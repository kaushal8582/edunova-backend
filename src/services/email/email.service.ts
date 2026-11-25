import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv, isProduction, isTest } from '../../config/env';
import {
  adminInviteEmailHtml,
  passwordResetEmailHtml,
  verificationEmailHtml,
} from './templates';

let transporter: Transporter | null = null;

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** In-memory sink used when SMTP is not configured (development/test). */
export const emailOutbox: OutboundEmail[] = [];

function isSmtpConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM);
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) {
    return null;
  }
  if (transporter) return transporter;

  const env = getEnv();
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

async function sendMail(message: OutboundEmail): Promise<void> {
  // Tests always capture mail in-memory so OTP/reset helpers can read it,
  // even if a developer .env has SMTP credentials configured.
  if (isTest() || !isSmtpConfigured()) {
    emailOutbox.push(message);
    if (!isProduction() && !isTest()) {
      console.info('[email:dev] SMTP not configured. Queued email:', {
        to: message.to,
        subject: message.subject,
      });
    }
    return;
  }

  const env = getEnv();
  const transport = getTransporter();
  if (!transport) {
    emailOutbox.push(message);
    return;
  }

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

export async function sendVerificationEmail(params: {
  to: string;
  fullName: string;
  otp: string;
}): Promise<void> {
  const env = getEnv();
  const content = verificationEmailHtml({
    fullName: params.fullName,
    otp: params.otp,
    frontendUrl: env.FRONTEND_URL,
  });
  await sendMail({ to: params.to, ...content });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName: string;
  resetToken: string;
}): Promise<void> {
  const env = getEnv();
  const resetUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(params.resetToken)}`;
  const content = passwordResetEmailHtml({
    fullName: params.fullName,
    resetUrl,
  });
  await sendMail({ to: params.to, ...content });
}

export async function sendAdminInviteEmail(params: {
  to: string;
  fullName: string;
  role: string;
}): Promise<void> {
  const env = getEnv();
  const content = adminInviteEmailHtml({
    fullName: params.fullName,
    email: params.to,
    role: params.role,
    frontendUrl: env.FRONTEND_URL,
  });
  await sendMail({ to: params.to, ...content });
}

export function clearEmailOutbox(): void {
  emailOutbox.length = 0;
}

export function resetEmailTransporter(): void {
  transporter = null;
}
