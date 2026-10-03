import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMongo, connectMongo } from '../../src/config/db.js';
import { ActivityLogModel } from '../../src/models/ActivityLogModel.js';
import { CommentModel } from '../../src/models/CommentModel.js';
import { OrderModel } from '../../src/models/OrderModel.js';
import { ProviderListingModel } from '../../src/models/ProviderListingModel.js';
import { ResourceModel } from '../../src/models/ResourceModel.js';
import { UserModel } from '../../src/models/UserModel.js';
import { generateReport } from '../../src/services/reportService.js';

const SHEETS = [
  'Resources',
  'Users',
  'Comments',
  'Provider Listings',
  'Orders',
  'Activity Logs',
  'Analytics',
];

/** Converts a worksheet (header row + data rows) to JSON objects. */
function wsToJson(ws: ExcelJS.Worksheet): Array<Record<string, unknown>> {
  const headers = (ws.getRow(1).values as unknown[]) ?? [];
  const rows: Array<Record<string, unknown>> = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]) ?? [];
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (i === 0 || h === undefined || h === null) return;
      obj[String(h)] = values[i];
    });
    rows.push(obj);
  });
  return rows;
}

let mongod: MongoMemoryServer;
let tmpDir: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('alpha-report-test');
  await connectMongo(process.env.MONGODB_URI);

  // Seed a small dataset.
  const author = await UserModel.create({
    email: 'report-author@example.com',
    username: 'report_author',
    password: 'ReportPass@1234',
    profile: { firstName: 'Rep', lastName: 'Orter' },
  });
  const provider = await UserModel.create({
    email: 'report-provider@example.com',
    username: 'report_provider',
    password: 'ReportPass@1234',
  });
  const resource = await ResourceModel.create({
    title: 'Reported test resource',
    content: '<p>Reported test content.</p>',
    category: 'Testing',
    tags: ['report'],
    authorId: author._id,
    status: 'published',
    upvoteCount: 3,
    versionHistory: [],
  });
  await CommentModel.create({
    resourceId: resource._id,
    authorId: author._id,
    content: 'A test comment',
    path: 'x',
    depth: 0,
    status: 'active',
    upvoteCount: 1,
  });
  await ProviderListingModel.create({
    providerId: provider._id,
    title: 'Reported rice',
    description: 'A test listing for the report.',
    category: 'grocery',
    price: 100,
    unit: 'kg',
    quantity: 10,
    currency: 'INR',
  });
  await OrderModel.create({
    customerId: author._id,
    items: [
      {
        listingId: resource._id,
        providerId: provider._id,
        title: 'Reported rice',
        unitPrice: 100,
        quantity: 2,
        unit: 'kg',
      },
    ],
    totalPrice: 200,
    currency: 'INR',
    status: 'pending',
    paymentMethod: 'upi',
    paymentStatus: 'paid',
    statusHistory: [{ status: 'pending', at: new Date() }],
  });
  await ActivityLogModel.create({
    actorId: author._id,
    actorEmail: author.email,
    action: 'test.event',
  });

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-reports-'));
}, 120_000);

afterAll(async () => {
  await closeMongo().catch(() => undefined);
  await mongod.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('reportService', () => {
  it('generates a workbook with all seven sheets and seeded rows', async () => {
    const file = await generateReport({ dir: tmpDir });
    expect(file).toBeTruthy();
    expect(fs.existsSync(file as string)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file as string);
    const sheetNames = wb.worksheets.map((w) => w.name);
    for (const sheet of SHEETS) {
      expect(sheetNames).toContain(sheet);
    }

    const resources = wsToJson(wb.getWorksheet('Resources'));
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({ Title: 'Reported test resource' });

    const users = wsToJson(wb.getWorksheet('Users'));
    expect(users.some((u) => u.Email === 'report-author@example.com')).toBe(true);

    const analytics = wsToJson(wb.getWorksheet('Analytics'));
    expect(analytics).toHaveLength(1);
    expect(analytics[0]).toMatchObject({
      'Total Resources': 1,
      'Total Comments': 1,
      'Total Orders': 1,
    });
  });

  it('keeps only the retention limit of files', async () => {
    for (let i = 0; i < reportRetention() + 2; i += 1) {
      // Wait a moment so filenames differ by minute.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1100));
      // eslint-disable-next-line no-await-in-loop
      await generateReport({ dir: tmpDir });
    }
    const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith('report_'));
    expect(files.length).toBeLessThanOrEqual(reportRetention());
  });
});

describe('admin report download endpoint', () => {
  it('serves an xlsx file for an admin and rejects non-admins', async () => {
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    await UserModel.create({
      email: 'report-admin@example.com',
      username: 'report_admin',
      password: 'ReportPass@1234',
      role: 'admin',
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'report-admin@example.com', password: 'ReportPass@1234' });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    const res = await request(app)
      .get('/api/v1/admin/report/download')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');

    // Non-admin is rejected.
    const memberLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'report-author@example.com', password: 'ReportPass@1234' });
    const memberRes = await request(app)
      .get('/api/v1/admin/report/download')
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`);
    expect(memberRes.status).toBe(403);
  }, 60_000);
});

function reportRetention(): number {
  // Kept inline to avoid importing the config into the test twice.
  return 10;
}
