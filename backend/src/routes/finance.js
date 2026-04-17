import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';
import { checkFiscalPeriod, fireNotificationRules } from '../utils/ruleEngine.js';

const router = Router();

// Helper: resolve GL account from fi_gl_mapping table
async function resolveGL(key) {
  // First try the mapping table
  const r = await query(`SELECT gl_account_id FROM fi_gl_mapping WHERE mapping_key = $1 AND gl_account_id IS NOT NULL`, [key]);
  if (r.rows[0]?.gl_account_id) return r.rows[0].gl_account_id;
  
  // Fallback: auto-detect by account name patterns
  const patterns = {
    accounts_receivable: "account_name ILIKE '%debtor%' OR account_name ILIKE '%receivable%'",
    sales_revenue: "(account_name ILIKE '%sales%' OR account_name ILIKE '%revenue%goods%') AND account_type='revenue'",
    service_revenue: "(account_name ILIKE '%service%') AND account_type='revenue'",
    accounts_payable: "account_name ILIKE '%creditor%' OR (account_name ILIKE '%payable%' AND account_type='liability' AND account_name NOT ILIKE '%tax%' AND account_name NOT ILIKE '%gst%' AND account_name NOT ILIKE '%tds%')",
    inventory_stock: "account_name ILIKE '%stock%' OR account_name ILIKE '%inventory%'",
    cogs: "account_name ILIKE '%cost of goods%' OR account_name ILIKE '%cogs%'",
    grn_clearing: "account_name ILIKE '%stock received%' OR account_name ILIKE '%gr/ir%' OR account_name ILIKE '%grn%'",
    bank_incoming: "account_name ILIKE '%incoming%' OR (account_name ILIKE '%bank%')",
    bank_outgoing: "account_name ILIKE '%outgoing%' OR (account_name ILIKE '%bank%')",
    cash_account: "account_name ILIKE '%petty cash%' OR account_name ILIKE '%cash in hand%'",
    // Input tax (purchase)
    input_cgst: "account_name ILIKE '%input cgst%' OR account_name ILIKE '%cgst input%' OR account_name ILIKE '%cgst receivable%'",
    input_sgst: "account_name ILIKE '%input sgst%' OR account_name ILIKE '%sgst input%' OR account_name ILIKE '%sgst receivable%'",
    input_igst: "account_name ILIKE '%input igst%' OR account_name ILIKE '%igst input%' OR account_name ILIKE '%igst receivable%'",
    // Output tax (sales)
    output_cgst: "account_name ILIKE '%output cgst%' OR (account_name ILIKE '%cgst%' AND account_type='liability')",
    output_sgst: "account_name ILIKE '%output sgst%' OR (account_name ILIKE '%sgst%' AND account_type='liability')",
    output_igst: "account_name ILIKE '%output igst%' OR (account_name ILIKE '%igst%' AND account_type='liability')",
    // Legacy
    input_gst: "account_name ILIKE '%input gst%' OR account_name ILIKE '%gst input%' OR account_name ILIKE '%gst credit%'",
    gst_payable: "account_name ILIKE '%gst payable%' AND account_type='liability'",
    tds_receivable: "account_name ILIKE '%tds receivable%' AND account_type='asset'",
    tds_payable: "account_name ILIKE '%tds payable%' AND account_type='liability'",
    salary_expense: "account_name ILIKE '%salaries%' AND account_type='expense'",
    payroll_payable: "account_name ILIKE '%payroll payable%' OR account_name ILIKE '%salary payable%'",
    depreciation_expense: "account_name ILIKE '%depreciation%' AND account_type='expense'",
    accumulated_depreciation: "account_name ILIKE '%accumulated depreciation%'",
    advance_to_supplier: "account_name ILIKE '%advance to supplier%'",
    advance_from_customer: "account_name ILIKE '%advance from customer%' AND account_type='liability'",
    retained_earnings: "account_name ILIKE '%retained earnings%'",
  };
  const p = patterns[key];
  if (!p) return null;
  const fb = await query(`SELECT id FROM fi_gl_accounts WHERE (${p}) AND is_active = true LIMIT 1`);
  return fb.rows[0]?.id || null;
}

// Helper: build JE lines with tax split for AP/AR invoices
async function buildTaxJELines(jeId, invoice, isAP) {
  const subtotal = parseFloat(invoice.subtotal || 0);
  const cgst = parseFloat(invoice.cgst_amount || 0);
  const sgst = parseFloat(invoice.sgst_amount || 0);
  const igst = parseFloat(invoice.igst_amount || 0);
  const total = parseFloat(invoice.total_amount || 0);
  const lines = [];
  let lineNum = 0;

  if (isAP) {
    const vendor = invoice.vendor_name || '';
    const ref = vendor ? `${invoice.doc_number} / ${vendor}` : invoice.doc_number;
    const invAcct = await resolveGL('inventory_stock');
    const apAcct = await resolveGL('accounts_payable');
    const inputGstAcct = await resolveGL('input_gst');

    if (invAcct) { lineNum++; lines.push([jeId, lineNum, invAcct, subtotal, 0, `Expense/Inventory — ${ref}`]); }
    if (inputGstAcct && (cgst + sgst + igst) > 0) { lineNum++; lines.push([jeId, lineNum, inputGstAcct, cgst + sgst + igst, 0, `Input GST — ${ref}`]); }
    if (apAcct) { lineNum++; lines.push([jeId, lineNum, apAcct, 0, total, `Creditors — ${ref}`]); }
  } else {
    const customer = invoice.customer_name || '';
    const ref = customer ? `${invoice.doc_number} / ${customer}` : invoice.doc_number;
    const arAcct = await resolveGL('accounts_receivable');
    const revAcct = await resolveGL('sales_revenue');
    const sgstAcct = await resolveGL('output_sgst');
    const cgstAcct = await resolveGL('output_cgst');
    const igstAcct = await resolveGL('gst_payable');

    if (arAcct) { lineNum++; lines.push([jeId, lineNum, arAcct, total, 0, `Debtors — ${ref}`]); }
    if (revAcct) { lineNum++; lines.push([jeId, lineNum, revAcct, 0, subtotal, `Revenue — ${ref}`]); }
    if (sgstAcct && sgst > 0) { lineNum++; lines.push([jeId, lineNum, sgstAcct, 0, sgst, `SGST Payable — ${ref}`]); }
    if (cgstAcct && cgst > 0) { lineNum++; lines.push([jeId, lineNum, cgstAcct, 0, cgst, `CGST Payable — ${ref}`]); }
    if (igstAcct && igst > 0) { lineNum++; lines.push([jeId, lineNum, igstAcct, 0, igst, `IGST Payable — ${ref}`]); }
  }

  for (const l of lines) {
    await query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,$5,$6)`, l);
  }
  return lines.length;
}

// ========================================
// JOURNAL ENTRIES
// ========================================
router.get('/journals', authenticate, async (req, res) => {
  try {
    const { status, date_from, date_to, search, page = 1 } = req.query;
    let sql = `SELECT jh.*, u.first_name || ' ' || u.last_name as created_by_name,
               c.company_name
               FROM fi_journal_headers jh
               LEFT JOIN sys_users u ON jh.created_by = u.id
               LEFT JOIN org_companies c ON jh.company_id = c.id
               WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND jh.status = $${idx++}`; params.push(status); }
    if (date_from) { sql += ` AND jh.posting_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND jh.posting_date <= $${idx++}`; params.push(date_to); }
    if (search) { sql += ` AND (jh.doc_number ILIKE $${idx} OR jh.description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY jh.posting_date DESC, jh.doc_number DESC`;
    sql = paginate(sql, parseInt(page), 50);
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/journals/:id', authenticate, async (req, res) => {
  try {
    const header = await query(
      `SELECT jh.*, u.first_name || ' ' || u.last_name as created_by_name, c.company_name
       FROM fi_journal_headers jh
       LEFT JOIN sys_users u ON jh.created_by = u.id
       LEFT JOIN org_companies c ON jh.company_id = c.id
       WHERE jh.id = $1`, [req.params.id]
    );
    if (!header.rows.length) return errorResponse(res, 'Not found', 404);

    const lines = await query(
      `SELECT jl.*, gl.account_code, gl.account_name, gl.account_type,
              cc.cc_code, cc.cc_name, pc.pc_code, pc.pc_name,
              bp.bp_number, bp.display_name as bp_name
       FROM fi_journal_lines jl
       LEFT JOIN fi_gl_accounts gl ON jl.gl_account_id = gl.id
       LEFT JOIN org_cost_centers cc ON jl.cost_center_id = cc.id
       LEFT JOIN org_profit_centers pc ON jl.profit_center_id = pc.id
       LEFT JOIN bp_business_partners bp ON jl.bp_id = bp.id
       WHERE jl.header_id = $1 ORDER BY jl.line_number`, [req.params.id]
    );

    successResponse(res, { ...header.rows[0], lines: lines.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/journals', authenticate, async (req, res) => {
  try {
    const { posting_date, document_date, description, reference, currency, lines } = req.body;
    if (!lines?.length || lines.length < 2) return errorResponse(res, 'At least 2 lines required', 400);

    const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit_amount || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return errorResponse(res, `Debits (${totalDebit.toFixed(2)}) must equal Credits (${totalCredit.toFixed(2)})`, 400);
    }
    
    // BUG #7 FIX: Validate all GL accounts exist and are active
    const glIds = lines.map(l => l.gl_account_id).filter(Boolean);
    if (glIds.length > 0) {
      const glValidation = await query(
        `SELECT id FROM fi_gl_accounts WHERE id = ANY($1::uuid[]) AND is_active = true`,
        [glIds]
      );
      if (glValidation.rows.length !== glIds.length) {
        return errorResponse(res, 'Invalid or inactive GL account(s) provided', 400);
      }
    }

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('JE');
      const compRes = await client.query(
        `SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
      const companyId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

      const header = await client.query(
        `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, description,
          reference, currency, total_debit, total_credit, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10) RETURNING *`,
        [docNumber, companyId, posting_date || new Date(), document_date || new Date(),
         description, reference, currency || 'INR', totalDebit, totalCredit, req.user.id]
      );

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await client.query(
          `INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, cost_center_id,
            profit_center_id, bp_id, debit_amount, credit_amount, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [header.rows[0].id, i + 1, l.gl_account_id, l.cost_center_id || null,
           l.profit_center_id || null, l.bp_id || null,
           parseFloat(l.debit_amount || 0), parseFloat(l.credit_amount || 0), l.description || null]
        );
      }

      return header.rows[0];
    });

    await auditLog(req.user.id, 'CREATE', 'journal_entry', result.id, null, { doc_number: result.doc_number }, req);
    successResponse(res, result, 'Journal entry created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/journals/:id/post', authenticate, async (req, res) => {
  try {
    const je = await query(`SELECT * FROM fi_journal_headers WHERE id = $1`, [req.params.id]);
    if (!je.rows.length) return errorResponse(res, 'Not found', 404);
    if (je.rows[0].status !== 'draft') return errorResponse(res, 'Only draft entries can be posted', 400);

    // Fiscal period check
    const periodCheck = await checkFiscalPeriod(je.rows[0].posting_date, je.rows[0].company_id);
    if (!periodCheck.allowed) return errorResponse(res, periodCheck.message, 422);

    await query(
      `UPDATE fi_journal_headers SET status = 'posted', posted_by = $1, posted_at = NOW() WHERE id = $2`,
      [req.user.id, req.params.id]
    );

    await auditLog(req.user.id, 'POST', 'journal_entry', req.params.id, null, null, req);
    await fireNotificationRules('journal_entry', req.params.id, 'on_status_change', je.rows[0], req.user.id);
    successResponse(res, null, 'Journal entry posted');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/journals/:id/reverse', authenticate, async (req, res) => {
  try {
    const je = await query(`SELECT * FROM fi_journal_headers WHERE id = $1`, [req.params.id]);
    if (!je.rows.length) return errorResponse(res, 'Not found', 404);
    if (je.rows[0].status !== 'posted') return errorResponse(res, 'Only posted entries can be reversed', 400);

    const lines = await query(`SELECT * FROM fi_journal_lines WHERE header_id = $1`, [req.params.id]);

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('JE');
      const rev = await client.query(
        `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, description,
          reference, currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
         VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,$4,$5,$6,$7,'posted',$8,$8,NOW()) RETURNING *`,
        [docNumber, je.rows[0].company_id, `Reversal of ${je.rows[0].doc_number}`,
         je.rows[0].doc_number, je.rows[0].currency, je.rows[0].total_credit, je.rows[0].total_debit, req.user.id]
      );

      for (const l of lines.rows) {
        await client.query(
          `INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, cost_center_id,
            profit_center_id, bp_id, debit_amount, credit_amount, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [rev.rows[0].id, l.line_number, l.gl_account_id, l.cost_center_id,
           l.profit_center_id, l.bp_id, l.credit_amount, l.debit_amount, `Reversal: ${l.description || ''}`]
        );
      }

      await client.query(
        `UPDATE fi_journal_headers SET status = 'reversed', reversal_doc = $1, reversed_by = $2 WHERE id = $3`,
        [rev.rows[0].id, req.user.id, req.params.id]
      );

      return rev.rows[0];
    });

    successResponse(res, result, 'Journal entry reversed');
  } catch (err) { errorResponse(res, err.message); }
});

// ========================================
// ACCOUNTS PAYABLE
// ========================================
router.get('/ap-invoices', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT ap.*, bp.display_name as vendor_name, bp.bp_number,
               pt.term_name as payment_term
               FROM fi_ap_invoices ap
               LEFT JOIN bp_business_partners bp ON ap.vendor_id = bp.id
               LEFT JOIN fi_payment_terms pt ON ap.payment_term_id = pt.id
               WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND ap.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (ap.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY ap.invoice_date DESC`;
    sql = paginate(sql, parseInt(page), 50);
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get POs eligible for AP invoicing
router.get('/ap-invoices/source-pos', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT po.id, po.doc_number, po.order_date, po.total_amount, po.currency, po.status,
              bp.display_name as vendor_name, bp.id as vendor_id, bp.gstin as vendor_gstin,
              p.plant_code
       FROM pur_purchase_orders po
       LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id
       LEFT JOIN org_plants p ON po.plant_id = p.id
       WHERE po.status IN ('confirmed','partially_received','completed')
       ORDER BY po.order_date DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get PO items for AP invoice auto-fill
router.get('/ap-invoices/source-po/:poId', authenticate, async (req, res) => {
  try {
    const po = await query(
      `SELECT po.*, bp.display_name as vendor_name, bp.gstin as vendor_gstin, bp.id as vendor_id
       FROM pur_purchase_orders po LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id
       WHERE po.id = $1`, [req.params.poId]);
    if (!po.rows.length) return errorResponse(res, 'PO not found', 404);
    const items = await query(
      `SELECT pi.*, m.material_code, m.material_name, m.hsn_code, m.gst_rate, u.uom_code
       FROM pur_po_items pi LEFT JOIN mm_materials m ON pi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON pi.uom_id = u.id
       WHERE pi.po_id = $1 ORDER BY pi.line_number`, [req.params.poId]);
    successResponse(res, { po: po.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// Get GRs eligible for AP invoicing
router.get('/ap-invoices/source-grs', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT gr.id, gr.doc_number, gr.created_at as gr_date, gr.status,
              po.doc_number as po_number, po.id as po_id,
              bp.display_name as vendor_name, bp.id as vendor_id, bp.gstin as vendor_gstin,
              p.plant_code,
              (SELECT COALESCE(SUM(gi.quantity),0) FROM pur_gr_items gi WHERE gi.gr_id=gr.id) as total_qty
       FROM pur_goods_receipts gr
       JOIN pur_purchase_orders po ON gr.po_id = po.id
       LEFT JOIN bp_business_partners bp ON gr.vendor_id = bp.id
       LEFT JOIN org_plants p ON gr.plant_id = p.id
       WHERE gr.status = 'completed'
       ORDER BY gr.created_at DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get GR items with PO prices for AP invoice auto-fill
router.get('/ap-invoices/source-gr/:grId', authenticate, async (req, res) => {
  try {
    const gr = await query(
      `SELECT gr.*, po.doc_number as po_number, po.currency,
              bp.display_name as vendor_name, bp.gstin as vendor_gstin, bp.id as vendor_id
       FROM pur_goods_receipts gr JOIN pur_purchase_orders po ON gr.po_id = po.id
       LEFT JOIN bp_business_partners bp ON gr.vendor_id = bp.id
       WHERE gr.id = $1`, [req.params.grId]);
    if (!gr.rows.length) return errorResponse(res, 'GR not found', 404);
    const items = await query(
      `SELECT gi.*, pi.unit_price, pi.line_number,
              m.material_code, m.material_name, m.hsn_code, m.gst_rate, u.uom_code
       FROM pur_gr_items gi LEFT JOIN pur_po_items pi ON gi.po_item_id = pi.id
       LEFT JOIN mm_materials m ON gi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON gi.uom_id = u.id
       WHERE gi.gr_id = $1 ORDER BY pi.line_number`, [req.params.grId]);
    successResponse(res, { gr: gr.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/ap-invoices', authenticate, async (req, res) => {
  try {
    const inv = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('API');
      const compRes = await client.query(
        `SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
      const companyId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

      let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
      const items = inv.items || [];
      for (const item of items) {
        const lineAmt = num(item.quantity) * num(item.unit_price) * (1 - num(item.discount_percent)/100);
        subtotal += lineAmt;
        cgstTotal += lineAmt * num(item.cgst_rate) / 100;
        sgstTotal += lineAmt * num(item.sgst_rate) / 100;
        igstTotal += lineAmt * num(item.igst_rate) / 100;
      }
      const taxTotal = cgstTotal + sgstTotal + igstTotal;

      const h = await client.query(
        `INSERT INTO fi_ap_invoices (doc_number, company_id, vendor_id, invoice_date, due_date,
          posting_date, reference, description, currency, subtotal, tax_amount, total_amount,
          vendor_invoice_number, vendor_gstin, place_of_supply, cgst_amount, sgst_amount, igst_amount,
          payment_term_id, po_reference, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'draft',$21) RETURNING *`,
        [docNumber, companyId, uuid(inv.vendor_id), inv.invoice_date || new Date(),
         inv.due_date, inv.posting_date || new Date(), inv.reference, inv.description,
         inv.currency || 'INR', subtotal.toFixed(2), taxTotal.toFixed(2), (subtotal + taxTotal).toFixed(2),
         inv.vendor_invoice_number, inv.vendor_gstin, inv.place_of_supply,
         cgstTotal.toFixed(2), sgstTotal.toFixed(2), igstTotal.toFixed(2),
         uuid(inv.payment_term_id), uuid(inv.po_reference), req.user.id]);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const lineAmt = num(it.quantity) * num(it.unit_price) * (1 - num(it.discount_percent)/100);
        await client.query(
          `INSERT INTO fi_ap_invoice_items (invoice_id, line_number, material_id, description, hsn_code,
            quantity, uom_id, unit_price, discount_percent, cgst_rate, sgst_rate, igst_rate,
            cgst_amount, sgst_amount, igst_amount, total_amount, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [h.rows[0].id, i+1, uuid(it.material_id), it.description, it.hsn_code,
           num(it.quantity), uuid(it.uom_id), num(it.unit_price), num(it.discount_percent),
           num(it.cgst_rate), num(it.sgst_rate), num(it.igst_rate),
           (lineAmt * num(it.cgst_rate)/100).toFixed(2), (lineAmt * num(it.sgst_rate)/100).toFixed(2),
           (lineAmt * num(it.igst_rate)/100).toFixed(2), lineAmt.toFixed(2), uuid(it.gl_account_id)]);
      }
      return h.rows[0];
    });

    await auditLog(req.user.id, 'CREATE', 'ap_invoice', result.id, null, inv, req);
    successResponse(res, result, 'AP Invoice created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// APPROVE AP Invoice — creates JE (Dr Expense/Inventory, Cr Accounts Payable)
router.post('/ap-invoices/:id/approve', authenticate, async (req, res) => {
  try {
    const inv = await query(
      `SELECT ap.*, bp.display_name as vendor_name FROM fi_ap_invoices ap
       LEFT JOIN bp_business_partners bp ON ap.vendor_id = bp.id WHERE ap.id = $1`, [req.params.id]);
    if (!inv.rows.length) return errorResponse(res, 'Not found', 404);
    if (inv.rows[0].status === 'approved') return errorResponse(res, 'Already approved', 400);
    if (inv.rows[0].journal_id) return errorResponse(res, 'JE already exists', 400);

    const i = inv.rows[0];
    const total = parseFloat(i.total_amount);

    // Create JE as DRAFT — will be posted when payment is made
    const jeDocNum = await getNextNumber('JE');
    const je = await query(
      `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description,
        currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$7,'posted',$8,$8,NOW()) RETURNING *`,
      [jeDocNum, i.company_id, i.posting_date || new Date(), `AP:${i.doc_number}`,
       `AP Invoice ${i.doc_number} — ${i.vendor_name || 'Vendor'}`, i.currency || 'INR', total, req.user.id]);

    await buildTaxJELines(je.rows[0].id, i, true);

    await query(`UPDATE fi_ap_invoices SET status='approved', journal_id=$1 WHERE id=$2`, [je.rows[0].id, req.params.id]);
    successResponse(res, { ...i, status: 'approved', journal_id: je.rows[0].id }, 'AP Invoice approved — JE auto-posted');
  } catch (err) { errorResponse(res, err.message); }
});

// Get matching status for all AP invoices
router.get('/ap-invoices/matching-summary', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT match_status, COUNT(*) as count, SUM(total_amount) as total
       FROM fi_ap_invoices WHERE status != 'cancelled' GROUP BY match_status`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/ap-invoices/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT ap.*, bp.display_name as vendor_name, bp.bp_number, bp.gstin as vendor_gstin_master
       FROM fi_ap_invoices ap LEFT JOIN bp_business_partners bp ON ap.vendor_id = bp.id
       WHERE ap.id = $1`, [req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT ai.*, m.material_code, m.material_name, u.uom_code
       FROM fi_ap_invoice_items ai
       LEFT JOIN mm_materials m ON ai.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON ai.uom_id = u.id
       WHERE ai.invoice_id = $1 ORDER BY ai.line_number`, [req.params.id]);
    successResponse(res, { ...result.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// ========================================
// ACCOUNTS RECEIVABLE
// ========================================
router.get('/ar-invoices', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT ar.*, bp.display_name as customer_name, bp.bp_number,
               pt.term_name as payment_term
               FROM fi_ar_invoices ar
               LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id
               LEFT JOIN fi_payment_terms pt ON ar.payment_term_id = pt.id
               WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (status) { sql += ` AND ar.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (ar.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY ar.invoice_date DESC`;
    sql = paginate(sql, parseInt(page), 50);
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get SOs eligible for AR invoicing
router.get('/ar-invoices/source-sos', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT so.id, so.doc_number, so.order_date, so.total_amount, so.currency, so.status,
              bp.display_name as customer_name, bp.id as customer_id, bp.gstin as customer_gstin
       FROM sd_sales_orders so
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE so.status IN ('confirmed','in_process','completed')
       ORDER BY so.order_date DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get SO items for AR invoice auto-fill
router.get('/ar-invoices/source-so/:soId', authenticate, async (req, res) => {
  try {
    const so = await query(
      `SELECT so.*, bp.display_name as customer_name, bp.gstin as customer_gstin, bp.id as customer_id,
              bp.billing_address, bp.shipping_address
       FROM sd_sales_orders so LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE so.id = $1`, [req.params.soId]);
    if (!so.rows.length) return errorResponse(res, 'SO not found', 404);
    const items = await query(
      `SELECT si.*, m.material_code, m.material_name, m.hsn_code, m.gst_rate, u.uom_code
       FROM sd_so_items si LEFT JOIN mm_materials m ON si.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON si.uom_id = u.id
       WHERE si.so_id = $1 ORDER BY si.line_number`, [req.params.soId]);
    successResponse(res, { so: so.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// Get Deliveries eligible for AR invoicing
router.get('/ar-invoices/source-deliveries', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.id, d.doc_number, d.delivery_date, d.status,
              so.doc_number as so_number, so.id as so_id, so.total_amount, so.currency,
              bp.display_name as customer_name, bp.id as customer_id, bp.gstin as customer_gstin
       FROM sd_deliveries d
       JOIN sd_sales_orders so ON d.so_id = so.id
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE d.status = 'completed'
       ORDER BY d.delivery_date DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get Delivery items for AR invoice auto-fill
router.get('/ar-invoices/source-delivery/:delId', authenticate, async (req, res) => {
  try {
    const del = await query(
      `SELECT d.*, so.doc_number as so_number, so.currency,
              bp.display_name as customer_name, bp.gstin as customer_gstin, bp.id as customer_id,
              bp.billing_address, bp.shipping_address
       FROM sd_deliveries d JOIN sd_sales_orders so ON d.so_id = so.id
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE d.id = $1`, [req.params.delId]);
    if (!del.rows.length) return errorResponse(res, 'Delivery not found', 404);
    const items = await query(
      `SELECT di.*, si.unit_price, si.line_number,
              m.material_code, m.material_name, m.hsn_code, m.gst_rate, u.uom_code
       FROM sd_delivery_items di LEFT JOIN sd_so_items si ON di.so_item_id = si.id
       LEFT JOIN mm_materials m ON di.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON di.uom_id = u.id
       WHERE di.delivery_id = $1 ORDER BY si.line_number`, [req.params.delId]);
    successResponse(res, { delivery: del.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/ar-invoices', authenticate, async (req, res) => {
  try {
    const inv = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('ARI');
      const compRes = await client.query(
        `SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
      const companyId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

      let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
      const items = inv.items || [];
      for (const item of items) {
        const lineAmt = num(item.quantity) * num(item.unit_price) * (1 - num(item.discount_percent)/100);
        subtotal += lineAmt;
        cgstTotal += lineAmt * num(item.cgst_rate) / 100;
        sgstTotal += lineAmt * num(item.sgst_rate) / 100;
        igstTotal += lineAmt * num(item.igst_rate) / 100;
      }
      const taxTotal = cgstTotal + sgstTotal + igstTotal;

      const h = await client.query(
        `INSERT INTO fi_ar_invoices (doc_number, company_id, customer_id, invoice_date, due_date,
          posting_date, reference, description, currency, subtotal, tax_amount, total_amount,
          customer_gstin, place_of_supply, cgst_amount, sgst_amount, igst_amount,
          billing_address, shipping_address, payment_term_id, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'draft',$21) RETURNING *`,
        [docNumber, companyId, uuid(inv.customer_id), inv.invoice_date || new Date(),
         inv.due_date, inv.posting_date || new Date(), inv.reference, inv.description,
         inv.currency || 'INR', subtotal.toFixed(2), taxTotal.toFixed(2), (subtotal + taxTotal).toFixed(2),
         inv.customer_gstin, inv.place_of_supply,
         cgstTotal.toFixed(2), sgstTotal.toFixed(2), igstTotal.toFixed(2),
         inv.billing_address, inv.shipping_address,
         uuid(inv.payment_term_id), req.user.id]);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const lineAmt = num(it.quantity) * num(it.unit_price) * (1 - num(it.discount_percent)/100);
        await client.query(
          `INSERT INTO fi_ar_invoice_items (invoice_id, line_number, material_id, description, hsn_code,
            quantity, uom_id, unit_price, discount_percent, cgst_rate, sgst_rate, igst_rate,
            cgst_amount, sgst_amount, igst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [h.rows[0].id, i+1, uuid(it.material_id), it.description, it.hsn_code,
           num(it.quantity), uuid(it.uom_id), num(it.unit_price), num(it.discount_percent),
           num(it.cgst_rate), num(it.sgst_rate), num(it.igst_rate),
           (lineAmt * num(it.cgst_rate)/100).toFixed(2), (lineAmt * num(it.sgst_rate)/100).toFixed(2),
           (lineAmt * num(it.igst_rate)/100).toFixed(2), lineAmt.toFixed(2)]);
      }
      return h.rows[0];
    });

    await auditLog(req.user.id, 'CREATE', 'ar_invoice', result.id, null, inv, req);
    successResponse(res, result, 'AR Invoice created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// APPROVE AR Invoice — creates JE (Dr Accounts Receivable, Cr Revenue)
router.post('/ar-invoices/:id/approve', authenticate, async (req, res) => {
  try {
    const inv = await query(
      `SELECT ar.*, bp.display_name as customer_name FROM fi_ar_invoices ar
       LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id WHERE ar.id = $1`, [req.params.id]);
    if (!inv.rows.length) return errorResponse(res, 'Not found', 404);
    if (inv.rows[0].status === 'approved') return errorResponse(res, 'Already approved', 400);
    if (inv.rows[0].journal_id) return errorResponse(res, 'JE already exists', 400);

    const i = inv.rows[0];
    const total = parseFloat(i.total_amount);

    // Create JE as DRAFT — posted when payment received
    const jeDocNum = await getNextNumber('JE');
    const je = await query(
      `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description,
        currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$7,'posted',$8,$8,NOW()) RETURNING *`,
      [jeDocNum, i.company_id, i.posting_date || new Date(), `AR:${i.doc_number}`,
       `AR Invoice ${i.doc_number} — ${i.customer_name || 'Customer'}`, i.currency || 'INR', total, req.user.id]);

    const arAcctResult = 'replaced'; // use buildTaxJELines instead
    await buildTaxJELines(je.rows[0].id, i, false);

    await query(`UPDATE fi_ar_invoices SET status='approved', journal_id=$1 WHERE id=$2`, [je.rows[0].id, req.params.id]);
    successResponse(res, { ...i, status: 'approved', journal_id: je.rows[0].id }, 'AR Invoice approved — JE auto-posted');
  } catch (err) { errorResponse(res, err.message); }
});

// GET AR Invoice detail with items
router.get('/ar-invoices/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT ar.*, bp.display_name as customer_name, bp.bp_number, bp.gstin as customer_gstin_master
       FROM fi_ar_invoices ar LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id
       WHERE ar.id = $1`, [req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT ai.*, m.material_code, m.material_name, u.uom_code
       FROM fi_ar_invoice_items ai
       LEFT JOIN mm_materials m ON ai.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON ai.uom_id = u.id
       WHERE ai.invoice_id = $1 ORDER BY ai.line_number`, [req.params.id]);
    successResponse(res, { ...result.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// GET Tax Master for dropdowns
router.get('/tax-master', authenticate, async (req, res) => {
  try {
    successResponse(res, (await query(`SELECT * FROM fi_tax_master WHERE is_active = true ORDER BY tax_code`)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========================================
// PAYMENTS
// ========================================

router.get('/payments', authenticate, async (req, res) => {
  try {
    const { type, status, search, page = 1 } = req.query;
    let sql = `SELECT p.*, bp.display_name as bp_name, bp.bp_number,
               b.bank_name, b.account_number as bank_account
               FROM fi_payments p
               LEFT JOIN bp_business_partners bp ON p.bp_id = bp.id
               LEFT JOIN fi_banks b ON p.bank_id = b.id
               WHERE 1=1`;
    const params = []; let idx = 1;
    if (type) { sql += ` AND p.payment_type = $${idx++}`; params.push(type); }
    if (status) { sql += ` AND p.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (p.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY p.payment_date DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Payment detail with cleared invoices and JE info
router.get('/payments/:id/detail', authenticate, async (req, res) => {
  try {
    const p = await query(`SELECT * FROM fi_payments WHERE id = $1`, [req.params.id]);
    if (!p.rows.length) return errorResponse(res, 'Not found', 404);
    const row = p.rows[0];

    // Get partner info
    let bp_name = '', bp_number = '', gstin = '';
    if (row.bp_id) {
      try { const bp = await query(`SELECT display_name, bp_number FROM bp_business_partners WHERE id = $1`, [row.bp_id]); bp_name = bp.rows[0]?.display_name || ''; bp_number = bp.rows[0]?.bp_number || ''; } catch {}
      try { const g = await query(`SELECT gstin FROM bp_business_partners WHERE id = $1`, [row.bp_id]); gstin = g.rows[0]?.gstin || ''; } catch {}
    }

    // Get created by name
    let created_by_name = '';
    if (row.created_by) { try { const u = await query(`SELECT first_name, last_name FROM sys_users WHERE id = $1`, [row.created_by]); created_by_name = u.rows[0] ? `${u.rows[0].first_name} ${u.rows[0].last_name}` : ''; } catch {} }

    // Get JE info
    let je_number = null, je_status = null;
    if (row.journal_id) { try { const je = await query(`SELECT doc_number, status FROM fi_journal_headers WHERE id = $1`, [row.journal_id]); je_number = je.rows[0]?.doc_number; je_status = je.rows[0]?.status; } catch {} }

    // Get cleared invoices
    let cleared_invoices = [];
    if (row.bp_id) {
      try {
        const isOut = row.payment_type === 'outgoing';
        const tbl = isOut ? 'fi_ap_invoices' : 'fi_ar_invoices';
        const col = isOut ? 'vendor_id' : 'customer_id';
        const c = await query(`SELECT doc_number, invoice_date, total_amount, paid_amount, status FROM ${tbl} WHERE ${col} = $1 AND paid_amount > 0 ORDER BY invoice_date DESC LIMIT 20`, [row.bp_id]);
        cleared_invoices = c.rows;
      } catch {}
    }

    successResponse(res, { ...row, bp_name, bp_number, gstin, created_by_name, je_number, je_status, cleared_invoices });
  } catch (err) { errorResponse(res, err.message); }
});

// Open AP invoices for vendor (payment invoice selection) — must be before :id routes
router.get('/payments/open-ap-invoices', authenticate, async (req, res) => {
  try {
    const { vendor_id } = req.query;
    if (!vendor_id) return successResponse(res, []);
    const result = await query(
      `SELECT ap.id, ap.doc_number, ap.invoice_date, ap.due_date, ap.total_amount, ap.paid_amount,
              (ap.total_amount - ap.paid_amount) as balance, ap.vendor_invoice_number, ap.reference, ap.status, ap.journal_id
       FROM fi_ap_invoices ap
       WHERE ap.vendor_id = $1 AND ap.status IN ('approved','draft','submitted') AND (ap.total_amount - ap.paid_amount) > 0
       ORDER BY ap.due_date ASC`, [vendor_id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Open AR invoices for customer
router.get('/payments/open-ar-invoices', authenticate, async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) return successResponse(res, []);
    const result = await query(
      `SELECT ar.id, ar.doc_number, ar.invoice_date, ar.due_date, ar.total_amount, ar.paid_amount,
              (ar.total_amount - ar.paid_amount) as balance, ar.reference, ar.status, ar.journal_id
       FROM fi_ar_invoices ar
       WHERE ar.customer_id = $1 AND ar.status IN ('approved','draft','submitted') AND (ar.total_amount - ar.paid_amount) > 0
       ORDER BY ar.due_date ASC`, [customer_id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// All pending (unpaid) invoices — AP + AR combined
router.get('/payments/pending-invoices', authenticate, async (req, res) => {
  try {
    const { type, search } = req.query;
    let sql = `
      SELECT 'AP' as invoice_type, ap.id, ap.doc_number, ap.invoice_date, ap.due_date,
             bp.display_name as partner_name, bp.bp_number, ap.vendor_id as partner_id,
             ap.total_amount, ap.paid_amount, (ap.total_amount - ap.paid_amount) as balance,
             ap.status, 'outgoing' as payment_direction
      FROM fi_ap_invoices ap
      LEFT JOIN bp_business_partners bp ON ap.vendor_id = bp.id
      WHERE ap.status IN ('approved','submitted') AND (ap.total_amount - ap.paid_amount) > 0
      ${ search ? `AND (ap.doc_number ILIKE '%${search.replace(/'/g,"''")}%' OR bp.display_name ILIKE '%${search.replace(/'/g,"''")}%')` : '' }
      UNION ALL
      SELECT 'AR' as invoice_type, ar.id, ar.doc_number, ar.invoice_date, ar.due_date,
             bp.display_name as partner_name, bp.bp_number, ar.customer_id as partner_id,
             ar.total_amount, ar.paid_amount, (ar.total_amount - ar.paid_amount) as balance,
             ar.status, 'incoming' as payment_direction
      FROM fi_ar_invoices ar
      LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id
      WHERE ar.status IN ('approved','submitted') AND (ar.total_amount - ar.paid_amount) > 0
      ${ search ? `AND (ar.doc_number ILIKE '%${search.replace(/'/g,"''")}%' OR bp.display_name ILIKE '%${search.replace(/'/g,"''")}%')` : '' }
      ORDER BY due_date ASC`;
    const rows = (await query(sql)).rows;
    const filtered = type ? rows.filter(r => r.payment_direction === type) : rows;
    successResponse(res, filtered);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/payments', authenticate, async (req, res) => {
  try {
    const p = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const docNumber = await getNextNumber('PAY');

    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
    const companyId = compRes.rows[0]?.id || (await query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

    const payAmt = num(p.amount);
    const invoiceIds = p.invoice_ids || [];

    // Build reference from selected invoices
    let invoiceRef = p.reference || '';
    if (invoiceIds.length && !invoiceRef) {
      const tbl = p.payment_type === 'outgoing' ? 'fi_ap_invoices' : 'fi_ar_invoices';
      const invDocs = await query(`SELECT doc_number FROM ${tbl} WHERE id = ANY($1)`, [invoiceIds]);
      invoiceRef = invDocs.rows.map(r => r.doc_number).join(', ');
    }

    const result = await query(
      `INSERT INTO fi_payments (doc_number, company_id, payment_type, bp_id, bank_id,
        payment_date, amount, currency, payment_method, check_number, reference, description, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'completed',$13) RETURNING *`,
      [docNumber, companyId, p.payment_type, uuid(p.bp_id), uuid(p.bank_id),
       p.payment_date || new Date(), payAmt, p.currency || 'INR',
       p.payment_method, p.check_number, invoiceRef || p.reference, p.description, req.user.id]);

    // ============ CLEAR INVOICES + POST THEIR DRAFT JEs ============
    const clearedInvoices = [];
    if (p.bp_id && payAmt > 0) {
      let remaining = payAmt;

      if (p.payment_type === 'outgoing') {
        let openAP;
        if (invoiceIds.length) {
          openAP = await query(`SELECT id, doc_number, total_amount, paid_amount, journal_id FROM fi_ap_invoices WHERE id = ANY($1) AND (total_amount - paid_amount) > 0 ORDER BY due_date`, [invoiceIds]);
        } else {
          openAP = await query(`SELECT id, doc_number, total_amount, paid_amount, journal_id FROM fi_ap_invoices WHERE vendor_id=$1 AND status IN ('approved','draft','submitted') AND (total_amount - paid_amount) > 0 ORDER BY due_date`, [p.bp_id]);
        }
        for (const inv of openAP.rows) {
          if (remaining <= 0) break;
          const due = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount);
          const apply = Math.min(remaining, due);
          await query(`UPDATE fi_ap_invoices SET paid_amount = paid_amount + $1, status = CASE WHEN (paid_amount + $1) >= total_amount THEN 'paid' ELSE status END WHERE id=$2`, [apply, inv.id]);
          clearedInvoices.push({ id: inv.id, doc_number: inv.doc_number, applied: apply });
          // Post the invoice's draft JE on payment
          if (inv.journal_id) {
            await query(`UPDATE fi_journal_headers SET status='posted', posted_by=$1, posted_at=NOW() WHERE id=$2 AND status='draft'`, [req.user.id, inv.journal_id]);
          }
          remaining -= apply;
        }
      } else if (p.payment_type === 'incoming') {
        let openAR;
        if (invoiceIds.length) {
          openAR = await query(`SELECT id, doc_number, total_amount, paid_amount, journal_id FROM fi_ar_invoices WHERE id = ANY($1) AND (total_amount - paid_amount) > 0 ORDER BY due_date`, [invoiceIds]);
        } else {
          openAR = await query(`SELECT id, doc_number, total_amount, paid_amount, journal_id FROM fi_ar_invoices WHERE customer_id=$1 AND status IN ('approved','draft','submitted') AND (total_amount - paid_amount) > 0 ORDER BY due_date`, [p.bp_id]);
        }
        for (const inv of openAR.rows) {
          if (remaining <= 0) break;
          const due = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount);
          const apply = Math.min(remaining, due);
          await query(`UPDATE fi_ar_invoices SET paid_amount = paid_amount + $1, status = CASE WHEN (paid_amount + $1) >= total_amount THEN 'paid' ELSE status END WHERE id=$2`, [apply, inv.id]);
          clearedInvoices.push({ id: inv.id, doc_number: inv.doc_number, applied: apply });
          if (inv.journal_id) {
            await query(`UPDATE fi_journal_headers SET status='posted', posted_by=$1, posted_at=NOW() WHERE id=$2 AND status='draft'`, [req.user.id, inv.journal_id]);
          }
          remaining -= apply;
        }
      }
    }

    // ============ PAYMENT JE (posted immediately) ============
    try {
      const partnerRes = await query(`SELECT display_name FROM bp_business_partners WHERE id = $1`, [p.bp_id]);
      const partnerName = partnerRes.rows[0]?.display_name || (p.payment_type === 'outgoing' ? 'Vendor' : 'Customer');
      const jeDocNum = await getNextNumber('JE');
      const je = await query(
        `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description,
          currency, total_debit, total_credit, status, posted_by, posted_at, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,$6,$7,$7,'posted',$8,NOW(),$8) RETURNING *`,
        [jeDocNum, companyId, p.payment_date || new Date(), `PAY:${docNumber}`,
         `Payment ${docNumber} — ${partnerName}${invoiceRef ? ' / ' + invoiceRef : ''}`,
         p.currency || 'INR', payAmt, req.user.id]);

      const bankGl = await resolveGL(p.payment_type === 'outgoing' ? 'bank_outgoing' : 'bank_incoming');
      const apGl = await resolveGL('accounts_payable');
      const arGl = await resolveGL('accounts_receivable');

      if (je.rows[0] && bankGl) {
        const invRef = invoiceRef || docNumber;
        if (p.payment_type === 'outgoing' && apGl)
          await query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,1,$2,$3,0,$4), ($1,2,$5,0,$3,$6)`,
            [je.rows[0].id, apGl, payAmt, `Creditors — ${partnerName} / ${invRef}`, bankGl, `Bank payment — ${partnerName} / ${docNumber}`]);
        else if (p.payment_type === 'incoming' && arGl)
          await query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,1,$2,$3,0,$4), ($1,2,$5,0,$3,$6)`,
            [je.rows[0].id, bankGl, payAmt, `Bank receipt — ${partnerName} / ${docNumber}`, arGl, `Debtors — ${partnerName} / ${invRef}`]);
      }
      await query(`UPDATE fi_payments SET journal_id = $1 WHERE id = $2`, [je.rows[0].id, result.rows[0].id]);
    } catch (jeErr) { console.log('Payment JE error:', jeErr.message); }

    await auditLog(req.user.id, 'CREATE', 'payment', result.rows[0].id, null, { ...p, cleared: clearedInvoices }, req);
    successResponse(res, { ...result.rows[0], cleared_invoices: clearedInvoices },
      `Payment ₹${payAmt.toLocaleString()} — ${clearedInvoices.length} invoice(s) cleared, JEs posted`, 201);
  } catch (err) { errorResponse(res, err.message); }
});

// ========================================
// FINANCIAL REPORTS
// ========================================

// Trial Balance
router.get('/reports/trial-balance', authenticate, async (req, res) => {
  try {
    const { as_of_date } = req.query;
    const dateFilter = as_of_date || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT gl.account_code, gl.account_name, gl.account_type, gl.account_group,
              COALESCE(SUM(jl.debit_amount), 0) as total_debit,
              COALESCE(SUM(jl.credit_amount), 0) as total_credit,
              COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0) as balance
       FROM fi_gl_accounts gl
       LEFT JOIN fi_journal_lines jl ON gl.id = jl.gl_account_id
       LEFT JOIN fi_journal_headers jh ON jl.header_id = jh.id
         AND jh.status = 'posted' AND jh.posting_date <= $1
       WHERE gl.is_active = true
       GROUP BY gl.id, gl.account_code, gl.account_name, gl.account_type, gl.account_group
       HAVING COALESCE(SUM(jl.debit_amount), 0) != 0 OR COALESCE(SUM(jl.credit_amount), 0) != 0
       ORDER BY gl.account_code`,
      [dateFilter]
    );

    const totals = result.rows.reduce((acc, r) => ({
      total_debit: acc.total_debit + parseFloat(r.total_debit),
      total_credit: acc.total_credit + parseFloat(r.total_credit),
    }), { total_debit: 0, total_credit: 0 });

    successResponse(res, { accounts: result.rows, totals, as_of_date: dateFilter });
  } catch (err) { errorResponse(res, err.message); }
});

// Profit & Loss
router.get('/reports/profit-loss', authenticate, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const fromDate = from_date || `${new Date().getFullYear()}-01-01`;
    const toDate = to_date || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT gl.account_code, gl.account_name, gl.account_type, gl.account_group,
              COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0) as amount
       FROM fi_gl_accounts gl
       LEFT JOIN fi_journal_lines jl ON gl.id = jl.gl_account_id
       LEFT JOIN fi_journal_headers jh ON jl.header_id = jh.id
         AND jh.status = 'posted'
         AND jh.posting_date BETWEEN $1 AND $2
       WHERE gl.account_type IN ('revenue', 'expense') AND gl.is_active = true
       GROUP BY gl.id, gl.account_code, gl.account_name, gl.account_type, gl.account_group
       ORDER BY gl.account_type DESC, gl.account_code`,
      [fromDate, toDate]
    );

    const revenue = result.rows.filter(r => r.account_type === 'revenue');
    const expenses = result.rows.filter(r => r.account_type === 'expense');
    const totalRevenue = revenue.reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalExpenses = expenses.reduce((s, r) => s + Math.abs(parseFloat(r.amount)), 0);

    successResponse(res, {
      revenue, expenses, totalRevenue, totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      from_date: fromDate, to_date: toDate
    });
  } catch (err) { errorResponse(res, err.message); }
});

// Balance Sheet
router.get('/reports/balance-sheet', authenticate, async (req, res) => {
  try {
    const { as_of_date } = req.query;
    const dateFilter = as_of_date || new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT gl.account_code, gl.account_name, gl.account_type, gl.account_group,
              CASE
                WHEN gl.account_type IN ('asset') THEN COALESCE(SUM(jl.debit_amount),0) - COALESCE(SUM(jl.credit_amount),0)
                ELSE COALESCE(SUM(jl.credit_amount),0) - COALESCE(SUM(jl.debit_amount),0)
              END as balance
       FROM fi_gl_accounts gl
       LEFT JOIN fi_journal_lines jl ON gl.id = jl.gl_account_id
       LEFT JOIN fi_journal_headers jh ON jl.header_id = jh.id
         AND jh.status = 'posted' AND jh.posting_date <= $1
       WHERE gl.account_type IN ('asset', 'liability', 'equity') AND gl.is_active = true
       GROUP BY gl.id, gl.account_code, gl.account_name, gl.account_type, gl.account_group
       ORDER BY gl.account_type, gl.account_code`,
      [dateFilter]
    );

    const assets = result.rows.filter(r => r.account_type === 'asset');
    const liabilities = result.rows.filter(r => r.account_type === 'liability');
    const equity = result.rows.filter(r => r.account_type === 'equity');

    const totalAssets = assets.reduce((s, r) => s + parseFloat(r.balance), 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + parseFloat(r.balance), 0);
    const totalEquity = equity.reduce((s, r) => s + parseFloat(r.balance), 0);

    successResponse(res, {
      assets, liabilities, equity,
      totalAssets, totalLiabilities, totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      as_of_date: dateFilter
    });
  } catch (err) { errorResponse(res, err.message); }
});

// GL Account Ledger
router.get('/reports/gl-ledger/:accountId', authenticate, async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const result = await query(
      `SELECT jl.*, jh.doc_number, jh.posting_date, jh.description as header_desc,
              jh.status, gl.account_code, gl.account_name
       FROM fi_journal_lines jl
       JOIN fi_journal_headers jh ON jl.header_id = jh.id
       JOIN fi_gl_accounts gl ON jl.gl_account_id = gl.id
       WHERE jl.gl_account_id = $1 AND jh.status = 'posted'
       ${from_date ? `AND jh.posting_date >= '${from_date}'` : ''}
       ${to_date ? `AND jh.posting_date <= '${to_date}'` : ''}
       ORDER BY jh.posting_date, jh.doc_number`,
      [req.params.accountId]
    );
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Finance Overview Stats
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [journals, ap, ar, payments] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='draft') as drafts,
             COUNT(*) FILTER(WHERE status='posted') as posted
             FROM fi_journal_headers`),
      query(`SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as total_amount,
             COALESCE(SUM(total_amount - paid_amount),0) as open_amount,
             COUNT(*) FILTER(WHERE due_date < CURRENT_DATE AND total_amount > paid_amount) as overdue
             FROM fi_ap_invoices WHERE status != 'cancelled'`),
      query(`SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as total_amount,
             COALESCE(SUM(total_amount - paid_amount),0) as open_amount,
             COUNT(*) FILTER(WHERE due_date < CURRENT_DATE AND total_amount > paid_amount) as overdue
             FROM fi_ar_invoices WHERE status != 'cancelled'`),
      query(`SELECT COUNT(*) as total, COALESCE(SUM(amount),0) as total_amount
             FROM fi_payments WHERE status != 'cancelled'
             AND payment_date >= DATE_TRUNC('month', CURRENT_DATE)`),
    ]);

    successResponse(res, {
      journals: journals.rows[0],
      accountsPayable: ap.rows[0],
      accountsReceivable: ar.rows[0],
      payments: payments.rows[0],
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// CASH FLOW FORECAST
// ============================================
router.get('/reports/cash-flow', authenticate, async (req, res) => {
  try {
    const { months = 6 } = req.query;
    // Current cash (from bank-type GL accounts)
    const cashAccounts = await query(
      `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount),0) as balance
       FROM fi_journal_lines jl
       JOIN fi_gl_accounts ga ON jl.gl_account_id = ga.id
       JOIN fi_journal_headers jh ON jl.header_id = jh.id
       WHERE ga.account_type = 'asset' AND ga.account_code LIKE '1%'
       AND jh.status = 'posted'`);
    const currentCash = parseFloat(cashAccounts.rows[0]?.balance || 0);

    // AR due (money coming in) grouped by month
    const arForecast = await query(
      `SELECT DATE_TRUNC('month', due_date)::DATE as month,
              COALESCE(SUM(total_amount - paid_amount),0) as inflow
       FROM fi_ar_invoices
       WHERE status != 'cancelled' AND total_amount > paid_amount
       AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + ($1 || ' months')::INTERVAL
       GROUP BY 1 ORDER BY 1`, [parseInt(months)]);

    // AP due (money going out) grouped by month
    const apForecast = await query(
      `SELECT DATE_TRUNC('month', due_date)::DATE as month,
              COALESCE(SUM(total_amount - paid_amount),0) as outflow
       FROM fi_ap_invoices
       WHERE status != 'cancelled' AND total_amount > paid_amount
       AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + ($1 || ' months')::INTERVAL
       GROUP BY 1 ORDER BY 1`, [parseInt(months)]);

    // Recurring costs estimate (last 3 months avg expenses)
    const avgExpenses = await query(
      `SELECT COALESCE(AVG(monthly_total),0) as avg_expense FROM (
        SELECT DATE_TRUNC('month', posting_date) as m, SUM(jl.debit_amount) as monthly_total
        FROM fi_journal_lines jl
        JOIN fi_gl_accounts ga ON jl.gl_account_id = ga.id
        JOIN fi_journal_headers jh ON jl.header_id = jh.id
        WHERE ga.account_type = 'expense' AND jh.status = 'posted'
        AND jh.posting_date >= CURRENT_DATE - INTERVAL '3 months'
        GROUP BY 1
      ) sub`);

    // Build monthly projection
    const projections = [];
    let runningCash = currentCash;
    for (let i = 0; i < parseInt(months); i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      const monthStr = d.toISOString().slice(0, 7);
      const monthDate = `${monthStr}-01`;
      const arRow = arForecast.rows.find(r => r.month?.toISOString?.()?.startsWith(monthStr) || String(r.month).startsWith(monthStr));
      const apRow = apForecast.rows.find(r => r.month?.toISOString?.()?.startsWith(monthStr) || String(r.month).startsWith(monthStr));
      const inflow = parseFloat(arRow?.inflow || 0);
      const outflow = parseFloat(apRow?.outflow || 0) + (i > 0 ? parseFloat(avgExpenses.rows[0]?.avg_expense || 0) : 0);
      runningCash += inflow - outflow;
      projections.push({
        month: new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        inflow, outflow, net: inflow - outflow, balance: runningCash,
      });
    }

    successResponse(res, {
      currentCash,
      avgMonthlyExpense: parseFloat(avgExpenses.rows[0]?.avg_expense || 0),
      projections,
      totalInflow: projections.reduce((s, p) => s + p.inflow, 0),
      totalOutflow: projections.reduce((s, p) => s + p.outflow, 0),
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// BANK RECONCILIATION
// ============================================
router.get('/bank-gl-accounts', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT id, account_code, account_name, account_type, account_group FROM fi_gl_accounts WHERE is_active = true AND (LOWER(account_name) LIKE '%bank%' OR LOWER(account_group) LIKE '%bank%' OR LOWER(account_name) LIKE '%incoming%' OR LOWER(account_name) LIKE '%outgoing%') ORDER BY account_code`);
    successResponse(res, r.rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/bank-accounts', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT ba.*, gl.account_code as gl_code, gl.account_name as gl_name FROM fi_bank_accounts ba LEFT JOIN fi_gl_accounts gl ON ba.gl_account_id = gl.id ORDER BY ba.account_code`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/bank-accounts', authenticate, async (req, res) => {
  try {
    const { account_code, account_name, bank_name, branch, account_number, ifsc_code, swift_code, currency, gl_account_id, opening_balance } = req.body;
    const r = await query(`INSERT INTO fi_bank_accounts (account_code, account_name, bank_name, branch, account_number, ifsc_code, swift_code, currency, gl_account_id, opening_balance, current_balance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
      [account_code, account_name, bank_name, branch, account_number, ifsc_code, swift_code, currency || 'INR', gl_account_id, opening_balance || 0]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/bank-statements', authenticate, async (req, res) => {
  try {
    const { bank_account_id, reconciled } = req.query;
    let sql = `SELECT bs.*, ba.account_name as bank_name FROM fi_bank_statements bs JOIN fi_bank_accounts ba ON bs.bank_account_id = ba.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (bank_account_id) { sql += ` AND bs.bank_account_id = $${idx++}`; params.push(bank_account_id); }
    if (reconciled !== undefined) { sql += ` AND bs.is_reconciled = $${idx++}`; params.push(reconciled === 'true'); }
    sql += ` ORDER BY bs.statement_date DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/bank-statements/import', authenticate, async (req, res) => {
  try {
    const { bank_account_id, statements } = req.body;
    let imported = 0;
    for (const s of statements) {
      await query(`INSERT INTO fi_bank_statements (bank_account_id, statement_date, reference, description, debit_amount, credit_amount, balance) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [bank_account_id, s.date, s.reference, s.description, s.debit || 0, s.credit || 0, s.balance]);
      imported++;
    }
    successResponse(res, { imported });
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/bank-statements/:id/reconcile', authenticate, async (req, res) => {
  try {
    const { matched_payment_id, matched_journal_id } = req.body;
    await query(`UPDATE fi_bank_statements SET is_reconciled = true, matched_payment_id = $1, matched_journal_id = $2 WHERE id = $3`,
      [matched_payment_id, matched_journal_id, req.params.id]);
    successResponse(res, null, 'Reconciled');
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/bank-statements/auto-reconcile', authenticate, async (req, res) => {
  try {
    const { bank_account_id } = req.body;
    // Match by amount + date proximity
    const unmatched = await query(`SELECT * FROM fi_bank_statements WHERE bank_account_id = $1 AND is_reconciled = false`, [bank_account_id]);
    let matched = 0;
    for (const stmt of unmatched.rows) {
      const amt = stmt.debit_amount > 0 ? stmt.debit_amount : stmt.credit_amount;
      const pay = await query(`SELECT id FROM fi_payments WHERE amount = $1 AND payment_date BETWEEN $2::date - 3 AND $2::date + 3 AND id NOT IN (SELECT matched_payment_id FROM fi_bank_statements WHERE matched_payment_id IS NOT NULL) LIMIT 1`, [amt, stmt.statement_date]);
      if (pay.rows.length) {
        await query(`UPDATE fi_bank_statements SET is_reconciled = true, matched_payment_id = $1 WHERE id = $2`, [pay.rows[0].id, stmt.id]);
        matched++;
      }
    }
    successResponse(res, { matched, total: unmatched.rows.length });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// EXCHANGE RATES
// ============================================
router.get('/exchange-rates', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM fi_exchange_rates ORDER BY rate_date DESC, from_currency`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/exchange-rates', authenticate, async (req, res) => {
  try {
    const { from_currency, to_currency, rate, effective_date } = req.body;
    const dt = effective_date || new Date().toISOString().split('T')[0];
    // Check if exists
    const exists = await query(`SELECT id FROM fi_exchange_rates WHERE from_currency = $1 AND to_currency = $2 AND rate_date = $3`, [from_currency, to_currency, dt]);
    if (exists.rows.length) {
      await query(`UPDATE fi_exchange_rates SET exchange_rate = $1 WHERE id = $2`, [rate, exists.rows[0].id]);
      successResponse(res, { from_currency, to_currency, exchange_rate: rate, rate_date: dt }, 'Updated');
    } else {
      const r = await query(`INSERT INTO fi_exchange_rates (from_currency, to_currency, exchange_rate, rate_date) VALUES ($1,$2,$3,$4) RETURNING *`,
        [from_currency, to_currency, rate, dt]);
      successResponse(res, r.rows[0], 'Created', 201);
    }
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/convert', authenticate, async (req, res) => {
  try {
    const { from, to, amount } = req.query;
    const r = await query(`SELECT exchange_rate FROM fi_exchange_rates WHERE from_currency = $1 AND to_currency = $2 ORDER BY rate_date DESC LIMIT 1`, [from, to]);
    if (!r.rows.length) return errorResponse(res, `No rate found for ${from}→${to}`, 404);
    successResponse(res, { from, to, rate: r.rows[0].exchange_rate, original: parseFloat(amount), converted: parseFloat(amount) * r.rows[0].exchange_rate });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// TAX MANAGEMENT
// ============================================
router.get('/tax-codes', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM fi_tax_codes ORDER BY tax_type, tax_rate`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/tax-codes', authenticate, async (req, res) => {
  try {
    const { tax_code, tax_name, tax_type, rate, tax_category, components, gl_account_id } = req.body;
    const r = await query(`INSERT INTO fi_tax_codes (tax_code, tax_name, tax_type, tax_rate, tax_category, components, gl_account_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tax_code, tax_name, tax_type || 'output', rate, tax_category || 'gst', JSON.stringify(components || []), gl_account_id]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/tax-calculate', authenticate, async (req, res) => {
  try {
    const { tax_code, amount } = req.query;
    const tc = await query(`SELECT * FROM fi_tax_codes WHERE tax_code = $1`, [tax_code]);
    if (!tc.rows.length) return errorResponse(res, 'Tax code not found', 404);
    const t = tc.rows[0];
    const taxAmount = (parseFloat(amount) * t.tax_rate) / 100;
    const components = typeof t.components === 'string' ? JSON.parse(t.components) : (t.components || []);
    const breakdown = components.length ? components.map(c => ({ name: c.name, rate: c.rate, amount: (parseFloat(amount) * c.rate) / 100 })) : [{ name: t.tax_name, rate: t.tax_rate, amount: taxAmount }];
    successResponse(res, { taxable: parseFloat(amount), tax: taxAmount, total: parseFloat(amount) + taxAmount, breakdown });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// BUDGETS
// ============================================
router.get('/budgets', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT b.*, gl.account_name FROM fi_budgets b LEFT JOIN fi_gl_accounts gl ON b.gl_account_id = gl.id ORDER BY b.fiscal_year DESC, b.cost_center`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/budgets', authenticate, async (req, res) => {
  try {
    const { budget_name, fiscal_year, cost_center, gl_account_id, budget_amount } = req.body;
    const r = await query(`INSERT INTO fi_budgets (budget_name, fiscal_year, cost_center, gl_account_id, budget_amount, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [budget_name, fiscal_year, cost_center, gl_account_id, budget_amount, req.user.id]);
    successResponse(res, r.rows[0], 'Created', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.get('/budgets/:id/check', authenticate, async (req, res) => {
  try {
    const b = await query(`SELECT * FROM fi_budgets WHERE id = $1`, [req.params.id]);
    if (!b.rows.length) return errorResponse(res, 'Not found', 404);
    const budget = b.rows[0];
    const utilization = budget.budget_amount > 0 ? ((budget.actual_amount / budget.budget_amount) * 100).toFixed(1) : 0;
    successResponse(res, { ...budget, utilization_pct: utilization, is_exceeded: budget.available_amount < 0 });
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// PERIOD CLOSING
// ============================================
router.get('/periods', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT p.*, u.first_name || ' ' || u.last_name as closed_by_name FROM fi_periods p LEFT JOIN sys_users u ON p.closed_by = u.id ORDER BY p.period_year DESC, p.period_month DESC`)).rows); } catch(e) { errorResponse(res, e.message); }
});
router.post('/periods/:id/close', authenticate, async (req, res) => {
  try {
    const period = await query(`SELECT * FROM fi_periods WHERE id = $1`, [req.params.id]);
    if (!period.rows.length) return errorResponse(res, 'Not found', 404);
    if (period.rows[0].status === 'closed') return errorResponse(res, 'Period already closed', 400);
    // Check for draft journals in this period
    const drafts = await query(`SELECT COUNT(*) as cnt FROM fi_journal_entries WHERE status = 'draft' AND EXTRACT(MONTH FROM posting_date) = $1 AND EXTRACT(YEAR FROM posting_date) = $2`, [period.rows[0].period_month, period.rows[0].period_year]);
    if (parseInt(drafts.rows[0].cnt) > 0) return errorResponse(res, `Cannot close — ${drafts.rows[0].cnt} draft journal(s) exist in this period. Post or delete them first.`, 400);
    await query(`UPDATE fi_periods SET status = 'closed', closed_by = $1, closed_at = NOW() WHERE id = $2`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Period closed');
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/periods/:id/reopen', authenticate, async (req, res) => {
  try {
    await query(`UPDATE fi_periods SET status = 'open', closed_by = NULL, closed_at = NULL WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Period reopened');
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// CREDIT CONTROL
// ============================================
router.get('/credit-check/:customerId', authenticate, async (req, res) => {
  try {
    const bp = await query(`SELECT id, display_name, credit_limit FROM bp_business_partners WHERE id = $1`, [req.params.customerId]);
    if (!bp.rows.length) return errorResponse(res, 'Customer not found', 404);
    const outstanding = await query(`SELECT COALESCE(SUM(total_amount - paid_amount), 0) as balance FROM fi_ar_invoices WHERE customer_id = $1 AND status != 'cancelled'`, [req.params.customerId]);
    const openOrders = await query(`SELECT COALESCE(SUM(total_amount), 0) as committed FROM sd_sales_orders WHERE customer_id = $1 AND status IN ('draft', 'confirmed')`, [req.params.customerId]);
    const bal = parseFloat(outstanding.rows[0].balance);
    const committed = parseFloat(openOrders.rows[0].committed);
    const limit = parseFloat(bp.rows[0].credit_limit || 0);
    const available = limit - bal - committed;
    const holds = await query(`SELECT * FROM fi_credit_holds WHERE customer_id = $1 AND is_active = true`, [req.params.customerId]);
    successResponse(res, { customer: bp.rows[0], credit_limit: limit, outstanding_balance: bal, committed_orders: committed, total_exposure: bal + committed, available_credit: available, is_exceeded: limit > 0 && available < 0, active_holds: holds.rows });
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/credit-hold', authenticate, async (req, res) => {
  try {
    const { customer_id, reason } = req.body;
    const r = await query(`INSERT INTO fi_credit_holds (customer_id, hold_type, reason, held_by) VALUES ($1,'manual',$2,$3) RETURNING *`, [customer_id, reason, req.user.id]);
    successResponse(res, r.rows[0], 'Hold placed', 201);
  } catch(e) { errorResponse(res, e.message); }
});
router.post('/credit-hold/:id/release', authenticate, async (req, res) => {
  try {
    await query(`UPDATE fi_credit_holds SET is_active = false, released_by = $1, released_at = NOW() WHERE id = $2`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Hold released');
  } catch(e) { errorResponse(res, e.message); }
});

// ============================================
// NOTIFICATIONS HELPER
// ============================================
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM sys_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    const unread = await query(`SELECT COUNT(*) as cnt FROM sys_notifications WHERE user_id = $1 AND is_read = false`, [req.user.id]);
    successResponse(res, { notifications: r.rows, unread_count: parseInt(unread.rows[0].cnt) });
  } catch(e) { errorResponse(res, e.message); }
});
router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try { await query(`UPDATE sys_notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]); successResponse(res, null); } catch(e) { errorResponse(res, e.message); }
});
router.put('/notifications/read-all', authenticate, async (req, res) => {
  try { await query(`UPDATE sys_notifications SET is_read = true WHERE user_id = $1 AND is_read = false`, [req.user.id]); successResponse(res, null); } catch(e) { errorResponse(res, e.message); }
});

// ========================================
// P4-27: 3-WAY MATCHING (PO → GRN → AP Invoice)
// ========================================
router.post('/ap-invoices/:id/match', authenticate, async (req, res) => {
  try {
    const inv = await query(`SELECT * FROM fi_ap_invoices WHERE id = $1`, [req.params.id]);
    if (!inv.rows.length) return errorResponse(res, 'Invoice not found', 404);
    const ap = inv.rows[0];

    // Find matching PO by po_reference or vendor
    let matchResult = { po: null, gr: null, status: 'unmatched', variance: 0 };

    if (ap.po_reference) {
      const po = await query(`SELECT * FROM pur_purchase_orders WHERE id = $1`, [ap.po_reference]);
      if (po.rows.length) {
        matchResult.po = po.rows[0];
        // Find GR for this PO
        const gr = await query(`SELECT * FROM pur_goods_receipts WHERE po_id = $1 ORDER BY receipt_date DESC LIMIT 1`, [ap.po_reference]);
        if (gr.rows.length) {
          matchResult.gr = gr.rows[0];
          // Calculate variance
          const poTotal = parseFloat(po.rows[0].total_amount || 0);
          const invTotal = parseFloat(ap.total_amount || 0);
          matchResult.variance = Math.abs(invTotal - poTotal);
          matchResult.status = matchResult.variance <= (poTotal * 0.02) ? 'matched' : 'variance';
        } else {
          matchResult.status = 'partial'; // PO found but no GR
        }
      }
    }

    // Update AP invoice with match result
    await query(
      `UPDATE fi_ap_invoices SET match_status=$1, matched_po_id=$2, matched_gr_id=$3, match_variance=$4 WHERE id=$5`,
      [matchResult.status, matchResult.po?.id || null, matchResult.gr?.id || null, matchResult.variance, req.params.id]);

    successResponse(res, matchResult, `Match status: ${matchResult.status}`);
  } catch (err) { errorResponse(res, err.message); }
});

// ========================================
// P4-28: E-INVOICE / IRN GENERATION
// ========================================
router.post('/ar-invoices/:id/generate-irn', authenticate, async (req, res) => {
  try {
    const inv = await query(
      `SELECT ar.*, bp.gstin as customer_gstin_val, bp.display_name as customer_name,
              c.gstin as company_gstin, c.company_name, c.pan as company_pan
       FROM fi_ar_invoices ar
       LEFT JOIN bp_business_partners bp ON ar.customer_id = bp.id
       LEFT JOIN org_companies c ON ar.company_id = c.id
       WHERE ar.id = $1`, [req.params.id]);
    if (!inv.rows.length) return errorResponse(res, 'Invoice not found', 404);

    const ar = inv.rows[0];
    if (!ar.company_gstin) return errorResponse(res, 'Company GSTIN not configured in Settings', 400);

    // Generate IRN (in production, this would call the GST portal API)
    // For now, generate a hash-based IRN
    const crypto = await import('crypto');
    const irnData = `${ar.company_gstin}|${ar.doc_number}|${ar.invoice_date}|${ar.total_amount}`;
    const irn = crypto.createHash('sha256').update(irnData).digest('hex');

    // Generate QR code data (simplified - real implementation uses signed JSON)
    const qrData = JSON.stringify({
      sellerGstin: ar.company_gstin,
      buyerGstin: ar.customer_gstin_val || '',
      docNo: ar.doc_number,
      docDate: ar.invoice_date,
      totalValue: ar.total_amount,
      irn: irn
    });

    await query(
      `UPDATE fi_ar_invoices SET irn_number=$1, irn_date=NOW(), qr_code=$2, einvoice_status='generated' WHERE id=$3`,
      [irn, qrData, req.params.id]);

    successResponse(res, { irn, qr_code: qrData, einvoice_status: 'generated' }, 'E-Invoice IRN generated');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// DELETE ENDPOINTS
// ============================================
router.delete("/journals/:id", authenticate, async (req, res) => {
  try {
    const j = await query("SELECT posting_status FROM fi_journal_headers WHERE id = $1", [req.params.id]);
    if (!j.rows.length) return errorResponse(res, "Not found", 404);
    if (j.rows[0].posting_status === "posted") return errorResponse(res, "Cannot delete posted journal entries. Reverse instead.", 400);
    await query("DELETE FROM fi_journal_lines WHERE header_id = $1", [req.params.id]);
    await query("DELETE FROM fi_journal_headers WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Journal entry deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/payments/:id", authenticate, async (req, res) => {
  try {
    const p = await query("SELECT status FROM fi_payments WHERE id = $1", [req.params.id]);
    if (!p.rows.length) return errorResponse(res, "Not found", 404);
    if (p.rows[0].status !== "draft") return errorResponse(res, "Only draft payments can be deleted. Posted payments must be reversed.", 400);
    await query("DELETE FROM fi_payments WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Payment deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/ap-invoices/:id", authenticate, async (req, res) => {
  try {
    const inv = await query("SELECT status, paid_amount FROM fi_ap_invoices WHERE id = $1", [req.params.id]);
    if (!inv.rows.length) return errorResponse(res, "Not found", 404);
    if (parseFloat(inv.rows[0].paid_amount || 0) > 0) return errorResponse(res, "Cannot delete — payments have been made against this invoice", 400);
    if (inv.rows[0].status !== "draft") return errorResponse(res, "Only draft invoices can be deleted", 400);
    await query("DELETE FROM fi_ap_invoice_items WHERE invoice_id = $1", [req.params.id]);
    await query("DELETE FROM fi_ap_invoices WHERE id = $1", [req.params.id]);
    successResponse(res, null, "AP Invoice deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/ar-invoices/:id", authenticate, async (req, res) => {
  try {
    const inv = await query("SELECT status, paid_amount FROM fi_ar_invoices WHERE id = $1", [req.params.id]);
    if (!inv.rows.length) return errorResponse(res, "Not found", 404);
    if (parseFloat(inv.rows[0].paid_amount || 0) > 0) return errorResponse(res, "Cannot delete — payments have been received against this invoice", 400);
    if (inv.rows[0].status !== "draft") return errorResponse(res, "Only draft invoices can be deleted", 400);
    await query("DELETE FROM fi_ar_invoice_items WHERE invoice_id = $1", [req.params.id]);
    await query("DELETE FROM fi_ar_invoices WHERE id = $1", [req.params.id]);
    successResponse(res, null, "AR Invoice deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// ============================================
// PETTY CASH MANAGEMENT
// ============================================
router.get('/petty-cash/funds', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT f.*, u.first_name || ' ' || u.last_name as custodian_name,
      p.plant_code, p.plant_name, g.account_code, g.account_name,
      (SELECT COUNT(*) FROM fi_petty_cash_txns t WHERE t.fund_id = f.id) as txn_count
      FROM fi_petty_cash_funds f
      LEFT JOIN sys_users u ON f.custodian_id = u.id
      LEFT JOIN org_plants p ON f.plant_id = p.id
      LEFT JOIN fi_gl_accounts g ON f.gl_account_id = g.id
      ORDER BY f.created_at DESC`);
    successResponse(res, r.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/petty-cash/funds', authenticate, async (req, res) => {
  try {
    const { fund_name, custodian_id, plant_id, gl_account_id, float_amount, bank_gl_id } = req.body;
    if (!fund_name) return errorResponse(res, 'Fund name required', 400);
    if (!gl_account_id) return errorResponse(res, 'Petty Cash GL account is required', 400);
    const amt = parseFloat(float_amount) || 0;

    const result = await transaction(async (client) => {
      const r = await client.query(
        `INSERT INTO fi_petty_cash_funds (fund_name, custodian_id, plant_id, gl_account_id, float_amount, current_balance)
         VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
        [fund_name, custodian_id || null, plant_id || null, gl_account_id, amt]);

      // If float amount > 0 and bank GL provided, create initial funding JE
      if (amt > 0 && bank_gl_id) {
        const jeNum = await getNextNumber('JE');
        const compRes = await client.query(`SELECT company_id FROM org_plants WHERE id = $1`, [plant_id]);
        const companyId = compRes.rows[0]?.company_id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;
        const je = await client.query(
          `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description, currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
           VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,$4,'INR',$5,$5,'posted',$6,$6,NOW()) RETURNING *`,
          [jeNum, companyId, `PC-FUND:${r.rows[0].id}`, `Petty Cash Fund Created — ${fund_name}`, amt, req.user.id]);
        // Dr Petty Cash GL, Cr Bank GL
        await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,1,$2,$3,0,$4)`,
          [je.rows[0].id, gl_account_id, amt, `Petty Cash — ${fund_name} (initial float)`]);
        await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,2,$2,0,$3,$4)`,
          [je.rows[0].id, bank_gl_id, amt, `Bank — fund petty cash ${fund_name}`]);
      }
      return r.rows[0];
    });

    successResponse(res, result, 'Petty cash fund created' + (amt > 0 && bank_gl_id ? ' — GL posted' : ''), 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/petty-cash/funds/:id', authenticate, async (req, res) => {
  try {
    const { fund_name, custodian_id, plant_id, gl_account_id, float_amount, status } = req.body;
    const r = await query(
      `UPDATE fi_petty_cash_funds SET fund_name=COALESCE($1,fund_name), custodian_id=$2, plant_id=$3,
       gl_account_id=$4, float_amount=COALESCE($5,float_amount), status=COALESCE($6,status) WHERE id=$7 RETURNING *`,
      [fund_name, custodian_id||null, plant_id||null, gl_account_id||null, float_amount, status, req.params.id]);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/petty-cash/funds/:id', authenticate, async (req, res) => {
  try {
    const deps = await query(`SELECT COUNT(*) FROM fi_petty_cash_txns WHERE fund_id = $1`, [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, 'Cannot delete — transactions exist', 400);
    await query(`DELETE FROM fi_petty_cash_funds WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Fund deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// Petty cash transactions
router.get('/petty-cash/txns', authenticate, async (req, res) => {
  try {
    const { fund_id, type } = req.query;
    let sql = `SELECT t.*, f.fund_name, g.account_code, g.account_name as expense_account,
      u.first_name || ' ' || u.last_name as created_by_name,
      cc.cc_code, cc.cc_name
      FROM fi_petty_cash_txns t
      LEFT JOIN fi_petty_cash_funds f ON t.fund_id = f.id
      LEFT JOIN fi_gl_accounts g ON t.expense_gl_id = g.id
      LEFT JOIN sys_users u ON t.created_by = u.id
      LEFT JOIN org_cost_centers cc ON t.cost_center_id::uuid = cc.id
      WHERE 1=1`;
    const params = []; let idx = 1;
    if (fund_id) { sql += ` AND t.fund_id = $${idx++}`; params.push(fund_id); }
    if (type) { sql += ` AND t.txn_type = $${idx++}`; params.push(type); }
    sql += ` ORDER BY t.txn_date DESC, t.created_at DESC LIMIT 200`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/petty-cash/txns', authenticate, async (req, res) => {
  try {
    const { fund_id, txn_type, amount, description, category, expense_gl_id, bank_gl_id, cost_center_id, project_id, receipt_number, paid_to } = req.body;
    
    // Mandatory field validation
    if (!fund_id) return errorResponse(res, 'Fund is required', 400);
    if (!txn_type) return errorResponse(res, 'Transaction type is required', 400);
    if (!['expense', 'replenish'].includes(txn_type)) return errorResponse(res, 'Type must be expense or replenish', 400);
    if (!amount || parseFloat(amount) <= 0) return errorResponse(res, 'Amount must be greater than 0', 400);
    if (!description) return errorResponse(res, 'Description is required', 400);

    if (txn_type === 'expense') {
      if (!expense_gl_id) return errorResponse(res, 'Expense GL (Debit account) is required', 400);
      if (!category) return errorResponse(res, 'Category is required for expenses', 400);
      if (!paid_to) return errorResponse(res, 'Paid To is required for expenses', 400);
      if (!cost_center_id && !project_id) return errorResponse(res, 'Cost Center or Project is required', 400);
    }
    if (txn_type === 'replenish') {
      if (!bank_gl_id) return errorResponse(res, 'Bank GL (Credit account) is required for replenishment', 400);
    }

    const fund = await query(`SELECT * FROM fi_petty_cash_funds WHERE id = $1`, [fund_id]);
    if (!fund.rows.length) return errorResponse(res, 'Fund not found', 404);
    const f = fund.rows[0];
    const amt = parseFloat(amount);

    if (!f.gl_account_id) return errorResponse(res, 'Fund has no Petty Cash GL configured. Edit the fund first.', 400);
    if (txn_type === 'expense' && amt > parseFloat(f.current_balance || 0)) return errorResponse(res, `Insufficient balance. Available: ₹${f.current_balance}`, 400);
    if (txn_type === 'expense' && expense_gl_id === f.gl_account_id) return errorResponse(res, 'Expense GL cannot be the same as the Petty Cash GL', 400);
    if (txn_type === 'replenish' && bank_gl_id === f.gl_account_id) return errorResponse(res, 'Bank GL cannot be the same as the Petty Cash GL', 400);

    const result = await transaction(async (client) => {
      const docNum = await getNextNumber('PC');
      const t = await client.query(
        `INSERT INTO fi_petty_cash_txns (fund_id, doc_number, txn_type, amount, description, category, expense_gl_id, cost_center_id, project_id, receipt_number, paid_to, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [fund_id, docNum, txn_type, amt, description, category, expense_gl_id||bank_gl_id||null, cost_center_id||null, project_id||null, receipt_number, paid_to, req.user.id]);

      // Update fund balance
      const delta = txn_type === 'replenish' ? amt : -amt;
      await client.query(`UPDATE fi_petty_cash_funds SET current_balance = current_balance + $1 WHERE id = $2`, [delta, fund_id]);

      // ========== GL JOURNAL ENTRY ==========
      // Petty Cash GL = f.gl_account_id (Asset account — Debit increases, Credit decreases)
      // 
      // REPLENISH: Money comes FROM bank INTO petty cash
      //   Line 1: Dr Petty Cash GL (increases petty cash balance)     debit_amount = amt
      //   Line 2: Cr Bank GL       (decreases bank balance)           credit_amount = amt
      //
      // EXPENSE: Money goes OUT of petty cash TO expense
      //   Line 1: Dr Expense GL    (increases expense)                debit_amount = amt
      //   Line 2: Cr Petty Cash GL (decreases petty cash balance)     credit_amount = amt
      // ==========

      const cashGl = f.gl_account_id;
      const jeNum = await getNextNumber('JE');
      const compRes = await client.query(`SELECT company_id FROM org_plants WHERE id = $1`, [f.plant_id]);
      const companyId = compRes.rows[0]?.company_id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

      const je = await client.query(
        `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description, currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
         VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,$4,'INR',$5,$5,'posted',$6,$6,NOW()) RETURNING *`,
        [jeNum, companyId, `PC:${docNum}`, `${txn_type === 'expense' ? 'PC Expense' : 'PC Replenish'} — ${docNum}: ${description||''}`, amt, req.user.id]);

      if (txn_type === 'replenish') {
        // Line 1: DEBIT Petty Cash GL (cash increases)
        await client.query(
          `INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description)
           VALUES ($1, 1, $2, $3, 0, $4)`,
          [je.rows[0].id, cashGl, amt, `Petty Cash Replenish — ${f.fund_name}`]);
        // Line 2: CREDIT Bank GL (bank decreases)
        await client.query(
          `INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description)
           VALUES ($1, 2, $2, 0, $3, $4)`,
          [je.rows[0].id, bank_gl_id, amt, `Bank — replenish ${f.fund_name}`]);
      } else if (txn_type === 'expense') {
        // Line 1: DEBIT Expense GL (expense increases)
        await client.query(
          `INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description, cost_center_id)
           VALUES ($1, 1, $2, $3, 0, $4, $5)`,
          [je.rows[0].id, expense_gl_id, amt, `${category||'Expense'} — ${description||docNum}`, cost_center_id||null]);
        // Line 2: CREDIT Petty Cash GL (cash decreases)
        await client.query(
          `INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description)
           VALUES ($1, 2, $2, 0, $3, $4)`,
          [je.rows[0].id, cashGl, amt, `Petty Cash Expense — ${f.fund_name}`]);
      }

      await client.query(`UPDATE fi_petty_cash_txns SET journal_id = $1 WHERE id = $2`, [je.rows[0].id, t.rows[0].id]);
      return t.rows[0];
    });

    successResponse(res, result, `${txn_type} recorded — GL posted`, 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/petty-cash/txns/:id', authenticate, async (req, res) => {
  try {
    const t = await query(`SELECT * FROM fi_petty_cash_txns WHERE id = $1`, [req.params.id]);
    if (!t.rows.length) return errorResponse(res, 'Not found', 404);
    const delta = t.rows[0].txn_type === 'replenish' ? -parseFloat(t.rows[0].amount) : parseFloat(t.rows[0].amount);
    await query(`UPDATE fi_petty_cash_funds SET current_balance = current_balance + $1 WHERE id = $2`, [delta, t.rows[0].fund_id]);
    await query(`DELETE FROM fi_petty_cash_txns WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Transaction deleted, balance reversed');
  } catch (err) { errorResponse(res, err.message); }
});

// Petty Cash Report — period-wise summary
router.get('/petty-cash/report', authenticate, async (req, res) => {
  try {
    const { fund_id, period = 'daily', from, to } = req.query;
    let dateFrom = from || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];
    let dateTo = to || new Date().toISOString().split('T')[0];

    // Period grouping SQL
    const periodSql = {
      daily: "TO_CHAR(t.txn_date, 'YYYY-MM-DD')",
      weekly: "TO_CHAR(DATE_TRUNC('week', t.txn_date), 'YYYY-MM-DD')",
      monthly: "TO_CHAR(DATE_TRUNC('month', t.txn_date), 'YYYY-MM')",
      yearly: "TO_CHAR(DATE_TRUNC('year', t.txn_date), 'YYYY')",
    };
    const grp = periodSql[period] || periodSql.daily;

    // Summary by period
    let sql = `SELECT ${grp} as period,
      COUNT(*) as txn_count,
      SUM(CASE WHEN t.txn_type='expense' THEN t.amount ELSE 0 END) as total_expense,
      SUM(CASE WHEN t.txn_type='replenish' THEN t.amount ELSE 0 END) as total_replenish,
      COUNT(CASE WHEN t.txn_type='expense' THEN 1 END) as expense_count,
      COUNT(CASE WHEN t.txn_type='replenish' THEN 1 END) as replenish_count
      FROM fi_petty_cash_txns t WHERE t.txn_date >= $1 AND t.txn_date <= $2`;
    const params = [dateFrom, dateTo];
    let idx = 3;
    if (fund_id) { sql += ` AND t.fund_id = $${idx++}`; params.push(fund_id); }
    sql += ` GROUP BY ${grp} ORDER BY period DESC`;

    const summary = await query(sql, params);

    // Category breakdown
    let catSql = `SELECT t.category, COUNT(*) as count, SUM(t.amount) as total
      FROM fi_petty_cash_txns t WHERE t.txn_type = 'expense' AND t.txn_date >= $1 AND t.txn_date <= $2`;
    const catParams = [dateFrom, dateTo];
    let catIdx = 3;
    if (fund_id) { catSql += ` AND t.fund_id = $${catIdx++}`; catParams.push(fund_id); }
    catSql += ` GROUP BY t.category ORDER BY total DESC`;

    const categories = await query(catSql, catParams);

    // Totals
    let totSql = `SELECT
      SUM(CASE WHEN txn_type='expense' THEN amount ELSE 0 END) as total_expense,
      SUM(CASE WHEN txn_type='replenish' THEN amount ELSE 0 END) as total_replenish,
      COUNT(*) as total_txns
      FROM fi_petty_cash_txns WHERE txn_date >= $1 AND txn_date <= $2`;
    const totParams = [dateFrom, dateTo];
    if (fund_id) { totSql += ` AND fund_id = $3`; totParams.push(fund_id); }

    const totals = await query(totSql, totParams);

    successResponse(res, {
      period_data: summary.rows,
      category_data: categories.rows,
      totals: totals.rows[0] || { total_expense: 0, total_replenish: 0, total_txns: 0 },
      filters: { fund_id, period, from: dateFrom, to: dateTo }
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// GL ACCOUNT MAPPING — dynamic mapping for auto-JE creation
// ============================================
const GL_MAPPING_KEYS = [
  { key: 'accounts_receivable', label: 'Accounts Receivable (Debtors)', category: 'sales', description: 'Dr on sales invoice, Cr on customer payment' },
  { key: 'sales_revenue', label: 'Sales Revenue — Goods', category: 'sales', description: 'Cr on sales invoice for goods' },
  { key: 'service_revenue', label: 'Sales Revenue — Services', category: 'sales', description: 'Cr on sales invoice for services' },
  { key: 'accounts_payable', label: 'Accounts Payable (Creditors)', category: 'procurement', description: 'Cr on purchase invoice, Dr on vendor payment' },
  { key: 'inventory_stock', label: 'Inventory / Stock In Hand', category: 'procurement', description: 'Dr on goods receipt, Cr on COGS' },
  { key: 'cogs', label: 'Cost of Goods Sold', category: 'procurement', description: 'Dr when goods are sold' },
  { key: 'grn_clearing', label: 'GR/IR Clearing (Stock Received Not Billed)', category: 'procurement', description: 'Cr on goods receipt, Dr on invoice verification' },
  { key: 'bank_incoming', label: 'Bank Account — Incoming', category: 'payments', description: 'Dr on customer payment receipt' },
  { key: 'bank_outgoing', label: 'Bank Account — Outgoing', category: 'payments', description: 'Cr on vendor payment' },
  { key: 'cash_account', label: 'Cash / Petty Cash', category: 'payments', description: 'Cash transactions' },
  // INPUT TAX (Purchase side)
  { key: 'input_cgst', label: 'Input CGST', category: 'tax_input', description: 'Dr on intra-state purchase — CGST input credit' },
  { key: 'input_sgst', label: 'Input SGST', category: 'tax_input', description: 'Dr on intra-state purchase — SGST input credit' },
  { key: 'input_igst', label: 'Input IGST', category: 'tax_input', description: 'Dr on inter-state purchase — IGST input credit' },
  // OUTPUT TAX (Sales side)
  { key: 'output_cgst', label: 'Output CGST Payable', category: 'tax_output', description: 'Cr on intra-state sales — CGST payable' },
  { key: 'output_sgst', label: 'Output SGST Payable', category: 'tax_output', description: 'Cr on intra-state sales — SGST payable' },
  { key: 'output_igst', label: 'Output IGST Payable', category: 'tax_output', description: 'Cr on inter-state sales — IGST payable' },
  // Legacy keys (backward compat)
  { key: 'input_gst', label: 'Input GST (Legacy — use separate CGST/SGST/IGST)', category: 'tax_input', description: 'Fallback if separate input tax keys not set' },
  { key: 'gst_payable', label: 'GST Payable (Legacy — use separate CGST/SGST/IGST)', category: 'tax_output', description: 'Fallback if separate output tax keys not set' },
  { key: 'tds_receivable', label: 'TDS Receivable', category: 'tax_other', description: 'Dr when TDS is deducted on income' },
  { key: 'tds_payable', label: 'TDS Payable', category: 'tax_other', description: 'Cr when TDS is deducted on payments' },
  { key: 'salary_expense', label: 'Salary Expense', category: 'payroll', description: 'Dr on payroll processing' },
  { key: 'payroll_payable', label: 'Payroll Payable', category: 'payroll', description: 'Cr on payroll — salaries pending payment' },
  { key: 'depreciation_expense', label: 'Depreciation Expense', category: 'assets', description: 'Dr on depreciation run' },
  { key: 'accumulated_depreciation', label: 'Accumulated Depreciation', category: 'assets', description: 'Cr on depreciation run' },
  { key: 'advance_to_supplier', label: 'Advance to Suppliers', category: 'procurement', description: 'Dr on advance payment to vendor' },
  { key: 'advance_from_customer', label: 'Advance from Customers', category: 'sales', description: 'Cr on advance received from customer' },
  { key: 'retained_earnings', label: 'Retained Earnings', category: 'equity', description: 'Period closing — net P&L transfer' },
];

// Auto-detect GL account for a mapping key based on account_name/code/group patterns
function autoDetectGL(accounts, key) {
  const patterns = {
    accounts_receivable: { names: ['debtor', 'receivable', 'trade receivable'], codes: ['1101', '1100', '1300'] },
    sales_revenue: { names: ['sales', 'product revenue', 'goods revenue'], codes: ['4101', '4100', '4001', '4010'] },
    service_revenue: { names: ['service revenue', 'service income', 'consulting'], codes: ['4102', '4200', '4020'] },
    accounts_payable: { names: ['creditor', 'payable', 'trade payable'], codes: ['2101', '2100', '2000'] },
    inventory_stock: { names: ['stock in hand', 'inventory', 'stock'], codes: ['1107', '1200', '1210'] },
    cogs: { names: ['cost of goods', 'cogs', 'cost of sales'], codes: ['5101', '5100', '5000'] },
    grn_clearing: { names: ['stock received', 'gr/ir', 'grn clearing', 'goods received not billed'], codes: ['2301', '2300'] },
    bank_incoming: { names: ['bank', 'incoming', 'dbs', 'sbi incoming', 'bank account'], codes: ['1201', '1202', '1200', '1010'] },
    bank_outgoing: { names: ['bank', 'outgoing', 'dbs', 'sbi', 'bank account'], codes: ['1201', '1200', '1010'] },
    cash_account: { names: ['petty cash', 'cash in hand', 'cash'], codes: ['1301', '1300', '1000'] },
    input_gst: { names: ['input gst', 'gst input', 'input tax credit', 'gst credit'], codes: ['1106', '1500', '1510'] },
    output_sgst: { names: ['sgst', 'state gst'], codes: ['2206', '2220'] },
    output_cgst: { names: ['cgst', 'central gst'], codes: ['2207', '2210'] },
    gst_payable: { names: ['gst payable', 'igst', 'gst output'], codes: ['2202', '2200', '2230'] },
    tds_receivable: { names: ['tds receivable', 'tds asset'], codes: ['1103', '1400'] },
    tds_payable: { names: ['tds payable', 'tds liability'], codes: ['2201', '2300'] },
    salary_expense: { names: ['salaries', 'salary expense', 'salary'], codes: ['6101', '6100', '6000'] },
    payroll_payable: { names: ['payroll payable', 'salary payable'], codes: ['2102', '2500'] },
    depreciation_expense: { names: ['depreciation'], codes: ['6601', '6300'] },
    accumulated_depreciation: { names: ['accumulated depreciation'], codes: ['1507', '1700'] },
    advance_to_supplier: { names: ['advance to supplier', 'supplier advance'], codes: ['1102', '1300'] },
    advance_from_customer: { names: ['advance from customer', 'customer advance'], codes: ['2401', '2100'] },
    retained_earnings: { names: ['retained earnings', 'reserves'], codes: ['3102', '3100', '3200'] },
    // Input tax (purchase)
    input_cgst: { names: ['input cgst', 'cgst input', 'cgst receivable'], codes: ['1501', '1510'] },
    input_sgst: { names: ['input sgst', 'sgst input', 'sgst receivable'], codes: ['1502', '1511'] },
    input_igst: { names: ['input igst', 'igst input', 'igst receivable'], codes: ['1503', '1512'] },
    // Output tax (sales)
    output_cgst: { names: ['output cgst', 'cgst payable', 'cgst output', 'cgst'], codes: ['2206', '2210'] },
    output_sgst: { names: ['output sgst', 'sgst payable', 'sgst output', 'sgst'], codes: ['2207', '2220'] },
    output_igst: { names: ['output igst', 'igst payable', 'igst output', 'igst'], codes: ['2208', '2230'] },
    // Legacy fallbacks
    input_gst: { names: ['input gst', 'gst input', 'input tax credit', 'gst credit'], codes: ['1106', '1500', '1510'] },
    gst_payable: { names: ['gst payable', 'gst output'], codes: ['2202', '2200'] },
  };
  const p = patterns[key];
  if (!p) return null;
  // Try name match first (most reliable)
  for (const name of p.names) {
    const match = accounts.find(a => a.account_name.toLowerCase().includes(name.toLowerCase()));
    if (match) return match;
  }
  // Try code prefix match
  for (const code of p.codes) {
    const match = accounts.find(a => a.account_code.startsWith(code));
    if (match) return match;
  }
  return null;
}

router.get('/gl-mapping', authenticate, async (req, res) => {
  try {
    const mappings = await query(`SELECT m.*, g.account_code, g.account_name, g.account_type FROM fi_gl_mapping m LEFT JOIN fi_gl_accounts g ON m.gl_account_id = g.id ORDER BY m.category, m.mapping_key`);
    const allAccounts = await query(`SELECT id, account_code, account_name, account_type, account_group FROM fi_gl_accounts WHERE is_active = true ORDER BY account_code`);
    
    // Build full list with existing mappings + unmapped keys
    const result = GL_MAPPING_KEYS.map(def => {
      const existing = mappings.rows.find(m => m.mapping_key === def.key);
      if (existing) return { ...def, ...existing, mapped: true };
      // Auto-detect suggestion
      const suggested = autoDetectGL(allAccounts.rows, def.key);
      return { ...def, gl_account_id: null, account_code: suggested?.account_code || null, account_name: suggested?.account_name || null, suggested_id: suggested?.id || null, mapped: false };
    });
    successResponse(res, { mappings: result, accounts: allAccounts.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/gl-mapping', authenticate, async (req, res) => {
  try {
    const { mappings } = req.body; // Array of { mapping_key, gl_account_id }
    if (!mappings?.length) return errorResponse(res, 'No mappings provided', 400);
    let saved = 0;
    for (const m of mappings) {
      const def = GL_MAPPING_KEYS.find(d => d.key === m.mapping_key);
      if (!def) continue;
      await query(
        `INSERT INTO fi_gl_mapping (mapping_key, mapping_label, category, gl_account_id, description)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (mapping_key) DO UPDATE SET gl_account_id = $4, updated_at = NOW()`,
        [m.mapping_key, def.label, def.category, m.gl_account_id || null, def.description]);
      saved++;
    }
    successResponse(res, { saved }, `${saved} mappings saved`);
  } catch (err) { errorResponse(res, err.message); }
});

// Auto-detect all and save
router.post('/gl-mapping/auto-detect', authenticate, async (req, res) => {
  try {
    const allAccounts = (await query(`SELECT id, account_code, account_name, account_type, account_group FROM fi_gl_accounts WHERE is_active = true`)).rows;
    let detected = 0;
    for (const def of GL_MAPPING_KEYS) {
      const match = autoDetectGL(allAccounts, def.key);
      if (match) {
        await query(
          `INSERT INTO fi_gl_mapping (mapping_key, mapping_label, category, gl_account_id, description)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (mapping_key) DO UPDATE SET gl_account_id = $4, updated_at = NOW()`,
          [def.key, def.label, def.category, match.id, def.description]);
        detected++;
      }
    }
    successResponse(res, { detected, total: GL_MAPPING_KEYS.length }, `${detected}/${GL_MAPPING_KEYS.length} accounts auto-detected`);
  } catch (err) { errorResponse(res, err.message); }
});

// Helper: resolve GL account from mapping (used by other modules)
router.get('/gl-mapping/resolve/:key', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT m.gl_account_id, g.account_code, g.account_name FROM fi_gl_mapping m JOIN fi_gl_accounts g ON m.gl_account_id = g.id WHERE m.mapping_key = $1`, [req.params.key]);
    if (!r.rows.length) return errorResponse(res, `GL mapping not configured for: ${req.params.key}`, 400);
    successResponse(res, r.rows[0]);
  } catch (err) { errorResponse(res, err.message); }
});


router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const checks = {
      'journals': { table: 'fi_journal_headers', pre: ["DELETE FROM fi_journal_lines WHERE header_id = ANY($1::uuid[])"], status_check_col: 'status', status_check: 'draft' },
      'payments': { table: 'fi_payments', status_check: 'draft' },
      'ap-invoices': { table: 'fi_ap_invoices', pre: ["DELETE FROM fi_ap_invoice_items WHERE invoice_id = ANY($1::uuid[])"], status_check: 'draft' },
      'ar-invoices': { table: 'fi_ar_invoices', pre: ["DELETE FROM fi_ar_invoice_items WHERE invoice_id = ANY($1::uuid[])"], status_check: 'draft' },
    };
    const cfg = checks[entity];
    if (!cfg) return errorResponse(res, 'Unknown entity', 400);
    const statusCol = cfg.status_check_col || 'status';
    if (cfg.status_check) { const sc = await query(`SELECT COUNT(*) FROM ${cfg.table} WHERE id = ANY($1::uuid[]) AND ${statusCol} != $2`, [ids, cfg.status_check]); if (parseInt(sc.rows[0].count) > 0) return errorResponse(res, `Cannot delete — some items not in ${cfg.status_check} status`, 400); }
    if (cfg.pre) { for (const sql of cfg.pre) await query(sql, [ids]); }
    const r = await query(`DELETE FROM ${cfg.table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

export default router;
