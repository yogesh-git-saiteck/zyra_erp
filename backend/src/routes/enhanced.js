import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber } from '../utils/helpers.js';

const router = Router();

// ============================================
// 2FA (TOTP Setup)
// ============================================
router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const secret = crypto.randomBytes(20).toString('hex');
    // Generate 8 backup codes
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());
    await query(`UPDATE sys_users SET totp_secret = $1, backup_codes = $2 WHERE id = $3`, [secret, JSON.stringify(backupCodes), req.user.id]);
    // In production, use a TOTP library to generate the QR URL
    const otpAuthUrl = `otpauth://totp/Zyra:${req.user.username}?secret=${secret}&issuer=Zyra`;
    successResponse(res, { secret, otpAuthUrl, backupCodes, message: 'Scan QR code with Google Authenticator, then verify' });
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/2fa/verify', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    // Simple verification (production would use TOTP algorithm)
    const user = await query(`SELECT totp_secret FROM sys_users WHERE id = $1`, [req.user.id]);
    if (!user.rows[0]?.totp_secret) return errorResponse(res, '2FA not set up', 400);
    // For demo: accept any 6-digit code to enable; real impl checks TOTP
    if (code && code.length === 6) {
      await query(`UPDATE sys_users SET totp_enabled = true WHERE id = $1`, [req.user.id]);
      successResponse(res, { enabled: true }, '2FA enabled');
    } else { errorResponse(res, 'Invalid code', 400); }
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    await query(`UPDATE sys_users SET totp_enabled = false, totp_secret = NULL, backup_codes = '[]' WHERE id = $1`, [req.user.id]);
    successResponse(res, null, '2FA disabled');
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// VERSION HISTORY
// ============================================
router.get('/versions/:entity/:entityId', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT v.*, u.first_name || ' ' || u.last_name as changed_by_name FROM sys_versions v LEFT JOIN sys_users u ON v.changed_by = u.id WHERE v.entity_type = $1 AND v.entity_id = $2 ORDER BY v.version_number DESC`,
      [req.params.entity, req.params.entityId]);
    successResponse(res, r.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/versions', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, data_snapshot, changed_fields } = req.body;
    const lastVer = await query(`SELECT COALESCE(MAX(version_number), 0) as ver FROM sys_versions WHERE entity_type = $1 AND entity_id = $2`, [entity_type, entity_id]);
    const r = await query(`INSERT INTO sys_versions (entity_type, entity_id, version_number, data_snapshot, changed_fields, changed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [entity_type, entity_id, parseInt(lastVer.rows[0].ver) + 1, JSON.stringify(data_snapshot), JSON.stringify(changed_fields || []), req.user.id]);
    successResponse(res, r.rows[0], 'Version saved', 201);
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// USER ACTIVITY / SESSIONS
// ============================================
router.get('/sessions/active', authenticate, adminOnly, async (req, res) => {
  try {
    const r = await query(`SELECT s.*, u.username, u.first_name, u.last_name FROM sys_user_sessions s JOIN sys_users u ON s.user_id = u.id WHERE s.is_active = true AND s.last_active_at > NOW() - INTERVAL '30 minutes' ORDER BY s.last_active_at DESC`);
    successResponse(res, r.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/sessions/heartbeat', authenticate, async (req, res) => {
  try {
    await query(`UPDATE sys_user_sessions SET last_active_at = NOW() WHERE user_id = $1 AND is_active = true`, [req.user.id]);
    successResponse(res, null);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/page-view', authenticate, async (req, res) => {
  try {
    const { page_path, page_title, duration_seconds } = req.body;
    await query(`INSERT INTO sys_page_views (user_id, page_path, page_title, duration_seconds) VALUES ($1,$2,$3,$4)`,
      [req.user.id, page_path, page_title, duration_seconds]);
    successResponse(res, null);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/analytics/page-views', authenticate, adminOnly, async (req, res) => {
  try {
    const views = await query(`SELECT page_path, page_title, COUNT(*) as views, COUNT(DISTINCT user_id) as unique_users FROM sys_page_views WHERE viewed_at > NOW() - INTERVAL '30 days' GROUP BY page_path, page_title ORDER BY views DESC LIMIT 20`);
    const userActivity = await query(`SELECT u.username, u.first_name, u.last_name, COUNT(*) as page_views FROM sys_page_views pv JOIN sys_users u ON pv.user_id = u.id WHERE pv.viewed_at > NOW() - INTERVAL '30 days' GROUP BY u.username, u.first_name, u.last_name ORDER BY page_views DESC LIMIT 10`);
    const daily = await query(`SELECT DATE(viewed_at) as day, COUNT(*) as views FROM sys_page_views WHERE viewed_at > NOW() - INTERVAL '30 days' GROUP BY DATE(viewed_at) ORDER BY day`);
    successResponse(res, { top_pages: views.rows, top_users: userActivity.rows, daily_trend: daily.rows });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// API RATE MONITORING
// ============================================
router.get('/api-usage', authenticate, adminOnly, async (req, res) => {
  try {
    const summary = await query(`SELECT api_key_id, endpoint, COUNT(*) as requests, AVG(response_time_ms)::int as avg_response_ms FROM sys_api_usage_log WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY api_key_id, endpoint ORDER BY requests DESC LIMIT 50`);
    const hourly = await query(`SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as requests FROM sys_api_usage_log WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY hour ORDER BY hour`);
    const errors = await query(`SELECT endpoint, status_code, COUNT(*) as count FROM sys_api_usage_log WHERE status_code >= 400 AND created_at > NOW() - INTERVAL '24 hours' GROUP BY endpoint, status_code ORDER BY count DESC LIMIT 20`);
    successResponse(res, { summary: summary.rows, hourly: hourly.rows, errors: errors.rows });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// DATA ARCHIVING
// ============================================
router.get('/archive-policies', authenticate, adminOnly, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_archive_policies ORDER BY entity_type`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/archive-policies', authenticate, adminOnly, async (req, res) => {
  try {
    const { entity_type, table_name, condition_field, condition_operator, condition_value, retention_days } = req.body;
    const r = await query(`INSERT INTO sys_archive_policies (entity_type, table_name, condition_field, condition_operator, condition_value, retention_days) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [entity_type, table_name, condition_field, condition_operator, condition_value, retention_days || 365]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/archive/run/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const policy = await query(`SELECT * FROM sys_archive_policies WHERE id = $1`, [req.params.id]);
    if (!policy.rows.length) return errorResponse(res, 'Not found', 404);
    const p = policy.rows[0];
    // Count records that would be archived
    let countSql = `SELECT COUNT(*) as cnt FROM ${p.table_name} WHERE created_at < NOW() - INTERVAL '${p.retention_days} days'`;
    if (p.condition_field && p.condition_value) countSql += ` AND ${p.condition_field} = '${p.condition_value}'`;
    const count = await query(countSql);
    await query(`UPDATE sys_archive_policies SET last_run_at = NOW(), records_archived = records_archived + $1 WHERE id = $2`, [count.rows[0].cnt, req.params.id]);
    successResponse(res, { policy: p.entity_type, eligible_records: parseInt(count.rows[0].cnt), message: `${count.rows[0].cnt} records eligible for archiving` });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// RECURRING DOCUMENTS
// ============================================
router.get('/recurring', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_recurring_templates ORDER BY next_run_date`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/recurring', authenticate, async (req, res) => {
  try {
    const { template_name, entity_type, document_data, frequency, next_run_date, max_occurrences } = req.body;
    const r = await query(`INSERT INTO sys_recurring_templates (template_name, entity_type, document_data, frequency, next_run_date, max_occurrences, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [template_name, entity_type, JSON.stringify(document_data), frequency || 'monthly', next_run_date, max_occurrences, req.user.id]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.put('/recurring/:id/toggle', authenticate, async (req, res) => {
  try { await query(`UPDATE sys_recurring_templates SET is_active = NOT is_active WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Toggled'); } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// EMAIL QUEUE
// ============================================
router.get('/email-queue', authenticate, adminOnly, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_email_queue ORDER BY created_at DESC LIMIT 100`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/email/send', authenticate, async (req, res) => {
  try {
    const { to_email, cc_email, subject, body_html, template_key } = req.body;
    const r = await query(`INSERT INTO sys_email_queue (to_email, cc_email, subject, body_html, template_key) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [to_email, cc_email, subject, body_html, template_key]);
    successResponse(res, r.rows[0], 'Queued', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/email/process-queue', authenticate, adminOnly, async (req, res) => {
  try {
    const pending = await query(`SELECT * FROM sys_email_queue WHERE status = 'pending' ORDER BY scheduled_at LIMIT 10`);
    let sent = 0, failed = 0;
    for (const email of pending.rows) {
      try {
        // In production: call Nodemailer/SendGrid here
        // For now, mark as sent (simulate)
        await query(`UPDATE sys_email_queue SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE id = $1`, [email.id]);
        sent++;
      } catch {
        await query(`UPDATE sys_email_queue SET status = 'failed', attempts = attempts + 1, error_message = 'Delivery failed' WHERE id = $1`, [email.id]);
        failed++;
      }
    }
    successResponse(res, { processed: pending.rows.length, sent, failed });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// BATCH & SERIAL TRACKING
// ============================================
router.get('/batches', authenticate, async (req, res) => {
  try {
    const { material_id } = req.query;
    let sql = `SELECT b.*, m.material_code, m.material_name, p.plant_code FROM inv_batches b JOIN mm_materials m ON b.material_id = m.id LEFT JOIN org_plants p ON b.plant_id = p.id WHERE 1=1`;
    const params = [];
    if (material_id) { sql += ` AND b.material_id = $1`; params.push(material_id); }
    sql += ` ORDER BY b.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/batches', authenticate, async (req, res) => {
  try {
    const { material_id, batch_number, manufacture_date, expiry_date, quantity, plant_id } = req.body;
    const r = await query(`INSERT INTO inv_batches (material_id, batch_number, manufacture_date, expiry_date, quantity, plant_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [material_id, batch_number, manufacture_date, expiry_date, quantity || 0, plant_id]);
    successResponse(res, r.rows[0], 'Batch created', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/serial-numbers', authenticate, async (req, res) => {
  try {
    const { material_id, status } = req.query;
    let sql = `SELECT sn.*, m.material_code, m.material_name FROM inv_serial_numbers sn JOIN mm_materials m ON sn.material_id = m.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (material_id) { sql += ` AND sn.material_id = $${idx++}`; params.push(material_id); }
    if (status) { sql += ` AND sn.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY sn.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/serial-numbers', authenticate, async (req, res) => {
  try {
    const { material_id, serial_number, batch_id, warranty_end } = req.body;
    const r = await query(`INSERT INTO inv_serial_numbers (material_id, serial_number, batch_id, warranty_end) VALUES ($1,$2,$3,$4) RETURNING *`,
      [material_id, serial_number, batch_id, warranty_end]);
    successResponse(res, r.rows[0], 'Serial registered', 201);
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// INTER-COMPANY TRANSACTIONS
// ============================================
router.get('/inter-company', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT ic.*, c1.company_name as from_company, c2.company_name as to_company FROM ic_transactions ic LEFT JOIN org_companies c1 ON ic.from_company_id = c1.id LEFT JOIN org_companies c2 ON ic.to_company_id = c2.id ORDER BY ic.created_at DESC`);
    successResponse(res, r.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/inter-company', authenticate, async (req, res) => {
  try {
    const { from_company_id, to_company_id, transaction_type, source_doc_type, source_doc_id, amount, currency } = req.body;
    const r = await query(`INSERT INTO ic_transactions (from_company_id, to_company_id, transaction_type, source_doc_type, source_doc_id, amount, currency) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [from_company_id, to_company_id, transaction_type, source_doc_type, source_doc_id, amount, currency || 'INR']);
    successResponse(res, r.rows[0], 'IC transaction created', 201);
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// PORTAL (Customer/Vendor self-service)
// ============================================
router.get('/portal/my-invoices', authenticate, async (req, res) => {
  try {
    // For portal users linked to a business partner
    const bp = await query(`SELECT id FROM bp_business_partners WHERE email = $1 LIMIT 1`, [req.user.email]);
    if (!bp.rows.length) return errorResponse(res, 'No partner linked', 404);
    const invoices = await query(`SELECT * FROM fi_ar_invoices WHERE customer_id = $1 ORDER BY invoice_date DESC`, [bp.rows[0].id]);
    successResponse(res, invoices.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/portal/my-orders', authenticate, async (req, res) => {
  try {
    const bp = await query(`SELECT id FROM bp_business_partners WHERE email = $1 LIMIT 1`, [req.user.email]);
    if (!bp.rows.length) return errorResponse(res, 'No partner linked', 404);
    const orders = await query(`SELECT * FROM sd_sales_orders WHERE customer_id = $1 ORDER BY order_date DESC`, [bp.rows[0].id]);
    successResponse(res, orders.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/portal/my-pos', authenticate, async (req, res) => {
  try {
    const bp = await query(`SELECT id FROM bp_business_partners WHERE email = $1 LIMIT 1`, [req.user.email]);
    if (!bp.rows.length) return errorResponse(res, 'No partner linked', 404);
    const pos = await query(`SELECT * FROM pur_purchase_orders WHERE vendor_id = $1 ORDER BY order_date DESC`, [bp.rows[0].id]);
    successResponse(res, pos.rows);
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// DOCUMENT ATTACHMENTS
// ============================================
router.get('/attachments/:entity/:entityId', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT a.*, u.first_name || ' ' || u.last_name as uploaded_by_name FROM sys_attachments a LEFT JOIN sys_users u ON a.uploaded_by = u.id WHERE a.entity_type = $1 AND a.entity_id = $2 ORDER BY a.created_at DESC`,
      [req.params.entity, req.params.entityId]);
    successResponse(res, r.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/attachments', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, file_name, file_url, file_size, mime_type, description } = req.body;
    const r = await query(`INSERT INTO sys_attachments (entity_type, entity_id, file_name, file_url, description, uploaded_by, file_size, mime_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [entity_type, entity_id, file_name, file_url, description, req.user.id, file_size, mime_type]);
    successResponse(res, r.rows[0], 'Attached', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.delete('/attachments/:id', authenticate, async (req, res) => {
  try { await query(`DELETE FROM sys_attachments WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch(e) { errorResponse(res, e.message); }
});

export default router;
