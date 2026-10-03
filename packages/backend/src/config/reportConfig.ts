import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const reportConfig = {
  /** Cron expression — every hour at minute 0. */
  schedule: '0 * * * *',
  /** Keep only the N most recent report files. */
  retention: 10,
  /** Directory where report files are stored (repo root ./reports). */
  dir: path.resolve(__dirname, '../../../../reports'),
  /** Filename pattern: report_YYYY-MM-DD_HH-MM.xlsx */
  filename: (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `report_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.xlsx`;
  },
  /** Generation attempts before giving up on a scheduled run. */
  maxRetries: 3,
  /** Run only in these environments (tests run the job manually). */
  enabledEnvironments: ['development', 'production'],
} as const;
