import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber } from '../utils/helpers.js';

const router = Router();
const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);

// =============================================
// 1. MULTI-COMPANY — switch + context
// =============================================
router.get('/companies', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT id, company_code, company_name, gstin, pan, city, currency, logo_url FROM org_companies WHERE is_active = true ORDER BY company_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/switch-company', authenticate, async (req, res) => {
  try {
    const { company_id } = req.body;
    if (!company_id) return errorResponse(res, 'Company ID required', 400);
    const comp = await query(`SELECT * FROM org_companies WHERE id = $1 AND is_active = true`, [company_id]);
    if (!comp.rows.length) return errorResponse(res, 'Company not found', 404);
    await query(`UPDATE sys_users SET default_company_id = $1 WHERE id = $2`, [company_id, req.user.id]);
    successResponse(res, comp.rows[0], 'Switched to ' + comp.rows[0].company_name);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/current-company', authenticate, async (req, res) => {
  try {
    const c = req.body;
    // Find the company this user is linked to
    const userComp = await query(
      `SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
    const fallback = await query(`SELECT id FROM org_companies WHERE is_active = true ORDER BY company_code LIMIT 1`);
    const compId = userComp.rows[0]?.id || fallback.rows[0]?.id;
    if (!compId) return errorResponse(res, 'No company found', 404);

    await query(
      `UPDATE org_companies SET
         company_name = COALESCE($1, company_name),
         company_name_local = COALESCE($2, company_name_local),
         gstin = COALESCE($3, gstin),
         pan = COALESCE($4, pan),
         cin = COALESCE($5, cin),
         address_line1 = COALESCE($6, address_line1),
         address_line2 = COALESCE($7, address_line2),
         city = COALESCE($8, city),
         state = COALESCE($9, state),
         country = COALESCE($10, country),
         postal_code = COALESCE($11, postal_code),
         phone = COALESCE($12, phone),
         email = COALESCE($13, email),
         website = COALESCE($14, website),
         currency = COALESCE($15, currency),
         fiscal_year_start = COALESCE($16, fiscal_year_start),
         logo_url = COALESCE($17, logo_url),
         terms_and_conditions = COALESCE($18, terms_and_conditions),
         bank_details = COALESCE($19, bank_details),
         digital_signature_url = COALESCE($20, digital_signature_url),
         updated_at = NOW()
       WHERE id = $21`,
      [c.company_name, c.company_name_local, c.gstin, c.pan, c.cin,
       c.address_line1, c.address_line2, c.city, c.state, c.country, c.postal_code,
       c.phone, c.email, c.website, c.currency, c.fiscal_year_start,
       c.logo_url, c.terms_and_conditions, c.bank_details, c.digital_signature_url, compId]
    );
    successResponse(res, null, 'Company settings saved');
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/current-company', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.* FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
    if (!result.rows.length) {
      const fallback = await query(`SELECT * FROM org_companies WHERE is_active = true ORDER BY company_code LIMIT 1`);
      return successResponse(res, fallback.rows[0] || {});
    }
    successResponse(res, result.rows[0]);
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 2. FISCAL PERIOD LOCKING
// =============================================
router.get('/fiscal-periods', authenticate, async (req, res) => {
  try {
    const { company_id, year } = req.query;
    let sql = `SELECT fp.*, u.first_name || ' ' || u.last_name as closed_by_name FROM fi_fiscal_periods fp LEFT JOIN sys_users u ON fp.closed_by = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (company_id) { sql += ` AND fp.company_id = $${idx++}`; params.push(company_id); }
    if (year) { sql += ` AND fp.period_year = $${idx++}`; params.push(year); }
    sql += ` ORDER BY fp.start_date`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/fiscal-periods/:id/close', authenticate, async (req, res) => {
  try {
    const period = await query(`SELECT * FROM fi_fiscal_periods WHERE id = $1`, [req.params.id]);
    if (!period.rows.length) return errorResponse(res, 'Period not found', 404);
    if (period.rows[0].status === 'closed' || period.rows[0].is_open === false) return errorResponse(res, 'Already closed', 400);
    await query(`UPDATE fi_fiscal_periods SET status='closed', is_open=false, closed_by=$1, closed_at=NOW() WHERE id=$2`, [req.user.id, req.params.id]);
    successResponse(res, null, `Period ${period.rows[0].period_name} closed`);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/fiscal-periods/:id/reopen', authenticate, async (req, res) => {
  try {
    await query(`UPDATE fi_fiscal_periods SET status='open', is_open=true, closed_by=NULL, closed_at=NULL WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Period reopened');
  } catch (err) { errorResponse(res, err.message); }
});

// Check if posting date is in an open period
router.get('/check-period', authenticate, async (req, res) => {
  try {
    const { posting_date, company_id } = req.query;
    if (!posting_date) return successResponse(res, { allowed: true });
    const d = new Date(posting_date);
    const result = await query(
      `SELECT * FROM fi_fiscal_periods WHERE company_id = $1 AND period_month = $2 AND period_year = $3`,
      [company_id, d.getMonth() + 1, d.getFullYear()]);
    if (!result.rows.length) return successResponse(res, { allowed: true, warning: 'No fiscal period defined' });
    if (result.rows[0].status === 'closed') return successResponse(res, { allowed: false, message: `Period ${result.rows[0].period_name} is closed` });
    successResponse(res, { allowed: true });
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 3. DOCUMENT AMENDMENT / CANCELLATION
// =============================================
router.post('/amend', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, reason, changed_fields, previous_values } = req.body;
    if (!entity_type || !entity_id || !reason) return errorResponse(res, 'Entity type, ID, and reason required', 400);
    const lastAmend = await query(`SELECT MAX(amendment_number) as max_num FROM sys_document_amendments WHERE entity_type=$1 AND entity_id=$2`, [entity_type, entity_id]);
    const nextNum = (parseInt(lastAmend.rows[0]?.max_num) || 0) + 1;
    const result = await query(
      `INSERT INTO sys_document_amendments (entity_type, entity_id, amendment_number, reason, changed_fields, previous_values, amended_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [entity_type, entity_id, nextNum, reason, JSON.stringify(changed_fields || {}), JSON.stringify(previous_values || {}), req.user.id]);
    await auditLog(req.user.id, 'AMEND', entity_type, entity_id, null, { amendment: nextNum, reason }, req);
    successResponse(res, result.rows[0], `Amendment #${nextNum} recorded`);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/amendments/:entity_type/:entity_id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, u.first_name || ' ' || u.last_name as amended_by_name
       FROM sys_document_amendments a LEFT JOIN sys_users u ON a.amended_by = u.id
       WHERE a.entity_type = $1 AND a.entity_id = $2 ORDER BY a.amendment_number DESC`,
      [req.params.entity_type, req.params.entity_id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/cancel', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, reason } = req.body;
    if (!entity_type || !entity_id || !reason) return errorResponse(res, 'Entity type, ID, and reason required', 400);

    // Map entity types to tables
    const tableMap = {
      ap_invoice: 'fi_ap_invoices', ar_invoice: 'fi_ar_invoices', payment: 'fi_payments',
      journal_entry: 'fi_journal_headers', sales_order: 'sd_sales_orders',
      purchase_order: 'pur_purchase_orders', delivery: 'sd_deliveries',
      goods_receipt: 'pur_goods_receipts', billing: 'sd_billing',
    };
    const table = tableMap[entity_type];
    if (!table) return errorResponse(res, `Cancellation not supported for ${entity_type}`, 400);

    // Get doc number before cancelling
    const doc = await query(`SELECT doc_number FROM ${table} WHERE id = $1`, [entity_id]);
    const docNumber = doc.rows[0]?.doc_number;

    // Cancel the document
    await query(`UPDATE ${table} SET status = 'cancelled' WHERE id = $1`, [entity_id]);

    // Auto-create reverse JE for financial documents
    let reverseJeId = null;
    if (['ap_invoice', 'ar_invoice', 'payment'].includes(entity_type)) {
      // Find related journal entry and reverse it
      const jeRef = await query(`SELECT id FROM fi_journal_headers WHERE reference = $1 LIMIT 1`, [docNumber]);
      if (jeRef.rows.length) {
        // Create a reverse entry
        const jeDocNum = await getNextNumber('JE');
        const origLines = await query(`SELECT * FROM fi_journal_lines WHERE journal_id = $1`, [jeRef.rows[0].id]);
        const rje = await query(
          `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description, currency, status, posted_by, posted_at)
           SELECT $1, company_id, CURRENT_DATE, CURRENT_DATE, $2, 'Reversal: ' || description, currency, 'posted', $3, NOW()
           FROM fi_journal_headers WHERE id = $4 RETURNING *`,
          [jeDocNum, `REV:${docNumber}`, req.user.id, jeRef.rows[0].id]);
        reverseJeId = rje.rows[0]?.id;
        // Reverse debit/credit
        for (const line of origLines.rows) {
          await query(
            `INSERT INTO fi_journal_lines (journal_id, gl_account_id, debit, credit, line_description)
             VALUES ($1,$2,$3,$4,$5)`,
            [reverseJeId, line.gl_account_id, line.credit, line.debit, `Reversal: ${line.line_description || ''}`]);
        }
      }
    }

    const cancel = await query(
      `INSERT INTO sys_document_cancellations (entity_type, entity_id, doc_number, reason, reverse_je_id, cancelled_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [entity_type, entity_id, docNumber, reason, reverseJeId, req.user.id]);

    await auditLog(req.user.id, 'CANCEL', entity_type, entity_id, null, { reason, reverse_je: reverseJeId }, req);
    successResponse(res, cancel.rows[0], `${docNumber} cancelled${reverseJeId ? ' — reverse JE created' : ''}`);
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 4. PDF GENERATION (HTML-based)
// =============================================
router.get('/pdf/:entity_type/:entity_id', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;

    // Get company (letterhead)
    const comp = await query(
      `SELECT c.* FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
    const company = comp.rows[0] || {};

    // Get document data based on type
    let doc, items = [], title = '';
    switch (entity_type) {
      case 'ap_invoice': {
        const r = await query(`SELECT ap.*, bp.display_name as vendor_name, bp.gstin as vendor_gstin_val, bp.address_line1 as vendor_address, bp.city as vendor_city FROM fi_ap_invoices ap LEFT JOIN bp_business_partners bp ON ap.vendor_id = bp.id WHERE ap.id=$1`, [entity_id]);
        doc = r.rows[0]; title = 'AP Invoice';
        items = (await query(`SELECT * FROM fi_ap_invoice_items WHERE invoice_id=$1 ORDER BY line_number`, [entity_id])).rows;
        break;
      }
      case 'ar_invoice': {
        const r = await query(`SELECT ar.*, bp.display_name as customer_name, bp.gstin as customer_gstin_val, bp.address_line1 as customer_address, bp.city as customer_city FROM fi_ar_invoices ar LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id WHERE ar.id=$1`, [entity_id]);
        doc = r.rows[0]; title = 'Tax Invoice';
        items = (await query(`SELECT * FROM fi_ar_invoice_items WHERE invoice_id=$1 ORDER BY line_number`, [entity_id])).rows;
        break;
      }
      case 'purchase_order': {
        const r = await query(`SELECT po.*, bp.display_name as vendor_name, bp.gstin as vendor_gstin_val FROM pur_purchase_orders po LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id WHERE po.id=$1`, [entity_id]);
        doc = r.rows[0]; title = 'Purchase Order';
        items = (await query(`SELECT pi.*, m.material_name, m.material_code FROM pur_po_items pi LEFT JOIN mm_materials m ON pi.material_id = m.id WHERE pi.po_id=$1 ORDER BY pi.line_number`, [entity_id])).rows;
        break;
      }
      case 'quotation': {
        const r = await query(`SELECT q.*, bp.display_name as customer_name FROM sd_quotations q LEFT JOIN bp_business_partners bp ON q.customer_id = bp.id WHERE q.id=$1`, [entity_id]);
        doc = r.rows[0]; title = 'Quotation';
        items = (await query(`SELECT qi.*, m.material_name, m.material_code FROM sd_quotation_items qi LEFT JOIN mm_materials m ON qi.material_id = m.id WHERE qi.quotation_id=$1 ORDER BY qi.line_number`, [entity_id])).rows;
        break;
      }
      default: return errorResponse(res, `PDF not supported for ${entity_type}`, 400);
    }
    if (!doc) return errorResponse(res, 'Document not found', 404);

    // Generate HTML
    const fmtCurrency = (v) => '₹' + parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

    const itemRows = items.map((it, i) => `<tr>
      <td style="border:1px solid #ddd;padding:6px;text-align:center">${i+1}</td>
      <td style="border:1px solid #ddd;padding:6px">${it.material_code||''} ${it.material_name||it.description||''}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:center">${it.hsn_code||''}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:right">${it.quantity||''}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:right">${fmtCurrency(it.unit_price)}</td>
      <td style="border:1px solid #ddd;padding:6px;text-align:right">${fmtCurrency(it.total_amount || (it.quantity * it.unit_price))}</td>
    </tr>`).join('');

    const partnerName = doc.vendor_name || doc.customer_name || '';
    const partnerGstin = doc.vendor_gstin || doc.vendor_gstin_val || doc.customer_gstin || doc.customer_gstin_val || '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;margin:30px;color:#333;font-size:12px}
      .header{display:flex;justify-content:space-between;border-bottom:3px solid #1a56db;padding-bottom:12px;margin-bottom:16px}
      .company{font-size:18px;font-weight:bold;color:#1a56db}
      .company-sub{font-size:11px;color:#666;margin-top:2px}
      .doc-title{font-size:20px;font-weight:bold;text-align:right;color:#1a56db}
      .doc-number{font-size:13px;color:#666;text-align:right}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
      .info-box{background:#f8f9fa;padding:10px;border-radius:4px}
      .info-label{font-size:10px;color:#888;text-transform:uppercase;margin-bottom:2px}
      .info-value{font-weight:bold}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th{background:#1a56db;color:white;padding:8px;font-size:11px;text-align:left}
      .totals{text-align:right;margin-top:8px}
      .totals td{padding:4px 8px}
      .total-row{font-size:14px;font-weight:bold;border-top:2px solid #333}
      .footer{margin-top:30px;border-top:1px solid #ddd;padding-top:10px;font-size:10px;color:#888}
      .terms{margin-top:20px;font-size:10px;color:#666}
    </style></head><body>
      <div class="header">
        <div>
          <div class="company">${company.company_name || 'Zyra'}</div>
          <div class="company-sub">${company.address_line1||''} ${company.city ? ', '+company.city : ''} ${company.state ? ', '+company.state : ''}</div>
          <div class="company-sub">GSTIN: ${company.gstin||'Not configured'} | PAN: ${company.pan||'—'} | CIN: ${company.cin||'—'}</div>
          <div class="company-sub">${company.phone ? 'Ph: '+company.phone : ''} ${company.email ? '| '+company.email : ''}</div>
        </div>
        <div>
          <div class="doc-title">${title}</div>
          <div class="doc-number">${doc.doc_number}</div>
          <div class="doc-number">Date: ${fmtDate(doc.invoice_date || doc.order_date || doc.quotation_date || doc.created_at)}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">${doc.vendor_name ? 'Vendor' : 'Customer'}</div>
          <div class="info-value">${partnerName}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">GSTIN: ${partnerGstin || '—'}</div>
          <div style="font-size:11px;color:#666">${doc.vendor_address||doc.customer_address||''} ${doc.vendor_city||doc.customer_city||''}</div>
        </div>
        <div class="info-box">
          <div class="info-label">Document Details</div>
          <div style="font-size:11px;margin-top:4px">
            ${doc.vendor_invoice_number ? '<b>Vendor Inv:</b> '+doc.vendor_invoice_number+'<br>' : ''}
            ${doc.place_of_supply ? '<b>Place of Supply:</b> '+doc.place_of_supply+'<br>' : ''}
            <b>Due Date:</b> ${fmtDate(doc.due_date)}<br>
            <b>Status:</b> ${(doc.status||'').toUpperCase()}
          </div>
        </div>
      </div>

      ${items.length ? `<table>
        <thead><tr><th style="width:40px">#</th><th>Description</th><th style="width:80px">HSN</th><th style="width:60px;text-align:right">Qty</th><th style="width:80px;text-align:right">Rate</th><th style="width:100px;text-align:right">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>` : ''}

      <table class="totals" style="width:300px;margin-left:auto">
        <tr><td>Subtotal:</td><td><b>${fmtCurrency(doc.subtotal)}</b></td></tr>
        ${parseFloat(doc.cgst_amount||0) > 0 ? `<tr><td>CGST:</td><td>${fmtCurrency(doc.cgst_amount)}</td></tr>` : ''}
        ${parseFloat(doc.sgst_amount||0) > 0 ? `<tr><td>SGST:</td><td>${fmtCurrency(doc.sgst_amount)}</td></tr>` : ''}
        ${parseFloat(doc.igst_amount||0) > 0 ? `<tr><td>IGST:</td><td>${fmtCurrency(doc.igst_amount)}</td></tr>` : ''}
        ${parseFloat(doc.tax_amount||0) > 0 && !doc.cgst_amount ? `<tr><td>Tax:</td><td>${fmtCurrency(doc.tax_amount)}</td></tr>` : ''}
        <tr class="total-row"><td>Total:</td><td>${fmtCurrency(doc.total_amount)}</td></tr>
      </table>

      ${company.terms_and_conditions ? `<div class="terms"><b>Terms & Conditions:</b><br>${company.terms_and_conditions}</div>` : ''}
      ${company.bank_details ? `<div class="terms"><b>Bank Details:</b><br>${company.bank_details}</div>` : ''}

      <div class="footer">
        <div style="float:right;text-align:center;margin-top:-20px">
          ${company.digital_signature_url ? `<img src="${company.digital_signature_url}" height="50" style="margin-bottom:4px"><br>` : '<div style="height:50px"></div>'}
          Authorized Signatory
        </div>
        Generated by Zyra on ${new Date().toLocaleString('en-IN')}
      </div>
    </body></html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 5. EMAIL SENDING
// =============================================
router.get('/email-config', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT id, company_id, smtp_host, smtp_port, smtp_user, smtp_secure, from_name, from_email, is_active FROM sys_email_config ORDER BY updated_at DESC LIMIT 1`);
    successResponse(res, result.rows[0] || {});
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/email-config', authenticate, async (req, res) => {
  try {
    const c = req.body;
    const existing = await query(`SELECT id FROM sys_email_config LIMIT 1`);
    if (existing.rows.length) {
      // Only update password if a new one was provided — prevents wiping it on reload
      if (c.smtp_password) {
        await query(`UPDATE sys_email_config SET smtp_host=$1, smtp_port=$2, smtp_user=$3, smtp_password=$4, smtp_secure=$5, from_name=$6, from_email=$7, is_active=$8, updated_at=NOW() WHERE id=$9`,
          [c.smtp_host, c.smtp_port||587, c.smtp_user, c.smtp_password, c.smtp_secure!==false, c.from_name, c.from_email, c.is_active!==false, existing.rows[0].id]);
      } else {
        await query(`UPDATE sys_email_config SET smtp_host=$1, smtp_port=$2, smtp_user=$3, smtp_secure=$4, from_name=$5, from_email=$6, is_active=$7, updated_at=NOW() WHERE id=$8`,
          [c.smtp_host, c.smtp_port||587, c.smtp_user, c.smtp_secure!==false, c.from_name, c.from_email, c.is_active!==false, existing.rows[0].id]);
      }
    } else {
      await query(`INSERT INTO sys_email_config (smtp_host, smtp_port, smtp_user, smtp_password, smtp_secure, from_name, from_email) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [c.smtp_host, c.smtp_port||587, c.smtp_user, c.smtp_password, c.smtp_secure!==false, c.from_name, c.from_email]);
    }
    successResponse(res, null, 'Email config saved');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/send-email', authenticate, async (req, res) => {
  try {
    const { to_email, cc_email, subject, body, entity_type, entity_id } = req.body;
    if (!to_email || !subject) return errorResponse(res, 'To email and subject required', 400);

    // Get SMTP config
    const config = await query(`SELECT * FROM sys_email_config WHERE is_active = true LIMIT 1`);
    if (!config.rows.length) return errorResponse(res, 'SMTP not configured. Go to Settings → Email Config.', 400);
    const smtp = config.rows[0];

    // Try sending via nodemailer (if available)
    let status = 'sent', errorMsg = null;
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport({
        host: smtp.smtp_host, port: smtp.smtp_port,
        secure: smtp.smtp_secure, auth: { user: smtp.smtp_user, pass: smtp.smtp_password }
      });
      await transporter.sendMail({
        from: `"${smtp.from_name}" <${smtp.from_email}>`,
        to: to_email, cc: cc_email, subject, html: body
      });
    } catch (emailErr) {
      status = 'failed'; errorMsg = emailErr.message;
    }

    // Log
    await query(
      `INSERT INTO sys_email_log (to_email, cc_email, subject, body, entity_type, entity_id, status, error_message, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [to_email, cc_email, subject, body, entity_type, entity_id, status, errorMsg, status === 'sent' ? new Date() : null]);

    if (status === 'failed') return errorResponse(res, `Email failed: ${errorMsg}. Check SMTP config.`, 500);
    successResponse(res, null, 'Email sent');
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/email-log', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM sys_email_log ORDER BY created_at DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 6. EMAIL NOTIFICATION SETTINGS
// =============================================

// Create table + seed defaults on startup
(async () => {
  try {
    await query(`CREATE TABLE IF NOT EXISTS sys_email_notification_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      event_key VARCHAR(50) NOT NULL UNIQUE,
      event_label VARCHAR(100) NOT NULL,
      description TEXT,
      category VARCHAR(50) DEFAULT 'general',
      is_enabled BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    const events = [
      ['approval_requested',   'Approval Requested',         'Email sent to approver(s) when a document is submitted for approval', 'approvals', 1],
      ['document_approved',    'Document Approved',           'Email sent to requester when their document is approved',             'approvals', 2],
      ['document_rejected',    'Document Rejected',           'Email sent to requester when their document is rejected',             'approvals', 3],
      ['next_level_approval',  'Next Level Approval',         'Email sent to next-level approvers when previous level approves',     'approvals', 4],
      ['po_created',           'PO Created',                  'Email notification when a new Purchase Order is created',            'procurement', 5],
      ['pr_submitted',         'PR Submitted',                'Email notification when a Purchase Requisition is submitted',        'procurement', 6],
      ['invoice_due',          'Invoice Due Reminder',        'Email sent when an invoice is approaching its due date',            'finance', 7],
      ['payment_received',     'Payment Received',            'Email notification when a payment is recorded',                     'finance', 8],
    ];

    for (const [key, label, desc, cat, sort] of events) {
      await query(
        `INSERT INTO sys_email_notification_settings (event_key, event_label, description, category, sort_order)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_key) DO NOTHING`,
        [key, label, desc, cat, sort]
      );
    }
  } catch (e) {
    console.error('Email notification settings migration:', e.message);
  }
})();

router.get('/notification-settings', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM sys_email_notification_settings ORDER BY sort_order, event_label`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/notification-settings/:key/toggle', authenticate, async (req, res) => {
  try {
    const r = await query(
      `UPDATE sys_email_notification_settings SET is_enabled = NOT is_enabled WHERE event_key = $1 RETURNING is_enabled`,
      [req.params.key]
    );
    if (!r.rows.length) return errorResponse(res, 'Setting not found', 404);
    successResponse(res, { is_enabled: r.rows[0].is_enabled }, `Notification ${r.rows[0].is_enabled ? 'enabled' : 'disabled'}`);
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 7. GST RETURN PREPARATION
// =============================================
router.get('/gst/gstr1', authenticate, async (req, res) => {
  try {
    const { month, year, company_id } = req.query;
    if (!month || !year) return errorResponse(res, 'Month and year required', 400);

    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;

    // B2B invoices (with GSTIN)
    const b2b = await query(
      `SELECT ar.doc_number, ar.invoice_date, ar.customer_gstin, bp.display_name as customer_name,
              ar.place_of_supply, ar.subtotal, ar.cgst_amount, ar.sgst_amount, ar.igst_amount, ar.total_amount,
              ar.status
       FROM fi_ar_invoices ar LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id
       WHERE ar.invoice_date BETWEEN $1 AND $2 AND ar.status != 'cancelled'
       ${company_id ? 'AND ar.company_id = $3' : ''}
       ORDER BY ar.invoice_date`,
      company_id ? [startDate, endDate, company_id] : [startDate, endDate]);

    // B2C invoices (without GSTIN)
    const b2c = b2b.rows.filter(r => !r.customer_gstin);
    const b2bFiltered = b2b.rows.filter(r => r.customer_gstin);

    // Credit/Debit notes
    const cdnr = await query(
      `SELECT cn.* FROM fi_credit_notes cn WHERE cn.note_date BETWEEN $1 AND $2`, [startDate, endDate]);

    // Summary
    const totalTaxable = b2b.rows.reduce((sum, r) => sum + parseFloat(r.subtotal || 0), 0);
    const totalCgst = b2b.rows.reduce((sum, r) => sum + parseFloat(r.cgst_amount || 0), 0);
    const totalSgst = b2b.rows.reduce((sum, r) => sum + parseFloat(r.sgst_amount || 0), 0);
    const totalIgst = b2b.rows.reduce((sum, r) => sum + parseFloat(r.igst_amount || 0), 0);

    successResponse(res, {
      period: `${new Date(year, month-1).toLocaleString('en', {month:'long'})} ${year}`,
      b2b: b2bFiltered, b2c, cdnr: cdnr.rows,
      summary: { invoices: b2b.rows.length, taxable: totalTaxable, cgst: totalCgst, sgst: totalSgst, igst: totalIgst, total_tax: totalCgst + totalSgst + totalIgst }
    });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/gst/gstr3b', authenticate, async (req, res) => {
  try {
    const { month, year, company_id } = req.query;
    if (!month || !year) return errorResponse(res, 'Month and year required', 400);

    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;

    const compFilter = company_id ? `AND company_id = '${company_id}'` : '';

    // 3.1 Outward supplies (AR invoices)
    const outward = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(subtotal),0) as taxable,
              COALESCE(SUM(cgst_amount),0) as cgst, COALESCE(SUM(sgst_amount),0) as sgst,
              COALESCE(SUM(igst_amount),0) as igst, COALESCE(SUM(total_amount),0) as total
       FROM fi_ar_invoices WHERE invoice_date BETWEEN $1 AND $2 AND status != 'cancelled' ${compFilter}`,
      [startDate, endDate]);

    // 4. Input tax credit (AP invoices)
    const input = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(subtotal),0) as taxable,
              COALESCE(SUM(cgst_amount),0) as cgst, COALESCE(SUM(sgst_amount),0) as sgst,
              COALESCE(SUM(igst_amount),0) as igst
       FROM fi_ap_invoices WHERE invoice_date BETWEEN $1 AND $2 AND status != 'cancelled' ${compFilter}`,
      [startDate, endDate]);

    const outData = outward.rows[0];
    const inData = input.rows[0];
    const netCgst = parseFloat(outData.cgst) - parseFloat(inData.cgst);
    const netSgst = parseFloat(outData.sgst) - parseFloat(inData.sgst);
    const netIgst = parseFloat(outData.igst) - parseFloat(inData.igst);

    successResponse(res, {
      period: `${new Date(year, month-1).toLocaleString('en', {month:'long'})} ${year}`,
      section_3_1: { description: 'Outward supplies', ...outData },
      section_4: { description: 'Input tax credit', ...inData },
      section_6: {
        description: 'Net tax payable',
        cgst: Math.max(0, netCgst), sgst: Math.max(0, netSgst), igst: Math.max(0, netIgst),
        total: Math.max(0, netCgst) + Math.max(0, netSgst) + Math.max(0, netIgst)
      }
    });
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 7. DATA VALIDATION
// =============================================
router.get('/validation-rules', authenticate, async (req, res) => {
  try {
    const { entity_type } = req.query;
    let sql = `SELECT * FROM sys_validation_rules WHERE is_active = true`;
    if (entity_type) sql += ` AND entity_type = '${entity_type}'`;
    successResponse(res, (await query(sql)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/validate', authenticate, async (req, res) => {
  try {
    const { entity_type, data } = req.body;
    const rules = (await query(`SELECT * FROM sys_validation_rules WHERE entity_type = $1 AND is_active = true`, [entity_type])).rows;
    const errors = [];

    for (const rule of rules) {
      const value = data[rule.field_name];
      if (!value || value === '') continue; // Skip empty — only validate if present

      if (rule.rule_type === 'regex') {
        const regex = new RegExp(rule.rule_value);
        if (!regex.test(value)) errors.push({ field: rule.field_name, message: rule.error_message });
      }
      if (rule.rule_type === 'unique') {
        const [table, col] = rule.rule_value.split('.');
        const existing = await query(`SELECT id FROM ${table} WHERE ${col} = $1 LIMIT 1`, [value]);
        if (existing.rows.length) errors.push({ field: rule.field_name, message: rule.error_message });
      }
    }

    successResponse(res, { valid: errors.length === 0, errors });
  } catch (err) { errorResponse(res, err.message); }
});

// =============================================
// 8. CONFIGURABLE DOCUMENT NUMBERING
// =============================================
router.get('/number-ranges', authenticate, async (req, res) => {
  try {
    successResponse(res, (await query(`SELECT * FROM sys_number_ranges ORDER BY object_type`)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/number-ranges/:id', authenticate, async (req, res) => {
  try {
    const { prefix, pattern, include_fy, include_company, reset_yearly, pad_length } = req.body;
    await query(
      `UPDATE sys_number_ranges SET prefix=COALESCE($1,prefix), pattern=$2, include_fy=COALESCE($3,include_fy),
       include_company=COALESCE($4,include_company), reset_yearly=COALESCE($5,reset_yearly), pad_length=COALESCE($6,pad_length)
       WHERE id=$7`,
      [prefix, pattern, include_fy, include_company, reset_yearly, pad_length||5, req.params.id]);
    successResponse(res, null, 'Number range updated');
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
