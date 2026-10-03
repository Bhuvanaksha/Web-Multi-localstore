import fs from 'node:fs';
import ExcelJS from 'exceljs';
import type { NextFunction, Request, Response } from 'express';
import { ActivityService } from '../services/ActivityService.js';
import { AdminService } from '../services/AdminService.js';
import { generateReport, latestReportPath } from '../services/reportService.js';
import { buildOrdersWorkbook, toOrderRows } from '../utils/ordersXlsx.js';

function sendXlsx(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export const AdminController = {
  async activity(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ActivityService.list({
        action: req.query.action as string | undefined,
        actorEmail: req.query.actorEmail as string | undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 30,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async orders(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminService.listAllOrders(
        Number(req.query.page) || 1,
        Number(req.query.limit) || 30,
        req.query.status as string | undefined,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /** Security & monitoring overview for the admin dashboard. */
  async securityOverview(_req: Request, res: Response, next: NextFunction) {
    try {
      const overview = await AdminService.getSecurityOverview();
      res.status(200).json(overview);
    } catch (err) {
      next(err);
    }
  },

  /** Downloads all orders as an .xlsx workbook (customers + what they bought). */
  async ordersExport(_req: Request, res: Response, next: NextFunction) {
    try {
      const orders = await AdminService.getAllOrdersForExport();
      const buffer = await buildOrdersWorkbook(toOrderRows(orders));
      sendXlsx(res, buffer, `orders-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      next(err);
    }
  },

  /**
   * Serves the latest automated report. Generates on demand when the hourly
   * scheduler hasn't produced one yet.
   */
  async reportDownload(_req: Request, res: Response, next: NextFunction) {
    try {
      let file = latestReportPath();
      if (!file) file = await generateReport();
      if (!file || !fs.existsSync(file)) {
        res.status(500).json({ error: { message: 'Report generation failed' } });
        return;
      }
      sendXlsx(res, fs.readFileSync(file), `report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      next(err);
    }
  },

  /** Exports the Security & Monitoring overview as an .xlsx workbook. */
  async securityExport(_req: Request, res: Response, next: NextFunction) {
    try {
      const o = await AdminService.getSecurityOverview();
      const wb = new ExcelJS.Workbook();

      const metrics = wb.addWorksheet('Metrics');
      metrics.columns = [
        { header: 'Metric', key: 'metric', width: 28 },
        { header: 'Value', key: 'value', width: 16 },
      ];
      metrics.addRows([
        { metric: 'Generated at', value: new Date().toLocaleString() },
        { metric: 'Total users', value: o.totals.users },
        { metric: 'MFA enabled', value: o.totals.mfaEnabled },
        { metric: 'Emails verified', value: o.totals.emailVerified },
        { metric: 'Locked accounts', value: o.totals.lockedAccounts },
        { metric: 'Active sessions', value: o.totals.activeSessions },
        { metric: 'Failed logins (24h)', value: o.recent.failedLogins24h },
        { metric: 'New-IP logins (24h)', value: o.recent.newIpLogins24h },
        { metric: 'Uptime (seconds)', value: o.health.uptimeSeconds },
        { metric: 'Memory RSS (MB)', value: o.health.memoryMb },
        { metric: 'MongoDB connected', value: o.health.mongoConnected ? 'Yes' : 'No' },
      ]);

      const trend = wb.addWorksheet('Login trend');
      trend.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Successful', key: 'success', width: 12 },
        { header: 'Failed', key: 'failed', width: 12 },
      ];
      trend.addRows(o.loginTrend);

      const suspects = wb.addWorksheet('Top failed accounts');
      suspects.columns = [
        { header: 'Email', key: 'email', width: 34 },
        { header: 'Failed attempts', key: 'failedLoginAttempts', width: 16 },
        { header: 'Locked', key: 'locked', width: 10 },
      ];
      suspects.addRows(o.topFailedAccounts.map((u) => ({ ...u, locked: u.locked ? 'Yes' : 'No' })));

      const events = wb.addWorksheet('Security events');
      events.columns = [
        { header: 'When', key: 'when', width: 22 },
        { header: 'Actor', key: 'actor', width: 30 },
        { header: 'Event', key: 'event', width: 26 },
        { header: 'Details', key: 'details', width: 60 },
      ];
      events.addRows(
        o.recentSecurityEvents.map((e) => ({
          when: e.createdAt ? new Date(e.createdAt).toLocaleString() : '',
          actor: e.actorEmail,
          event: e.action,
          details: e.metadata ? JSON.stringify(e.metadata) : '',
        })),
      );

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      sendXlsx(res, buffer, `security-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      next(err);
    }
  },

  /** Downloads the activity log as an .xlsx workbook. */
  async activityExport(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ActivityService.list({
        action: req.query.action as string | undefined,
        page: 1,
        limit: 2000,
      });
      const rows = result.items.map((a) => ({
        When: a.createdAt ? new Date(a.createdAt).toLocaleString() : '',
        Actor: a.actorEmail ?? '',
        'Actor ID': a.actorId ?? '',
        Action: a.action,
        'Entity Type': a.entityType ?? '',
        'Entity ID': a.entityId ?? '',
        Details: a.metadata ? JSON.stringify(a.metadata) : '',
      }));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Activity');
      const headers = rows.length > 0 ? Object.keys(rows[0]) : ['(empty)'];
      ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 12) }));
      ws.addRows(rows);
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      sendXlsx(res, buffer, `activity-logs-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      next(err);
    }
  },
};
