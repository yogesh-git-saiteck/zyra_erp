import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate, adminOnly, auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, paginate } from '../utils/helpers.js';

const router = Router();

// ========== 1. NOTIFICATION RULES ==========
router.get('/notification-rules', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_notification_rules ORDER BY created_at DESC`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/notification-rules', authenticate, adminOnly, async (req, res) => {
  try {
    const { rule_name, entity_type, trigger_event, conditions, notify_roles, notify_users, channel, message_template } = req.body;
    if (!rule_name || !entity_type || !trigger_event) return errorResponse(res, 'Name, entity, and trigger required', 400);
    const r = await query(`INSERT INTO sys_notification_rules (rule_name, entity_type, trigger_event, conditions, notify_roles, notify_users, channel, message_template, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [rule_name, entity_type, trigger_event, JSON.stringify(conditions || []), JSON.stringify(notify_roles || []), JSON.stringify(notify_users || []), channel || 'in_app', message_template, req.user.id]);
    successResponse(res, r.rows[0], 'Rule created', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.put('/notification-rules/:id/toggle', authenticate, adminOnly, async (req, res) => {
  try { await query(`UPDATE sys_notification_rules SET is_active = NOT is_active WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Toggled'); } catch (err) { errorResponse(res, err.message); }
});
router.delete('/notification-rules/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_notification_rules WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});

// ========== 2. SCHEDULED JOBS ==========
router.get('/scheduled-jobs', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_scheduled_jobs ORDER BY created_at DESC`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/scheduled-jobs', authenticate, adminOnly, async (req, res) => {
  try {
    const { job_name, job_type, schedule_cron, schedule_description, config } = req.body;
    if (!job_name) return errorResponse(res, 'Job name is required', 400);
    const r = await query(
      `INSERT INTO sys_scheduled_jobs (job_name, job_type, schedule_cron, schedule_description, config, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (job_name) DO UPDATE
         SET job_type=$2, schedule_cron=$3, schedule_description=$4, config=$5
       RETURNING *`,
      [job_name, job_type, schedule_cron, schedule_description, JSON.stringify(config || {}), req.user.id]);
    successResponse(res, r.rows[0], 'Job saved', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.put('/scheduled-jobs/:id/toggle', authenticate, adminOnly, async (req, res) => {
  try { await query(`UPDATE sys_scheduled_jobs SET is_active = NOT is_active WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Toggled'); } catch (err) { errorResponse(res, err.message); }
});
router.post('/scheduled-jobs/:id/run', authenticate, adminOnly, async (req, res) => {
  try {
    const startTime = Date.now();
    const job = await query(`SELECT * FROM sys_scheduled_jobs WHERE id = $1`, [req.params.id]);
    if (!job.rows.length) return errorResponse(res, 'Not found', 404);
    // Execute job based on type
    let affected = 0;
    const jt = job.rows[0].job_type;
    if (jt === 'auto_close') { const r = await query(`UPDATE sd_quotations SET status = 'cancelled' WHERE valid_until < CURRENT_DATE AND status = 'draft'`); affected = r.rowCount; }
    else if (jt === 'overdue_check') { const r = await query(`SELECT COUNT(*) as cnt FROM fi_ar_invoices WHERE due_date < CURRENT_DATE AND total_amount > paid_amount AND status != 'cancelled'`); affected = parseInt(r.rows[0].cnt); }
    await query(`INSERT INTO sys_job_log (job_id, status, records_affected, duration_ms, completed_at) VALUES ($1,'completed',$2,$3,NOW())`, [req.params.id, affected, Date.now() - startTime]);
    await query(`UPDATE sys_scheduled_jobs SET last_run_at = NOW(), last_run_status = 'completed', run_count = run_count + 1 WHERE id = $1`, [req.params.id]);
    successResponse(res, { affected }, 'Job executed');
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/scheduled-jobs/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_scheduled_jobs WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});
router.get('/scheduled-jobs/:id/log', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_job_log WHERE job_id = $1 ORDER BY started_at DESC LIMIT 50`, [req.params.id])).rows); } catch (err) { errorResponse(res, err.message); }
});

// ========== 3. EMAIL TEMPLATES ==========
router.get('/email-templates', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_email_templates ORDER BY template_name`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/email-templates', authenticate, adminOnly, async (req, res) => {
  try {
    const { template_key, template_name, subject, body_html, variables } = req.body;
    const r = await query(`INSERT INTO sys_email_templates (template_key, template_name, subject, body_html, variables, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [template_key, template_name, subject, body_html, JSON.stringify(variables || []), req.user.id]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.put('/email-templates/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { template_name, subject, body_html, variables } = req.body;
    await query(`UPDATE sys_email_templates SET template_name=COALESCE($1,template_name), subject=COALESCE($2,subject), body_html=COALESCE($3,body_html), variables=COALESCE($4,variables), updated_at=NOW() WHERE id=$5`,
      [template_name, subject, body_html, variables ? JSON.stringify(variables) : null, req.params.id]);
    successResponse(res, null, 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========== 4. BUSINESS RULES ==========
router.get('/business-rules', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_business_rules ORDER BY entity_type, priority`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/business-rules', authenticate, adminOnly, async (req, res) => {
  try {
    const { rule_name, entity_type, trigger_point, conditions, action_type, action_config, error_message, priority } = req.body;
    const r = await query(`INSERT INTO sys_business_rules (rule_name, entity_type, trigger_point, conditions, action_type, action_config, error_message, priority, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [rule_name, entity_type, trigger_point || 'before_save', JSON.stringify(conditions || []), action_type || 'block', JSON.stringify(action_config || {}), error_message, priority || 0, req.user.id]);
    successResponse(res, r.rows[0], 'Rule created', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.put('/business-rules/:id/toggle', authenticate, adminOnly, async (req, res) => {
  try { await query(`UPDATE sys_business_rules SET is_active = NOT is_active WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Toggled'); } catch (err) { errorResponse(res, err.message); }
});
router.delete('/business-rules/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_business_rules WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});
// Evaluate business rules for an entity
router.post('/business-rules/evaluate', authenticate, async (req, res) => {
  try {
    const { entity_type, data, trigger_point } = req.body;
    const rules = await query(`SELECT * FROM sys_business_rules WHERE entity_type = $1 AND trigger_point = $2 AND is_active = true ORDER BY priority`, [entity_type, trigger_point || 'before_save']);
    const violations = [];
    for (const rule of rules.rows) {
      const conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
      let violated = false;
      for (const cond of conditions) {
        const val = data[cond.field];
        if (cond.operator === 'gt' && parseFloat(val) > parseFloat(cond.value)) violated = true;
        if (cond.operator === 'lt' && parseFloat(val) < parseFloat(cond.value)) violated = true;
        if (cond.operator === 'eq' && String(val) === String(cond.value)) violated = true;
        if (cond.operator === 'empty' && (!val || val === '')) violated = true;
        if (cond.operator === 'not_empty' && val && val !== '') violated = true;
      }
      if (violated) violations.push({ rule_name: rule.rule_name, action: rule.action_type, message: rule.error_message || `Business rule violated: ${rule.rule_name}` });
    }
    successResponse(res, { violations, blocked: violations.some(v => v.action === 'block') });
  } catch (err) { errorResponse(res, err.message); }
});

// ========== 5. VALIDATION RULES ==========
router.get('/validation-rules', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_validation_rules WHERE is_active = true ORDER BY entity_type, field_name`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/validation-rules', authenticate, adminOnly, async (req, res) => {
  try {
    const { entity_type, field_name, rule_type, rule_value, error_message } = req.body;
    if (!entity_type || !field_name || !rule_type) return errorResponse(res, 'Entity, field, and rule type are required', 400);
    const r = await query(
      `INSERT INTO sys_validation_rules (entity_type, field_name, rule_type, rule_value, error_message, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (entity_type, field_name, rule_type) DO UPDATE
         SET rule_value=$4, error_message=$5
       RETURNING *`,
      [entity_type, field_name, rule_type, rule_value, error_message, req.user.id]);
    successResponse(res, r.rows[0], 'Saved', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/validation-rules/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_validation_rules WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});

// ========== 6. DASHBOARD WIDGETS ==========
router.get('/dashboard-widgets', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_dashboard_widgets ORDER BY sort_order`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/dashboard-widgets', authenticate, adminOnly, async (req, res) => {
  try {
    const { widget_name, widget_type, config, data_source, role_filter, sort_order, grid_cols } = req.body;
    const r = await query(`INSERT INTO sys_dashboard_widgets (widget_name, widget_type, config, data_source, role_filter, sort_order, grid_cols, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [widget_name, widget_type, JSON.stringify(config || {}), data_source, JSON.stringify(role_filter || []), sort_order || 0, grid_cols || 1, req.user.id]);
    successResponse(res, r.rows[0], 'Widget created', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/dashboard-widgets/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_dashboard_widgets WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});

// ========== 7. DATA IMPORT ==========
router.post('/import', authenticate, adminOnly, async (req, res) => {
  try {
    const { entity_type, data, field_mapping } = req.body;
    if (!entity_type || !data?.length) return errorResponse(res, 'Entity and data required', 400);
    const allowedTables = {
      business_partners: 'bp_business_partners', materials: 'mm_materials', employees: 'hr_employees',
    };
    const table = allowedTables[entity_type];
    if (!table) return errorResponse(res, 'Unsupported entity for import', 400);

    const log = await query(`INSERT INTO sys_import_log (entity_type, file_name, total_rows, imported_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [entity_type, `import_${Date.now()}.json`, data.length, req.user.id]);

    let success = 0, failed = 0; const errors = [];
    for (let i = 0; i < data.length; i++) {
      try {
        let record = data[i];
        if (field_mapping?.length) {
          const mapped = {};
          for (const m of field_mapping) { if (m.source && m.target && record[m.source] !== undefined) mapped[m.target] = record[m.source]; }
          record = mapped;
        }
        const cols = Object.keys(record);
        const vals = Object.values(record);
        await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`, vals);
        success++;
      } catch (err) { failed++; errors.push({ row: i + 1, error: err.message }); }
    }

    await query(`UPDATE sys_import_log SET success_rows=$1, failed_rows=$2, error_details=$3, status='completed', completed_at=NOW() WHERE id=$4`,
      [success, failed, JSON.stringify(errors.slice(0, 100)), log.rows[0].id]);
    successResponse(res, { total: data.length, success, failed, errors: errors.slice(0, 10) });
  } catch (err) { errorResponse(res, err.message); }
});
router.get('/import-log', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_import_log ORDER BY created_at DESC LIMIT 50`)).rows); } catch (err) { errorResponse(res, err.message); }
});

// ========== 8. PRINT TEMPLATES ==========
router.get('/print-templates', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_print_templates ORDER BY entity_type`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.get('/print-templates/:id', authenticate, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const r = await query(`SELECT * FROM sys_print_templates WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0]);
  } catch (err) { errorResponse(res, err.message); }
});
router.post('/print-templates', authenticate, adminOnly, async (req, res) => {
  try {
    const t = req.body;
    const r = await query(`INSERT INTO sys_print_templates (template_name, entity_type, header_html, body_html, footer_html, logo_url, company_name, company_address, company_phone, company_email, company_tax_id, is_default, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [t.template_name, t.entity_type, t.header_html, t.body_html, t.footer_html, t.logo_url, t.company_name, t.company_address, t.company_phone, t.company_email, t.company_tax_id, t.is_default || false, req.user.id]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.put('/print-templates/:id', authenticate, adminOnly, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const t = req.body;
    await query(`UPDATE sys_print_templates SET
      template_name=COALESCE($1,template_name),
      header_html=$2,
      body_html=CASE WHEN $3::text IS NOT NULL AND $3::text != '' THEN $3::text ELSE body_html END,
      footer_html=$4,
      logo_url=COALESCE($5,logo_url),
      company_name=COALESCE($6,company_name),
      company_address=COALESCE($7,company_address),
      company_phone=COALESCE($8,company_phone),
      company_email=COALESCE($9,company_email),
      company_tax_id=COALESCE($10,company_tax_id),
      updated_at=NOW()
      WHERE id=$11`,
      [t.template_name, t.header_html||null, t.body_html||null, t.footer_html||null, t.logo_url||null, t.company_name||null, t.company_address||null, t.company_phone||null, t.company_email||null, t.company_tax_id||null, req.params.id]);
    successResponse(res, null, 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/print-templates/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_print_templates WHERE id=$1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});

// POST /platform/print-templates/seed-defaults — insert default templates for all entities
router.post('/print-templates/seed-defaults', authenticate, adminOnly, async (req, res) => {
  try {
    // Shared CSS — injected into each template body_html
    const CSS = `<style>@media print{@page{size:A4;margin:8mm}}.main-box{border:2px solid #000;display:flex;flex-direction:column}table{width:100%;border-collapse:collapse;margin-bottom:-1px}td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}.title-text{font-size:13pt;letter-spacing:2px}.company-name{font-size:10pt}.bold{font-weight:bold}.center{text-align:center}.right{text-align:right}.gray{background-color:#f2f2f2}.no-border-left{border-left:none!important}.no-border-right{border-right:none!important}.unruled-items td{border-top:none!important;border-bottom:none!important;padding-top:1px;padding-bottom:1px}.spacer-row td{height:8px;border-top:none!important;border-bottom:1px solid #000!important}.footer-row td{border-top:1px solid #000!important;background-color:#f2f2f2;padding:5px}</style>`;

    // Header: company letterhead + document title
    const hdr = (title) => `${CSS}<div class="main-box"><table>
      <tr><td colspan="2" class="center bold gray title-text">${title}</td></tr>
      <tr>
        <td style="width:20%;" class="no-border-right center">{{company_logo}}</td>
        <td style="width:80%;line-height:1.2;" class="no-border-left center">
          <div class="bold company-name">{{company_name}}</div>
          <div style="font-size:8pt;">{{company_address}}<br><b>Contact:</b> {{company_phone}} | <b>Email:</b> {{company_email}}<br><b>GST:</b> {{company_tax_id}}</div>
        </td>
      </tr></table>`;

    // Amount in words row
    const words = `<table><tr><td style="padding:5px;"><b>Amount in Words:</b> {{amount_in_words}}</td></tr></table>`;

    // Signature/remarks footer — flex:1 makes it grow to fill remaining page height
    const sig = `<table style="flex:1;height:250px;"><tr>
      <td style="width:60%;vertical-align:top;"><b>Remarks:</b><br>{{notes}}</td>
      <td style="width:40%;position:relative;" class="center">
        <br><b>For {{company_name}}</b>
        <div style="position:absolute;bottom:10px;width:100%;left:0;text-align:center;">
          <hr style="width:70%;border:0.4px solid #000;margin:0 auto 4px;"><b>Authorised Signatory</b>
        </div>
      </td>
    </tr></table></div>`;

    // Vendor info block — right side has doc-specific fields via inner nested table
    const vendorInfo = (docLabel='PO No', dateLabel='PO Date', extra='') => `<table><tr>
      <td style="width:55%;">
        <span class="bold" style="text-decoration:underline;">Vendor Details:</span><br>
        <b>{{vendor_name}}</b><br>{{vendor_address}}<br>
        <b>GST:</b> {{vendor_gstin}} | <b>PAN:</b> {{vendor_pan}}
      </td>
      <td style="width:45%;padding:0;"><table style="border:none;">
        <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;width:50%;"><b>${docLabel}:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{doc_number}}</td></tr>
        <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>${dateLabel}:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{date}}</td></tr>
        ${extra}
        <tr><td style="border:none;padding:3px 5px;"><b>Place of Supply:</b></td><td style="border:none;padding:3px 5px;">{{place_of_supply}}</td></tr>
      </table></td>
    </tr></table>`;

    // Customer info block
    const customerInfo = (docLabel='SO No', dateLabel='SO Date', extra='') => `<table><tr>
      <td style="width:55%;">
        <span class="bold" style="text-decoration:underline;">Customer Details:</span><br>
        <b>{{customer_name}}</b><br>{{customer_address}}<br>
        <b>GST:</b> {{customer_gstin}}
      </td>
      <td style="width:45%;padding:0;"><table style="border:none;">
        <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;width:50%;"><b>${docLabel}:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{doc_number}}</td></tr>
        <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>${dateLabel}:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{date}}</td></tr>
        ${extra}
        <tr><td style="border:none;padding:3px 5px;"><b>Place of Supply:</b></td><td style="border:none;padding:3px 5px;">{{place_of_supply}}</td></tr>
      </table></td>
    </tr></table>`;

    const templates = [
      {
        template_name: 'Default Purchase Order',
        entity_type: 'purchase_order',
        body_html: hdr('PURCHASE ORDER') + vendorInfo('PO No','PO Date') + `{{items_table}}{{tax_table}}` + words + sig,
      },
      {
        template_name: 'Default Sales Order',
        entity_type: 'sales_order',
        body_html: hdr('SALES ORDER') + customerInfo('SO No','SO Date',
          `<tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>Delivery Date:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{delivery_date}}</td></tr>
           <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>Customer PO:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{customer_po_number}}</td></tr>`
        ) + `{{items_table}}{{tax_table}}` + words + sig,
      },
      {
        template_name: 'Default Purchase Requisition',
        entity_type: 'purchase_requisition',
        body_html: hdr('PURCHASE REQUISITION') + `<table><tr>
          <td style="width:55%;"><b>Requested By:</b> {{requester_name}}<br><b>Department:</b> {{department}}</td>
          <td style="width:45%;padding:0;"><table style="border:none;">
            <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;width:50%;"><b>PR No:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{doc_number}}</td></tr>
            <tr><td style="border:none;padding:3px 5px;"><b>PR Date:</b></td><td style="border:none;padding:3px 5px;">{{date}}</td></tr>
          </table></td>
        </tr></table>` + `{{items_table}}` + words + sig,
      },
      {
        template_name: 'Default AP Invoice',
        entity_type: 'ap_invoice',
        body_html: hdr('TAX INVOICE') + vendorInfo('Invoice No','Invoice Date') + `{{items_table}}{{tax_table}}` + words +
          `<table style="flex:1;height:150px;"><tr>
            <td style="width:60%;vertical-align:top;"><b>Bank Details / Payment Instructions:</b><br><br></td>
            <td style="width:40%;position:relative;" class="center"><br><b>For {{company_name}}</b>
              <div style="position:absolute;bottom:10px;width:100%;left:0;text-align:center;">
                <hr style="width:70%;border:0.4px solid #000;margin:0 auto 4px;"><b>Authorised Signatory</b>
              </div>
            </td>
          </tr></table></div>`,
      },
      {
        template_name: 'Default Payment Voucher',
        entity_type: 'payment',
        body_html: hdr('PAYMENT VOUCHER') + `<table><tr>
          <td style="width:55%;"><b>Paid To:</b> {{party_name}}</td>
          <td style="width:45%;padding:0;"><table style="border:none;">
            <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;width:50%;"><b>Voucher No:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{doc_number}}</td></tr>
            <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>Date:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{date}}</td></tr>
            <tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>Method:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{payment_method}}</td></tr>
            <tr><td style="border:none;padding:3px 5px;"><b>Reference:</b></td><td style="border:none;padding:3px 5px;">{{reference_number}}</td></tr>
          </table></td>
        </tr></table>
        <table><tr class="bold gray"><td class="right" style="font-size:10pt;">Amount Paid</td><td style="width:160px;" class="right"><b>{{amount}}</b></td></tr></table>` +
        words +
        `<table style="flex:1;height:200px;"><tr>
          <td style="width:50%;vertical-align:top;"><b>Prepared By:</b><br><br><br>
            <div style="border-top:0.4px solid #000;margin-top:20px;width:80%;padding-top:4px;">Signature</div>
          </td>
          <td style="width:50%;position:relative;" class="center"><br><b>For {{company_name}}</b>
            <div style="position:absolute;bottom:10px;width:100%;left:0;text-align:center;">
              <hr style="width:70%;border:0.4px solid #000;margin:0 auto 4px;"><b>Authorised Signatory</b>
            </div>
          </td>
        </tr></table></div>`,
      },
      {
        template_name: 'Default Quotation',
        entity_type: 'quotation',
        body_html: hdr('QUOTATION') + customerInfo('Quotation No','Date',
          `<tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>Valid Until:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{valid_until}}</td></tr>`
        ) + `{{items_table}}{{tax_table}}` + words + sig,
      },
      {
        template_name: 'Default AR Invoice',
        entity_type: 'ar_invoice',
        body_html: hdr('TAX INVOICE') + customerInfo('Invoice No','Invoice Date',
          `<tr><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;"><b>Due Date:</b></td><td style="border:none;border-bottom:1px solid #000;padding:3px 5px;">{{due_date}}</td></tr>`
        ) + `{{items_table}}{{tax_table}}` + words + sig,
      },
    ];

    const result = [];
    for (const t of templates) {
      const existing = await query(`SELECT id FROM sys_print_templates WHERE entity_type=$1 AND is_default=true LIMIT 1`, [t.entity_type]);
      if (existing.rows.length) {
        // Skip — never overwrite user-customized templates
        result.push({ entity_type: t.entity_type, status: 'skipped', id: existing.rows[0].id });
      } else {
        const r = await query(`INSERT INTO sys_print_templates (template_name, entity_type, body_html, is_default, created_by) VALUES ($1,$2,$3,true,$4) RETURNING id`,
          [t.template_name, t.entity_type, t.body_html, req.user.id]);
        result.push({ entity_type: t.entity_type, status: 'created', id: r.rows[0].id });
      }
    }
    successResponse(res, result, 'Default templates seeded');
  } catch (err) { errorResponse(res, err.message); }
});

// ── helpers ──────────────────────────────────────────────────────────────────
function numberToWords(amount) {
  if (amount == null || isNaN(amount)) return '';
  const n = Math.round(parseFloat(amount) * 100);
  const rupees = Math.floor(n / 100);
  const paise = n % 100;
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function toWords(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' ' + ones[num%10] : '');
    if (num < 1000) return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' ' + toWords(num%100) : '');
    if (num < 100000) return toWords(Math.floor(num/1000)) + ' Thousand' + (num%1000 ? ' ' + toWords(num%1000) : '');
    if (num < 10000000) return toWords(Math.floor(num/100000)) + ' Lakh' + (num%100000 ? ' ' + toWords(num%100000) : '');
    return toWords(Math.floor(num/10000000)) + ' Crore' + (num%10000000 ? ' ' + toWords(num%10000000) : '');
  }
  const rupeesStr = rupees === 0 ? 'Zero' : toWords(rupees);
  return 'INR ' + rupeesStr + ' Rupees' + (paise > 0 ? ' and ' + toWords(paise) + ' Paise' : '') + ' Only';
}

function buildItemsTableHtml(items, currency, subtotal) {
  const fmt = v => { if (v==null) return '—'; const s=currency==='USD'?'$':currency==='EUR'?'€':'₹'; return `${s}${parseFloat(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };
  if (!items?.length) return '<p style="font-size:9px;font-style:italic;padding:5px;">No items found.</p>';
  const rows = items.map((it,idx) => {
    const lineTotal = it.total_amount||it.total_price||(parseFloat(it.quantity||1)*parseFloat(it.unit_price||it.estimated_price||0));
    return `<tr class="unruled-items">
      <td class="center">${idx+1}</td>
      <td><b>${it.item_name||it.description||'—'}</b>${(it.material_code||it.material_number)?`<br><small style="color:#555;">${it.material_code||it.material_number}</small>`:''}</td>
      <td class="right">${fmt(it.unit_price||it.estimated_price||it.rate)}</td>
      <td class="center">${parseFloat(it.quantity||0).toFixed(3)} ${it.uom_name||'Nos'}</td>
      <td class="center">${parseFloat(it.discount_percent||0).toFixed(1)}%</td>
      <td class="right">${fmt(lineTotal)}</td>
    </tr>`;
  }).join('');
  const calcSubtotal = subtotal != null ? subtotal : items.reduce((s,it)=>s+parseFloat(it.total_amount||it.total_price||(parseFloat(it.quantity||1)*parseFloat(it.unit_price||it.estimated_price||0))||0),0);
  return `<table>
    <thead><tr class="gray bold center">
      <th style="width:5%;">S.No</th>
      <th style="width:38%;">Description</th>
      <th style="width:15%;">Unit Rate</th>
      <th style="width:15%;">Qty</th>
      <th style="width:10%;">Disc%</th>
      <th style="width:17%;">Total (INR)</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="spacer-row"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
      <tr class="footer-row bold"><td colspan="5" class="right">Sub-Total</td><td class="right">${fmt(calcSubtotal)}</td></tr>
    </tbody>
  </table>`;
}

function buildTaxTableHtml(items, currency, grandTotal) {
  const fmt = v => { if (v==null) return '—'; const s=currency==='USD'?'$':currency==='EUR'?'€':'₹'; return `${s}${parseFloat(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };
  if (!items?.length) return '';
  let totTaxable=0, totTax=0;
  const rows = items.map((it,idx) => {
    const totalAmt = parseFloat(it.total_amount||it.total_price||(parseFloat(it.quantity||1)*parseFloat(it.unit_price||0)))||0;
    const taxAmt = parseFloat(it.tax_amount||0);
    const taxable = totalAmt - taxAmt;
    const rate = taxable > 0 ? Math.round(taxAmt / taxable * 100) : 0;
    const halfRate = rate / 2;
    const cgst = taxAmt / 2; const sgst = taxAmt / 2;
    totTaxable += taxable; totTax += taxAmt;
    return `<tr class="center">
      <td>${idx+1}</td>
      <td class="right">${fmt(taxable)}</td>
      <td>${halfRate.toFixed(1)}%</td><td class="right">${fmt(cgst)}</td>
      <td>${halfRate.toFixed(1)}%</td><td class="right">${fmt(sgst)}</td>
      <td class="right">${fmt(taxAmt)}</td>
    </tr>`;
  }).join('');
  const grand = grandTotal != null ? grandTotal : (totTaxable + totTax);
  return `<table>
    <thead><tr class="gray bold center" style="font-size:8pt;">
      <th style="width:5%;">S.No</th>
      <th>Taxable Value</th>
      <th colspan="2">CGST</th>
      <th colspan="2">SGST</th>
      <th>Total Tax</th>
    </tr></thead>
    <tbody>
      ${rows}
      <tr class="bold"><td colspan="6" class="right">Grand Total (INR)</td><td class="right" style="font-size:9pt;">${fmt(grand)}</td></tr>
    </tbody>
  </table>`;
}

// Fetch entity data for print template rendering
async function fetchEntityData(entityType, entityId) {
  const fmt = (v, cur='INR') => { if (v==null) return '—'; const s=cur==='USD'?'$':cur==='EUR'?'€':'₹'; return `${s}${parseFloat(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`; };
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const bpAddr = bp => [bp.address_line1, bp.city, bp.state, bp.postal_code].filter(Boolean).join(', ');
  try {
    if (entityType === 'purchase_order') {
      const r = await query(`SELECT po.*, bp.display_name as vendor_name, bp.gstin as vendor_gstin, bp.pan as vendor_pan, bp.address_line1, bp.city, bp.state, bp.postal_code, pt.term_name as payment_terms, u.first_name||' '||u.last_name as created_by_name FROM pur_purchase_orders po LEFT JOIN bp_business_partners bp ON po.vendor_id=bp.id LEFT JOIN fi_payment_terms pt ON po.payment_term_id=pt.id LEFT JOIN sys_users u ON po.created_by=u.id WHERE po.id=$1`,[entityId]);
      if (!r.rows.length) return {};
      const e=r.rows[0]; const cur=e.currency||'INR';
      const items=(await query(`SELECT poi.*, COALESCE(m.material_name,poi.description) as item_name, m.material_code, uom.uom_name FROM pur_po_items poi LEFT JOIN mm_materials m ON poi.material_id=m.id LEFT JOIN mm_units_of_measure uom ON poi.uom_id=uom.id WHERE poi.po_id=$1 ORDER BY poi.line_number`,[entityId])).rows;
      const rawTotal = parseFloat(e.total_amount)||0;
      return {doc_number:e.doc_number,date:fmtDate(e.order_date||e.created_at),status:(e.status||'').replace(/_/g,' ').toUpperCase(),vendor_name:e.vendor_name||'—',vendor_address:bpAddr(e),vendor_gstin:e.vendor_gstin||'—',vendor_pan:e.vendor_pan||'—',payment_terms:e.payment_terms||'—',place_of_supply:e.state||e.city||'—',subtotal:fmt(e.subtotal,cur),tax_amount:fmt(e.tax_amount,cur),total_amount:fmt(rawTotal,cur),amount_in_words:numberToWords(rawTotal),currency:cur,description:e.description||'',notes:e.notes||'',_items:items,_currency:cur};
    }
    if (entityType === 'purchase_requisition') {
      const r = await query(`SELECT pr.*, u.first_name||' '||u.last_name as requester_name FROM pur_requisitions pr LEFT JOIN sys_users u ON pr.requester_id=u.id WHERE pr.id=$1`,[entityId]);
      if (!r.rows.length) return {};
      const e=r.rows[0]; const rawTotal = parseFloat(e.total_amount)||0;
      const items=(await query(`SELECT pri.*, COALESCE(m.material_name,pri.description) as item_name, m.material_code, uom.uom_name FROM pur_requisition_items pri LEFT JOIN mm_materials m ON pri.material_id=m.id LEFT JOIN mm_units_of_measure uom ON pri.uom_id=uom.id WHERE pri.requisition_id=$1 ORDER BY pri.line_number,pri.id`,[entityId]).catch(()=>({rows:[]}))).rows;
      return {doc_number:e.doc_number,date:fmtDate(e.required_date||e.created_at),status:(e.status||'').replace(/_/g,' ').toUpperCase(),requester_name:e.requester_name||'—',department:e.department||'—',description:e.description||'',notes:e.justification||e.description||'',total_amount:fmt(rawTotal),amount_in_words:numberToWords(rawTotal),_items:items,_currency:e.currency||'INR'};
    }
    if (entityType === 'sales_order') {
      const r = await query(`SELECT so.*, bp.display_name as customer_name, bp.gstin as customer_gstin, bp.pan as customer_pan, bp.address_line1, bp.city, bp.state, bp.postal_code FROM sd_sales_orders so LEFT JOIN bp_business_partners bp ON so.customer_id=bp.id WHERE so.id=$1`,[entityId]);
      if (!r.rows.length) return {};
      const e=r.rows[0]; const cur=e.currency||'INR'; const rawTotal=parseFloat(e.total_amount)||0;
      const items=(await query(`SELECT soi.*, COALESCE(m.material_name,soi.description) as item_name, m.material_code, uom.uom_name FROM sd_so_items soi LEFT JOIN mm_materials m ON soi.material_id=m.id LEFT JOIN mm_units_of_measure uom ON soi.uom_id=uom.id WHERE soi.so_id=$1 ORDER BY soi.line_number`,[entityId])).rows;
      return {doc_number:e.doc_number,date:fmtDate(e.order_date||e.created_at),status:(e.status||'').replace(/_/g,' ').toUpperCase(),customer_name:e.customer_name||'—',customer_address:bpAddr(e),customer_gstin:e.customer_gstin||'—',customer_pan:e.customer_pan||'—',customer_po_number:e.customer_po_number||'—',delivery_date:fmtDate(e.delivery_date),shipping_method:e.shipping_method||'—',delivery_terms:e.delivery_terms||'—',place_of_supply:e.state||e.city||'—',subtotal:fmt(e.subtotal,cur),tax_amount:fmt(e.tax_amount,cur),total_amount:fmt(rawTotal,cur),amount_in_words:numberToWords(rawTotal),currency:cur,notes:e.internal_notes||'',_items:items,_currency:cur};
    }
    if (entityType === 'ap_invoice') {
      const r = await query(`SELECT ai.*, bp.display_name as vendor_name, bp.gstin as vendor_gstin, bp.pan as vendor_pan, bp.address_line1, bp.city, bp.state, bp.postal_code FROM fi_ap_invoices ai LEFT JOIN bp_business_partners bp ON ai.vendor_id=bp.id WHERE ai.id=$1`,[entityId]);
      if (!r.rows.length) return {};
      const e=r.rows[0]; const cur=e.currency||'INR'; const rawTotal=parseFloat(e.total_amount)||0;
      // Fetch invoice line items; AP items use cgst_amount+sgst_amount+igst_amount instead of tax_amount
      let apItems=(await query(`SELECT aii.*, COALESCE(m.material_name,aii.description) as item_name, m.material_code, uom.uom_name FROM fi_ap_invoice_items aii LEFT JOIN mm_materials m ON aii.material_id=m.id LEFT JOIN mm_units_of_measure uom ON aii.uom_id=uom.id WHERE aii.invoice_id=$1 ORDER BY aii.line_number`,[entityId]).catch(()=>({rows:[]}))).rows;
      // Fall back to referenced PO items if invoice has no line items saved
      if (!apItems.length && e.po_reference) {
        apItems=(await query(`SELECT poi.*, COALESCE(m.material_name,poi.description) as item_name, m.material_code, uom.uom_name FROM pur_po_items poi LEFT JOIN mm_materials m ON poi.material_id=m.id LEFT JOIN mm_units_of_measure uom ON poi.uom_id=uom.id WHERE poi.po_id=$1 ORDER BY poi.line_number`,[e.po_reference]).catch(()=>({rows:[]}))).rows;
      }
      // Normalise: add tax_amount from CGST+SGST+IGST for AP invoice items
      const items = apItems.map(it => ({...it, tax_amount: it.tax_amount != null ? it.tax_amount : ((parseFloat(it.cgst_amount)||0)+(parseFloat(it.sgst_amount)||0)+(parseFloat(it.igst_amount)||0))}));
      return {doc_number:e.doc_number,date:fmtDate(e.invoice_date||e.created_at),due_date:fmtDate(e.due_date),status:(e.status||'').replace(/_/g,' ').toUpperCase(),vendor_name:e.vendor_name||'—',vendor_address:bpAddr(e),vendor_gstin:e.vendor_gstin||e.vendor_gstin||'—',vendor_pan:e.vendor_pan||'—',place_of_supply:e.place_of_supply||e.state||e.city||'—',subtotal:fmt(e.subtotal,cur),tax_amount:fmt(e.tax_amount,cur),total_amount:fmt(rawTotal,cur),amount_in_words:numberToWords(rawTotal),currency:cur,notes:e.description||'',_items:items,_currency:cur};
    }
    if (entityType === 'payment') {
      const r = await query(`SELECT p.*, bp.display_name as party_name FROM fi_payments p LEFT JOIN bp_business_partners bp ON p.business_partner_id=bp.id WHERE p.id=$1`,[entityId]);
      if (!r.rows.length) return {};
      const e=r.rows[0]; const cur=e.currency||'INR'; const rawAmt=parseFloat(e.amount)||0;
      return {doc_number:e.doc_number,date:fmtDate(e.payment_date||e.created_at),status:(e.status||'').replace(/_/g,' ').toUpperCase(),party_name:e.party_name||'—',amount:fmt(rawAmt,cur),amount_in_words:numberToWords(rawAmt),payment_method:(e.payment_method||'').replace(/_/g,' '),reference_number:e.reference_number||'—',currency:cur,_items:[],_currency:cur};
    }
    if (entityType === 'quotation') {
      const r = await query(`SELECT q.*, bp.display_name as customer_name, bp.gstin as customer_gstin, bp.address_line1, bp.city, bp.state, bp.postal_code FROM sd_quotations q LEFT JOIN bp_business_partners bp ON q.customer_id=bp.id WHERE q.id=$1`,[entityId]).catch(()=>({rows:[]}));
      if (!r.rows.length) return {};
      const e=r.rows[0]; const cur=e.currency||'INR'; const rawTotal=parseFloat(e.total_amount)||0;
      const items=(await query(`SELECT qi.*, COALESCE(m.material_name,qi.description) as item_name, m.material_code, uom.uom_name FROM sd_quotation_items qi LEFT JOIN mm_materials m ON qi.material_id=m.id LEFT JOIN mm_units_of_measure uom ON qi.uom_id=uom.id WHERE qi.quotation_id=$1`,[entityId]).catch(()=>({rows:[]}))).rows;
      return {doc_number:e.doc_number,date:fmtDate(e.created_at),valid_until:fmtDate(e.valid_until),status:(e.status||'').replace(/_/g,' ').toUpperCase(),customer_name:e.customer_name||'—',customer_address:bpAddr(e),customer_gstin:e.customer_gstin||'—',place_of_supply:e.state||e.city||'—',subtotal:fmt(e.subtotal,cur),tax_amount:fmt(e.tax_amount,cur),total_amount:fmt(rawTotal,cur),amount_in_words:numberToWords(rawTotal),currency:cur,_items:items,_currency:cur};
    }
    if (entityType === 'ar_invoice') {
      const r = await query(`SELECT ai.*, bp.display_name as customer_name, bp.gstin as customer_gstin, bp.pan as customer_pan, bp.address_line1, bp.city, bp.state, bp.postal_code FROM fi_ar_invoices ai LEFT JOIN bp_business_partners bp ON ai.customer_id=bp.id WHERE ai.id=$1`,[entityId]).catch(()=>({rows:[]}));
      if (!r.rows.length) return {};
      const e=r.rows[0]; const cur=e.currency||'INR'; const rawTotal=parseFloat(e.total_amount)||0;
      const arItems=(await query(`SELECT aii.*, COALESCE(m.material_name,aii.description) as item_name, m.material_code, uom.uom_name FROM fi_ar_invoice_items aii LEFT JOIN mm_materials m ON aii.material_id=m.id LEFT JOIN mm_units_of_measure uom ON aii.uom_id=uom.id WHERE aii.invoice_id=$1 ORDER BY aii.id`,[entityId]).catch(()=>({rows:[]}))).rows;
      const items = arItems.map(it => ({...it, tax_amount: it.tax_amount != null ? it.tax_amount : ((parseFloat(it.cgst_amount)||0)+(parseFloat(it.sgst_amount)||0)+(parseFloat(it.igst_amount)||0))}));
      return {doc_number:e.doc_number,date:fmtDate(e.invoice_date||e.created_at),due_date:fmtDate(e.due_date),status:(e.status||'').replace(/_/g,' ').toUpperCase(),customer_name:e.customer_name||'—',customer_address:bpAddr(e),customer_gstin:e.customer_gstin||'—',customer_pan:e.customer_pan||'—',place_of_supply:e.place_of_supply||e.state||e.city||'—',subtotal:fmt(e.subtotal,cur),tax_amount:fmt(e.tax_amount,cur),total_amount:fmt(rawTotal,cur),amount_in_words:numberToWords(rawTotal),currency:cur,notes:e.description||e.notes||'',_items:items,_currency:cur};
    }
  } catch(err) { console.error('fetchEntityData:',err.message); }
  return {};
}

// GET /platform/print-templates/:id/render?entity_id=xxx  — returns full HTML document
router.get('/print-templates/:id/render', authenticate, async (req, res) => {
  try {
    const { entity_id } = req.query;
    const tpl = (await query(`SELECT * FROM sys_print_templates WHERE id=$1`,[req.params.id])).rows[0];
    if (!tpl) return errorResponse(res, 'Template not found', 404);

    const data = entity_id ? await fetchEntityData(tpl.entity_type, entity_id) : {};
    // fetchEntityData returns pre-formatted strings (e.g. "₹50.00") — strip symbols to get raw numbers
    const parseAmt = s => parseFloat(String(s||'0').replace(/[^0-9.-]/g,''))||0;
    const grandTotal = parseAmt(data.total_amount || data.grand_total);
    const taxTotal = parseAmt(data.tax_amount);
    const subtotal = parseAmt(data.subtotal) || (grandTotal - taxTotal) || null;
    const itemsHtml = buildItemsTableHtml(data._items, data._currency, subtotal);
    const taxHtml = buildTaxTableHtml(data._items, data._currency, grandTotal);

    const templateHtml = [tpl.header_html, tpl.body_html, tpl.footer_html].filter(Boolean).join('\n');
    let rendered = templateHtml
      .replace(/\{\{items_table\}\}/g, itemsHtml)
      .replace(/\{\{tax_table\}\}/g, taxHtml)
      .replace(/\{\{company_logo\}\}/g, tpl.logo_url ? `<img src="${tpl.logo_url}" style="max-height:80px;max-width:200px;" alt="logo">` : '');

    const companyVars = { company_name: tpl.company_name||'', company_address: tpl.company_address||'', company_phone: tpl.company_phone||'', company_email: tpl.company_email||'', company_tax_id: tpl.company_tax_id||'' };
    Object.entries({...companyVars,...data}).forEach(([k,v]) => {
      if (k.startsWith('_')) return;
      rendered = rendered.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v!=null ? String(v) : '');
    });

    res.set('Content-Type','text/html');
    const isFullDocument = /^\s*<!DOCTYPE\s/i.test(rendered) || /^\s*<html[\s>]/i.test(rendered);
    if (isFullDocument) {
      // Template is a complete HTML document — inject print CSS into existing <head> without double-wrapping
      const printCss = `<style>*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}@media print{@page{size:A4;margin:8mm}}</style>`;
      const output = /<head[^>]*>/i.test(rendered)
        ? rendered.replace(/<head([^>]*)>/i, `<head$1>${printCss}`)
        : rendered.replace(/^\s*(<html[^>]*>)/i, `$1<head>${printCss}</head>`);
      res.send(output);
    } else {
      res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${tpl.template_name} - ${data.doc_number||''}</title><style>*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{width:100%;margin:0;padding:0;background:white;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#000}img{max-width:100%}table{width:100%;border-collapse:collapse;margin-bottom:-1px}td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}.main-box{border:2px solid #000;display:flex;flex-direction:column;min-height:281mm}.main-box>*:last-child{flex:1}.bold{font-weight:bold}.center{text-align:center}.right{text-align:right}.gray{background-color:#f2f2f2}.no-border-left{border-left:none!important}.no-border-right{border-right:none!important}.unruled-items td{border-top:none!important;border-bottom:none!important;padding-top:1px;padding-bottom:1px}.spacer-row td{height:8px;border-top:none!important;border-bottom:1px solid #000!important}.footer-row td{border-top:1px solid #000!important;background-color:#f2f2f2;padding:5px}.title-text{font-size:13pt;letter-spacing:2px}.company-name{font-size:10pt}@media print{@page{size:A4;margin:8mm}html,body{width:100%;margin:0;padding:0}.main-box{min-height:281mm}}</style></head><body>${rendered}</body></html>`);
    }
  } catch(err) { errorResponse(res, err.message); }
});

// ========== 9. LOCALIZATION ==========
router.get('/languages', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_supported_languages ORDER BY language_name`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.get('/translations/:lang', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT translation_key, translation_value FROM sys_translations WHERE language_code = $1`, [req.params.lang])).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/translations', authenticate, adminOnly, async (req, res) => {
  try {
    const { language_code, translations } = req.body;
    let count = 0;
    for (const { key, value } of translations) {
      await query(`INSERT INTO sys_translations (language_code, translation_key, translation_value) VALUES ($1,$2,$3) ON CONFLICT (language_code, translation_key) DO UPDATE SET translation_value = $3`, [language_code, key, value]);
      count++;
    }
    successResponse(res, { count }, `${count} translations saved`);
  } catch (err) { errorResponse(res, err.message); }
});

// ========== 10. APPROVAL RULES ==========
router.get('/approval-rules', authenticate, async (req, res) => {
  try {
    const rules = (await query(`SELECT r.*, u.first_name || ' ' || u.last_name as approver_name FROM sys_approval_rules r LEFT JOIN sys_users u ON r.approver_user_id = u.id ORDER BY entity_type, priority`)).rows;
    // Collect all user IDs referenced in approver_steps across all rules
    const allUserIds = new Set();
    for (const rule of rules) {
      const steps = Array.isArray(rule.approver_steps) ? rule.approver_steps
        : (typeof rule.approver_steps === 'string' ? JSON.parse(rule.approver_steps || '[]') : []);
      steps.forEach(s => { if (s.approver_user_id) allUserIds.add(s.approver_user_id); });
    }
    // Fetch all referenced users in one query
    const userMap = {};
    if (allUserIds.size > 0) {
      const uRes = await query(`SELECT id, first_name || ' ' || last_name as full_name FROM sys_users WHERE id = ANY($1)`, [Array.from(allUserIds)]);
      uRes.rows.forEach(u => { userMap[u.id] = u.full_name; });
    }
    // Enrich each rule's approver_steps with user names
    const enriched = rules.map(rule => {
      const steps = Array.isArray(rule.approver_steps) ? rule.approver_steps
        : (typeof rule.approver_steps === 'string' ? JSON.parse(rule.approver_steps || '[]') : []);
      return {
        ...rule,
        approver_steps: steps.map(s => ({
          ...s,
          approver_user_name: s.approver_user_id ? (userMap[s.approver_user_id] || s.approver_user_id) : null,
        })),
      };
    });
    successResponse(res, enriched);
  } catch (err) { errorResponse(res, err.message); }
});
router.post('/approval-rules', authenticate, adminOnly, async (req, res) => {
  try {
    const { rule_name, entity_type, condition_field, condition_operator, condition_value, approver_role, approver_user_id, priority, approver_steps } = req.body;
    // Derive top-level role/user from first step for backward compatibility
    const steps = Array.isArray(approver_steps) && approver_steps.length ? approver_steps : null;
    const firstRole = steps ? (steps[0]?.approver_role || null) : (approver_role || null);
    const firstUserId = steps ? (steps[0]?.approver_user_id || null) : (approver_user_id || null);
    const r = await query(
      `INSERT INTO sys_approval_rules (rule_name, entity_type, condition_field, condition_operator, condition_value, approver_role, approver_user_id, approver_steps, priority, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [rule_name, entity_type, condition_field||null, condition_operator||null, condition_value||null,
       firstRole, firstUserId||null, steps ? JSON.stringify(steps) : '[]', priority || 0, req.user.id]);
    successResponse(res, r.rows[0], 'Rule created', 201);
  } catch (err) { errorResponse(res, err.message); }
});
router.put('/approval-rules/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { rule_name, entity_type, condition_field, condition_operator, condition_value, approver_role, approver_user_id, priority, approver_steps } = req.body;
    const steps = Array.isArray(approver_steps) && approver_steps.length ? approver_steps : null;
    const firstRole = steps ? (steps[0]?.approver_role || null) : (approver_role || null);
    const firstUserId = steps ? (steps[0]?.approver_user_id || null) : (approver_user_id || null);
    const r = await query(
      `UPDATE sys_approval_rules SET rule_name=$1, entity_type=$2, condition_field=$3, condition_operator=$4, condition_value=$5,
       approver_role=$6, approver_user_id=$7, approver_steps=$8, priority=$9 WHERE id=$10 RETURNING *`,
      [rule_name, entity_type, condition_field||null, condition_operator||null, condition_value||null,
       firstRole, firstUserId||null, steps ? JSON.stringify(steps) : '[]', priority || 0, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Rule not found', 404);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/approval-rules/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM sys_approval_rules WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); } catch (err) { errorResponse(res, err.message); }
});

// ========== 11. BACKUP ==========
router.get('/backup/info', authenticate, adminOnly, async (req, res) => {
  try {
    const tables = await query(`SELECT schemaname, tablename, n_live_tup as row_count FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_live_tup DESC`);
    const dbSize = await query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
    const totalRows = tables.rows.reduce((s, t) => s + parseInt(t.row_count || 0), 0);
    successResponse(res, { tables: tables.rows, totalTables: tables.rows.length, totalRows, dbSize: dbSize.rows[0]?.size });
  } catch (err) { errorResponse(res, err.message); }
});

// ========== OVERVIEW ==========
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [notif, jobs, rules, validations, widgets, templates, approvals] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE is_active) as active FROM sys_notification_rules`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE is_active) as active FROM sys_scheduled_jobs`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE is_active) as active FROM sys_business_rules`),
      query(`SELECT COUNT(*) as total FROM sys_validation_rules WHERE is_active = true`),
      query(`SELECT COUNT(*) as total FROM sys_dashboard_widgets WHERE is_active = true`),
      query(`SELECT COUNT(*) as total FROM sys_email_templates WHERE is_active = true`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE is_active) as active FROM sys_approval_rules`),
    ]);
    successResponse(res, {
      notifications: notif.rows[0], jobs: jobs.rows[0], rules: rules.rows[0],
      validations: validations.rows[0], widgets: widgets.rows[0],
      emailTemplates: templates.rows[0], approvals: approvals.rows[0],
    });
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
