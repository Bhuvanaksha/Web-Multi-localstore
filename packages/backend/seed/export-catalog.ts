/**
 * Exports provider-catalog.json to exports/provider-catalog.xlsx with two
 * sheets — "Providers" (account/contact details) and "Listings" (products
 * with ₹ prices and sale units). Runs with: npm run seed:export
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import catalog from './provider-catalog.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../../../exports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'provider-catalog.xlsx');

function fillSheet(ws: ExcelJS.Worksheet, rows: Record<string, unknown>[]): void {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['(empty)'];
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 2, 14) }));
  ws.addRows(rows);
}

const providerRows = catalog.providers.map((p) => ({
  'Provider Username': p.username,
  'Provider Name': `${p.profile?.firstName ?? ''} ${p.profile?.lastName ?? ''}`.trim(),
  Email: p.email,
  Phone: p.contactPhone ?? '',
  Bio: p.profile?.bio ?? '',
  'No. of Listings': p.listings.length,
}));

const listingRows = catalog.providers.flatMap((p) =>
  p.listings.map((l) => ({
    Provider: p.username,
    Title: l.title,
    Category: l.category,
    'Price (INR)': `₹ ${l.price}`,
    Unit: l.unit ?? '',
    'In Stock': l.quantity ?? '',
    Availability: l.availability ?? 'available',
    Description: l.description,
    'Contact Phone': p.contactPhone ?? '',
  })),
);

const wb = new ExcelJS.Workbook();
fillSheet(wb.addWorksheet('Providers'), providerRows);
fillSheet(wb.addWorksheet('Listings'), listingRows);
await wb.xlsx.writeFile(outFile);

// Also print a readable summary for quick verification.
console.log(
  `Exported ${providerRows.length} providers & ${listingRows.length} listings → ${outFile}`,
);
for (const row of listingRows) {
  console.log(
    `  • ${row.Provider.padEnd(20)} ${row.Title.padEnd(28)} ${row['Price (INR)'].padEnd(10)} /${row.Unit}`,
  );
}
