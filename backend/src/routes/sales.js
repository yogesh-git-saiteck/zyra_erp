import { Router } from 'express';
import Decimal from 'decimal.js';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate, friendlyError } from '../utils/helpers.js';
import { checkBusinessRules, fireNotificationRules, triggerApprovalRules } from '../utils/ruleEngine.js';
import { getConfigs, getConfigBool } from '../utils/configService.js';

const router = Router();
const toUuid = v => (v && v !== '' ? v : null);
const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const toDec = v => new Decimal(v || 0);
const decRound = (d, places = 2) => d.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();

// ============================================
// OVERVIEW
// ============================================
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [quotations, orders, deliveries, billing] = await Promise.all([
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as amount FROM sd_quotations`),
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as amount FROM sd_sales_orders`),
      query(`SELECT COUNT(*) as count FROM sd_deliveries`),
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount),0) as amount FROM sd_billing`),
    ]);
    successResponse(res, { quotations: quotations.rows[0], orders: orders.rows[0], deliveries: deliveries.rows[0], billing: billing.rows[0] });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// SALES QUOTATIONS
// ============================================
router.get('/quotations', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    const perms = req.user.permissions || {};
    
    // BUG #6 FIX: Add customer access control based on user territories
    let sql = `SELECT q.*, bp.display_name as customer_name, bp.bp_number, bp.territory_id,
               (SELECT COUNT(*) FROM sd_quotation_items qi WHERE qi.quotation_id = q.id) as item_count
               FROM sd_quotations q 
               LEFT JOIN bp_business_partners bp ON q.customer_id = bp.id 
               WHERE 1=1`;
    const params = []; let idx = 1;
    
    // If user has restricted territory access, filter customers by territory
    if (!perms.view_all_customers && perms.allowed_territories && perms.allowed_territories.length > 0) {
      sql += ` AND COALESCE(bp.territory_id::text, '') = ANY($${idx++}::text[])`;
      params.push(perms.allowed_territories.map(t => t || ''));
    }
    
    if (status) { sql += ` AND q.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (q.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY q.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/quotations/:id', authenticate, async (req, res) => {
  try {
    const q = await query(`SELECT q.*, bp.display_name as customer_name, bp.bp_number, bp.gstin as customer_gstin_val,
       bp.territory_id
       FROM sd_quotations q LEFT JOIN bp_business_partners bp ON q.customer_id = bp.id WHERE q.id = $1`, [req.params.id]);
    if (!q.rows.length) return errorResponse(res, 'Not found', 404);
    
    // BUG #6 FIX: Check user permission to view this customer's quotation
    const perms = req.user.permissions || {};
    if (!perms.view_all_customers && perms.allowed_territories && perms.allowed_territories.length > 0) {
      if (!perms.allowed_territories.includes(q.rows[0].territory_id)) {
        return errorResponse(res, 'Permission denied: You cannot view this quotation', 403);
      }
    }
    
    const items = await query(
      `SELECT qi.*, m.material_code, m.material_name, m.hsn_code as mat_hsn, u.uom_code,
              p.plant_code, p.plant_name, sl.sloc_code, sl.sloc_name
       FROM sd_quotation_items qi
       LEFT JOIN mm_materials m ON qi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON qi.uom_id = u.id
       LEFT JOIN org_plants p ON qi.plant_id = p.id
       LEFT JOIN org_storage_locations sl ON qi.storage_location_id = sl.id
       WHERE qi.quotation_id = $1 ORDER BY qi.line_number`, [req.params.id]);
    successResponse(res, { ...q.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/quotations', authenticate, async (req, res) => {
  try {
    const h = req.body;
    if (!h.customer_id || !h.items?.length) return errorResponse(res, 'Customer and at least one item required', 400);
    
    // BUG #6 FIX: Verify user has permission to create quotation for this customer
    const perms = req.user.permissions || {};
    if (!perms.view_all_customers && perms.allowed_territories && perms.allowed_territories.length > 0) {
      const customerCheck = await query(
        `SELECT territory_id FROM bp_business_partners WHERE id = $1 LIMIT 1`,
        [h.customer_id]
      );
      if (customerCheck.rows.length && !perms.allowed_territories.includes(customerCheck.rows[0].territory_id)) {
        return errorResponse(res, 'Permission denied: You cannot create quotations for this customer', 403);
      }
    }
    
    const docNum = await getNextNumber('SQ');
    const compRes = await query(`SELECT id FROM org_companies ORDER BY created_at LIMIT 1`);
    const companyId = toUuid(h.company_id) || compRes.rows[0]?.id || null;

    const subtotal = h.items.reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100)))), toDec(0));
    const cgst = h.items.reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100))).times(toDec(i.cgst_rate).dividedBy(100))), toDec(0));
    const sgst = h.items.reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100))).times(toDec(i.sgst_rate).dividedBy(100))), toDec(0));
    const igst = h.items.reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100))).times(toDec(i.igst_rate).dividedBy(100))), toDec(0));
    const taxTotal = decRound(cgst.plus(sgst).plus(igst));

    const result = await transaction(async (client) => {
      const qr = await client.query(
        `INSERT INTO sd_quotations (doc_number, company_id, customer_id, doc_type, quotation_date, valid_until,
         currency, subtotal, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount,
         place_of_supply, customer_gstin, profit_center_id, project_id, payment_term_id,
         delivery_terms, sales_rep, description, notes, created_by)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,'INR',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [docNum, companyId, h.customer_id, h.doc_type || 'goods', h.valid_until,
         decRound(subtotal), taxTotal, decRound(subtotal.plus(toDec(taxTotal))), decRound(cgst), decRound(sgst), decRound(igst),
         h.place_of_supply, h.customer_gstin, toUuid(h.profit_center_id), toUuid(h.project_id),
         toUuid(h.payment_term_id), h.delivery_terms, h.sales_rep, h.description, h.notes, req.user.id]);

      for (let i = 0; i < h.items.length; i++) {
        const it = h.items[i];
        const lineAmt = decRound(toDec(it.quantity).times(toDec(it.unit_price)).times(toDec(1).minus(toDec(it.discount_percent).dividedBy(100))));
        const lineTax = decRound(toDec(lineAmt).times(toDec(it.cgst_rate).plus(toDec(it.sgst_rate)).plus(toDec(it.igst_rate)).dividedBy(100)));
        await client.query(
          `INSERT INTO sd_quotation_items (quotation_id, line_number, material_id, description, quantity, uom_id,
           unit_price, discount_percent, tax_amount, total_amount, plant_id, storage_location_id,
           hsn_code, gst_rate, cgst_rate, sgst_rate, igst_rate, delivery_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [qr.rows[0].id, i + 1, toUuid(it.material_id), it.description || it.service_description,
           toNum(it.quantity), toUuid(it.uom_id), toNum(it.unit_price), toNum(it.discount_percent),
           lineTax, lineAmt + lineTax, toUuid(it.plant_id), toUuid(it.storage_location_id),
           it.hsn_code, toNum(it.gst_rate), toNum(it.cgst_rate), toNum(it.sgst_rate), toNum(it.igst_rate),
           it.delivery_date || null]);
      }
      return qr.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'sales_quotation', result.id, null, { doc_number: docNum }, req);
    successResponse(res, result, 'Quotation created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.put('/quotations/:id', authenticate, async (req, res) => {
  try {
    const h = req.body;
    const existing = await query(`SELECT * FROM sd_quotations WHERE id=$1 AND status='draft'`, [req.params.id]);
    if (!existing.rows.length) return errorResponse(res, 'Quotation not found or not in draft status', 400);

    const subtotal = (h.items || []).reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100)))), toDec(0));
    const cgst = (h.items || []).reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100))).times(toDec(i.cgst_rate).dividedBy(100))), toDec(0));
    const sgst = (h.items || []).reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100))).times(toDec(i.sgst_rate).dividedBy(100))), toDec(0));
    const igst = (h.items || []).reduce((s, i) => s.plus(toDec(i.quantity).times(toDec(i.unit_price)).times(toDec(1).minus(toDec(i.discount_percent).dividedBy(100))).times(toDec(i.igst_rate).dividedBy(100))), toDec(0));

    await transaction(async (client) => {
      await client.query(
        `UPDATE sd_quotations SET customer_id=COALESCE($1,customer_id), valid_until=$2, doc_type=$3,
         subtotal=$4, tax_amount=$5, total_amount=$6, cgst_amount=$7, sgst_amount=$8, igst_amount=$9,
         place_of_supply=$10, customer_gstin=$11, profit_center_id=$12, project_id=$13,
         payment_term_id=$14, delivery_terms=$15, sales_rep=$16, description=$17, notes=$18, updated_at=NOW()
         WHERE id=$19`,
        [h.customer_id, h.valid_until, h.doc_type || 'goods', decRound(subtotal), decRound(cgst.plus(sgst).plus(igst)), decRound(subtotal.plus(cgst).plus(sgst).plus(igst)),
         decRound(cgst), decRound(sgst), decRound(igst), h.place_of_supply, h.customer_gstin, toUuid(h.profit_center_id), toUuid(h.project_id),
         toUuid(h.payment_term_id), h.delivery_terms, h.sales_rep, h.description, h.notes, req.params.id]);

      if (h.items?.length) {
        await client.query(`DELETE FROM sd_quotation_items WHERE quotation_id=$1`, [req.params.id]);
        for (let i = 0; i < h.items.length; i++) {
          const it = h.items[i];
          const lineAmt = decRound(toDec(it.quantity).times(toDec(it.unit_price)).times(toDec(1).minus(toDec(it.discount_percent).dividedBy(100))));
          const lineTax = decRound(toDec(lineAmt).times(toDec(it.cgst_rate).plus(toDec(it.sgst_rate)).plus(toDec(it.igst_rate)).dividedBy(100)));
          await client.query(
            `INSERT INTO sd_quotation_items (quotation_id, line_number, material_id, description, quantity, uom_id,
             unit_price, discount_percent, tax_amount, total_amount, plant_id, storage_location_id,
             hsn_code, gst_rate, cgst_rate, sgst_rate, igst_rate, delivery_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [req.params.id, i + 1, toUuid(it.material_id), it.description, toNum(it.quantity), toUuid(it.uom_id),
             toNum(it.unit_price), toNum(it.discount_percent), lineTax, lineAmt + lineTax,
             toUuid(it.plant_id), toUuid(it.storage_location_id), it.hsn_code, toNum(it.gst_rate),
             toNum(it.cgst_rate), toNum(it.sgst_rate), toNum(it.igst_rate), it.delivery_date || null]);
        }
      }
    });
    successResponse(res, null, 'Quotation updated');
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// Confirm Quotation
router.post('/quotations/:id/confirm', authenticate, async (req, res) => {
  try {
    const q = await query(`SELECT * FROM sd_quotations WHERE id = $1`, [req.params.id]);
    if (!q.rows.length) return errorResponse(res, 'Not found', 404);
    if (q.rows[0].status !== 'draft') return errorResponse(res, 'Only draft quotations can be confirmed', 400);
    await query(`UPDATE sd_quotations SET status = 'approved' WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Quotation confirmed');
  } catch (err) { errorResponse(res, err.message); }
});

// Convert Quotation → Sales Order
router.post('/quotations/:id/convert', authenticate, async (req, res) => {
  try {
    const qt = await query(`SELECT * FROM sd_quotations WHERE id = $1`, [req.params.id]);
    if (!qt.rows.length) return errorResponse(res, 'Not found', 404);
    if (qt.rows[0].status === 'completed') return errorResponse(res, 'Already converted', 400);
    const q = qt.rows[0];
    const items = await query(`SELECT * FROM sd_quotation_items WHERE quotation_id = $1 ORDER BY line_number`, [req.params.id]);
    const soNum = await getNextNumber('SO');

    const result = await transaction(async (client) => {
      const so = await client.query(
        `INSERT INTO sd_sales_orders (doc_number, company_id, customer_id, doc_type, order_date, delivery_date,
         payment_term_id, currency, subtotal, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount,
         place_of_supply, customer_gstin, customer_po_number, profit_center_id, project_id, delivery_terms,
         description, notes, plant_id, created_by)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'INR',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
        [soNum, q.company_id, q.customer_id, q.doc_type, q.valid_until, q.payment_term_id,
         q.subtotal, q.tax_amount, q.total_amount, q.cgst_amount, q.sgst_amount, q.igst_amount,
         q.place_of_supply, q.customer_gstin, req.body.customer_po_number,
         q.profit_center_id, q.project_id, q.delivery_terms, q.description, q.notes, null, req.user.id]);

      for (const it of items.rows) {
        await client.query(
          `INSERT INTO sd_so_items (so_id, line_number, material_id, description, quantity, uom_id,
           unit_price, discount_percent, tax_amount, total_amount, plant_id, storage_location_id,
           hsn_code, gst_rate, cgst_rate, sgst_rate, igst_rate, delivery_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [so.rows[0].id, it.line_number, it.material_id, it.description, it.quantity, it.uom_id,
           it.unit_price, it.discount_percent, it.tax_amount, it.total_amount,
           it.plant_id, it.storage_location_id, it.hsn_code, it.gst_rate,
           it.cgst_rate, it.sgst_rate, it.igst_rate, it.delivery_date]);
      }
      await client.query(`UPDATE sd_quotations SET status='completed', converted_to_so=$1 WHERE id=$2`, [so.rows[0].id, req.params.id]);
      return so.rows[0];
    });
    successResponse(res, result, 'Converted to SO', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// ============================================
// SALES ORDERS
// ============================================
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT so.*, bp.display_name as customer_name, bp.bp_number,
               (SELECT COUNT(*) FROM sd_so_items si WHERE si.so_id = so.id) as item_count
               FROM sd_sales_orders so LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND so.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (so.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx} OR so.customer_po_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY so.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Must be before /orders/:id to avoid route conflict
router.get('/orders/eligible-for-billing', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT so.*, bp.display_name as customer_name, bp.state as customer_state, bp.gstin as customer_gstin_master,
              (SELECT COALESCE(SUM(si.quantity),0) FROM sd_so_items si WHERE si.so_id = so.id) as total_ordered_qty,
              (SELECT COALESCE(SUM(COALESCE(si.billed_qty,0)),0) FROM sd_so_items si WHERE si.so_id = so.id) as total_billed_qty
       FROM sd_sales_orders so LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE (
         (COALESCE(so.doc_type,'goods') = 'goods' AND so.status IN ('delivered','partially_delivered'))
         OR
         (COALESCE(so.doc_type,'goods') = 'service' AND so.status IN ('confirmed','delivered','partially_delivered'))
       )
       AND EXISTS (
         SELECT 1 FROM sd_so_items si
         WHERE si.so_id = so.id
         AND si.quantity > COALESCE(si.billed_qty, 0)
       )
       ORDER BY so.created_at DESC`);
    successResponse(res, r.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const so = await query(`SELECT so.*, bp.display_name as customer_name, bp.bp_number, bp.gstin as cust_gstin,
       pt.term_code as payment_term_code, pt.term_name as payment_term_name,
       pc.pc_code as profit_center_code, pc.pc_name as profit_center_name,
       pr.project_code, pr.project_name
       FROM sd_sales_orders so
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       LEFT JOIN fi_payment_terms pt ON so.payment_term_id = pt.id
       LEFT JOIN org_profit_centers pc ON so.profit_center_id = pc.id
       LEFT JOIN ps_projects pr ON so.project_id = pr.id
       WHERE so.id = $1`, [req.params.id]);
    if (!so.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT si.*, m.material_code, m.material_name, u.uom_code,
              p.plant_code, p.plant_name, sl.sloc_code, sl.sloc_name
       FROM sd_so_items si LEFT JOIN mm_materials m ON si.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON si.uom_id = u.id
       LEFT JOIN org_plants p ON si.plant_id = p.id
       LEFT JOIN org_storage_locations sl ON si.storage_location_id = sl.id
       WHERE si.so_id = $1 ORDER BY si.line_number`, [req.params.id]);
    successResponse(res, { ...so.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/orders', authenticate, async (req, res) => {
  try {
    const h = req.body;
    if (!h.customer_id || !h.items?.length) return errorResponse(res, 'Customer and items required', 400);
    // Business rule enforcement
    const ruleCheck = await checkBusinessRules('sales_order', { ...h, total_amount: h.items?.reduce((s,i)=>s+(parseFloat(i.quantity||0)*parseFloat(i.unit_price||0)),0) }, 'before_save');
    if (ruleCheck.blocked) return errorResponse(res, ruleCheck.message, 422);
    const docNum = await getNextNumber('SO');
    const compRes = await query(`SELECT id FROM org_companies ORDER BY created_at LIMIT 1`);
    const companyId = toUuid(h.company_id) || compRes.rows[0]?.id || null;

    const subtotal = h.items.reduce((s, i) => s + (toNum(i.quantity) * toNum(i.unit_price) * (1 - toNum(i.discount_percent) / 100)), 0);
    const cgst = h.items.reduce((s, i) => s + (toNum(i.quantity) * toNum(i.unit_price) * (1 - toNum(i.discount_percent) / 100) * toNum(i.cgst_rate) / 100), 0);
    const sgst = h.items.reduce((s, i) => s + (toNum(i.quantity) * toNum(i.unit_price) * (1 - toNum(i.discount_percent) / 100) * toNum(i.sgst_rate) / 100), 0);
    const igst = h.items.reduce((s, i) => s + (toNum(i.quantity) * toNum(i.unit_price) * (1 - toNum(i.discount_percent) / 100) * toNum(i.igst_rate) / 100), 0);

    const result = await transaction(async (client) => {
      const so = await client.query(
        `INSERT INTO sd_sales_orders (doc_number, company_id, customer_id, doc_type, order_date, delivery_date,
         payment_term_id, currency, subtotal, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount,
         place_of_supply, customer_gstin, customer_po_number, customer_po_date, profit_center_id, project_id, delivery_terms,
         priority, shipping_method, description, internal_notes, plant_id, created_by)
         VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'INR',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
        [docNum, companyId, h.customer_id, h.doc_type || 'goods', h.delivery_date, toUuid(h.payment_term_id),
         subtotal, cgst+sgst+igst, subtotal+cgst+sgst+igst, cgst, sgst, igst,
         h.place_of_supply, h.customer_gstin, h.customer_po_number, h.customer_po_date || null,
         toUuid(h.profit_center_id), toUuid(h.project_id), h.delivery_terms,
         h.priority || 'normal', h.shipping_method, h.description, h.internal_notes, toUuid(h.plant_id), req.user.id]);

      for (let i = 0; i < h.items.length; i++) {
        const it = h.items[i];
        const lineAmt = toNum(it.quantity) * toNum(it.unit_price) * (1 - toNum(it.discount_percent) / 100);
        const lineTax = lineAmt * (toNum(it.cgst_rate) + toNum(it.sgst_rate) + toNum(it.igst_rate)) / 100;
        await client.query(
          `INSERT INTO sd_so_items (so_id, line_number, material_id, description, quantity, uom_id,
           unit_price, discount_percent, tax_amount, total_amount, plant_id, storage_location_id,
           hsn_code, gst_rate, cgst_rate, sgst_rate, igst_rate, delivery_date, sloc_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$12)`,
          [so.rows[0].id, i + 1, toUuid(it.material_id), it.description || it.service_description,
           toNum(it.quantity), toUuid(it.uom_id), toNum(it.unit_price), toNum(it.discount_percent),
           lineTax, lineAmt + lineTax, toUuid(it.plant_id), toUuid(it.storage_location_id),
           it.hsn_code, toNum(it.gst_rate), toNum(it.cgst_rate), toNum(it.sgst_rate), toNum(it.igst_rate),
           it.delivery_date || null]);
      }
      return so.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'sales_order', result.id, null, { doc_number: docNum }, req);
    // Rule engine — fire notifications and check approval rules (non-blocking)
    await fireNotificationRules('sales_order', result.id, 'on_create', result, req.user.id);
    await triggerApprovalRules('sales_order', result.id, result, req.user.id);
    successResponse(res, result, 'Sales Order created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const h = req.body;
    const result = await query(`UPDATE sd_sales_orders SET delivery_date=$1, customer_po_number=$2, priority=$3,
      shipping_method=$4, internal_notes=$5, description=$6, place_of_supply=$7, delivery_terms=$8, updated_at=NOW() WHERE id=$9 AND status IN ('draft','rejected') RETURNING id`,
      [h.delivery_date, h.customer_po_number, h.priority, h.shipping_method, h.internal_notes, h.description, h.place_of_supply, h.delivery_terms, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or not editable', 404);
    successResponse(res, null, 'Updated');
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.post('/orders/:id/confirm', authenticate, async (req, res) => {
  try {
    const soId = req.params.id;
    const so = await query(`SELECT * FROM sd_sales_orders WHERE id = $1 AND status = 'draft'`, [soId]);
    if (!so.rows.length) return errorResponse(res, 'Order not found or not in draft status', 404);
    const order = so.rows[0];

    const cfg = await getConfigs([
      'sales.require_availability_check',
      'sales.credit_limit_check',
      'sales.require_customer_po_number',
      'production.auto_create_order_on_so',
      'production.planning_strategy',
    ]);

    // ── 1. Customer PO number required ──────────────────────────────────
    if (cfg['sales.require_customer_po_number'] === 'true' && !order.customer_po_number) {
      return errorResponse(res, 'Customer PO Number is required before confirming this order', 400);
    }

    // ── 2. Stock availability check ──────────────────────────────────────
    if (cfg['sales.require_availability_check'] === 'true') {
      const items = await query(
        `SELECT soi.material_id, soi.quantity, m.material_code, m.material_name,
         COALESCE((SELECT SUM(s.quantity) FROM inv_stock s WHERE s.material_id = soi.material_id), 0) as available_qty
         FROM sd_so_items soi
         JOIN mm_materials m ON m.id = soi.material_id
         WHERE soi.so_id = $1`, [soId]);
      const shortages = items.rows.filter(r => parseFloat(r.available_qty) < parseFloat(r.quantity));
      if (shortages.length) {
        const detail = shortages.map(s => `${s.material_code} (need ${s.quantity}, have ${parseFloat(s.available_qty)})`).join('; ');
        return errorResponse(res, `Insufficient stock — ${detail}`, 400);
      }
    }

    // ── 3. Credit limit check ────────────────────────────────────────────
    if (cfg['sales.credit_limit_check'] === 'true') {
      const bp = await query(
        `SELECT bp.credit_limit,
         COALESCE((SELECT SUM(so2.total_amount) FROM sd_sales_orders so2
                   WHERE so2.customer_id = bp.id AND so2.status IN ('confirmed','in_process') AND so2.id <> $2), 0) as outstanding
         FROM bp_business_partners bp WHERE bp.id = $1`, [order.customer_id, soId]);
      if (bp.rows.length) {
        const limit = parseFloat(bp.rows[0].credit_limit || 0);
        const outstanding = parseFloat(bp.rows[0].outstanding || 0);
        const orderAmt = parseFloat(order.total_amount || 0);
        if (limit > 0 && (outstanding + orderAmt) > limit) {
          return errorResponse(res, `Credit limit exceeded. Limit: ${limit}, Outstanding: ${outstanding}, This order: ${orderAmt}`, 400);
        }
      }
    }

    // ── 4. Confirm the order ────────────────────────────────────────────
    await query(`UPDATE sd_sales_orders SET status = 'confirmed', updated_at = NOW() WHERE id = $1`, [soId]);

    // ── 5. Auto-create production orders (MTO) ──────────────────────────
    const strategy = cfg['production.planning_strategy'] || 'MTS';
    const autoCreateProd = cfg['production.auto_create_order_on_so'] === 'true';
    if (autoCreateProd && strategy !== 'MTS') {
      const items = await query(
        `SELECT soi.material_id, soi.quantity, m.material_code,
         COALESCE(m.planning_strategy, $2) as mat_strategy
         FROM sd_so_items soi
         JOIN mm_materials m ON m.id = soi.material_id
         WHERE soi.so_id = $1`, [soId, strategy]);
      for (const item of items.rows) {
        const matStrategy = item.mat_strategy;
        if (strategy === 'MTO' || (strategy === 'MIXED' && matStrategy === 'MTO')) {
          // Check if BOM exists (only create prod order if there's a BOM)
          const bom = await query(
            `SELECT id FROM pp_bom_headers WHERE material_id = $1 AND status = 'released' AND is_active = true ORDER BY version DESC LIMIT 1`,
            [item.material_id]);
          if (bom.rows.length) {
            const docNum = await getNextNumber('PO');
            await query(
              `INSERT INTO pp_production_orders (doc_number, material_id, planned_qty, status, planned_start, planned_end, bom_id, created_by)
               VALUES ($1, $2, $3, 'draft', CURRENT_DATE, CURRENT_DATE + 7, $4, $5)
               ON CONFLICT DO NOTHING`,
              [docNum, item.material_id, item.quantity, bom.rows[0].id, req.user.id]);
          }
        }
      }
    }

    successResponse(res, null, 'Order confirmed');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// DELIVERIES — reduces stock for goods, skips for service
// ============================================
router.get('/deliveries', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT d.*, so.doc_number as so_number, bp.display_name as customer_name,
               p.plant_code, so.doc_type,
               (SELECT COUNT(*) FROM sd_delivery_items di WHERE di.delivery_id = d.id) as item_count
               FROM sd_deliveries d
               LEFT JOIN sd_sales_orders so ON d.so_id = so.id
               LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
               LEFT JOIN org_plants p ON d.plant_id = p.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND d.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (d.doc_number ILIKE $${idx} OR so.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY d.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Check stock availability before delivery
router.get('/orders/:id/delivery-check', authenticate, async (req, res) => {
  try {
    const so = await query(`SELECT * FROM sd_sales_orders WHERE id = $1`, [req.params.id]);
    if (!so.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT si.*, m.material_code, m.material_name, m.is_batch_managed,
              COALESCE(s.qty, 0) as available_stock
       FROM sd_so_items si
       LEFT JOIN mm_materials m ON si.material_id = m.id
       LEFT JOIN (SELECT material_id, plant_id, SUM(quantity) as qty FROM inv_stock GROUP BY material_id, plant_id) s
         ON s.material_id = si.material_id AND s.plant_id = si.plant_id
       WHERE si.so_id = $1 ORDER BY si.line_number`, [req.params.id]);
    const issues = items.rows
      .filter(i => i.material_id && toNum(i.quantity) - toNum(i.delivered_qty) > toNum(i.available_stock))
      .map(i => ({ material: i.material_code || i.description, needed: toNum(i.quantity) - toNum(i.delivered_qty), available: toNum(i.available_stock) }));
    successResponse(res, { doc_type: so.rows[0].doc_type, items: items.rows, stock_issues: issues, can_deliver: so.rows[0].doc_type === 'service' || issues.length === 0 });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/deliveries', authenticate, async (req, res) => {
  try {
    const { so_id, ship_to_address, shipping_method, eway_bill_number, carrier, lr_number, vehicle_number, driver_name } = req.body;
    if (!so_id) return errorResponse(res, 'Sales order required', 400);
    const so = await query(`SELECT * FROM sd_sales_orders WHERE id = $1 AND status IN ('confirmed','partially_delivered')`, [so_id]);
    if (!so.rows.length) return errorResponse(res, 'SO not found or not confirmed', 400);
    const s = so.rows[0];
    if (s.doc_type === 'service') return errorResponse(res, 'Service orders do not require delivery — go directly to Billing', 400);
    const isService = false;

    const soItems = await query(
      `SELECT si.*, m.material_code, m.material_name FROM sd_so_items si
       LEFT JOIN mm_materials m ON si.material_id = m.id WHERE si.so_id = $1 ORDER BY si.line_number`, [so_id]);
    const pendingItems = soItems.rows.filter(i => toNum(i.quantity) - toNum(i.delivered_qty) > 0);
    if (!pendingItems.length) return errorResponse(res, 'All items already delivered', 400);

    // ── PRE-FLIGHT: validate ALL items have sufficient stock before touching anything ──
    const stockFailures = [];
    for (const item of pendingItems) {
      if (!item.material_id) continue;
      const deliverQty = toNum(item.quantity) - toNum(item.delivered_qty);
      const plantId    = item.plant_id || s.plant_id;
      const totalStock = await query(
        `SELECT COALESCE(SUM(quantity), 0) as qty FROM inv_stock WHERE material_id=$1 AND plant_id=$2`,
        [item.material_id, plantId]);
      const available = parseFloat(totalStock.rows[0].qty);
      if (available < deliverQty) {
        stockFailures.push(`${item.material_code || item.material_name}: need ${deliverQty}, available ${available}`);
      }
    }
    if (stockFailures.length) {
      return errorResponse(res, `Cannot create delivery — insufficient stock: ${stockFailures.join('; ')}`, 400);
    }

    const docNum = await getNextNumber('DL');

    const result = await transaction(async (client) => {
      const dl = await client.query(
        `INSERT INTO sd_deliveries (doc_number, so_id, doc_type, delivery_date, status, plant_id,
         ship_to_address, shipping_method, eway_bill_number, carrier, lr_number, vehicle_number, driver_name, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,'completed',$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [docNum, so_id, s.doc_type || 'goods', toUuid(pendingItems[0]?.plant_id || s.plant_id),
         ship_to_address, shipping_method, eway_bill_number, carrier, lr_number, vehicle_number, driver_name, req.user.id]);

      for (const item of pendingItems) {
        const deliverQty = toNum(item.quantity) - toNum(item.delivered_qty);
        await client.query(
          `INSERT INTO sd_delivery_items (delivery_id, so_item_id, material_id, quantity, uom_id, storage_location_id, hsn_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [dl.rows[0].id, item.id, toUuid(item.material_id), deliverQty, toUuid(item.uom_id),
           toUuid(item.storage_location_id || item.sloc_id), item.hsn_code]);

        await client.query(`UPDATE sd_so_items SET delivered_qty = delivered_qty + $1 WHERE id = $2`, [deliverQty, item.id]);

        // Reduce stock (goods only) — stock was pre-validated above so this will always succeed
        if (!isService && item.material_id) {
          const plantId = item.plant_id || s.plant_id;
          const slocId  = item.storage_location_id || item.sloc_id;
          // Prefer exact sloc match, fall back to any sloc with enough stock
          let stockRow;
          if (slocId) {
            stockRow = await client.query(
              `SELECT id, quantity, sloc_id FROM inv_stock WHERE material_id=$1 AND plant_id=$2 AND sloc_id=$3 FOR UPDATE`,
              [item.material_id, plantId, slocId]);
          }
          if (!stockRow?.rows?.length) {
            stockRow = await client.query(
              `SELECT id, quantity, sloc_id FROM inv_stock WHERE material_id=$1 AND plant_id=$2 ORDER BY quantity DESC LIMIT 1 FOR UPDATE`,
              [item.material_id, plantId]);
          }
          if (!stockRow?.rows?.length) throw new Error(`No stock record found for ${item.material_code}`);
          const newQty = parseFloat(stockRow.rows[0].quantity) - deliverQty;
          if (newQty < 0) throw new Error(`Stock went negative for ${item.material_code} — concurrent delivery conflict`);
          await client.query(`UPDATE inv_stock SET quantity=$1, updated_at=NOW() WHERE id=$2`, [newQty, stockRow.rows[0].id]);
          const smNum = await getNextNumber('SM');
          await client.query(
            `INSERT INTO inv_stock_movements (doc_number, movement_type, material_id, plant_id, sloc_id, quantity, uom_id, reference_type, reference_id, created_by)
             VALUES ($1,'issue',$2,$3,$4,$5,$6,'delivery',$7,$8)`,
            [smNum, item.material_id, plantId, stockRow.rows[0].sloc_id, deliverQty, item.uom_id, dl.rows[0].id, req.user.id]);
        }
      }

      // Update SO status
      const allDelivered = await client.query(`SELECT COUNT(*) as cnt FROM sd_so_items WHERE so_id = $1 AND quantity > delivered_qty`, [so_id]);
      const newStatus = parseInt(allDelivered.rows[0].cnt) === 0 ? 'delivered' : 'partially_delivered';
      await client.query(`UPDATE sd_sales_orders SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, so_id]);

      return dl.rows[0];
    });
    successResponse(res, result, 'Delivery created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// ============================================
// BILLING → Auto-creates AR Invoice + JE
// ============================================
router.get('/billing', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT b.*, so.doc_number as so_number, bp.display_name as customer_name,
       ari.doc_number as ar_invoice_number, je.doc_number as je_number
       FROM sd_billing b LEFT JOIN sd_sales_orders so ON b.so_id = so.id
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       LEFT JOIN fi_ar_invoices ari ON b.ar_invoice_id = ari.id
       LEFT JOIN fi_journal_headers je ON b.journal_id = je.id
       ORDER BY b.created_at DESC`);
    successResponse(res, r.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/billing/:id', authenticate, async (req, res) => {
  try {
    const bl = await query(
      `SELECT b.*, so.doc_number as so_number, bp.display_name as customer_name,
       ari.doc_number as ar_invoice_number, je.doc_number as je_number
       FROM sd_billing b LEFT JOIN sd_sales_orders so ON b.so_id = so.id
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       LEFT JOIN fi_ar_invoices ari ON b.ar_invoice_id = ari.id
       LEFT JOIN fi_journal_headers je ON b.journal_id = je.id
       WHERE b.id = $1`, [req.params.id]);
    if (!bl.rows.length) return errorResponse(res, 'Not found', 404);
    // Use billing-specific items if available, otherwise fall back to SO items
    const biItems = await query(
      `SELECT bi.*, m.material_code, m.material_name, u.uom_code
       FROM sd_billing_items bi LEFT JOIN sd_so_items si ON bi.so_item_id = si.id
       LEFT JOIN mm_materials m ON si.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON si.uom_id = u.id
       WHERE bi.billing_id = $1 ORDER BY bi.line_number`, [req.params.id]);
    if (biItems.rows.length > 0) {
      successResponse(res, { ...bl.rows[0], items: biItems.rows });
    } else {
      const items = await query(
        `SELECT si.*, m.material_code, m.material_name, u.uom_code
         FROM sd_so_items si LEFT JOIN mm_materials m ON si.material_id = m.id
         LEFT JOIN mm_units_of_measure u ON si.uom_id = u.id
         WHERE si.so_id = $1 ORDER BY si.line_number`, [bl.rows[0].so_id]);
      successResponse(res, { ...bl.rows[0], items: items.rows });
    }
  } catch (err) { errorResponse(res, err.message); }
});

// Edit billing document (date and place_of_supply)
router.put('/billing/:id', authenticate, async (req, res) => {
  try {
    const { billing_date, place_of_supply } = req.body;
    const result = await query(
      `UPDATE sd_billing SET
         billing_date = COALESCE($1, billing_date),
         place_of_supply = COALESCE($2, place_of_supply)
       WHERE id = $3 RETURNING *`,
      [billing_date || null, place_of_supply || null, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, result.rows[0], 'Billing updated');
  } catch (err) { errorResponse(res, err.message); }
});

// Create billing — supports partial billing via optional billing_items array
router.post('/billing', authenticate, async (req, res) => {
  try {
    // billing_items: [{so_item_id, billing_qty}] — if omitted, bills full remaining qty per item
    const { so_id, billing_items } = req.body;
    if (!so_id) return errorResponse(res, 'Sales order required', 400);
    const so = await query(`SELECT * FROM sd_sales_orders WHERE id = $1`, [so_id]);
    if (!so.rows.length) return errorResponse(res, 'SO not found', 404);
    const s = so.rows[0];
    const blNum = await getNextNumber('BL');

    const result = await transaction(async (client) => {
      const companyId = s.company_id || (await client.query(`SELECT id FROM org_companies ORDER BY created_at LIMIT 1`)).rows[0]?.id;

      const GSTIN_STATE_MAP = {'01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','27':'Maharashtra','29':'Karnataka','30':'Goa','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','36':'Telangana','37':'Andhra Pradesh'};
      const compRow = (await client.query(`SELECT state, tax_id FROM org_companies WHERE id = $1`, [companyId])).rows[0];
      const custRow = (await client.query(`SELECT state, gstin FROM bp_business_partners WHERE id = $1`, [s.customer_id])).rows[0];

      let compSt = (compRow?.state || '').trim();
      let custSt = (custRow?.state || '').trim();
      if (!compSt && compRow?.tax_id?.length >= 2) compSt = GSTIN_STATE_MAP[compRow.tax_id.substring(0,2)] || '';
      if (!custSt && custRow?.gstin?.length >= 2) custSt = GSTIN_STATE_MAP[custRow.gstin.substring(0,2)] || '';
      const normalize = (st) => st.toLowerCase().replace(/[^a-z]/g, '');
      const sameState = compSt && custSt && normalize(compSt) === normalize(custSt);
      const placeOfSupply = custSt || s.place_of_supply || compSt || '';
      const custGstin = custRow?.gstin || s.customer_gstin || '';

      // Load SO items and determine billing quantities
      const soItems = (await client.query(`SELECT * FROM sd_so_items WHERE so_id = $1 ORDER BY line_number`, [so_id])).rows;

      // Build billing qty map: use provided billing_items or default to remaining qty
      const billingQtyMap = {};
      if (billing_items && billing_items.length > 0) {
        for (const bi of billing_items) { billingQtyMap[bi.so_item_id] = parseFloat(bi.billing_qty || 0); }
      } else {
        for (const it of soItems) {
          const remaining = parseFloat(it.quantity) - parseFloat(it.billed_qty || 0);
          if (remaining > 0) billingQtyMap[it.id] = remaining;
        }
      }

      // Calculate totals using billing quantities only
      let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
      const ariItems = [];
      for (const it of soItems) {
        const billingQty = billingQtyMap[it.id] || 0;
        if (billingQty <= 0) continue;
        const remaining = parseFloat(it.quantity) - parseFloat(it.billed_qty || 0);
        const actualQty = Math.min(billingQty, remaining);
        if (actualQty <= 0) continue;

        const lineAmt = actualQty * parseFloat(it.unit_price||0) * (1 - parseFloat(it.discount_percent||0)/100);
        subtotal += lineAmt;
        let gstRate = parseFloat(it.gst_rate || 0);
        if (gstRate === 0) gstRate = parseFloat(it.cgst_rate||0) * 2 || parseFloat(it.igst_rate||0);
        if (gstRate === 0 && it.material_id) {
          const matR = await client.query(`SELECT gst_rate FROM mm_materials WHERE id=$1`, [it.material_id]);
          gstRate = parseFloat(matR.rows[0]?.gst_rate || 0);
        }
        let cgstR = 0, sgstR = 0, igstR = 0, cgstA = 0, sgstA = 0, igstA = 0;
        if (sameState) {
          cgstR = gstRate / 2; sgstR = gstRate / 2;
          cgstA = lineAmt * cgstR / 100; sgstA = lineAmt * sgstR / 100;
        } else {
          igstR = gstRate;
          igstA = lineAmt * igstR / 100;
        }
        totalCgst += cgstA; totalSgst += sgstA; totalIgst += igstA;
        ariItems.push({ ...it, billing_qty: actualQty, lineAmt, cgst_rate: cgstR, sgst_rate: sgstR, igst_rate: igstR, cgst_amount: cgstA, sgst_amount: sgstA, igst_amount: igstA });
      }

      if (ariItems.length === 0) throw new Error('No items to bill — all quantities already billed');
      const taxTotal = totalCgst + totalSgst + totalIgst;
      const grandTotal = subtotal + taxTotal;

      // Create Billing
      const bl = await client.query(
        `INSERT INTO sd_billing (doc_number, so_id, billing_date, customer_id, subtotal, tax_amount, total_amount, doc_type,
         cgst_amount, sgst_amount, igst_amount, place_of_supply, status, created_by)
         VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed',$12) RETURNING *`,
        [blNum, so_id, s.customer_id, subtotal, taxTotal, grandTotal, s.doc_type||'goods',
         totalCgst, totalSgst, totalIgst, placeOfSupply, req.user.id]);

      // Store billing line items in sd_billing_items and update billed_qty on SO items
      for (let i = 0; i < ariItems.length; i++) {
        const it = ariItems[i];
        await client.query(
          `INSERT INTO sd_billing_items (billing_id, so_item_id, line_number, description, quantity, unit_price,
           discount_percent, hsn_code, gst_rate, cgst_rate, sgst_rate, igst_rate,
           cgst_amount, sgst_amount, igst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [bl.rows[0].id, it.id, i+1, it.description, it.billing_qty, it.unit_price,
           it.discount_percent||0, it.hsn_code, it.gst_rate||0,
           it.cgst_rate, it.sgst_rate, it.igst_rate,
           it.cgst_amount.toFixed(4), it.sgst_amount.toFixed(4), it.igst_amount.toFixed(4), it.lineAmt.toFixed(4)]);
        await client.query(
          `UPDATE sd_so_items SET billed_qty = COALESCE(billed_qty,0) + $1 WHERE id = $2`,
          [it.billing_qty, it.id]);
      }

      // Auto-create AR Invoice
      const ariNum = await getNextNumber('ARI');
      const ari = await client.query(
        `INSERT INTO fi_ar_invoices (doc_number, company_id, customer_id, invoice_date, due_date, posting_date, currency,
         subtotal, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount, place_of_supply,
         customer_gstin, status, created_by)
         VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + 30,CURRENT_DATE,'INR',$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12) RETURNING *`,
        [ariNum, companyId, s.customer_id, subtotal, taxTotal, grandTotal,
         totalCgst, totalSgst, totalIgst, placeOfSupply, custGstin, req.user.id]);

      for (let i = 0; i < ariItems.length; i++) {
        const it = ariItems[i];
        await client.query(
          `INSERT INTO fi_ar_invoice_items (invoice_id, line_number, material_id, description, quantity, uom_id,
           unit_price, discount_percent, hsn_code, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, total_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [ari.rows[0].id, i+1, toUuid(it.material_id), it.description, it.billing_qty, toUuid(it.uom_id),
           it.unit_price, it.discount_percent||0, it.hsn_code,
           it.cgst_rate, it.sgst_rate, it.igst_rate,
           it.cgst_amount.toFixed(2), it.sgst_amount.toFixed(2), it.igst_amount.toFixed(2), it.lineAmt.toFixed(2)]);
      }

      // Auto-create Journal Entry
      const jeNum = await getNextNumber('JE');
      const je = await client.query(
        `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, description, currency, total_debit, total_credit, status, journal_type, created_by, posted_by, posted_at)
         VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,'INR',$4,$4,'posted','sales',$5,$5,NOW()) RETURNING *`,
        [jeNum, companyId, `AR Invoice ${ariNum} from Billing ${blNum}`, grandTotal, req.user.id]);

      const _gl = async (key, fb) => {
        const r = await client.query(`SELECT gl_account_id FROM fi_gl_mapping WHERE mapping_key=$1 AND gl_account_id IS NOT NULL`, [key]);
        if (r.rows[0]?.gl_account_id) return r.rows[0].gl_account_id;
        if (fb) { const f = await client.query(`SELECT id FROM fi_gl_accounts WHERE (${fb}) AND is_active=true LIMIT 1`); return f.rows[0]?.id || null; }
        return null;
      };
      const arGl = await _gl('accounts_receivable', "account_name ILIKE '%debtor%' OR account_name ILIKE '%receivable%'");
      const docType = s.doc_type || 'goods';
      const revGl = docType === 'service'
        ? (await _gl('service_revenue', "account_name ILIKE '%service%' AND account_type='revenue'") || await _gl('sales_revenue', "account_name ILIKE '%sales%' AND account_type='revenue'"))
        : await _gl('sales_revenue', "account_name ILIKE '%sales%' AND account_type='revenue'");
      const cgstGl = await _gl('output_cgst', "account_name ILIKE '%output cgst%' OR (account_name ILIKE '%cgst%' AND account_type='liability')");
      const sgstGl = await _gl('output_sgst', "account_name ILIKE '%output sgst%' OR (account_name ILIKE '%sgst%' AND account_type='liability')");
      const igstGl = await _gl('output_igst', "account_name ILIKE '%output igst%' OR (account_name ILIKE '%igst%' AND account_type='liability')");

      let ln = 0;
      if (arGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, description, debit_amount, credit_amount) VALUES ($1,$2,$3,$4,$5,0)`, [je.rows[0].id, ln, arGl, `Debtors — ${ariNum}`, grandTotal]); }
      if (revGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, description, debit_amount, credit_amount) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, revGl, `${docType === 'service' ? 'Service' : 'Goods'} Revenue — ${blNum}`, subtotal]); }
      if (cgstGl && totalCgst > 0) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, description, debit_amount, credit_amount) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, cgstGl, `Output CGST — ${ariNum}`, totalCgst]); }
      if (sgstGl && totalSgst > 0) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, description, debit_amount, credit_amount) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, sgstGl, `Output SGST — ${ariNum}`, totalSgst]); }
      if (igstGl && totalIgst > 0) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, description, debit_amount, credit_amount) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, igstGl, `Output IGST — ${ariNum}`, totalIgst]); }

      await client.query(`UPDATE sd_billing SET ar_invoice_id=$1, journal_id=$2 WHERE id=$3`, [ari.rows[0].id, je.rows[0].id, bl.rows[0].id]);
      await client.query(`UPDATE fi_ar_invoices SET journal_id=$1 WHERE id=$2`, [je.rows[0].id, ari.rows[0].id]);

      // Mark SO completed only when ALL items are fully billed
      const openItems = (await client.query(
        `SELECT COUNT(*) FROM sd_so_items WHERE so_id=$1 AND quantity > COALESCE(billed_qty,0)`, [so_id])).rows[0];
      if (parseInt(openItems.count) === 0) {
        await client.query(`UPDATE sd_sales_orders SET status='completed', updated_at=NOW() WHERE id=$1`, [so_id]);
      }

      return { billing: bl.rows[0], ar_invoice: ari.rows[0], journal: je.rows[0] };
    });
    successResponse(res, result, `Billing created → AR Invoice ${result.ar_invoice.doc_number} auto-generated`, 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// ============================================
// AR INVOICE SOURCE — Copy from SO/Delivery
// ============================================
router.get('/ar-invoices/source-sos', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT so.*, bp.display_name as customer_name FROM sd_sales_orders so
       LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE so.status IN ('confirmed','delivered','partially_delivered','completed') ORDER BY so.created_at DESC`);
    successResponse(res, r.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/ar-invoices/source-so/:soId', authenticate, async (req, res) => {
  try {
    const so = await query(`SELECT so.*, bp.display_name as customer_name, bp.gstin as cust_gstin FROM sd_sales_orders so LEFT JOIN bp_business_partners bp ON so.customer_id = bp.id WHERE so.id = $1`, [req.params.soId]);
    const items = await query(`SELECT si.*, m.material_code, m.material_name, m.hsn_code as mat_hsn, u.uom_code FROM sd_so_items si LEFT JOIN mm_materials m ON si.material_id = m.id LEFT JOIN mm_units_of_measure u ON si.uom_id = u.id WHERE si.so_id = $1 ORDER BY si.line_number`, [req.params.soId]);
    successResponse(res, { ...so.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// RETURNS & CREDIT NOTES
// ============================================
router.get('/returns', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT r.*, bp.display_name as customer_name FROM sd_returns r LEFT JOIN bp_business_partners bp ON r.customer_id = bp.id ORDER BY r.created_at DESC`)).rows); }
  catch (err) { errorResponse(res, err.message); }
});
router.post('/returns', authenticate, async (req, res) => {
  try {
    const { customer_id, original_so_id, reason, items } = req.body;
    const docNum = await getNextNumber('RET');
    const totalAmt = (items || []).reduce((s, i) => s + (toNum(i.quantity) * toNum(i.unit_price)), 0);
    const r = await query(`INSERT INTO sd_returns (doc_number, customer_id, original_so_id, reason, total_amount, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [docNum, customer_id, toUuid(original_so_id), reason, totalAmt, req.user.id]);
    for (const item of (items || [])) {
      await query(`INSERT INTO sd_return_items (return_id, material_id, quantity, unit_price, reason, condition) VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.rows[0].id, toUuid(item.material_id), item.quantity, item.unit_price, item.reason, item.condition || 'good']);
    }
    successResponse(res, r.rows[0], 'Return created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.post('/returns/:id/process', authenticate, async (req, res) => {
  try {
    const ret = await query(`SELECT * FROM sd_returns WHERE id = $1`, [req.params.id]);
    if (!ret.rows.length) return errorResponse(res, 'Not found', 404);
    const cnNum = await getNextNumber('CN');
    const result = await transaction(async (client) => {
      const cn = await client.query(`INSERT INTO fi_credit_notes (doc_number, note_type, partner_id, reference_return_id, total_amount, status, created_by) VALUES ($1,'credit',$2,$3,$4,'approved',$5) RETURNING *`,
        [cnNum, ret.rows[0].customer_id, req.params.id, ret.rows[0].total_amount, req.user.id]);
      // Add stock back for good condition items
      const items = await client.query(`SELECT ri.*, m.material_code FROM sd_return_items ri LEFT JOIN mm_materials m ON ri.material_id = m.id WHERE ri.return_id = $1`, [req.params.id]);
      for (const item of items.rows) {
        if (item.condition === 'good' && item.material_id) {
          const plant = await client.query(`SELECT plant_id FROM mm_material_plant_data WHERE material_id = $1 LIMIT 1`, [item.material_id]);
          if (plant.rows.length) {
            const sl = await client.query(`SELECT id FROM org_storage_locations WHERE plant_id = $1 AND is_active = true LIMIT 1`, [plant.rows[0].plant_id]);
            if (sl.rows.length) {
              const smNum = await getNextNumber('SM');
              await client.query(`INSERT INTO inv_stock_movements (doc_number, movement_type, material_id, plant_id, sloc_id, quantity, reference_type, reference_id, created_by) VALUES ($1,'return',$2,$3,$4,$5,'return',$6,$7)`,
                [smNum, item.material_id, plant.rows[0].plant_id, sl.rows[0].id, item.quantity, cn.rows[0].id, req.user.id]);
              const existing = await client.query(`SELECT id FROM inv_stock WHERE material_id=$1 AND plant_id=$2 AND sloc_id=$3`, [item.material_id, plant.rows[0].plant_id, sl.rows[0].id]);
              if (existing.rows.length) {
                await client.query(`UPDATE inv_stock SET quantity = quantity + $1 WHERE id = $2`, [item.quantity, existing.rows[0].id]);
              } else {
                await client.query(`INSERT INTO inv_stock (material_id, plant_id, sloc_id, quantity) VALUES ($1,$2,$3,$4)`, [item.material_id, plant.rows[0].plant_id, sl.rows[0].id, item.quantity]);
              }
            }
          }
        }
      }
      await client.query(`UPDATE sd_returns SET status = 'processed', credit_note_id = $1 WHERE id = $2`, [cn.rows[0].id, req.params.id]);
      return { return_id: req.params.id, credit_note: cn.rows[0] };
    });
    successResponse(res, result, 'Return processed, credit note created');
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.get('/credit-notes', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT cn.*, bp.display_name as partner_name FROM fi_credit_notes cn LEFT JOIN bp_business_partners bp ON cn.partner_id = bp.id ORDER BY cn.created_at DESC`)).rows); }
  catch (err) { errorResponse(res, err.message); }
});

// ============================================
// PRICE LISTS
// ============================================
router.get('/price-lists', authenticate, async (req, res) => {
  try { const r = await query(`SELECT pl.*, (SELECT COUNT(*) FROM sd_price_list_items pli WHERE pli.price_list_id = pl.id) as item_count FROM sd_price_lists pl ORDER BY pl.priority DESC, pl.list_name`); successResponse(res, r.rows); }
  catch (err) { errorResponse(res, err.message); }
});
router.post('/price-lists', authenticate, async (req, res) => {
  try {
    const { list_name, list_type, currency, valid_from, valid_to, customer_group, priority, items } = req.body;
    const pl = await query(`INSERT INTO sd_price_lists (list_name, list_type, currency, valid_from, valid_to, customer_group, priority) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [list_name, list_type || 'standard', currency || 'INR', valid_from, valid_to, customer_group, priority || 0]);
    for (const item of (items || [])) {
      await query(`INSERT INTO sd_price_list_items (price_list_id, material_id, unit_price, min_quantity, max_quantity, discount_percent) VALUES ($1,$2,$3,$4,$5,$6)`,
        [pl.rows[0].id, item.material_id, item.unit_price, item.min_quantity || 1, item.max_quantity, item.discount_percent || 0]);
    }
    successResponse(res, pl.rows[0], 'Created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.get('/price-lists/:id/items', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT pli.*, m.material_code, m.material_name FROM sd_price_list_items pli JOIN mm_materials m ON pli.material_id = m.id WHERE pli.price_list_id = $1`, [req.params.id])).rows); }
  catch (err) { errorResponse(res, err.message); }
});
router.get('/get-price', authenticate, async (req, res) => {
  try {
    const { material_id, customer_group, quantity } = req.query;
    const qty = parseFloat(quantity || 1);
    const prices = await query(
      `SELECT pli.unit_price, pli.discount_percent, pl.list_name FROM sd_price_list_items pli
       JOIN sd_price_lists pl ON pli.price_list_id = pl.id
       WHERE pli.material_id = $1 AND pl.is_active = true
       AND (pl.valid_from IS NULL OR pl.valid_from <= CURRENT_DATE)
       AND (pl.valid_to IS NULL OR pl.valid_to >= CURRENT_DATE)
       AND pli.min_quantity <= $2 AND (pli.max_quantity IS NULL OR pli.max_quantity >= $2)
       AND (pl.customer_group IS NULL OR pl.customer_group = $3)
       ORDER BY pl.priority DESC, pli.discount_percent DESC LIMIT 1`, [material_id, qty, customer_group]);
    if (prices.rows.length) {
      const p = prices.rows[0];
      successResponse(res, { unit_price: p.unit_price, discount: p.discount_percent, final_price: p.unit_price * (1 - (p.discount_percent || 0) / 100), source: p.list_name });
    } else {
      const mat = await query(`SELECT sales_price FROM mm_materials WHERE id = $1`, [material_id]);
      successResponse(res, { unit_price: mat.rows[0]?.sales_price || 0, discount: 0, final_price: mat.rows[0]?.sales_price || 0, source: 'Material Master' });
    }
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// DELETE ENDPOINTS (dependency-checked)
// ============================================
router.delete("/quotations/:id", authenticate, async (req, res) => {
  try {
    const q = await query("SELECT status, converted_to_so FROM sd_quotations WHERE id = $1", [req.params.id]);
    if (!q.rows.length) return errorResponse(res, "Not found", 404);
    if (q.rows[0].converted_to_so) return errorResponse(res, "Cannot delete — this quotation has been converted to a Sales Order", 400);
    if (q.rows[0].status !== "draft") return errorResponse(res, "Only draft quotations can be deleted", 400);
    await query("DELETE FROM sd_quotation_items WHERE quotation_id = $1", [req.params.id]);
    await query("DELETE FROM sd_quotations WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Quotation deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/orders/:id", authenticate, async (req, res) => {
  try {
    const so = await query("SELECT status FROM sd_sales_orders WHERE id = $1", [req.params.id]);
    if (!so.rows.length) return errorResponse(res, "Not found", 404);
    if (so.rows[0].status !== "draft") return errorResponse(res, "Only draft sales orders can be deleted", 400);
    const deps = await query("SELECT COUNT(*) FROM sd_deliveries WHERE so_id = $1", [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, "Cannot delete — deliveries exist for this order", 400);
    await query("DELETE FROM sd_so_items WHERE so_id = $1", [req.params.id]);
    await query("DELETE FROM sd_sales_orders WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Sales Order deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/deliveries/:id", authenticate, async (req, res) => {
  try {
    const dl = await query("SELECT * FROM sd_deliveries WHERE id = $1", [req.params.id]);
    if (!dl.rows.length) return errorResponse(res, "Not found", 404);
    const billing = await query("SELECT COUNT(*) FROM sd_billing WHERE so_id = $1", [dl.rows[0].so_id]);
    if (parseInt(billing.rows[0].count) > 0) return errorResponse(res, "Cannot delete — billing exists for this delivery order", 400);
    await query("DELETE FROM sd_delivery_items WHERE delivery_id = $1", [req.params.id]);
    await query("DELETE FROM sd_deliveries WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Delivery deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/billing/:id", authenticate, async (req, res) => {
  try {
    const bl = await query("SELECT * FROM sd_billing WHERE id = $1", [req.params.id]);
    if (!bl.rows.length) return errorResponse(res, "Not found", 404);
    if (bl.rows[0].ar_invoice_id) return errorResponse(res, "Cannot delete — AR Invoice has been generated from this billing", 400);
    await query("DELETE FROM sd_billing_items WHERE billing_id = $1", [req.params.id]);
    await query("DELETE FROM sd_billing WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Billing deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const checks = {
      'quotations': { table: 'sd_quotations', deps: "SELECT COUNT(*) FROM sd_sales_orders WHERE quotation_id = ANY($1::uuid[])", pre: ["DELETE FROM sd_quotation_items WHERE quotation_id = ANY($1::uuid[])"], status_check: 'draft' },
      'orders': { table: 'sd_sales_orders', deps: "SELECT COUNT(*) FROM sd_deliveries WHERE so_id = ANY($1::uuid[])", pre: ["DELETE FROM sd_so_items WHERE so_id = ANY($1::uuid[])"], status_check: 'draft' },
      'deliveries': { table: 'sd_deliveries', deps: "SELECT COUNT(*) FROM sd_billing WHERE so_id IN (SELECT so_id FROM sd_deliveries WHERE id = ANY($1::uuid[]))", pre: ["DELETE FROM sd_delivery_items WHERE delivery_id = ANY($1::uuid[])"] },
      'billing': { table: 'sd_billing', pre: ["DELETE FROM sd_billing_items WHERE billing_id = ANY($1::uuid[])"], deps: null },
    };
    const cfg = checks[entity];
    if (!cfg) return errorResponse(res, 'Unknown entity', 400);
    if (cfg.status_check) {
      const sc = await query(`SELECT COUNT(*) FROM ${cfg.table} WHERE id = ANY($1::uuid[]) AND status != $2`, [ids, cfg.status_check]);
      if (parseInt(sc.rows[0].count) > 0) return errorResponse(res, `Cannot delete — ${sc.rows[0].count} items are not in ${cfg.status_check} status`, 400);
    }
    if (cfg.deps) { const d = await query(cfg.deps, [ids]); if (parseInt(d.rows[0].count) > 0) return errorResponse(res, `Cannot delete — ${d.rows[0].count} dependent records exist`, 400); }
    if (cfg.pre) { for (const sql of cfg.pre) await query(sql, [ids]); }
    const r = await query(`DELETE FROM ${cfg.table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
