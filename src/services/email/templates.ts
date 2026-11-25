export function verificationEmailHtml(params: {
  fullName: string;
  otp: string;
  frontendUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Verify your EduNova account';
  const text = `Hi ${params.fullName},\n\nYour verification code is ${params.otp}.\nIt expires soon. If you did not create an account, ignore this email.\n\n${params.frontendUrl}`;
  const html = `
    <p>Hi ${escapeHtml(params.fullName)},</p>
    <p>Your verification code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${escapeHtml(params.otp)}</p>
    <p>This code expires soon. If you did not create an account, you can ignore this email.</p>
  `;
  return { subject, text, html };
}

export function passwordResetEmailHtml(params: {
  fullName: string;
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Reset your EduNova password';
  const text = `Hi ${params.fullName},\n\nReset your password using this link (expires soon):\n${params.resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `
    <p>Hi ${escapeHtml(params.fullName)},</p>
    <p>We received a request to reset your password.</p>
    <p><a href="${escapeHtml(params.resetUrl)}">Reset password</a></p>
    <p>If you did not request this, you can ignore this email.</p>
  `;
  return { subject, text, html };
}

export function adminInviteEmailHtml(params: {
  fullName: string;
  email: string;
  role: string;
  frontendUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = 'Your EduNova admin account';
  const text = `Hi ${params.fullName},\n\nAn administrator account (${params.role}) was created for ${params.email}.\nSign in at ${params.frontendUrl} and verify your email if prompted.\nNever share your password.`;
  const html = `
    <p>Hi ${escapeHtml(params.fullName)},</p>
    <p>An administrator account (<strong>${escapeHtml(params.role)}</strong>) was created for <strong>${escapeHtml(params.email)}</strong>.</p>
    <p>Sign in at <a href="${escapeHtml(params.frontendUrl)}">${escapeHtml(params.frontendUrl)}</a> and complete email verification if prompted.</p>
    <p>Never share your password. This email does not contain credentials.</p>
  `;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
