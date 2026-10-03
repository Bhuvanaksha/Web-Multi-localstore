import mongoose from 'mongoose';
import { ActivityLogModel } from '../models/ActivityLogModel.js';
import { type OrderDocument, OrderModel } from '../models/OrderModel.js';
import { RefreshTokenModel } from '../models/RefreshTokenModel.js';
import { UserModel } from '../models/UserModel.js';
import { serializeOrder } from './OrderService.js';

const CUSTOMER_SELECT = 'email username profile.firstName profile.lastName';

/** Security-related activity actions shown on the monitoring tab. */
const SECURITY_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.login_new_ip',
  'auth.registered',
  'auth.password_reset',
  'auth.password_changed',
  'auth.mfa_enabled',
  'auth.mfa_disabled',
  'auth.mfa_recovery_used',
  'auth.token_reuse_detected',
];

export interface OrderWithCustomer extends ReturnType<typeof serializeOrder> {
  customer: { id?: string; name: string; email: string };
}

export const AdminService = {
  /** Every order with customer details, newest first. */
  async listAllOrders(page = 1, limit = 30, status?: string) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
      OrderModel.find(filter)
        .populate('customerId', CUSTOMER_SELECT)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrderModel.countDocuments(filter),
    ]);
    return {
      items: items.map((doc) => this.serializeWithCustomer(doc)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /** All orders with customers (used by the Excel export). */
  async getAllOrdersForExport(): Promise<OrderWithCustomer[]> {
    const docs = await OrderModel.find()
      .populate('customerId', CUSTOMER_SELECT)
      .sort({ createdAt: -1 });
    return docs.map((doc) => this.serializeWithCustomer(doc));
  },

  serializeWithCustomer(doc: OrderDocument): OrderWithCustomer {
    const base = serializeOrder(doc);
    const customer =
      typeof doc.customerId === 'object' && doc.customerId !== null
        ? (doc.customerId as unknown as Record<string, unknown>)
        : undefined;
    const profile = (customer?.profile as Record<string, unknown> | undefined) ?? {};
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    return {
      ...base,
      customer: {
        id: (customer?._id ?? base.customerId)?.toString(),
        name: name || (customer?.username as string) || 'Unknown',
        email: (customer?.email as string) ?? '',
      },
    };
  },

  /**
   * Aggregates everything the Security & Monitoring tab shows: adoption
   * metrics, login trends, suspicious accounts, recent events, health.
   */
  async getSecurityOverview() {
    const now = new Date();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dayMs = 24 * 60 * 60 * 1000;

    const [
      totalUsers,
      mfaEnabled,
      emailVerified,
      lockedAccounts,
      activeSessions,
      failed24h,
      newIp24h,
      securityEvents,
      trend,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ mfaEnabled: true }),
      UserModel.countDocuments({ emailVerified: true }),
      UserModel.countDocuments({ lockoutUntil: { $gt: now } }),
      RefreshTokenModel.countDocuments({ revoked: false }),
      ActivityLogModel.countDocuments({
        action: 'auth.login_failed',
        createdAt: { $gte: since24h },
      }),
      ActivityLogModel.countDocuments({
        action: 'auth.login_new_ip',
        createdAt: { $gte: since24h },
      }),
      ActivityLogModel.find({ action: { $in: SECURITY_ACTIONS } })
        .sort({ createdAt: -1 })
        .limit(25),
      ActivityLogModel.aggregate([
        {
          $match: {
            createdAt: { $gte: since7d },
            action: { $in: ['auth.login', 'auth.login_failed'] },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              action: '$action',
            },
            n: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Assemble 7 days of login success/failure counts (zero-filled days).
    const byDay = new Map<string, { success: number; failed: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * dayMs);
      byDay.set(d.toISOString().slice(0, 10), { success: 0, failed: 0 });
    }
    for (const row of trend as Array<{ _id: { date: string; action: string }; n: number }>) {
      const entry = byDay.get(row._id.date);
      if (!entry) continue;
      if (row._id.action === 'auth.login') entry.success += row.n;
      else entry.failed += row.n;
    }
    const loginTrend = [...byDay.entries()].map(([date, counts]) => ({ date, ...counts }));

    // Accounts with the most failed attempts (brute-force suspects).
    const topFailedAccounts = await UserModel.find({ failedLoginAttempts: { $gt: 0 } })
      .sort({ failedLoginAttempts: -1 })
      .limit(10)
      .select('email failedLoginAttempts lockoutUntil');

    return {
      totals: {
        users: totalUsers,
        mfaEnabled,
        emailVerified,
        lockedAccounts,
        activeSessions,
      },
      recent: {
        failedLogins24h: failed24h,
        newIpLogins24h: newIp24h,
      },
      loginTrend,
      topFailedAccounts: topFailedAccounts.map((u) => ({
        email: u.email,
        failedLoginAttempts: u.failedLoginAttempts,
        locked: !!u.lockoutUntil && u.lockoutUntil.getTime() > Date.now(),
      })),
      recentSecurityEvents: securityEvents.map((e) => ({
        id: e._id.toString(),
        actorEmail: e.actorEmail ?? '',
        action: e.action,
        metadata: e.metadata ?? {},
        createdAt: e.createdAt,
      })),
      health: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        mongoConnected: mongoose.connection.readyState === 1,
      },
    };
  },
};
