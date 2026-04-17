import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

const router = Router();

// ============================================
// DOCUMENT COMMENTS / NOTES
// ============================================
router.get('/comments/:entityType/:entityId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, u.first_name || ' ' || u.last_name as author_name, u.username
       FROM sys_comments c LEFT JOIN sys_users u ON c.created_by = u.id
       WHERE c.entity_type = $1 AND c.entity_id = $2 ORDER BY c.created_at DESC`,
      [req.params.entityType, req.params.entityId]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/comments', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, comment_text, is_internal } = req.body;
    if (!entity_type || !entity_id || !comment_text) return errorResponse(res, 'Entity and comment required', 400);
    const result = await query(
      `INSERT INTO sys_comments (entity_type, entity_id, comment_text, is_internal, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [entity_type, entity_id, comment_text, is_internal !== false, req.user.id]);
    successResponse(res, result.rows[0], 'Comment added', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// DOCUMENT STATUS TIMELINE
// ============================================
router.get('/timeline/:entityType/:entityId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT sh.*, u.first_name || ' ' || u.last_name as changed_by_name
       FROM sys_status_history sh LEFT JOIN sys_users u ON sh.changed_by = u.id
       WHERE sh.entity_type = $1 AND sh.entity_id = $2 ORDER BY sh.created_at ASC`,
      [req.params.entityType, req.params.entityId]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/timeline', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, old_status, new_status, notes } = req.body;
    await query(
      `INSERT INTO sys_status_history (entity_type, entity_id, old_status, new_status, changed_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entity_type, entity_id, old_status, new_status, req.user.id, notes]);
    successResponse(res, null, 'Recorded');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// FAVORITES / BOOKMARKS
// ============================================
router.get('/favorites', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM sys_favorites WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/favorites', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, path, label } = req.body;
    const result = await query(
      `INSERT INTO sys_favorites (user_id, entity_type, entity_id, path, label)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`,
      [req.user.id, entity_type, entity_id, path, label]);
    successResponse(res, result.rows[0], 'Bookmarked');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/favorites/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM sys_favorites WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
    successResponse(res, null, 'Removed');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// AGING REPORTS
// ============================================
router.get('/aging/ap', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT bp.bp_number, bp.display_name as vendor_name,
        COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN total_amount - paid_amount END),0) as current,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN total_amount - paid_amount END),0) as days_1_30,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN total_amount - paid_amount END),0) as days_31_60,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90 THEN total_amount - paid_amount END),0) as days_61_90,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 90 THEN total_amount - paid_amount END),0) as days_over_90,
        COALESCE(SUM(total_amount - paid_amount),0) as total
       FROM fi_ap_invoices ap
       JOIN bp_business_partners bp ON ap.vendor_id = bp.id
       WHERE ap.status != 'cancelled' AND ap.total_amount > ap.paid_amount
       GROUP BY bp.id, bp.bp_number, bp.display_name
       ORDER BY total DESC`);
    const totals = result.rows.reduce((acc, r) => ({
      current: acc.current + parseFloat(r.current), days_1_30: acc.days_1_30 + parseFloat(r.days_1_30),
      days_31_60: acc.days_31_60 + parseFloat(r.days_31_60), days_61_90: acc.days_61_90 + parseFloat(r.days_61_90),
      days_over_90: acc.days_over_90 + parseFloat(r.days_over_90), total: acc.total + parseFloat(r.total),
    }), { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total: 0 });
    successResponse(res, { rows: result.rows, totals });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/aging/ar', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT bp.bp_number, bp.display_name as customer_name,
        COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN total_amount - paid_amount END),0) as current,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN total_amount - paid_amount END),0) as days_1_30,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN total_amount - paid_amount END),0) as days_31_60,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90 THEN total_amount - paid_amount END),0) as days_61_90,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE - 90 THEN total_amount - paid_amount END),0) as days_over_90,
        COALESCE(SUM(total_amount - paid_amount),0) as total
       FROM fi_ar_invoices ar
       JOIN bp_business_partners bp ON ar.customer_id = bp.id
       WHERE ar.status != 'cancelled' AND ar.total_amount > ar.paid_amount
       GROUP BY bp.id, bp.bp_number, bp.display_name
       ORDER BY total DESC`);
    const totals = result.rows.reduce((acc, r) => ({
      current: acc.current + parseFloat(r.current), days_1_30: acc.days_1_30 + parseFloat(r.days_1_30),
      days_31_60: acc.days_31_60 + parseFloat(r.days_31_60), days_61_90: acc.days_61_90 + parseFloat(r.days_61_90),
      days_over_90: acc.days_over_90 + parseFloat(r.days_over_90), total: acc.total + parseFloat(r.total),
    }), { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total: 0 });
    successResponse(res, { rows: result.rows, totals });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// BATCH OPERATIONS
// ============================================
router.post('/batch/approve-leaves', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No IDs provided', 400);
    const result = await query(
      `UPDATE hr_leave_requests SET status='approved', approved_by=$1, approved_at=NOW()
       WHERE id = ANY($2::uuid[]) AND status='pending'`, [req.user.id, ids]);
    successResponse(res, { affected: result.rowCount }, `${result.rowCount} leave(s) approved`);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/batch/post-journals', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No IDs provided', 400);
    const result = await query(
      `UPDATE fi_journal_headers SET status='posted', posted_by=$1, posted_at=NOW()
       WHERE id = ANY($2::uuid[]) AND status='draft'`, [req.user.id, ids]);
    successResponse(res, { affected: result.rowCount }, `${result.rowCount} journal(s) posted`);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/batch/confirm-orders', authenticate, async (req, res) => {
  try {
    const { ids, entity_type } = req.body;
    if (!ids?.length || !entity_type) return errorResponse(res, 'IDs and entity type required', 400);
    const tables = { purchase_order: 'pur_purchase_orders', sales_order: 'sd_sales_orders' };
    const table = tables[entity_type];
    if (!table) return errorResponse(res, 'Invalid entity type', 400);
    const result = await query(
      `UPDATE ${table} SET status='confirmed', approved_by=$1, approved_at=NOW()
       WHERE id = ANY($2::uuid[]) AND status='draft'`, [req.user.id, ids]);
    successResponse(res, { affected: result.rowCount }, `${result.rowCount} order(s) confirmed`);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// COPY DOCUMENT
// ============================================
router.post('/copy/quotation/:id', authenticate, async (req, res) => {
  try {
    const orig = await query(`SELECT * FROM sd_quotations WHERE id = $1`, [req.params.id]);
    if (!orig.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(`SELECT * FROM sd_quotation_items WHERE quotation_id = $1`, [req.params.id]);
    // Return data for frontend to pre-fill the create form
    successResponse(res, { header: orig.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/copy/sales-order/:id', authenticate, async (req, res) => {
  try {
    const orig = await query(`SELECT * FROM sd_sales_orders WHERE id = $1`, [req.params.id]);
    if (!orig.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(`SELECT * FROM sd_so_items WHERE so_id = $1`, [req.params.id]);
    successResponse(res, { header: orig.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/copy/purchase-order/:id', authenticate, async (req, res) => {
  try {
    const orig = await query(`SELECT * FROM pur_purchase_orders WHERE id = $1`, [req.params.id]);
    if (!orig.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(`SELECT * FROM pur_po_items WHERE po_id = $1`, [req.params.id]);
    successResponse(res, { header: orig.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// USER THEME PREFERENCE
// ============================================
router.put('/user-theme', authenticate, async (req, res) => {
  try {
    const { theme } = req.body;
    await query(`UPDATE sys_users SET theme = $1 WHERE id = $2`, [theme, req.user.id]);
    successResponse(res, { theme }, 'Theme updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/user-theme', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT theme FROM sys_users WHERE id = $1`, [req.user.id]);
    successResponse(res, { theme: result.rows[0]?.theme || 'light' });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// GENERIC EXPORT (CSV data for any entity)
// ============================================
router.get('/export/:entity', authenticate, async (req, res) => {
  try {
    const entities = {
      business_partners: `SELECT bp_number, bp_type, display_name, company_name, email, phone, city, country, credit_limit, is_active, created_at FROM bp_business_partners ORDER BY bp_number`,
      materials: `SELECT material_code, material_name, standard_price, sales_price, is_active, created_at FROM mm_materials ORDER BY material_code`,
      sales_orders: `SELECT doc_number, order_date, delivery_date, currency, subtotal, tax_amount, total_amount, status, created_at FROM sd_sales_orders ORDER BY order_date DESC`,
      purchase_orders: `SELECT doc_number, order_date, delivery_date, currency, subtotal, tax_amount, total_amount, status, created_at FROM pur_purchase_orders ORDER BY order_date DESC`,
      journal_entries: `SELECT doc_number, posting_date, document_date, description, currency, total_debit, total_credit, status FROM fi_journal_headers ORDER BY posting_date DESC`,
      ap_invoices: `SELECT doc_number, invoice_date, due_date, subtotal, tax_amount, total_amount, paid_amount, status FROM fi_ap_invoices ORDER BY invoice_date DESC`,
      ar_invoices: `SELECT doc_number, invoice_date, due_date, subtotal, tax_amount, total_amount, paid_amount, status FROM fi_ar_invoices ORDER BY invoice_date DESC`,
      employees: `SELECT e.employee_number, bp.display_name, d.dept_name, p.position_name, e.hire_date, e.salary, e.status FROM hr_employees e LEFT JOIN bp_business_partners bp ON e.bp_id = bp.id LEFT JOIN hr_departments d ON e.department_id = d.id LEFT JOIN hr_positions p ON e.position_id = p.id ORDER BY e.employee_number`,
      assets: `SELECT asset_code, asset_name, acquisition_date, acquisition_cost, accumulated_depreciation, net_book_value, status FROM am_assets ORDER BY asset_code`,
      stock: `SELECT m.material_code, m.material_name, p.plant_code, sl.sloc_code, s.quantity, s.stock_type FROM inv_stock s JOIN mm_materials m ON s.material_id = m.id LEFT JOIN org_plants p ON s.plant_id = p.id LEFT JOIN org_storage_locations sl ON s.sloc_id = sl.id WHERE s.quantity > 0 ORDER BY m.material_code`,
      opportunities: `SELECT opportunity_name, stage, probability, expected_value, expected_close, status, created_at FROM crm_opportunities ORDER BY created_at DESC`,
    };
    const sql = entities[req.params.entity];
    if (!sql) return errorResponse(res, 'Unknown entity', 400);
    const result = await query(sql);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// CROSS-MODULE DOCUMENT TRACE
// Traces the full document chain for any entity
// ============================================
router.get('/document-trace/:entityType/:entityId', authenticate, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const chain = [];

    if (entityType === 'sales_order' || entityType === 'quotation') {
      // Quotation → SO → Delivery → Billing → AR Invoice → Payment
      let soId = entityId, quotId = null;
      if (entityType === 'quotation') {
        const q = await query(`SELECT * FROM sd_quotations WHERE id = $1`, [entityId]);
        if (q.rows[0]) { chain.push({ type: 'quotation', doc_number: q.rows[0].doc_number, status: q.rows[0].status, id: q.rows[0].id, date: q.rows[0].quotation_date }); }
        const so = await query(`SELECT * FROM sd_sales_orders WHERE quotation_id = $1`, [entityId]);
        if (so.rows[0]) soId = so.rows[0].id;
        else soId = null;
      }
      if (entityType === 'sales_order') {
        const so = await query(`SELECT * FROM sd_sales_orders WHERE id = $1`, [entityId]);
        if (so.rows[0]) {
          if (so.rows[0].quotation_id) {
            const q = await query(`SELECT * FROM sd_quotations WHERE id = $1`, [so.rows[0].quotation_id]);
            if (q.rows[0]) chain.push({ type: 'quotation', doc_number: q.rows[0].doc_number, status: q.rows[0].status, id: q.rows[0].id, date: q.rows[0].quotation_date });
          }
        }
      }
      if (soId) {
        const so = await query(`SELECT * FROM sd_sales_orders WHERE id = $1`, [soId]);
        if (so.rows[0]) chain.push({ type: 'sales_order', doc_number: so.rows[0].doc_number, status: so.rows[0].status, id: so.rows[0].id, date: so.rows[0].order_date, amount: so.rows[0].total_amount });
        const del = await query(`SELECT * FROM sd_deliveries WHERE so_id = $1`, [soId]);
        del.rows.forEach(d => chain.push({ type: 'delivery', doc_number: d.doc_number, status: d.status, id: d.id, date: d.delivery_date }));
        const bil = await query(`SELECT * FROM sd_billing_docs WHERE so_id = $1`, [soId]);
        bil.rows.forEach(b => chain.push({ type: 'billing', doc_number: b.doc_number, status: b.status, id: b.id, date: b.billing_date, amount: b.total_amount }));
        const ar = await query(`SELECT * FROM fi_ar_invoices WHERE reference_id = $1`, [soId]);
        ar.rows.forEach(a => chain.push({ type: 'ar_invoice', doc_number: a.doc_number, status: a.status, id: a.id, date: a.invoice_date, amount: a.total_amount }));
      }
    }

    if (entityType === 'purchase_order' || entityType === 'requisition') {
      // Requisition → PO → Goods Receipt → AP Invoice → Payment
      let poId = entityId, reqId = null;
      if (entityType === 'requisition') {
        const r = await query(`SELECT * FROM pur_requisitions WHERE id = $1`, [entityId]);
        if (r.rows[0]) chain.push({ type: 'requisition', doc_number: r.rows[0].doc_number, status: r.rows[0].status, id: r.rows[0].id, date: r.rows[0].required_date });
        const po = await query(`SELECT * FROM pur_purchase_orders WHERE requisition_id = $1`, [entityId]);
        if (po.rows[0]) poId = po.rows[0].id;
        else poId = null;
      }
      if (entityType === 'purchase_order') {
        const po = await query(`SELECT * FROM pur_purchase_orders WHERE id = $1`, [entityId]);
        if (po.rows[0]?.requisition_id) {
          const r = await query(`SELECT * FROM pur_requisitions WHERE id = $1`, [po.rows[0].requisition_id]);
          if (r.rows[0]) chain.push({ type: 'requisition', doc_number: r.rows[0].doc_number, status: r.rows[0].status, id: r.rows[0].id, date: r.rows[0].required_date });
        }
      }
      if (poId) {
        const po = await query(`SELECT * FROM pur_purchase_orders WHERE id = $1`, [poId]);
        if (po.rows[0]) chain.push({ type: 'purchase_order', doc_number: po.rows[0].doc_number, status: po.rows[0].status, id: po.rows[0].id, date: po.rows[0].order_date, amount: po.rows[0].total_amount });
        const gr = await query(`SELECT * FROM pur_goods_receipts WHERE po_id = $1`, [poId]);
        gr.rows.forEach(g => chain.push({ type: 'goods_receipt', doc_number: g.doc_number, status: g.status, id: g.id, date: g.receipt_date }));
        const ap = await query(`SELECT * FROM fi_ap_invoices WHERE po_reference = $1`, [poId]);
        ap.rows.forEach(a => chain.push({ type: 'ap_invoice', doc_number: a.doc_number, status: a.status, id: a.id, date: a.invoice_date, amount: a.total_amount }));
      }
    }

    // Find any payments linked to invoices in the chain
    const invoiceIds = chain.filter(c => c.type === 'ar_invoice' || c.type === 'ap_invoice').map(c => c.id);
    if (invoiceIds.length) {
      const payments = await query(`SELECT id, doc_number, amount, payment_date, status FROM fi_payments WHERE bp_id IN (SELECT vendor_id FROM fi_ap_invoices WHERE id = ANY($1::uuid[]) UNION SELECT customer_id FROM fi_ar_invoices WHERE id = ANY($1::uuid[])) AND status != 'cancelled' ORDER BY payment_date DESC LIMIT 20`, [invoiceIds]);
      payments.rows.forEach(p => chain.push({ type: 'payment', doc_number: p.doc_number, status: p.status, id: p.id, date: p.payment_date, amount: p.amount }));
    }

    successResponse(res, chain);
  } catch (err) { errorResponse(res, err.message); }
});

export default router;

