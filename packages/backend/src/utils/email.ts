import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from './logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email. When SMTP is unconfigured (dev) the message is logged
 * instead so flows (verification links, notifications) remain testable.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // No SMTP configured (dev) — surface the message body so flows like
    // email verification and password reset stay testable via the log.
    logger.info('[mail:dev] email would be sent', {
      to: message.to,
      subject: message.subject,
      body: message.text ?? message.html,
    });
    return;
  }
  try {
    await t.sendMail({ from: config.SMTP_FROM, ...message });
    logger.info('email sent', { to: message.to, subject: message.subject });
  } catch (err) {
    logger.error('email send failed', { error: (err as Error).message });
    throw err;
  }
}
