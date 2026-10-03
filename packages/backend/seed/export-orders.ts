/**
 * Exports every order (customer, items, ₹ totals, payment) from the database
 * to exports/orders-report.xlsx. Runs with: npm run export:orders
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeMongo, connectMongo } from '../src/config/db.js';
import '../src/models/UserModel.js'; // register User so populate() works
import { AdminService } from '../src/services/AdminService.js';
import { logger } from '../src/utils/logger.js';
import { buildOrdersWorkbook, toOrderRows } from '../src/utils/ordersXlsx.js';

async function main(): Promise<void> {
  await connectMongo();
  const orders = await AdminService.getAllOrdersForExport();
  const buffer = await buildOrdersWorkbook(toOrderRows(orders));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(__dirname, '../../../exports');
  fs.mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `orders-report-${date}.xlsx`);
  fs.writeFileSync(outFile, buffer);

  logger.info('orders export complete', { orders: orders.length, file: outFile });
  for (const row of toOrderRows(orders).slice(0, 10)) {
    logger.info('  order', { id: row.id, customer: row.customerEmail, total: row.totalPrice });
  }
  await closeMongo();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  logger.error('orders export failed', { error: err instanceof Error ? err.message : err });
  await closeMongo().catch(() => undefined);
  process.exit(1);
});
