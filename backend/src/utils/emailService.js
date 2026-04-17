import { query } from '../config/database.js';

/**
 * Send an email using the SMTP config stored in sys_email_config.
 * Always logs to sys_email_log regardless of success/failure.
 */
export async function sendEmail({ to, subject, html, entity_type, entity_id, cc } = {}) {
  if (!to || !subject) return { success: false, error: 'Missing to/subject' };
  try {
    const config = await query(`SELECT * FROM sys_email_config WHERE is_active = true LIMIT 1`);
    if (!config.rows.length) return { success: false, error: 'SMTP not configured' };
    const smtp = config.rows[0];

    let status = 'sent', errorMsg = null;
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: smtp.smtp_host,
        port: smtp.smtp_port,
        secure: smtp.smtp_secure,
        auth: { user: smtp.smtp_user, pass: smtp.smtp_password },
      });
      await transporter.sendMail({
        from: `"${smtp.from_name}" <${smtp.from_email}>`,
        to, cc, subject, html,
      });
    } catch (e) {
      status = 'failed'; errorMsg = e.message;
    }

    await query(
      `INSERT INTO sys_email_log (to_email, cc_email, subject, body, entity_type, entity_id, status, error_message, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [to, cc || null, subject, html, entity_type || null, entity_id || null, status, errorMsg,
       status === 'sent' ? new Date() : null]
    ).catch(() => {});

    return { success: status === 'sent', error: errorMsg };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Check if a notification event is enabled in sys_email_notification_settings.
 * Defaults to true if the event is not found (fail-open).
 */
export async function isNotificationEnabled(eventKey) {
  try {
    const r = await query(
      `SELECT is_enabled FROM sys_email_notification_settings WHERE event_key = $1`,
      [eventKey]
    );
    if (!r.rows.length) return true;
    return r.rows[0].is_enabled;
  } catch {
    return false;
  }
}

/**
 * Shared HTML wrapper for all notification emails.
 */
export function emailTemplate({ headerColor = '#0d3d8f', headerText, bodyHtml, appUrl = '' }) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:${headerColor};padding:20px 24px;">
      <h2 style="margin:0;color:#ffffff;font-size:18px;">${headerText}</h2>
    </div>
    <div style="padding:24px;color:#1f2937;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="background:#f9fafb;padding:12px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
      This is an automated notification from <strong>Zyra ERP</strong>. Do not reply to this email.
    </div>
  </div>`;
}
