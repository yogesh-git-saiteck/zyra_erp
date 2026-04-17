import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber } from '../utils/helpers.js';

const router = Router();
const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

// ===================================================
// BUDGET MANAGEMENT
// ===================================================
router.get('/budgets', authenticate, async (req, res) => {
  try {
    const { fiscal_year, company_id, cost_center_id } = req.query;
    let sql = `SELECT b.*, cc.cc_code, cc.cc_name, gl.account_code, gl.account_name, c.company_code,
               u.first_name || ' ' || u.last_name as created_by_name
               FROM fi_budgets b
               LEFT JOIN org_cost_centers cc ON b.cost_center_id = cc.id
               LEFT JOIN fi_gl_accounts gl ON b.gl_account_id = gl.id
               LEFT JOIN org_companies c ON b.company_id = c.id
               LEFT JOIN sys_users u ON b.created_by = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (fiscal_year) { sql += ` AND b.fiscal_year = $${idx++}`; params.push(fiscal_year); }
    if (company_id) { sql += ` AND b.company_id = $${idx++}`; params.push(company_id); }
    if (cost_center_id) { sql += ` AND b.cost_center_id = $${idx++}`; params.push(cost_center_id); }
    sql += ` ORDER BY b.fiscal_year DESC, cc.cc_code, gl.account_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/budgets', authenticate, async (req, res) => {
  try {
    const b = req.body;
    if (!b.fiscal_year || !b.cost_center_id) return errorResponse(res, 'Fiscal year and cost center required', 400);
    const annual = num(b.annual_amount) || (num(b.m1)+num(b.m2)+num(b.m3)+num(b.m4)+num(b.m5)+num(b.m6)+num(b.m7)+num(b.m8)+num(b.m9)+num(b.m10)+num(b.m11)+num(b.m12));
    const budgetName = b.budget_name || `Budget ${b.fiscal_year} — ${b.budget_type || 'annual'}`;
    const r = await query(
      `INSERT INTO fi_budgets (budget_name, company_id, cost_center_id, gl_account_id, fiscal_year, budget_type, budget_amount, annual_amount,
        m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12, notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [budgetName, uuid(b.company_id), b.cost_center_id, uuid(b.gl_account_id), b.fiscal_year, b.budget_type||'annual', annual,
       num(b.m1),num(b.m2),num(b.m3),num(b.m4),num(b.m5),num(b.m6),num(b.m7),num(b.m8),num(b.m9),num(b.m10),num(b.m11),num(b.m12),
       b.notes, 'draft', req.user.id]);
    successResponse(res, r.rows[0], 'Budget created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/budgets/:id/approve', authenticate, async (req, res) => {
  try {
    await query(`UPDATE fi_budgets SET status='approved', approved_by=$1 WHERE id=$2`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Budget approved');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/budgets/:id', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM fi_budgets WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Budget deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// Budget vs Actual comparison
router.get('/budget-vs-actual', authenticate, async (req, res) => {
  try {
    const { fiscal_year, company_id } = req.query;
    const fy = fiscal_year || new Date().getFullYear();

    const result = await query(
      `SELECT b.id, b.fiscal_year, COALESCE(b.annual_amount, b.budget_amount, 0) as budget,
              cc.cc_code, cc.cc_name, gl.account_code, gl.account_name,
              -- Actual = GR received amounts
              COALESCE((SELECT SUM(gri.quantity * COALESCE(poi.unit_price, 0))
                FROM pur_gr_items gri
                JOIN pur_goods_receipts gr ON gri.gr_id = gr.id
                JOIN pur_purchase_orders po ON gr.po_id = po.id
                LEFT JOIN pur_po_items poi ON gri.po_item_id = poi.id
                WHERE po.cost_center_id = b.cost_center_id
                AND (b.gl_account_id IS NULL OR COALESCE(gri.gl_account_id, poi.gl_account_id, b.gl_account_id) = b.gl_account_id)
                AND EXTRACT(YEAR FROM gr.created_at) = b.fiscal_year
              ), 0) as actual,
              -- Committed PR = only unconverted items
              COALESCE((SELECT SUM(
                pri.total_amount * (1 - LEAST(COALESCE(pri.converted_qty, 0) / NULLIF(pri.quantity, 0), 1))
              ) FROM pur_requisition_items pri
                JOIN pur_requisitions pr ON pri.requisition_id = pr.id
                WHERE pr.cost_center_id = b.cost_center_id AND pr.status IN ('approved','confirmed')
                AND (b.gl_account_id IS NULL OR COALESCE(pri.gl_account_id, b.gl_account_id) = b.gl_account_id)
                AND EXTRACT(YEAR FROM pr.created_at) = b.fiscal_year
                AND (pri.quantity - COALESCE(pri.converted_qty, 0)) > 0
              ), 0) as committed_pr,
              -- Committed PO = only un-GR'd portion
              COALESCE((SELECT SUM(poi.total_amount * (1 - LEAST(COALESCE(poi.received_qty,0)/NULLIF(poi.quantity,0), 1)))
                FROM pur_po_items poi
                JOIN pur_purchase_orders po ON poi.po_id = po.id
                WHERE po.cost_center_id = b.cost_center_id AND po.status NOT IN ('cancelled','draft')
                AND (b.gl_account_id IS NULL OR COALESCE(poi.gl_account_id, b.gl_account_id) = b.gl_account_id)
                AND EXTRACT(YEAR FROM po.created_at) = b.fiscal_year
                AND (poi.quantity - COALESCE(poi.received_qty, 0)) > 0
              ), 0) as committed_po
       FROM fi_budgets b
       LEFT JOIN org_cost_centers cc ON b.cost_center_id = cc.id
       LEFT JOIN fi_gl_accounts gl ON b.gl_account_id = gl.id
       WHERE b.fiscal_year = $1
       ${company_id ? ` AND b.company_id = '${company_id}'` : ''}
       ORDER BY cc.cc_code`, [fy]);

    const rows = result.rows.map(r => {
      const budget = parseFloat(r.budget || 0);
      const actual = parseFloat(r.actual || 0);
      const committed = parseFloat(r.committed_pr || 0) + parseFloat(r.committed_po || 0);
      const available = budget - committed;
      return {
        ...r, committed, available,
        variance: budget - actual,
        utilization_pct: budget > 0 ? ((actual / budget) * 100).toFixed(1) : 0,
        committed_pct: budget > 0 ? ((committed / budget) * 100).toFixed(1) : 0
      };
    });

    successResponse(res, rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Check budget before PO/PR creation
router.get('/budget-check', authenticate, async (req, res) => {
  try {
    const { cost_center_id, amount, fiscal_year } = req.query;
    if (!cost_center_id) return successResponse(res, { allowed: true, message: 'No cost center — budget check skipped' });

    const budget = await query(
      `SELECT SUM(annual_amount) as total_budget FROM fi_budgets WHERE cost_center_id=$1 AND fiscal_year=$2 AND status='approved'`,
      [cost_center_id, fiscal_year || new Date().getFullYear()]);
    const spent = await query(
      `SELECT COALESCE(SUM(jl.debit_amount),0) as total_spent FROM fi_journal_lines jl
       JOIN fi_journal_headers jh ON jl.header_id = jh.id
       WHERE jl.cost_center_id=$1 AND jh.status='posted' AND EXTRACT(YEAR FROM jh.posting_date)=$2`,
      [cost_center_id, fiscal_year || new Date().getFullYear()]);

    const budgetAmt = parseFloat(budget.rows[0]?.total_budget || 0);
    const spentAmt = parseFloat(spent.rows[0]?.total_spent || 0);
    const remaining = budgetAmt - spentAmt;
    const reqAmt = parseFloat(amount || 0);

    successResponse(res, {
      allowed: budgetAmt === 0 || remaining >= reqAmt,
      budget: budgetAmt, spent: spentAmt, remaining,
      message: remaining < reqAmt && budgetAmt > 0 ? `Budget exceeded! Budget: ₹${budgetAmt.toLocaleString()}, Spent: ₹${spentAmt.toLocaleString()}, Remaining: ₹${remaining.toLocaleString()}` : 'Within budget'
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ===================================================
// EXPENSE CLAIMS
// ===================================================
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const { status, employee_id } = req.query;
    let sql = `SELECT ec.*, e.first_name || ' ' || e.last_name as employee_name, e.employee_number,
               cc.cc_code, cc.cc_name
               FROM hr_expense_claims ec
               LEFT JOIN hr_employees e ON ec.employee_id = e.id
               LEFT JOIN org_cost_centers cc ON ec.cost_center_id = cc.id WHERE 1=1`;
    if (status) sql += ` AND ec.status = '${status}'`;
    if (employee_id) sql += ` AND ec.employee_id = '${employee_id}'`;
    sql += ` ORDER BY ec.created_at DESC`;
    successResponse(res, (await query(sql)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/expenses/:id', authenticate, async (req, res) => {
  try {
    const claim = await query(
      `SELECT ec.*, e.first_name || ' ' || e.last_name as employee_name, e.employee_number
       FROM hr_expense_claims ec LEFT JOIN hr_employees e ON ec.employee_id = e.id WHERE ec.id=$1`, [req.params.id]);
    if (!claim.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(`SELECT * FROM hr_expense_items WHERE claim_id=$1 ORDER BY line_number`, [req.params.id]);
    successResponse(res, { ...claim.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/expenses', authenticate, async (req, res) => {
  try {
    const ec = req.body;
    if (!ec.employee_id) return errorResponse(res, 'Employee required', 400);
    if (!ec.items?.length) return errorResponse(res, 'At least one expense item required', 400);

    const result = await transaction(async (client) => {
      const docNum = await getNextNumber('EXP');
      const compRes = await client.query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id=c.id WHERE u.id=$1`, [req.user.id]);
      const compId = compRes.rows[0]?.id || (await client.query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

      const totalAmt = ec.items.reduce((s, it) => s + num(it.amount), 0);
      const h = await client.query(
        `INSERT INTO hr_expense_claims (doc_number, company_id, employee_id, claim_date, description, total_amount, currency, cost_center_id, project_id, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [docNum, compId, ec.employee_id, ec.claim_date || new Date(), ec.description, totalAmt, ec.currency||'INR',
         uuid(ec.cost_center_id), uuid(ec.project_id), ec.notes, req.user.id]);

      for (let i = 0; i < ec.items.length; i++) {
        const it = ec.items[i];
        await client.query(
          `INSERT INTO hr_expense_items (claim_id, line_number, expense_date, expense_type, description, amount, receipt_number, is_billable, gl_account_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [h.rows[0].id, i+1, it.expense_date||new Date(), it.expense_type||'general', it.description, num(it.amount), it.receipt_number, it.is_billable||false, uuid(it.gl_account_id)]);
      }
      return h.rows[0];
    });
    successResponse(res, result, 'Expense claim created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/expenses/:id/approve', authenticate, async (req, res) => {
  try {
    const { approved_amount } = req.body;
    const claim = await query(`SELECT * FROM hr_expense_claims WHERE id=$1`, [req.params.id]);
    if (!claim.rows.length) return errorResponse(res, 'Not found', 404);

    await query(`UPDATE hr_expense_claims SET status='approved', approved_by=$1, approved_at=NOW(), approved_amount=$2 WHERE id=$3`,
      [req.user.id, approved_amount || claim.rows[0].total_amount, req.params.id]);

    // Create JE: Dr Expense, Cr Employee Payable
    try {
      const c = claim.rows[0];
      const amt = num(approved_amount) || num(c.total_amount);
      const jeDocNum = await getNextNumber('JE');
      const je = await query(
        `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description,
          currency, total_debit, total_credit, status, posted_by, posted_at, created_by)
         VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,$4,$5,$6,$6,'posted',$7,NOW(),$7) RETURNING *`,
        [jeDocNum, c.company_id, `EXP:${c.doc_number}`, `Expense claim ${c.doc_number} approved`, c.currency||'INR', amt, req.user.id]);

      const expAcct = await query(`SELECT id FROM fi_gl_accounts WHERE account_type='expense' LIMIT 1`);
      const payAcct = await query(`SELECT id FROM fi_gl_accounts WHERE account_type='liability' LIMIT 1`);
      if (expAcct.rows[0]?.id && payAcct.rows[0]?.id) {
        await query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description, cost_center_id)
           VALUES ($1,1,$2,$3,0,$4,$5), ($1,2,$6,0,$3,$7,NULL)`,
          [je.rows[0].id, expAcct.rows[0].id, amt, `Expense — ${c.doc_number}`, uuid(c.cost_center_id), payAcct.rows[0].id, `Payable — ${c.doc_number}`]);
      }
    } catch (jeErr) { console.log('Expense JE error:', jeErr.message); }

    successResponse(res, null, 'Expense claim approved — JE posted');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/expenses/:id/reject', authenticate, async (req, res) => {
  try {
    await query(`UPDATE hr_expense_claims SET status='rejected', approved_by=$1, approved_at=NOW(), notes=COALESCE(notes,'') || ' | Rejected: ' || $2 WHERE id=$3`,
      [req.user.id, req.body.reason || 'No reason', req.params.id]);
    successResponse(res, null, 'Expense claim rejected');
  } catch (err) { errorResponse(res, err.message); }
});

// ===================================================
// MRP ENGINE
// ===================================================
router.post('/mrp/run', authenticate, async (req, res) => {
  try {
    const { plant_id, planning_horizon_days } = req.body;
    const horizon = planning_horizon_days || 30;

    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id=c.id WHERE u.id=$1`, [req.user.id]);
    const compId = compRes.rows[0]?.id || (await query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;
    const plantFilter = plant_id || (await query(`SELECT id FROM org_plants WHERE is_active=true LIMIT 1`)).rows[0]?.id;

    const result = await transaction(async (client) => {
      // Create MRP run header
      const run = await client.query(
        `INSERT INTO pp_mrp_runs (company_id, plant_id, planning_horizon_days, run_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        [compId, plantFilter, horizon, req.user.id]);
      const runId = run.rows[0].id;

      // 1. Get all stocked materials for this plant
      const materials = await client.query(
        `SELECT m.id, m.material_code, m.material_name,
                COALESCE(s.qty, 0) as current_stock,
                COALESCE(mpd.reorder_point, 0) as reorder_point,
                COALESCE(mpd.safety_stock, 0) as safety_stock,
                COALESCE(mpd.lead_time_days, 0) as lead_time_days,
                COALESCE(mpd.min_lot_size, 1) as min_lot_size
         FROM mm_materials m
         LEFT JOIN (SELECT material_id, SUM(quantity) as qty FROM inv_stock WHERE plant_id=$1 GROUP BY material_id) s ON s.material_id = m.id
         LEFT JOIN mm_material_plant_data mpd ON mpd.material_id = m.id AND mpd.plant_id = $1
         WHERE m.is_active = true`, [plantFilter]);

      // 2. Get demand: open SO items + production orders requiring materials
      let totalDemand = 0, totalPlanned = 0, totalShortfalls = 0;

      for (const mat of materials.rows) {
        // Demand from open sales orders
        const soDemand = await client.query(
          `SELECT COALESCE(SUM(si.quantity), 0) as demand FROM sd_so_items si
           JOIN sd_sales_orders so ON si.so_id = so.id
           WHERE si.material_id = $1 AND so.status IN ('confirmed','in_process')
           AND so.delivery_date <= CURRENT_DATE + $2 * INTERVAL '1 day'`,
          [mat.id, horizon]);

        // Demand from production orders (BOM components)
        const prodDemand = await client.query(
          `SELECT COALESCE(SUM(bi.quantity * po.quantity), 0) as demand
           FROM pp_bom_items bi
           JOIN pp_bom_headers bh ON bi.bom_id = bh.id
           JOIN pp_production_orders po ON po.bom_id = bh.id
           WHERE bi.material_id = $1 AND po.status IN ('planned','released')`, [mat.id]);

        // Supply: open PO items
        const supply = await client.query(
          `SELECT COALESCE(SUM(pi.quantity), 0) as supply FROM pur_po_items pi
           JOIN pur_purchase_orders po ON pi.po_id = po.id
           WHERE pi.material_id = $1 AND po.status IN ('confirmed','partially_received')`, [mat.id]);

        const demand = parseFloat(soDemand.rows[0].demand) + parseFloat(prodDemand.rows[0].demand);
        const supplyQty = parseFloat(supply.rows[0].supply);
        const stock = parseFloat(mat.current_stock);
        const net = demand - stock - supplyQty;
        const reorder = parseFloat(mat.reorder_point);
        const safety = parseFloat(mat.safety_stock);

        // Calculate planned order
        let plannedQty = 0;
        let action = 'none';

        if (net > 0) {
          plannedQty = Math.max(net + safety, parseFloat(mat.min_lot_size));
          action = 'create_pr';
          totalShortfalls++;
        } else if (stock <= reorder && reorder > 0) {
          plannedQty = Math.max(reorder - stock + safety, parseFloat(mat.min_lot_size));
          action = 'reorder';
        }

        if (demand > 0 || plannedQty > 0 || stock > 0) {
          totalDemand++;
          if (plannedQty > 0) totalPlanned++;

          await client.query(
            `INSERT INTO pp_mrp_results (mrp_run_id, material_id, plant_id, current_stock, total_demand, total_supply,
              net_requirement, planned_order_qty, reorder_point, safety_stock, lead_time_days, action, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open')`,
            [runId, mat.id, plantFilter, stock, demand, supplyQty, Math.max(0, net),
             plannedQty, reorder, safety, parseInt(mat.lead_time_days), action]);
        }
      }

      // Update run header
      await client.query(
        `UPDATE pp_mrp_runs SET status='completed', total_demand_items=$1, total_planned_orders=$2, total_shortfalls=$3, completed_at=NOW() WHERE id=$4`,
        [totalDemand, totalPlanned, totalShortfalls, runId]);

      return run.rows[0];
    });

    successResponse(res, result, `MRP run complete — ${result.total_demand_items || 0} items analyzed`, 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/mrp/runs', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, p.plant_code, p.plant_name, u.first_name || ' ' || u.last_name as run_by_name
       FROM pp_mrp_runs r LEFT JOIN org_plants p ON r.plant_id = p.id LEFT JOIN sys_users u ON r.run_by = u.id
       ORDER BY r.run_date DESC LIMIT 20`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/mrp/results/:runId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, m.material_code, m.material_name, p.plant_code
       FROM pp_mrp_results r LEFT JOIN mm_materials m ON r.material_id = m.id
       LEFT JOIN org_plants p ON r.plant_id = p.id
       WHERE r.mrp_run_id = $1 ORDER BY r.action DESC, m.material_code`, [req.params.runId]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Convert MRP result to Purchase Requisition
router.post('/mrp/results/:id/create-pr', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT r.*, m.material_name FROM pp_mrp_results r LEFT JOIN mm_materials m ON r.material_id=m.id WHERE r.id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    const item = r.rows[0];

    const docNum = await getNextNumber('PR');
    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id=c.id WHERE u.id=$1`, [req.user.id]);
    const compId = compRes.rows[0]?.id || (await query(`SELECT id FROM org_companies LIMIT 1`)).rows[0]?.id;

    const pr = await query(
      `INSERT INTO pur_requisitions (doc_number, company_id, plant_id, status, doc_type, required_date, description, total_amount, requester_id, created_by)
       VALUES ($1,$2,$3,'draft','goods',CURRENT_DATE + $4 * INTERVAL '1 day',$5,0,$6,$6) RETURNING *`,
      [docNum, compId, item.plant_id, item.lead_time_days, `MRP: ${item.material_name} — shortfall ${item.net_requirement}`, req.user.id]);

    await query(
      `INSERT INTO pur_requisition_items (requisition_id, line_number, material_id, description, quantity, uom_id, plant_id)
       VALUES ($1,1,$2,$3,$4,(SELECT base_uom_id FROM mm_materials WHERE id=$2),$5)`,
      [pr.rows[0].id, item.material_id, item.material_name, item.planned_order_qty, item.plant_id]);

    await query(`UPDATE pp_mrp_results SET status='converted' WHERE id=$1`, [req.params.id]);

    successResponse(res, pr.rows[0], `PR ${docNum} created for ${item.material_name}`, 201);
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
