const { config } = require('../config');
const { ApiError } = require('../lib/http');

const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

async function deliver({ to, subject, html, text }) {
  if (config.emailProvider === 'console') {
    console.log(`[development email] To: ${to}\nSubject: ${subject}\n${text}`);
    return { id: 'console' };
  }
  if (config.emailProvider !== 'resend') throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, html, text })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, 'EMAIL_DELIVERY_FAILED', body.message || 'Email delivery failed.');
  return body;
}

async function sendPasswordResetEmail(user, rawToken) {
  const resetUrl = `${config.appUrl}/reset-password.html?token=${encodeURIComponent(rawToken)}`;
  const name = escapeHtml(user.name);
  return deliver({
    to: user.email,
    subject: 'Reset your PayPoint password',
    text: `Hello ${user.name}, reset your PayPoint password using this link: ${resetUrl}. It expires in ${config.passwordResetTtlMinutes} minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0b1b3b"><h2>Reset your PayPoint password</h2><p>Hello ${name},</p><p>We received a request to reset your password. This link expires in ${config.passwordResetTtlMinutes} minutes and can be used once.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#0757e6;color:#fff;text-decoration:none;border-radius:8px">Reset password</a></p><p>If you did not request this, you can safely ignore this email.</p></div>`
  });
}

async function sendPasswordChangedEmail(user) {
  return deliver({
    to: user.email,
    subject: 'Your PayPoint password was changed',
    text: 'Your PayPoint password was changed. If you did not make this change, contact support immediately.',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0b1b3b"><h2>Password changed</h2><p>Hello ${escapeHtml(user.name)},</p><p>Your PayPoint password was changed and existing sessions were signed out.</p><p>If you did not make this change, contact support immediately.</p></div>`
  });
}

module.exports = { sendPasswordResetEmail, sendPasswordChangedEmail };
