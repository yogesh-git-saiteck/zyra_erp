import { Router } from 'express';
import Decimal from 'decimal.js';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';
import { checkBusinessRules, fireNotificationRules, triggerApprovalRules } from '../utils/ruleEngine.js';
import { getConfigs, getConfigBool, getConfigNum } from '../utils/configService.js';

// Decimal.js helpers for precise cost calculations
const toDec = v => new Decimal(v || 0);
const decRound = (d, places = 2) => d.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();

// Budget check helper — validates budget availability for cost center or GL account
async function checkBudget(client, { cost_center_id, gl_account_id, amount, fiscal_year, company_id }) {
  if (!cost_center_id && !gl_account_id) return null; // no budget control
  const fy = fiscal_year || new Date().getFullYear();
  const q = client ? (sql, p) => client.query(sql, p) : query;
  
  // Find matching budget
  let budgetSql = `SELECT b.*, COALESCE(b.annual_amount, b.budget_amount, 0) as budget_limit FROM fi_budgets b WHERE b.fiscal_year = $1 AND b.status IN ('draft','approved','active')`;
  const params = [fy];
  let idx = 2;
  if (cost_center_id) { budgetSql += ` AND b.cost_center_id = $${idx++}`; params.push(cost_center_id); }
  if (gl_account_id) { budgetSql += ` AND b.gl_account_id = $${idx++}`; params.push(gl_account_id); }
  if (company_id) { budgetSql += ` AND b.company_id = $${idx++}`; params.push(company_id); }
  budgetSql += ` LIMIT 1`;
  
  const budget = await q(budgetSql, params);
  if (!budget.rows.length) return null; // no budget defined — allow

  const b = budget.rows[0];
  const budgetLimit = parseFloat(b.budget_limit || 0);
  if (budgetLimit <= 0) return null; // no limit set

  // Calculate committed: unconverted PR items + un-GR'd PO items
  let commitSql = `SELECT COALESCE(SUM(amount), 0) as spent FROM (`;
  const commitParams = [];
  let ci = 1;
  
  // PR items: only unconverted portion
  commitSql += `SELECT pri.total_amount * (1 - LEAST(COALESCE(pri.converted_qty, 0) / NULLIF(pri.quantity, 0), 1)) as amount
    FROM pur_requisition_items pri
    JOIN pur_requisitions pr ON pri.requisition_id = pr.id
    WHERE pr.status IN ('approved','confirmed') AND EXTRACT(YEAR FROM pr.created_at) = $${ci++}
    AND (pri.quantity - COALESCE(pri.converted_qty, 0)) > 0`;
  commitParams.push(fy);
  if (cost_center_id) { commitSql += ` AND pr.cost_center_id = $${ci++}`; commitParams.push(cost_center_id); }
  if (gl_account_id) { commitSql += ` AND COALESCE(pri.gl_account_id, $${ci++}::uuid) = $${ci++}::uuid`; commitParams.push(gl_account_id, gl_account_id); }
  
  commitSql += ` UNION ALL `;
  
  // PO items: only un-GR'd portion
  commitSql += `SELECT poi.total_amount * (1 - LEAST(COALESCE(poi.received_qty, 0) / NULLIF(poi.quantity, 0), 1)) as amount
    FROM pur_po_items poi
    JOIN pur_purchase_orders po ON poi.po_id = po.id
    WHERE po.status NOT IN ('cancelled','draft') AND EXTRACT(YEAR FROM po.created_at) = $${ci++}
    AND (poi.quantity - COALESCE(poi.received_qty, 0)) > 0`;
  commitParams.push(fy);
  if (cost_center_id) { commitSql += ` AND po.cost_center_id = $${ci++}`; commitParams.push(cost_center_id); }
  if (gl_account_id) { commitSql += ` AND COALESCE(poi.gl_account_id, $${ci++}::uuid) = $${ci++}::uuid`; commitParams.push(gl_account_id, gl_account_id); }
  
  commitSql += `) x`;

  const committed = await q(commitSql, commitParams);
  const totalSpent = parseFloat(committed.rows[0]?.spent || 0);
  const available = budgetLimit - totalSpent;
  const requestAmount = parseFloat(amount || 0);

  if (requestAmount > available) {
    return {
      exceeded: true,
      budget_limit: budgetLimit,
      spent: totalSpent,
      available: available,
      requested: requestAmount,
      message: `Budget exceeded! Budget: ₹${budgetLimit.toLocaleString()}, Already committed: ₹${totalSpent.toLocaleString()}, Available: ₹${available.toLocaleString()}, Requested: ₹${requestAmount.toLocaleString()}`
    };
  }
  return null; // within budget
}

const router = Router();

// ========= OVERVIEW =========
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [reqs, pos, grs] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='draft') as drafts,
             COALESCE(SUM(total_amount),0) as amount FROM pur_requisitions`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='draft') as drafts,
             COUNT(*) FILTER(WHERE status='confirmed') as confirmed,
             COALESCE(SUM(total_amount),0) as amount FROM pur_purchase_orders`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='draft') as pending FROM pur_goods_receipts`),
    ]);
    successResponse(res, { requisitions: reqs.rows[0], purchaseOrders: pos.rows[0], goodsReceipts: grs.rows[0] });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= PURCHASE REQUISITIONS =========
router.get('/requisitions', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT pr.*, u.first_name || ' ' || u.last_name as requester_name,
               cc.cc_code, cc.cc_name, pj.project_code, pj.project_name
               FROM pur_requisitions pr
               LEFT JOIN sys_users u ON pr.requester_id = u.id
               LEFT JOIN org_cost_centers cc ON pr.cost_center_id = cc.id
               LEFT JOIN ps_projects pj ON pr.project_id = pj.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND pr.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (pr.doc_number ILIKE $${idx} OR pr.description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY pr.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/requisitions/:id', authenticate, async (req, res) => {
  try {
    const header = await query(
      `SELECT pr.*, u.first_name || ' ' || u.last_name as requester_name,
              cc.cc_code, cc.cc_name, pj.project_name, pj.project_code
       FROM pur_requisitions pr
       LEFT JOIN sys_users u ON pr.requester_id = u.id
       LEFT JOIN org_cost_centers cc ON pr.cost_center_id = cc.id
       LEFT JOIN ps_projects pj ON pr.project_id = pj.id
       WHERE pr.id = $1`, [req.params.id]);
    if (!header.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT ri.*, m.material_code, m.material_name, u.uom_code,
              p.plant_code, p.plant_name, sl.sloc_code, sl.sloc_name
       FROM pur_requisition_items ri
       LEFT JOIN mm_materials m ON ri.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON ri.uom_id = u.id
       LEFT JOIN org_plants p ON ri.plant_id = p.id
       LEFT JOIN org_storage_locations sl ON ri.storage_location_id = sl.id
       WHERE ri.requisition_id = $1 ORDER BY ri.line_number`, [req.params.id]);
    successResponse(res, { ...header.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/requisitions', authenticate, async (req, res) => {
  try {
    const { required_date, description, priority, items, cost_center_id, preferred_vendor_id, project_id, doc_type } = req.body;
    if (!items?.length) return errorResponse(res, 'At least one item required', 400);
    if (!required_date) return errorResponse(res, 'Required date is mandatory', 400);
    if (!description) return errorResponse(res, 'Description/purpose is mandatory', 400);
    if (!cost_center_id && !project_id) return errorResponse(res, 'Either cost center or project is mandatory', 400);
    
    // Budget check per GL account
    if (cost_center_id) {
      const glGroups = {};
      for (const i of items) {
        const gl = i.gl_account_id || 'none';
        const amt = parseFloat(i.quantity || 0) * parseFloat(i.estimated_price || 0);
        glGroups[gl] = (glGroups[gl] || 0) + amt;
      }
      for (const [gl, amt] of Object.entries(glGroups)) {
        const budgetIssue = await checkBudget(null, { cost_center_id, gl_account_id: gl === 'none' ? null : gl, amount: amt, fiscal_year: new Date().getFullYear() });
        if (budgetIssue?.exceeded) return errorResponse(res, budgetIssue.message, 400);
      }
    }

    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('PR');
      const compRes = await client.query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
      const compId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;
      let total = 0;
      for (const i of items) total += parseFloat(i.quantity || 0) * parseFloat(i.estimated_price || 0);
      const h = await client.query(
        `INSERT INTO pur_requisitions (doc_number, company_id, plant_id, requester_id, required_date, description, priority, total_amount, status, doc_type, cost_center_id, preferred_vendor_id, project_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11,$12,NOW()) RETURNING *`,
        [docNumber, compId, uuid(items[0]?.plant_id), req.user.id, required_date, description, priority || 'medium', total.toFixed(2),
         doc_type || 'goods', uuid(cost_center_id), uuid(preferred_vendor_id), uuid(project_id)]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const lineTotal = parseFloat(it.quantity || 0) * parseFloat(it.estimated_price || 0);
        await client.query(
          `INSERT INTO pur_requisition_items (requisition_id, line_number, material_id, description, quantity, uom_id, estimated_price, total_amount, plant_id, storage_location_id, hsn_code, required_date, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [h.rows[0].id, i + 1, uuid(it.material_id), it.description, it.quantity, uuid(it.uom_id), it.estimated_price || 0, lineTotal.toFixed(2), uuid(it.plant_id), uuid(it.storage_location_id), it.hsn_code||null, it.required_date || required_date, uuid(it.gl_account_id)]);
      }
      // Auto-approve if total is below threshold
      const autoApproveBelow = await getConfigNum('procurement.auto_approve_below', 0);
      if (autoApproveBelow > 0 && total <= autoApproveBelow) {
        await client.query(
          `UPDATE pur_requisitions SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2`,
          [req.user.id, h.rows[0].id]);
        h.rows[0].status = 'approved';
      }
      return h.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'requisition', result.id, null, { doc_number: result.doc_number }, req);
    successResponse(res, result, 'Requisition created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// UPDATE requisition (draft or rejected)
router.put('/requisitions/:id', authenticate, async (req, res) => {
  try {
    const { required_date, description, priority, items } = req.body;
    const existing = await query(`SELECT * FROM pur_requisitions WHERE id=$1 AND status IN ('draft','rejected')`, [req.params.id]);
    if (!existing.rows.length) return errorResponse(res, 'Not found or not editable', 404);
    const toUuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await transaction(async (client) => {
      await client.query(
        `UPDATE pur_requisitions SET required_date=COALESCE($1,required_date), description=COALESCE($2,description),
         priority=COALESCE($3,priority) WHERE id=$4`,
        [required_date, description, priority, req.params.id]);
      if (items && items.length > 0) {
        await client.query(`DELETE FROM pur_requisition_items WHERE requisition_id=$1`, [req.params.id]);
        let total = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const lineTotal = parseFloat(it.quantity || 0) * parseFloat(it.estimated_price || 0);
          total += lineTotal;
          await client.query(
            `INSERT INTO pur_requisition_items (requisition_id, line_number, material_id, description, quantity, uom_id, estimated_price, total_amount, plant_id, storage_location_id, hsn_code, required_date, gl_account_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [req.params.id, i+1, toUuid(it.material_id), it.description, it.quantity, toUuid(it.uom_id), it.estimated_price||0, lineTotal.toFixed(2), toUuid(it.plant_id), toUuid(it.storage_location_id), it.hsn_code||null, it.required_date||required_date, toUuid(it.gl_account_id)]);
        }
        await client.query(`UPDATE pur_requisitions SET total_amount=$1 WHERE id=$2`, [total.toFixed(2), req.params.id]);
      }
      return (await client.query(`SELECT * FROM pur_requisitions WHERE id=$1`, [req.params.id])).rows[0];
    });
    successResponse(res, result, 'Requisition updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/requisitions/:id/approve', authenticate, async (req, res) => {
  try {
    await query(`UPDATE pur_requisitions SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2 AND status='draft'`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Requisition approved');
  } catch (err) { errorResponse(res, err.message); }
});

// Convert requisition to PO
router.post('/requisitions/:id/convert', authenticate, async (req, res) => {
  try {
    const { vendor_id, payment_term_id, selected_items } = req.body;
    if (!vendor_id) return errorResponse(res, 'Vendor is required', 400);
    if (!selected_items?.length) return errorResponse(res, 'Select at least one item to convert', 400);
    const pr = await query(`SELECT * FROM pur_requisitions WHERE id = $1`, [req.params.id]);
    if (!pr.rows.length) return errorResponse(res, 'Not found', 404);
    // PR must be approved before converting to PO
    if (!['approved', 'partially_converted'].includes(pr.rows[0].status)) {
      return errorResponse(res, `Cannot convert PR to PO — status is '${pr.rows[0].status}'. PR must be approved first.`, 400);
    }
    const allItems = await query(`SELECT * FROM pur_requisition_items WHERE requisition_id = $1`, [req.params.id]);

    // Validate quantities
    for (const sel of selected_items) {
      const prItem = allItems.rows.find(i => i.id === sel.id);
      if (!prItem) return errorResponse(res, `Item ${sel.id} not found in this PR`, 400);
      const remaining = parseFloat(prItem.quantity) - parseFloat(prItem.converted_qty || 0);
      if (remaining <= 0) return errorResponse(res, `Item "${prItem.description}" is already fully converted`, 400);
      if (parseFloat(sel.po_qty) <= 0) return errorResponse(res, `PO quantity must be greater than 0`, 400);
      if (parseFloat(sel.po_qty) > remaining) return errorResponse(res, `PO qty (${sel.po_qty}) exceeds remaining PR qty (${remaining}) for "${prItem.description}"`, 400);
    }

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('PO');
      const p = pr.rows[0];
      let subtotal = 0;

      const po = await client.query(
        `INSERT INTO pur_purchase_orders (doc_number, company_id, vendor_id, plant_id, payment_term_id, currency, subtotal, total_amount, description, status, requisition_id, created_by)
         VALUES ($1,$2,$3,$4,$5,'INR',0,0,$6,'draft',$7,$8) RETURNING *`,
        [docNumber, p.company_id, vendor_id, p.plant_id, payment_term_id, p.description, p.id, req.user.id]);

      let lineNum = 0;
      for (const sel of selected_items) {
        const prItem = allItems.rows.find(i => i.id === sel.id);
        lineNum++;
        const qty = parseFloat(sel.po_qty);
        const price = parseFloat(sel.unit_price ?? prItem.estimated_price ?? 0);
        const lt = qty * price;
        subtotal += lt;
        const toUuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
        await client.query(
          `INSERT INTO pur_po_items (po_id, line_number, material_id, description, quantity, uom_id, unit_price, total_amount, plant_id, storage_location_id, hsn_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [po.rows[0].id, lineNum, toUuid(prItem.material_id), prItem.description, qty, toUuid(prItem.uom_id), price, lt.toFixed(2), toUuid(prItem.plant_id), toUuid(prItem.storage_location_id), prItem.hsn_code||null]);

        // Update converted_qty on PR item
        await client.query(`UPDATE pur_requisition_items SET converted_qty = COALESCE(converted_qty,0) + $1 WHERE id = $2`, [qty, sel.id]);
      }

      await client.query(`UPDATE pur_purchase_orders SET subtotal = $1, total_amount = $1 WHERE id = $2`, [subtotal.toFixed(2), po.rows[0].id]);

      // Check if ALL items are fully converted → mark PR completed
      const remaining = await client.query(
        `SELECT COUNT(*) FROM pur_requisition_items WHERE requisition_id = $1 AND (quantity - COALESCE(converted_qty,0)) > 0.001`, [p.id]);
      if (parseInt(remaining.rows[0].count) === 0) {
        await client.query(`UPDATE pur_requisitions SET status='completed' WHERE id=$1`, [p.id]);
      }

      return po.rows[0];
    });
    successResponse(res, result, 'Converted to Purchase Order');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= PURCHASE ORDERS =========
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT po.*, bp.display_name as vendor_name, bp.bp_number,
               pr.doc_number as pr_number, rfq.doc_number as quotation_number
               FROM pur_purchase_orders po
               LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id
               LEFT JOIN pur_requisitions pr ON po.requisition_id = pr.id
               LEFT JOIN pur_rfq rfq ON po.rfq_id = rfq.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND po.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (po.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx} OR pr.doc_number ILIKE $${idx} OR rfq.doc_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY po.order_date DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get POs eligible for goods receipt (confirmed or partially received)
router.get('/orders/eligible-for-gr', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT po.*, bp.display_name as vendor_name, bp.bp_number,
              p.plant_code, p.plant_name,
              (SELECT COUNT(*) FROM pur_po_items pi WHERE pi.po_id = po.id) as item_count,
              COALESCE((SELECT SUM(pi.quantity) FROM pur_po_items pi WHERE pi.po_id = po.id), 0) as total_ordered,
              COALESCE((SELECT SUM(gi.quantity) FROM pur_gr_items gi
                JOIN pur_goods_receipts gr ON gi.gr_id = gr.id WHERE gr.po_id = po.id AND gr.status='completed'), 0) as total_received
       FROM pur_purchase_orders po
       LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id
       LEFT JOIN org_plants p ON po.plant_id = p.id
       WHERE po.status IN ('confirmed', 'partially_received')
       ORDER BY po.order_date DESC`);

    const eligible = result.rows.filter(po => parseFloat(po.total_received) < parseFloat(po.total_ordered));
    successResponse(res, eligible);
  } catch (err) { errorResponse(res, err.message); }
});

// PRs available for direct PO creation (only those with unconverted items)
router.get('/orders/source-prs', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT pr.id, pr.doc_number, pr.required_date, pr.total_amount, pr.description, pr.status,
              pr.doc_type, p.plant_code, p.plant_name, pr.plant_id,
              (SELECT COUNT(*) FROM pur_requisition_items pi WHERE pi.requisition_id = pr.id
                AND (pi.quantity - COALESCE(pi.converted_qty, 0)) > 0.001) as open_item_count
       FROM pur_requisitions pr LEFT JOIN org_plants p ON pr.plant_id = p.id
       WHERE pr.status IN ('approved')
         AND EXISTS (SELECT 1 FROM pur_requisition_items pi WHERE pi.requisition_id = pr.id
                     AND (pi.quantity - COALESCE(pi.converted_qty, 0)) > 0.001)
       ORDER BY pr.created_at DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get PR items for PO auto-fill (only unconverted items with remaining qty)
router.get('/orders/source-pr/:prId', authenticate, async (req, res) => {
  try {
    const pr = await query(`SELECT pr.*, p.plant_code, p.plant_name FROM pur_requisitions pr LEFT JOIN org_plants p ON pr.plant_id = p.id WHERE pr.id = $1`, [req.params.prId]);
    if (!pr.rows.length) return errorResponse(res, 'PR not found', 404);
    const items = await query(
      `SELECT pi.*, pi.converted_qty, m.material_code, m.material_name, m.hsn_code, m.gst_rate, m.standard_price, u.uom_code,
              p2.plant_code, p2.plant_name, sl.sloc_code,
              (pi.quantity - COALESCE(pi.converted_qty, 0)) as remaining_qty
       FROM pur_requisition_items pi LEFT JOIN mm_materials m ON pi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON pi.uom_id = u.id
       LEFT JOIN org_plants p2 ON pi.plant_id = p2.id
       LEFT JOIN org_storage_locations sl ON pi.storage_location_id = sl.id
       WHERE pi.requisition_id = $1
         AND (pi.quantity - COALESCE(pi.converted_qty, 0)) > 0.001
       ORDER BY pi.line_number`, [req.params.prId]);
    successResponse(res, { pr: pr.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const header = await query(
      `SELECT po.*, bp.display_name as vendor_name, bp.bp_number, bp.email as vendor_email,
              bp.address_line1 as vendor_address, bp.city as vendor_city, bp.country as vendor_country,
              pt.term_name as payment_term, c.company_name, c.address_line1 as company_address,
              c.city as company_city, c.country as company_country, c.phone as company_phone
       FROM pur_purchase_orders po
       LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id
       LEFT JOIN fi_payment_terms pt ON po.payment_term_id = pt.id
       LEFT JOIN org_companies c ON po.company_id = c.id
       WHERE po.id = $1`, [req.params.id]);
    if (!header.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT pi.*, m.material_code, m.material_name, u.uom_code
       FROM pur_po_items pi LEFT JOIN mm_materials m ON pi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON pi.uom_id = u.id WHERE pi.po_id = $1 ORDER BY pi.line_number`, [req.params.id]);
    successResponse(res, { ...header.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/orders', authenticate, async (req, res) => {
  try {
    const { vendor_id, plant_id, delivery_date, payment_term_id, description, notes, items, rfq_id, requisition_id, cost_center_id, project_id, doc_type } = req.body;
    if (!vendor_id || !items?.length) return errorResponse(res, 'Vendor and items required', 400);
    
    // BUG #10 FIX: Verify vendor is approved before creating purchase order
    const vendorCheck = await query(
      `SELECT id, status FROM bp_business_partners WHERE id = $1 AND bp_category = 'vendor'`,
      [vendor_id]
    );
    if (!vendorCheck.rows.length) return errorResponse(res, 'Vendor not found', 400);
    if (vendorCheck.rows[0].status !== 'active' && vendorCheck.rows[0].status !== 'approved') {
      return errorResponse(res, `Cannot create PO: Vendor status is "${vendorCheck.rows[0].status}" (must be "active" or "approved")`, 403);
    }
    
    // Budget check per GL account
    if (cost_center_id) {
      const glGroups = {};
      for (const it of items) {
        const gl = it.gl_account_id || 'none';
        const disc = parseFloat(it.discount_percent || 0);
        const amt = parseFloat(it.quantity || 0) * parseFloat(it.unit_price || 0) * (1 - disc/100);
        glGroups[gl] = (glGroups[gl] || 0) + amt;
      }
      for (const [gl, amt] of Object.entries(glGroups)) {
        const budgetIssue = await checkBudget(null, { cost_center_id, gl_account_id: gl === 'none' ? null : gl, amount: amt, fiscal_year: new Date().getFullYear() });
        if (budgetIssue?.exceeded) return errorResponse(res, budgetIssue.message, 400);
      }
    }

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('PO');
      const toUuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
      const compRes = await client.query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
      const compId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;
      const plantId = plant_id || (await client.query(`SELECT id FROM org_plants WHERE is_active=true LIMIT 1`)).rows[0]?.id;
      let subtotal = toDec(0), taxTotal = toDec(0);
      for (const it of items) {
        const lt = toDec(it.quantity).times(toDec(it.unit_price)).times(toDec(1).minus(toDec(it.discount_percent || 0).dividedBy(100)));
        subtotal = subtotal.plus(lt);
        taxTotal = taxTotal.plus(lt.times(toDec(it.tax_rate || 0).dividedBy(100)));
      }
      const po = await client.query(
        `INSERT INTO pur_purchase_orders (doc_number, company_id, vendor_id, plant_id, delivery_date, payment_term_id, currency, subtotal, tax_amount, total_amount, description, notes, requisition_id, rfq_id, cost_center_id, project_id, doc_type, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'INR',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'draft',$17) RETURNING *`,
        [docNumber, compId, toUuid(vendor_id), toUuid(plantId), delivery_date||null, toUuid(payment_term_id), decRound(subtotal), decRound(taxTotal), decRound(subtotal.plus(taxTotal)), description||'', notes||'', toUuid(requisition_id), toUuid(rfq_id), toUuid(cost_center_id), toUuid(project_id), doc_type||'goods', req.user.id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const lt = decRound(toDec(it.quantity).times(toDec(it.unit_price)).times(toDec(1).minus(toDec(it.discount_percent || 0).dividedBy(100))));
        const tax = decRound(toDec(lt).times(toDec(it.tax_rate || 0).dividedBy(100)));
        await client.query(
          `INSERT INTO pur_po_items (po_id, line_number, material_id, description, quantity, uom_id, unit_price, discount_percent, delivery_date, gst_rate, tax_amount, total_amount, plant_id, storage_location_id, hsn_code, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [po.rows[0].id, i + 1, toUuid(it.material_id), it.description, it.quantity, toUuid(it.uom_id), it.unit_price, parseFloat(it.discount_percent || 0), it.delivery_date||null, parseFloat(it.tax_rate||0), tax, lt, toUuid(it.plant_id), toUuid(it.storage_location_id), it.hsn_code||null, toUuid(it.gl_account_id)]);
      }
      // Mark quotation as converted
      if (rfq_id) await client.query(`UPDATE pur_rfq SET status='completed' WHERE id=$1`, [rfq_id]);

      // Update converted_qty on PR items when PO is created from PR
      if (requisition_id) {
        // BUG #11 FIX: Use SELECT FOR UPDATE to lock PR items during conversion
        const prItems = (await client.query(
          `SELECT * FROM pur_requisition_items WHERE requisition_id = $1 ORDER BY line_number FOR UPDATE`,
          [requisition_id]
        )).rows;
        for (const poItem of items) {
          // Match PR item by material_id + description
          const prItem = prItems.find(pi =>
            (pi.material_id && poItem.material_id && pi.material_id === poItem.material_id) ||
            (pi.description === poItem.description)
          );
          if (prItem) {
            const poQty = parseFloat(poItem.quantity || 0);
            const remaining = parseFloat(prItem.quantity) - parseFloat(prItem.converted_qty || 0);
            const updateQty = Math.min(poQty, remaining);
            if (updateQty > 0) {
              await client.query(`UPDATE pur_requisition_items SET converted_qty = COALESCE(converted_qty,0) + $1 WHERE id = $2`, [updateQty, prItem.id]);
              prItem.converted_qty = (parseFloat(prItem.converted_qty || 0) + updateQty);
            }
          }
        }
        // Check if ALL items are fully converted → mark PR completed
        const openItems = (await client.query(
          `SELECT COUNT(*) FROM pur_requisition_items WHERE requisition_id = $1 AND (quantity - COALESCE(converted_qty,0)) > 0.001`, [requisition_id])).rows[0];
        if (parseInt(openItems.count) === 0) {
          await client.query(`UPDATE pur_requisitions SET status='completed' WHERE id=$1`, [requisition_id]);
        }
      }

      return po.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'purchase_order', result.id, null, { doc_number: result.doc_number }, req);
    // Rule engine — fire notifications and check approval rules (non-blocking)
    await fireNotificationRules('purchase_order', result.id, 'on_create', result, req.user.id);
    await triggerApprovalRules('purchase_order', result.id, result, req.user.id);
    successResponse(res, result, 'Purchase order created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// UPDATE purchase order (draft or rejected)
router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const { delivery_date, description, notes, payment_term_id, vendor_id, cost_center_id, project_id, items } = req.body;
    const existing = await query(`SELECT * FROM pur_purchase_orders WHERE id=$1 AND status IN ('draft','rejected')`, [req.params.id]);
    if (!existing.rows.length) return errorResponse(res, 'Not found or not editable (only draft/rejected orders can be edited)', 404);
    const toUuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await transaction(async (client) => {
      await client.query(
        `UPDATE pur_purchase_orders SET delivery_date=COALESCE($1,delivery_date), description=COALESCE($2,description),
         notes=COALESCE($3,notes), payment_term_id=COALESCE($4,payment_term_id),
         vendor_id=COALESCE($5,vendor_id), cost_center_id=$6, project_id=$7 WHERE id=$8`,
        [delivery_date||null, description, notes, toUuid(payment_term_id), toUuid(vendor_id), toUuid(cost_center_id), toUuid(project_id), req.params.id]);
      if (items && items.length > 0) {
        await client.query(`DELETE FROM pur_po_items WHERE po_id=$1`, [req.params.id]);
        let subtotal = 0, taxTotal = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const disc = parseFloat(it.discount_percent || 0);
          const lt = parseFloat(it.quantity) * parseFloat(it.unit_price) * (1 - disc/100);
          const tax = lt * (parseFloat(it.tax_rate || 0) / 100);
          subtotal += lt; taxTotal += tax;
          await client.query(
            `INSERT INTO pur_po_items (po_id, line_number, material_id, description, quantity, uom_id, unit_price, discount_percent, delivery_date, gst_rate, tax_amount, total_amount, plant_id, storage_location_id, hsn_code, gl_account_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [req.params.id, i+1, toUuid(it.material_id), it.description, it.quantity, toUuid(it.uom_id), it.unit_price, disc, it.delivery_date||null, parseFloat(it.tax_rate||0), tax.toFixed(2), lt.toFixed(2), toUuid(it.plant_id), toUuid(it.storage_location_id), it.hsn_code||null, toUuid(it.gl_account_id)]);
        }
        await client.query(
          `UPDATE pur_purchase_orders SET subtotal=$1, tax_amount=$2, total_amount=$3 WHERE id=$4`,
          [subtotal.toFixed(2), taxTotal.toFixed(2), (subtotal+taxTotal).toFixed(2), req.params.id]);
      }
      return (await client.query(`SELECT * FROM pur_purchase_orders WHERE id=$1`, [req.params.id])).rows[0];
    });
    successResponse(res, result, 'Purchase order updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/orders/:id/confirm', authenticate, async (req, res) => {
  try {
    // Validate PO has at least one item before confirming
    const itemCount = await query(`SELECT COUNT(*) as cnt FROM pur_po_items WHERE po_id = $1`, [req.params.id]);
    if (parseInt(itemCount.rows[0].cnt) === 0) {
      return errorResponse(res, 'Cannot confirm PO — no line items exist on this purchase order', 400);
    }
    const r = await query(
      `UPDATE pur_purchase_orders SET status='confirmed', approved_by=$1, approved_at=NOW() WHERE id=$2 AND status='draft' RETURNING *`,
      [req.user.id, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'PO not found or not in draft status', 400);
    successResponse(res, r.rows[0], 'Purchase order confirmed');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= GOODS RECEIPTS =========
router.get('/goods-receipts', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT gr.*, bp.display_name as vendor_name, po.doc_number as po_number,
               COALESCE(gr.doc_type, po.doc_type, 'goods') as doc_type,
               p.plant_code, p.plant_name,
               (SELECT COUNT(*) FROM pur_gr_items gi WHERE gi.gr_id = gr.id) as item_count,
               (SELECT COALESCE(SUM(gi.quantity),0) FROM pur_gr_items gi WHERE gi.gr_id = gr.id) as total_qty
               FROM pur_goods_receipts gr
               LEFT JOIN bp_business_partners bp ON gr.vendor_id = bp.id
               LEFT JOIN pur_purchase_orders po ON gr.po_id = po.id
               LEFT JOIN org_plants p ON gr.plant_id = p.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND gr.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (gr.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY gr.receipt_date DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// GET GR detail with items
router.get('/goods-receipts/:id', authenticate, async (req, res) => {
  try {
    const header = await query(
      `SELECT gr.*, bp.display_name as vendor_name, po.doc_number as po_number,
              COALESCE(gr.doc_type, po.doc_type, 'goods') as doc_type,
              p.plant_code, p.plant_name
       FROM pur_goods_receipts gr
       LEFT JOIN bp_business_partners bp ON gr.vendor_id = bp.id
       LEFT JOIN pur_purchase_orders po ON gr.po_id = po.id
       LEFT JOIN org_plants p ON gr.plant_id = p.id
       WHERE gr.id = $1`, [req.params.id]);
    if (!header.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT gi.*, m.material_code, m.material_name, u.uom_code, sl.sloc_code, sl.sloc_name,
              poi.description as po_item_description, poi.hsn_code
       FROM pur_gr_items gi
       LEFT JOIN mm_materials m ON gi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON gi.uom_id = u.id
       LEFT JOIN org_storage_locations sl ON gi.sloc_id = sl.id
       LEFT JOIN pur_po_items poi ON gi.po_item_id = poi.id
       WHERE gi.gr_id = $1 ORDER BY gi.id`, [req.params.id]);
    successResponse(res, { ...header.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// Get PO items pending receipt (for the GR creation form)
router.get('/orders/:id/pending-items', authenticate, async (req, res) => {
  try {
    const po = await query(
      `SELECT po.*, bp.display_name as vendor_name, p.plant_code, p.plant_name
       FROM pur_purchase_orders po
       LEFT JOIN bp_business_partners bp ON po.vendor_id = bp.id
       LEFT JOIN org_plants p ON po.plant_id = p.id
       WHERE po.id = $1`, [req.params.id]);
    if (!po.rows.length) return errorResponse(res, 'PO not found', 404);

    // Get PO items with already-received quantities from completed GRs only
    const items = await query(
      `SELECT pi.*, m.material_code, m.material_name, u.uom_code, m.base_uom_id,
              COALESCE(pi.hsn_code, m.hsn_code) as hsn_code,
              COALESCE(NULLIF(pi.gst_rate, 0), m.gst_rate, 0) as gst_rate,
              m.is_batch_managed,
              COALESCE(rcv.received_qty, 0) as received_qty,
              (pi.quantity - COALESCE(rcv.received_qty, 0)) as pending_qty
       FROM pur_po_items pi
       LEFT JOIN mm_materials m ON pi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON pi.uom_id = u.id
       LEFT JOIN (
         SELECT gi.po_item_id, SUM(gi.quantity) as received_qty
         FROM pur_gr_items gi
         JOIN pur_goods_receipts gr ON gi.gr_id = gr.id
         WHERE gr.status = 'completed'
         GROUP BY gi.po_item_id
       ) rcv ON rcv.po_item_id = pi.id
       WHERE pi.po_id = $1
       AND (pi.quantity - COALESCE(rcv.received_qty, 0)) > 0
       ORDER BY pi.line_number`, [req.params.id]);

    // Get storage locations for this plant
    const slocs = await query(
      `SELECT sl.* FROM org_storage_locations sl WHERE sl.plant_id = $1 AND sl.is_active = true ORDER BY sl.sloc_code`,
      [po.rows[0].plant_id]);

    successResponse(res, {
      po: po.rows[0],
      items: items.rows,
      storage_locations: slocs.rows
    });
  } catch (err) { errorResponse(res, err.message); }
});

// CREATE Goods Receipt — creates GR items, stock movements, updates inv_stock, creates AP Invoice
router.post('/goods-receipts', authenticate, async (req, res) => {
  try {
    const { po_id, items } = req.body;
    if (!po_id) return errorResponse(res, 'Purchase order required', 400);
    if (!items?.length) return errorResponse(res, 'At least one item required', 400);

    const po = await query(`SELECT * FROM pur_purchase_orders WHERE id = $1`, [po_id]);
    if (!po.rows.length) return errorResponse(res, 'PO not found', 404);
    if (!['confirmed', 'partially_received'].includes(po.rows[0].status)) {
      return errorResponse(res, 'PO must be confirmed before goods receipt', 400);
    }

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('GR');
      const p = po.rows[0];

      // Create GR header
      const gr = await client.query(
        `INSERT INTO pur_goods_receipts (doc_number, company_id, po_id, vendor_id, plant_id, doc_type, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'completed',$7) RETURNING *`,
        [docNumber, p.company_id, po_id, p.vendor_id, p.plant_id, p.doc_type||'goods', req.user.id]);

      const smDocNumber = await getNextNumber('SM');
      let grSubtotal = 0;

      // Process each item: create GR item + stock movement + update stock
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemDesc = item.description || item.material_name || '';
        if ((!item.material_id && !itemDesc) || !item.quantity || parseFloat(item.quantity) <= 0) continue;
        const isService = (p.doc_type || 'goods') === 'service';
        if (!isService && !item.sloc_id) throw new Error(`Storage location is required for ${item.material_name || 'item ' + (i+1)}`);

        const qty = parseFloat(item.quantity);

        // Validate: cannot receive more than PO ordered qty minus already received (with tolerance)
        if (item.po_item_id) {
          const poItem = await client.query(`SELECT quantity FROM pur_po_items WHERE id = $1`, [item.po_item_id]);
          const received = await client.query(
            `SELECT COALESCE(SUM(gi.quantity), 0) as total FROM pur_gr_items gi
             JOIN pur_goods_receipts gr ON gi.gr_id = gr.id
             WHERE gi.po_item_id = $1 AND gr.status = 'completed'`, [item.po_item_id]);
          const orderedQty = parseFloat(poItem.rows[0]?.quantity || 0);
          const alreadyReceived = parseFloat(received.rows[0]?.total || 0);
          const grTolerance = await getConfigNum('procurement.gr_qty_tolerance_percent', 0);
          const maxAllowed = (orderedQty - alreadyReceived) * (1 + grTolerance / 100);
          if (qty > maxAllowed) throw new Error(`Cannot receive ${qty} for ${item.material_name || 'item'} — max allowed is ${maxAllowed.toFixed(3)} including ${grTolerance}% tolerance (ordered: ${orderedQty}, already received: ${alreadyReceived})`);

          // Partial GR check
          const allowPartialGr = await getConfigBool('procurement.allow_partial_gr', true);
          if (!allowPartialGr && qty < (orderedQty - alreadyReceived)) {
            throw new Error(`Partial goods receipt not allowed. Must receive full quantity: ${(orderedQty - alreadyReceived).toFixed(3)} for ${item.material_name || 'item'}`);
          }
        }

        const unitPrice = parseFloat(item.unit_price || 0);
        grSubtotal += qty * unitPrice;
        const toUuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

        // 1. Create GR line item
        // Get gl_account_id from request or from PO item
        let glAccId = toUuid(item.gl_account_id);
        if (!glAccId && item.po_item_id) {
          const poiGl = await client.query(`SELECT gl_account_id FROM pur_po_items WHERE id = $1`, [item.po_item_id]);
          glAccId = poiGl.rows[0]?.gl_account_id || null;
        }
        await client.query(
          `INSERT INTO pur_gr_items (gr_id, po_item_id, material_id, quantity, uom_id, batch_number, sloc_id, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [gr.rows[0].id, item.po_item_id, toUuid(item.material_id), qty, toUuid(item.uom_id), item.batch_number || null, toUuid(item.sloc_id), glAccId]);

        // 2 & 3. Stock movement + inventory update — only for goods (services have no physical stock)
        if (!isService && item.material_id) {
          await client.query(
            `INSERT INTO inv_stock_movements (doc_number, line_number, movement_type, material_id, plant_id, sloc_id,
              batch_number, quantity, uom_id, reference_type, reference_id, created_by)
             VALUES ($1,$2,'receipt',$3,$4,$5,$6,$7,$8,'goods_receipt',$9,$10)`,
            [smDocNumber, i + 1, item.material_id, p.plant_id, item.sloc_id,
             item.batch_number || null, qty, item.uom_id, gr.rows[0].id, req.user.id]);

          const existing = await client.query(
            `SELECT id, quantity FROM inv_stock WHERE material_id=$1 AND plant_id=$2 AND sloc_id=$3`,
            [item.material_id, p.plant_id, item.sloc_id]);

          if (existing.rows.length) {
            await client.query(
              `UPDATE inv_stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
              [qty, existing.rows[0].id]);
          } else {
            await client.query(
              `INSERT INTO inv_stock (material_id, plant_id, sloc_id, quantity) VALUES ($1,$2,$3,$4)`,
              [item.material_id, p.plant_id, item.sloc_id, qty]);
          }
        }
      }

      // Check if PO is fully received
      const pendingCheck = await client.query(
        `SELECT pi.id, pi.quantity,
                COALESCE((SELECT SUM(gi.quantity) FROM pur_gr_items gi
                  JOIN pur_goods_receipts g ON gi.gr_id = g.id WHERE gi.po_item_id = pi.id AND g.status='completed'), 0) as received
         FROM pur_po_items pi WHERE pi.po_id = $1`, [po_id]);

      const allReceived = pendingCheck.rows.every(r => parseFloat(r.received) >= parseFloat(r.quantity));
      const someReceived = pendingCheck.rows.some(r => parseFloat(r.received) > 0);

      if (allReceived) {
        await client.query(`UPDATE pur_purchase_orders SET status='completed' WHERE id=$1`, [po_id]);
      } else if (someReceived) {
        await client.query(`UPDATE pur_purchase_orders SET status='partially_received' WHERE id=$1`, [po_id]);
      }

      // ============ AUTO-CREATE AP INVOICE FOR THIS GR ============
      const compRow = (await client.query(`SELECT state, tax_id FROM org_companies WHERE id = $1`, [p.company_id])).rows[0];
      const vendRow = (await client.query(`SELECT state, gstin, display_name FROM bp_business_partners WHERE id = $1`, [p.vendor_id])).rows[0];
      
      const GSTIN_STATE_MAP = {'01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','27':'Maharashtra','29':'Karnataka','30':'Goa','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','36':'Telangana','37':'Andhra Pradesh'};
      
      const vendGstin = vendRow?.gstin || '';
      
      // BP master state field is primary, GSTIN is fallback
      let compSt = (compRow?.state || '').trim();
      let vendSt = (vendRow?.state || '').trim();
      // Fallback to GSTIN only if state field is empty
      if (!compSt && compRow?.tax_id?.length >= 2) compSt = GSTIN_STATE_MAP[compRow.tax_id.substring(0,2)] || '';
      if (!vendSt && vendGstin.length >= 2) vendSt = GSTIN_STATE_MAP[vendGstin.substring(0,2)] || '';
      
      // Compare: strip non-alpha for robust matching (handles "33-Tamil Nadu" vs "Tamil Nadu")
      const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
      const sameState = compSt && vendSt && normalize(compSt) === normalize(vendSt);
      const placeOfSupply = vendSt || compSt || '';
      
      console.log(`GR GST:`, { compSt, vendSt, vendGstin, sameState, placeOfSupply });

      let grCgst = 0, grSgst = 0, grIgst = 0;

      if (grSubtotal > 0) {
        const apDocNumber = await getNextNumber('API');

        // Calculate tax per item with multi-level gst_rate fallback
        const apItems = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.material_id || !item.quantity || parseFloat(item.quantity) <= 0) continue;
          const qty = parseFloat(item.quantity);
          const up = parseFloat(item.unit_price || 0);
          const lineAmt = qty * up;

          // GST rate: request body → PO item → reverse-calc → material master
          let gstRate = parseFloat(item.gst_rate || 0);
          if (gstRate === 0 && item.po_item_id) {
            const pit = (await client.query(`SELECT gst_rate, tax_amount, total_amount FROM pur_po_items WHERE id=$1`, [item.po_item_id])).rows[0];
            if (pit) {
              gstRate = parseFloat(pit.gst_rate || 0);
              if (gstRate === 0 && parseFloat(pit.tax_amount) > 0 && parseFloat(pit.total_amount) > 0)
                gstRate = Math.round((parseFloat(pit.tax_amount) / parseFloat(pit.total_amount)) * 100 * 100) / 100;
            }
          }
          if (gstRate === 0 && item.material_id) {
            gstRate = parseFloat((await client.query(`SELECT gst_rate FROM mm_materials WHERE id=$1`, [item.material_id])).rows[0]?.gst_rate || 0);
          }

          let cgstRate = 0, sgstRate = 0, igstRate = 0;
          let cgstAmt = 0, sgstAmt = 0, igstAmt = 0;

          if (sameState) {
            cgstRate = gstRate / 2; sgstRate = gstRate / 2;
            cgstAmt = lineAmt * cgstRate / 100; sgstAmt = lineAmt * sgstRate / 100;
          } else {
            igstRate = gstRate;
            igstAmt = lineAmt * igstRate / 100;
          }
          grCgst += cgstAmt; grSgst += sgstAmt; grIgst += igstAmt;
          apItems.push({ material_id: item.material_id, description: item.material_name || '', qty, up, lineAmt, hsn_code: item.hsn_code || '', cgstRate, sgstRate, igstRate, cgstAmt, sgstAmt, igstAmt });
        }

        const grTax = grCgst + grSgst + grIgst;
        const grTotal = grSubtotal + grTax;

        // Determine AP invoice status based on finance.auto_post_goods_receipt config
        const autoPostGR = await getConfigBool('finance.auto_post_goods_receipt', true);
        const apInvStatus = autoPostGR ? 'approved' : 'draft';

        // Create AP Invoice
        const apInv = await client.query(
          `INSERT INTO fi_ap_invoices (doc_number, company_id, vendor_id, invoice_date, due_date, posting_date,
            reference, description, currency, subtotal, tax_amount, total_amount, cgst_amount, sgst_amount, igst_amount,
            vendor_gstin, place_of_supply, paid_amount, status, po_reference, created_by)
           VALUES ($1,$2,$3,CURRENT_DATE,CURRENT_DATE + INTERVAL '30 days',CURRENT_DATE,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,$15,$16,$17)
           RETURNING *`,
          [apDocNumber, p.company_id, p.vendor_id, `GR:${docNumber}`,
           `AP Invoice for GR ${docNumber} (PO ${p.doc_number})${allReceived ? '' : ' - Partial'}`,
           p.currency || 'INR', grSubtotal, grTax, grTotal, grCgst, grSgst, grIgst, vendGstin, placeOfSupply, apInvStatus, po_id, req.user.id]);

        // AP Invoice line items with tax split
        for (let i = 0; i < apItems.length; i++) {
          const it = apItems[i];
          await client.query(
            `INSERT INTO fi_ap_invoice_items (invoice_id, line_number, material_id, description, quantity, unit_price, total_amount, hsn_code, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [apInv.rows[0].id, i+1, it.material_id, it.description, it.qty, it.up, it.lineAmt,
             it.hsn_code, it.cgstRate, it.sgstRate, it.igstRate, it.cgstAmt.toFixed(2), it.sgstAmt.toFixed(2), it.igstAmt.toFixed(2)]);
        }

        // ========== JOURNAL ENTRY (only when finance.auto_post_goods_receipt = true) ==========
        if (autoPostGR) {
          const jeDocNum = await getNextNumber('JE');
          const je = await client.query(
            `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description,
              currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
             VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,$4,$5,$6,$7,'posted',$8,$8,NOW()) RETURNING *`,
            [jeDocNum, p.company_id, `AP:${apDocNumber}`, `AP Invoice ${apDocNumber} — GR ${docNumber}`,
             p.currency || 'INR', grTotal, grTotal, req.user.id]);

          // Resolve GL accounts with fallback by name pattern
          const _gl = async (key, nameFallback) => {
            const r = await client.query(`SELECT gl_account_id FROM fi_gl_mapping WHERE mapping_key=$1 AND gl_account_id IS NOT NULL`, [key]);
            if (r.rows[0]?.gl_account_id) return r.rows[0].gl_account_id;
            if (nameFallback) {
              const fb = await client.query(`SELECT id FROM fi_gl_accounts WHERE (${nameFallback}) AND is_active=true LIMIT 1`);
              return fb.rows[0]?.id || null;
            }
            return null;
          };
          const invGl = await _gl('inventory_stock', "LOWER(account_name) LIKE '%stock%' OR LOWER(account_name) LIKE '%inventory%'");
          const apGl = await _gl('accounts_payable', "LOWER(account_name) LIKE '%creditor%' OR (LOWER(account_name) LIKE '%payable%' AND LOWER(account_name) NOT LIKE '%gst%' AND LOWER(account_name) NOT LIKE '%tax%')");
          const inputCgstGl = await _gl('input_cgst', "LOWER(account_name) LIKE '%input cgst%' OR LOWER(account_name) LIKE '%cgst input%'")
            || await _gl('input_gst', "LOWER(account_name) LIKE '%input gst%' OR LOWER(account_name) LIKE '%gst input%'");
          const inputSgstGl = await _gl('input_sgst', "LOWER(account_name) LIKE '%input sgst%' OR LOWER(account_name) LIKE '%sgst input%'")
            || inputCgstGl;
          const inputIgstGl = await _gl('input_igst', "LOWER(account_name) LIKE '%input igst%' OR LOWER(account_name) LIKE '%igst input%'")
            || await _gl('input_gst', "LOWER(account_name) LIKE '%input gst%' OR LOWER(account_name) LIKE '%gst input%'");

          console.log(`GR ${docNumber} GL:`, { invGl: invGl||'MISSING', apGl: apGl||'MISSING', inputCgstGl: inputCgstGl||'N/A', inputSgstGl: inputSgstGl||'N/A', inputIgstGl: inputIgstGl||'N/A', grSubtotal, grCgst, grSgst, grIgst, grTotal });

          let ln = 0;
          if (invGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, invGl, grSubtotal, `Stock — GR ${docNumber}`]); }
          if (grCgst > 0 && inputCgstGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, inputCgstGl, grCgst, `Input CGST — GR ${docNumber}`]); }
          if (grSgst > 0 && inputSgstGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, inputSgstGl, grSgst, `Input SGST — GR ${docNumber}`]); }
          if (grIgst > 0 && inputIgstGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, inputIgstGl, grIgst, `Input IGST — GR ${docNumber}`]); }
          if (apGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,0,$4,$5)`, [je.rows[0].id, ln, apGl, grTotal, `AP — ${apDocNumber}`]); }

          if (ln === 0) console.log('WARN: No GL lines created for GR', docNumber, '— check GL accounts and GL Mapping');
          await client.query(`UPDATE fi_ap_invoices SET journal_id = $1 WHERE id = $2`, [je.rows[0].id, apInv.rows[0].id]);
        }
      }

      return gr.rows[0];
    });

    await auditLog(req.user.id, 'CREATE', 'goods_receipt', result.id, null, { doc_number: result.doc_number, po_id, item_count: items.length }, req);
    successResponse(res, result, 'Goods receipt created — stock updated, AP invoice created', 201);
  } catch (err) { errorResponse(res, err.message); }
});


// ============================================
// SUPPLIER QUOTATIONS (between PR and PO)
// ============================================

// List all quotations
router.get('/quotations', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT q.*, bp.display_name as vendor_name, bp.bp_number,
               pr.doc_number as pr_number, pr.doc_type, p.plant_code, p.plant_name,
               pt.term_name as payment_term_name,
               (SELECT COUNT(*) FROM pur_rfq_items qi WHERE qi.rfq_id = q.id) as item_count
               FROM pur_rfq q
               LEFT JOIN bp_business_partners bp ON q.vendor_id = bp.id
               LEFT JOIN pur_requisitions pr ON q.requisition_id = pr.id
               LEFT JOIN org_plants p ON q.plant_id = p.id
               LEFT JOIN fi_payment_terms pt ON q.payment_term_id = pt.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND q.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (q.doc_number ILIKE $${idx} OR bp.display_name ILIKE $${idx} OR pr.doc_number ILIKE $${idx} OR q.status::text ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY q.created_at DESC`;
    let rows = (await query(sql, params)).rows;

    // Best quotation comparison: for each PR with multiple quotations, mark the lowest total
    const prGroups = {};
    rows.forEach(r => { if (r.requisition_id) { if (!prGroups[r.requisition_id]) prGroups[r.requisition_id] = []; prGroups[r.requisition_id].push(r); } });
    Object.values(prGroups).forEach(group => {
      if (group.length > 1) {
        const validQuotes = group.filter(g => g.status !== 'rejected');
        if (validQuotes.length > 1) {
          const best = validQuotes.reduce((a, b) => parseFloat(a.total_amount) <= parseFloat(b.total_amount) ? a : b);
          group.forEach(g => {
            g.comparison_count = validQuotes.length;
            g.is_best_quote = g.id === best.id;
            g.best_amount = parseFloat(best.total_amount);
            g.savings_pct = g.id !== best.id ? (((parseFloat(g.total_amount) - parseFloat(best.total_amount)) / parseFloat(g.total_amount)) * 100).toFixed(1) : null;
          });
        }
      }
    });

    successResponse(res, rows);
  } catch (err) { errorResponse(res, err.message); }
});

// STATIC routes BEFORE parameterized /:id
router.get('/quotations/source-prs', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT pr.id, pr.doc_number, pr.required_date, pr.total_amount, pr.description, pr.status, pr.doc_type,
              p.plant_code, p.plant_name, pr.plant_id,
              (SELECT COUNT(*) FROM pur_requisition_items pi WHERE pi.requisition_id = pr.id) as item_count
       FROM pur_requisitions pr LEFT JOIN org_plants p ON pr.plant_id = p.id
       WHERE pr.status IN ('approved')
         AND NOT EXISTS (
           SELECT 1 FROM pur_rfq q
           WHERE q.requisition_id = pr.id
           AND q.status NOT IN ('rejected','cancelled')
         )
       ORDER BY pr.created_at DESC LIMIT 50`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/quotations/source-pr/:prId', authenticate, async (req, res) => {
  try {
    const pr = await query(`SELECT pr.*, p.plant_code, p.plant_name FROM pur_requisitions pr LEFT JOIN org_plants p ON pr.plant_id = p.id WHERE pr.id = $1`, [req.params.prId]);
    if (!pr.rows.length) return errorResponse(res, 'PR not found', 404);
    const items = await query(
      `SELECT pi.*, m.material_code, m.material_name, m.hsn_code, m.gst_rate, m.standard_price, u.uom_code,
              pl.plant_code as item_plant_code, pl.plant_name as item_plant_name
       FROM pur_requisition_items pi LEFT JOIN mm_materials m ON pi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON pi.uom_id = u.id
       LEFT JOIN org_plants pl ON pi.plant_id = pl.id
       WHERE pi.requisition_id = $1 ORDER BY pi.line_number`, [req.params.prId]);
    successResponse(res, { pr: pr.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/quotations/eligible-for-po', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT q.*, bp.display_name as vendor_name, bp.bp_number, p.plant_code, p.plant_name,
              (SELECT COUNT(*) FROM pur_rfq_items qi WHERE qi.rfq_id = q.id) as item_count
       FROM pur_rfq q LEFT JOIN bp_business_partners bp ON q.vendor_id = bp.id
       LEFT JOIN org_plants p ON q.plant_id = p.id
       WHERE q.status = 'confirmed' ORDER BY q.created_at DESC`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Parameterized routes AFTER static
router.get('/quotations/:id', authenticate, async (req, res) => {
  try {
    const q = await query(
      `SELECT q.*, bp.display_name as vendor_name, bp.bp_number, bp.gstin as vendor_gstin,
              pr.doc_number as pr_number, p.plant_code, p.plant_name
       FROM pur_rfq q LEFT JOIN bp_business_partners bp ON q.vendor_id = bp.id
       LEFT JOIN pur_requisitions pr ON q.requisition_id = pr.id
       LEFT JOIN org_plants p ON q.plant_id = p.id WHERE q.id = $1`, [req.params.id]);
    if (!q.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT qi.*, m.material_code, m.material_name, u.uom_code, m.hsn_code as mat_hsn
       FROM pur_rfq_items qi LEFT JOIN mm_materials m ON qi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON qi.uom_id = u.id
       WHERE qi.rfq_id = $1 ORDER BY qi.line_number`, [req.params.id]);
    successResponse(res, { ...q.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/quotations/:id/for-po', authenticate, async (req, res) => {
  try {
    const q = await query(`SELECT q.*, bp.display_name as vendor_name, bp.id as vendor_id FROM pur_rfq q LEFT JOIN bp_business_partners bp ON q.vendor_id = bp.id WHERE q.id = $1`, [req.params.id]);
    if (!q.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT qi.*, m.material_code, m.material_name, m.hsn_code as mat_hsn, u.uom_code
       FROM pur_rfq_items qi LEFT JOIN mm_materials m ON qi.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON qi.uom_id = u.id
       WHERE qi.rfq_id = $1 ORDER BY qi.line_number`, [req.params.id]);
    successResponse(res, { quotation: q.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// Create quotation
router.post('/quotations', authenticate, async (req, res) => {
  try {
    const q = req.body;
    if (!q.vendor_id) return errorResponse(res, 'Vendor is required', 400);
    if (!q.items?.length) return errorResponse(res, 'At least one item required', 400);

    const result = await transaction(async (client) => {
      const docNum = await getNextNumber('RFQ');
      const compRes = await client.query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id=c.id WHERE u.id=$1`, [req.user.id]);
      const compId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

      let subtotal = 0;
      for (const it of q.items) {
        subtotal += (parseFloat(it.quantity)||0) * (parseFloat(it.unit_price)||0) * (1 - (parseFloat(it.discount_percent)||0)/100);
      }
      const taxAmt = subtotal * (parseFloat(q.tax_rate)||18) / 100;

      const h = await client.query(
        `INSERT INTO pur_rfq (doc_number, company_id, requisition_id, vendor_id, plant_id, rfq_date, response_date,
          description, currency, subtotal, tax_amount, total_amount, validity_date, payment_terms, delivery_terms, notes, doc_type, payment_term_id, cost_center_id, project_id, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'draft',$21) RETURNING *`,
        [docNum, compId, q.requisition_id||null, q.vendor_id, q.plant_id||null,
         q.rfq_date||new Date(), q.response_date, q.description,
         q.currency||'INR', subtotal.toFixed(2), taxAmt.toFixed(2), (subtotal+taxAmt).toFixed(2),
         q.validity_date, q.payment_terms, q.delivery_terms, q.notes, q.doc_type||'goods', q.payment_term_id||null, q.cost_center_id||null, q.project_id||null, req.user.id]);

      for (let i = 0; i < q.items.length; i++) {
        const it = q.items[i];
        const qty = parseFloat(it.quantity)||0;
        const price = parseFloat(it.unit_price)||0;
        const disc = parseFloat(it.discount_percent)||0;
        const lineAmt = qty * price * (1 - disc/100);
        await client.query(
          `INSERT INTO pur_rfq_items (rfq_id, pr_item_id, line_number, material_id, description, quantity, uom_id,
            unit_price, discount_percent, tax_rate, total_amount, delivery_date, hsn_code, remarks, plant_id, storage_location_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [h.rows[0].id, it.pr_item_id||null, i+1, it.material_id||null, it.description,
           qty, it.uom_id||null, price, disc, parseFloat(it.tax_rate)||0,
           lineAmt.toFixed(2), it.delivery_date, it.hsn_code, it.remarks, it.plant_id||null, it.storage_location_id||null]);
      }
      return h.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'supplier_quotation', result.id, null, { doc_number: result.doc_number }, req);
    successResponse(res, result, 'Supplier quotation created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/quotations/:id/confirm', authenticate, async (req, res) => {
  try {
    // Get the quotation to find its PR
    const rfq = await query(`SELECT requisition_id FROM pur_rfq WHERE id=$1`, [req.params.id]);
    
    // Confirm this quotation
    await query(`UPDATE pur_rfq SET status='confirmed' WHERE id=$1`, [req.params.id]);
    
    // Auto-reject all other draft quotations for the same PR
    if (rfq.rows[0]?.requisition_id) {
      const rejected = await query(
        `UPDATE pur_rfq SET status='rejected' WHERE requisition_id=$1 AND id != $2 AND status='draft' RETURNING doc_number`,
        [rfq.rows[0].requisition_id, req.params.id]);
      const rejCount = rejected.rows.length;
      successResponse(res, null, rejCount > 0 
        ? `Quotation confirmed — ${rejCount} other quotation(s) for the same PR auto-rejected`
        : 'Quotation confirmed');
    } else {
      successResponse(res, null, 'Quotation confirmed');
    }
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/quotations/:id/reject', authenticate, async (req, res) => {
  try { await query(`UPDATE pur_rfq SET status='rejected' WHERE id=$1`, [req.params.id]); successResponse(res, null, 'Quotation rejected'); }
  catch (err) { errorResponse(res, err.message); }
});

export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const checks = {
      'requisitions': { table: 'pur_requisitions', pre: ["DELETE FROM pur_requisition_items WHERE requisition_id = ANY($1::uuid[])"], status_check: 'draft' },
      'quotations': { table: 'pur_rfq', pre: ["DELETE FROM pur_rfq_items WHERE rfq_id = ANY($1::uuid[])"] },
      'purchase-orders': { table: 'pur_purchase_orders', deps: "SELECT COUNT(*) FROM pur_goods_receipts WHERE po_id = ANY($1::uuid[])", pre: ["DELETE FROM pur_po_items WHERE po_id = ANY($1::uuid[])"], status_check: 'draft' },
      'goods-receipts': { table: 'pur_goods_receipts', pre: ["DELETE FROM pur_gr_items WHERE gr_id = ANY($1::uuid[])"] },
    };
    const cfg = checks[entity];
    if (!cfg) return errorResponse(res, 'Unknown entity', 400);
    if (cfg.status_check) { const sc = await query(`SELECT COUNT(*) FROM ${cfg.table} WHERE id = ANY($1::uuid[]) AND status != $2`, [ids, cfg.status_check]); if (parseInt(sc.rows[0].count) > 0) return errorResponse(res, `Cannot delete — some items not in ${cfg.status_check} status`, 400); }
    if (cfg.deps) { const d = await query(cfg.deps, [ids]); if (parseInt(d.rows[0].count) > 0) return errorResponse(res, `Cannot delete — dependent records exist`, 400); }
    if (cfg.pre) { for (const sql of cfg.pre) await query(sql, [ids]); }
    const r = await query(`DELETE FROM ${cfg.table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
