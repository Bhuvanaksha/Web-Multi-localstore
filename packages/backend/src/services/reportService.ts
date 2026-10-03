import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { reportConfig } from '../config/reportConfig.js';
import { ActivityLogModel } from '../models/ActivityLogModel.js';
import { CommentModel } from '../models/CommentModel.js';
import { OrderModel } from '../models/OrderModel.js';
import { ProviderListingModel } from '../models/ProviderListingModel.js';
import { ResourceModel } from '../models/ResourceModel.js';
import { UserModel } from '../models/UserModel.js';
import { VoteModel } from '../models/VoteModel.js';
import { logger } from '../utils/logger.js';

const fmt = (d?: Date | string) => (d ? new Date(d).toLocaleString() : '');
const truncate = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Fills a worksheet with a header row + data rows. */
function fillSheet(ws: ExcelJS.Worksheet, rows: Array<Record<string, unknown>>): void {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['(empty)'];
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 12) }));
  ws.addRows(rows);
}

interface ReportData {
  resources: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  listings: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  analytics: Array<Record<string, unknown>>;
}

/** Runs all aggregation pipelines and assembles the workbook rows. */
async function collectData(): Promise<ReportData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [resources, users, comments, listings, orders, activity, totals] = await Promise.all([
    ResourceModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $lookup: {
          from: 'users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'author',
        },
      },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'resourceId',
          as: 'comments',
        },
      },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
    ]),

    UserModel.aggregate([
      {
        $lookup: {
          from: 'resources',
          localField: '_id',
          foreignField: 'authorId',
          as: 'resources',
        },
      },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'authorId',
          as: 'comments',
        },
      },
      { $sort: { createdAt: -1 } },
    ]),

    CommentModel.aggregate([
      {
        $lookup: {
          from: 'resources',
          localField: 'resourceId',
          foreignField: '_id',
          as: 'resource',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'authorId',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: { path: '$resource', preserveNullAndEmptyArrays: true } },
      { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
    ]),

    ProviderListingModel.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'providerId',
          foreignField: '_id',
          as: 'provider',
        },
      },
      { $unwind: { path: '$provider', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
    ]),

    OrderModel.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
    ]),

    ActivityLogModel.find().sort({ createdAt: -1 }).limit(2000).lean(),

    Promise.all([
      ResourceModel.countDocuments(),
      ResourceModel.countDocuments({ status: 'published', publishedAt: { $gte: startOfDay } }),
      UserModel.countDocuments(),
      UserModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      CommentModel.countDocuments(),
      CommentModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      VoteModel.countDocuments(),
      OrderModel.countDocuments(),
      OrderModel.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, revenue: { $sum: '$totalPrice' } } },
      ]),
      ActivityLogModel.distinct('actorId', { createdAt: { $gte: last24h } }),
    ]),
  ]);

  const [
    totalResources,
    publishedToday,
    totalUsers,
    newUsersToday,
    totalComments,
    newCommentsToday,
    totalVotes,
    totalOrders,
    revenueAgg,
    activeUsers,
  ] = totals;

  return {
    resources: resources.map((r) => ({
      ID: r._id.toString(),
      Title: r.title,
      Slug: r.slug ?? '',
      Author:
        [r.author?.profile?.firstName, r.author?.profile?.lastName].filter(Boolean).join(' ') ||
        r.author?.username ||
        '',
      Category: r.category,
      Tags: (r.tags ?? []).join(', '),
      Status: r.status,
      'View Count': r.viewCount ?? 0,
      'Upvote Count': r.upvoteCount ?? 0,
      'Comment Count': (r.comments ?? []).length,
      'Published At': fmt(r.publishedAt),
      'Last Updated At': fmt(r.updatedAt),
    })),

    users: users.map((u) => ({
      'User ID': u._id.toString(),
      Username: u.username,
      Email: u.email,
      Role: u.role,
      Verified: u.isActive ? 'Yes' : 'No',
      'Registration Date': fmt(u.createdAt),
      'Total Resources Submitted': (u.resources ?? []).length,
      'Total Comments Made': (u.comments ?? []).length,
      'Total Upvotes Received':
        ((u.resources as Array<Record<string, unknown>>) ?? []).reduce(
          (sum, r) => sum + ((r.upvoteCount as number) ?? 0),
          0,
        ) +
        ((u.comments as Array<Record<string, unknown>>) ?? []).reduce(
          (sum, c) => sum + ((c.upvoteCount as number) ?? 0),
          0,
        ),
    })),

    comments: comments.map((c) => ({
      'Comment ID': c._id.toString(),
      'Resource Title': c.resource?.title ?? '',
      Author: c.author?.username ?? '',
      Content: truncate(c.content ?? ''),
      'Upvote Count': c.upvoteCount ?? 0,
      Depth: c.depth ?? 0,
      Status: c.status,
      'Created At': fmt(c.createdAt),
    })),

    listings: listings.map((l) => ({
      'Listing ID': l._id.toString(),
      Provider:
        [l.provider?.profile?.firstName, l.provider?.profile?.lastName].filter(Boolean).join(' ') ||
        l.provider?.username ||
        '',
      Title: l.title,
      Category: l.category,
      'Price (INR)': l.price,
      Unit: l.unit ?? '',
      'Quantity In Stock': l.quantity ?? '',
      Availability: l.availability,
      'Created At': fmt(l.createdAt),
    })),

    orders: orders.map((o) => ({
      'Order ID': o._id.toString(),
      Customer:
        [o.customer?.profile?.firstName, o.customer?.profile?.lastName].filter(Boolean).join(' ') ||
        o.customer?.username ||
        '',
      Email: o.customer?.email ?? '',
      Items: ((o.items as Array<Record<string, unknown>>) ?? [])
        .map((i) => `${i.title} ×${i.quantity}${i.unit ? ` ${i.unit}` : ''}`)
        .join('; '),
      'Total (INR)': o.totalPrice,
      Status: o.status,
      Payment: `${o.paymentMethod ?? '—'} · ${o.paymentStatus}`,
      'Placed At': fmt(o.createdAt),
    })),

    activity: activity.map((a) => ({
      When: fmt(a.createdAt),
      Actor: a.actorEmail ?? '',
      Action: a.action,
      Entity: a.entityType ? `${a.entityType} ${(a.entityId ?? '').slice(-6)}` : '',
      Details: a.metadata ? JSON.stringify(a.metadata) : '',
    })),

    analytics: [
      {
        Date: new Date().toLocaleString(),
        'Total Resources': totalResources,
        'Published Resources (Today)': publishedToday,
        'Total Users': totalUsers,
        'New Users (Today)': newUsersToday,
        'Total Comments': totalComments,
        'New Comments (Today)': newCommentsToday,
        'Total Votes': totalVotes,
        'Total Orders': totalOrders,
        'Revenue (Paid, INR)': revenueAgg[0]?.revenue ?? 0,
        'Active Users (last 24h)': activeUsers.length,
      },
    ],
  };
}

/**
 * Generates the full report workbook and writes it to disk.
 * Returns the file path, or null when generation fails.
 */
export async function generateReport(overrides?: { dir?: string }): Promise<string | null> {
  try {
    const data = await collectData();
    const wb = new ExcelJS.Workbook();
    fillSheet(wb.addWorksheet('Resources'), data.resources);
    fillSheet(wb.addWorksheet('Users'), data.users);
    fillSheet(wb.addWorksheet('Comments'), data.comments);
    fillSheet(wb.addWorksheet('Provider Listings'), data.listings);
    fillSheet(wb.addWorksheet('Orders'), data.orders);
    fillSheet(wb.addWorksheet('Activity Logs'), data.activity);
    fillSheet(wb.addWorksheet('Analytics'), data.analytics);

    const dir = overrides?.dir ?? reportConfig.dir;
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, reportConfig.filename(new Date()));
    await wb.xlsx.writeFile(filePath);

    await cleanupOldReports(dir);
    logger.info('report generated', { file: filePath });
    return filePath;
  } catch (err) {
    logger.error('report generation failed', { error: (err as Error).message });
    return null;
  }
}

/** Keeps only the newest `retention` report files in the directory. */
async function cleanupOldReports(dir: string): Promise<void> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('report_') && f.endsWith('.xlsx'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(reportConfig.retention)) {
    fs.unlinkSync(path.join(dir, old.f));
  }
}

/** Path of the most recent report file, or null when none exists yet. */
export function latestReportPath(): string | null {
  const dir = reportConfig.dir;
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('report_') && f.endsWith('.xlsx'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length > 0 ? path.join(dir, files[0].f) : null;
}
