import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';
import { getConfigBool } from '../utils/configService.js';

const router = Router();

// ─── SCHEMA INIT ──────────────────────────────────────────────────
export async function initProductionSchema() {
  try {
    await query(`ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'released'`);
    await query(`ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS version INT DEFAULT 1`);
    await query(`ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS bom_usage VARCHAR(10) DEFAULT '1'`);
    await query(`ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS valid_from DATE DEFAULT CURRENT_DATE`);
    await query(`ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS valid_to DATE`);
    await query(`ALTER TABLE pp_work_centers ADD COLUMN IF NOT EXISTS wc_category VARCHAR(30) DEFAULT 'machine'`);
    await query(`ALTER TABLE pp_routings ADD COLUMN IF NOT EXISTS routing_status VARCHAR(20) DEFAULT 'active'`);
    await query(`ALTER TABLE pp_routings ADD COLUMN IF NOT EXISTS task_list_type VARCHAR(10) DEFAULT 'N'`);
    await query(`ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS scrap_qty NUMERIC(15,3) DEFAULT 0`);
    await query(`ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS lot_number VARCHAR(50)`);
    await query(`ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS actual_start_date DATE`);
    await query(`ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'PP01'`);
    await query(`ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS planning_strategy VARCHAR(10) DEFAULT 'MTS'`);

    // Seed module-wise configuration (ON CONFLICT DO NOTHING — never overrides user changes)
    const configs = [
      // ── PRODUCTION ──────────────────────────────────────────────────────
      ['production.planning_strategy',          'MTS',   'production', 'Global planning strategy: MTS (Make-to-Stock), MTO (Make-to-Order), MIXED (per-material)'],
      ['production.auto_create_order_on_so',    'false', 'production', 'Auto-create production order when SO is confirmed (applies to MTO/MIXED materials)'],
      ['production.mrp_consider_safety_stock',  'true',  'production', 'Include safety stock buffer when calculating net requirements in MRP'],
      ['production.mrp_consider_open_po',       'true',  'production', 'Count open/confirmed purchase orders as available supply in MRP'],
      ['production.mrp_consider_reorder_points','true',  'production', 'Generate reorder alerts for MTS materials below their reorder point'],
      ['production.default_lead_time_days',     '7',     'production', 'Default procurement/production lead time (days) when not set on material master'],
      ['production.allow_partial_completion',   'true',  'production', 'Allow production orders to be completed with less than the planned quantity'],
      ['production.require_routing_on_order',   'false', 'production', 'Block production order confirmation if no routing is assigned'],
      ['production.scrap_auto_write_off',       'false', 'production', 'Automatically post a stock write-off journal entry when scrap quantity is recorded'],
      // ── SALES ───────────────────────────────────────────────────────────
      ['sales.require_availability_check',      'false', 'sales', 'Block SO confirmation if any line item has insufficient stock'],
      ['sales.credit_limit_check',              'false', 'sales', 'Block SO confirmation if customer outstanding balance exceeds their credit limit'],
      ['sales.require_customer_po_number',      'false', 'sales', 'Make Customer PO Number mandatory before SO can be confirmed'],
      ['sales.allow_partial_delivery',          'true',  'sales', 'Allow delivery of partial quantities (deliver less than ordered)'],
      ['sales.auto_invoice_on_delivery',        'false', 'sales', 'Automatically create an invoice when a delivery is completed'],
      ['sales.auto_create_delivery_on_confirm', 'false', 'sales', 'Automatically create a delivery document when SO is confirmed'],
      ['sales.allow_so_edit_after_confirm',     'false', 'sales', 'Allow editing of sales order header fields after it is confirmed'],
      ['sales.default_payment_terms_days',      '30',    'sales', 'Default number of days for invoice payment terms on sales orders'],
      ['sales.default_delivery_days',           '7',     'sales', 'Default delivery lead time in days added to order date'],
      ['sales.mto_auto_trigger_production',     'false', 'sales', 'Trigger MRP/production planning run automatically on SO confirmation'],
      // ── PROCUREMENT ─────────────────────────────────────────────────────
      ['procurement.auto_create_pr_from_mrp',   'false', 'procurement', 'Automatically create purchase requisitions from MRP shortage results'],
      ['procurement.default_payment_terms_days','30',    'procurement', 'Default payment terms in days for purchase orders'],
      ['procurement.require_approval_above',    '0',     'procurement', 'PR/PO value above this amount requires approval (0 = always require manual approval)'],
      ['procurement.auto_approve_below',        '0',     'procurement', 'Auto-approve PRs with total value below this amount (0 = disabled)'],
      ['procurement.allow_partial_gr',          'true',  'procurement', 'Allow goods receipt for partial quantities against a PO line'],
      ['procurement.three_way_matching',        'false', 'procurement', 'Enforce PO → GR → Invoice three-way quantity and price match before payment'],
      ['procurement.gr_qty_tolerance_percent',  '5',     'procurement', 'Acceptable over/under delivery tolerance (%) on goods receipt vs PO quantity'],
      ['procurement.auto_create_po_from_pr',    'false', 'procurement', 'Automatically convert approved PRs into draft purchase orders'],
      // ── INVENTORY ───────────────────────────────────────────────────────
      ['inventory.negative_stock_allowed',      'false', 'inventory', 'Allow stock quantity to go below zero (backflushing / real-time posting)'],
      ['inventory.valuation_method',            'FIFO',  'inventory', 'Stock valuation method: FIFO (First-In-First-Out), LIFO, AVCO (Average Cost)'],
      ['inventory.auto_reserve_on_so',          'false', 'inventory', 'Automatically reserve (soft-allocate) stock when a sales order is confirmed'],
      ['inventory.low_stock_alert_enabled',     'true',  'inventory', 'Generate low-stock dashboard alerts when stock falls below reorder point'],
      ['inventory.batch_tracking_enabled',      'false', 'inventory', 'Enable batch/lot number tracking on all stock movements'],
      ['inventory.serial_tracking_enabled',     'false', 'inventory', 'Enable serial number tracking for individual unit traceability'],
      // ── FINANCE ─────────────────────────────────────────────────────────
      ['finance.auto_post_goods_receipt',            'true',  'finance', 'Auto-post GL journal entry (Dr Inventory / Cr Payables) on goods receipt'],
      ['finance.auto_post_invoice',                  'true',  'finance', 'Auto-post GL journal entry when an AR/AP invoice is created'],
      ['finance.auto_post_delivery',                 'false', 'finance', 'Auto-post COGS journal entry (Dr COGS / Cr Inventory) on goods delivery'],
      ['finance.auto_post_production_completion',    'false', 'finance', 'Auto-post production cost journal entry on production order completion'],
      ['finance.require_cost_center_on_journal',     'false', 'finance', 'Make cost center mandatory on all manual journal entry lines'],
      ['finance.multi_currency_enabled',             'false', 'finance', 'Enable multi-currency transactions and exchange rate management'],
      ['finance.tax_inclusive_pricing',              'false', 'finance', 'Treat entered prices as tax-inclusive (back-calculate tax from total)'],
      ['finance.bank_reconciliation_tolerance',      '0',     'finance', 'Amount tolerance for auto-matching bank statement lines (0 = exact match only)'],
      ['finance.auto_allocate_payment',              'true',  'finance', 'Auto-allocate payments to oldest outstanding invoices first'],
      ['finance.fiscal_year_start_month',            '4',     'finance', 'Month the fiscal year starts (1=Jan, 4=Apr for Indian FY)'],
      // ── HR ──────────────────────────────────────────────────────────────
      ['hr.overtime_enabled',               'true',     'hr', 'Allow recording of overtime hours for payroll calculation'],
      ['hr.overtime_rate_multiplier',       '1.5',      'hr', 'Overtime pay rate as a multiplier of regular hourly rate (e.g. 1.5 = time-and-a-half)'],
      ['hr.leave_approval_required',        'true',     'hr', 'Require manager approval before leave request is granted'],
      ['hr.payroll_frequency',              'monthly',  'hr', 'Pay cycle frequency: monthly, biweekly, weekly'],
      ['hr.attendance_based_payroll',       'false',    'hr', 'Deduct pay for absent days based on attendance records'],
      ['hr.probation_period_days',          '90',       'hr', 'Default probation period in days for new employees'],
      ['hr.expense_approval_required',      'true',     'hr', 'Require manager approval before expense claims are reimbursed'],
      ['hr.expense_limit_per_claim',        '0',        'hr', 'Maximum allowed amount per expense claim (0 = no limit)'],
      ['hr.auto_increment_leave_balance',   'true',     'hr', 'Automatically accrue leave balance each month based on entitlement'],
      // ── CRM ─────────────────────────────────────────────────────────────
      ['crm.lead_auto_assign',              'false',    'crm', 'Automatically assign new leads to sales reps using round-robin'],
      ['crm.follow_up_reminder_days',       '3',        'crm', 'Trigger follow-up reminder this many days after last activity on an opportunity'],
      ['crm.auto_convert_lead_on_win',      'true',     'crm', 'Auto-convert lead/opportunity to customer (BP) when deal is marked as won'],
      ['crm.require_close_reason',          'true',     'crm', 'Require a reason when closing or losing an opportunity'],
      ['crm.opportunity_probability_calc',  'manual',   'crm', 'How win probability is set: manual (user enters) or stage (derived from pipeline stage)'],
      // ── QUALITY ─────────────────────────────────────────────────────────
      ['quality.inspection_on_gr',           'false',   'quality', 'Trigger quality inspection automatically when goods are received'],
      ['quality.inspection_on_production',   'false',   'quality', 'Trigger quality inspection when a production order is completed'],
      ['quality.allow_delivery_without_qc',  'true',    'quality', 'Allow delivery/shipment before quality inspection is completed'],
      ['quality.defect_threshold_percent',   '5',       'quality', 'Acceptable defect rate (%); exceeding this triggers a non-conformance alert'],
      ['quality.auto_reject_on_threshold',   'false',   'quality', 'Automatically reject batch/lot when defect rate exceeds the threshold'],
      // ── WAREHOUSE ───────────────────────────────────────────────────────
      ['warehouse.bin_management_enabled',  'false',    'warehouse', 'Enable bin/shelf location tracking within storage locations'],
      ['warehouse.pick_confirm_required',   'false',    'warehouse', 'Require picker to confirm each pick before stock is reduced'],
      ['warehouse.put_away_strategy',       'FIFO',     'warehouse', 'Bin put-away strategy: FIFO (oldest first), FEFO (expiry first), nearest'],
      ['warehouse.packing_slip_required',   'false',    'warehouse', 'Require a packing slip to be printed/confirmed before delivery is dispatched'],
      ['warehouse.auto_print_labels',       'false',    'warehouse', 'Automatically print barcode/QR labels when stock is received into warehouse'],
      // ── ASSETS ──────────────────────────────────────────────────────────
      ['assets.depreciation_method',          'straight_line', 'assets', 'Depreciation method: straight_line, declining_balance, sum_of_years'],
      ['assets.auto_post_depreciation',       'false',    'assets', 'Auto-post monthly depreciation journal entries for all active assets'],
      ['assets.depreciation_frequency',       'monthly',  'assets', 'Depreciation posting frequency: monthly, quarterly, annually'],
      ['assets.capitalization_threshold',     '5000',     'assets', 'Minimum purchase value to capitalize as a fixed asset (below = expense directly)'],
      ['assets.require_location_on_asset',    'true',     'assets', 'Require physical location to be set before activating an asset'],
      ['assets.disposal_requires_approval',   'true',     'assets', 'Require manager approval before an asset can be disposed or written off'],
      ['assets.auto_create_from_gr',          'false',    'assets', 'Auto-create a fixed asset record when a capital goods item is received via GR'],
      ['assets.useful_life_alert_days',       '30',       'assets', 'Alert X days before an asset reaches end of useful life'],
      // ── PROJECTS ────────────────────────────────────────────────────────
      ['projects.budget_overrun_action',      'warn',     'projects', 'Action when project budget is exceeded: warn (allow with alert) or block (prevent posting)'],
      ['projects.auto_close_on_completion',   'true',     'projects', 'Automatically close project when all tasks are marked complete'],
      ['projects.require_timesheet_approval', 'true',     'projects', 'Require manager approval for timesheet entries before hours are posted'],
      ['projects.allow_billing_without_po',   'false',    'projects', 'Allow project billing without a customer purchase order reference'],
      ['projects.default_billing_type',       'fixed',    'projects', 'Default billing type for new projects: fixed, time_materials, milestone'],
      ['projects.timesheet_frequency',        'weekly',   'projects', 'Timesheet submission frequency: daily, weekly, biweekly'],
      ['projects.cost_tracking_enabled',      'true',     'projects', 'Enable project cost tracking (labour, materials, overheads)'],
      // ── MAINTENANCE ─────────────────────────────────────────────────────
      ['maintenance.preventive_enabled',      'true',     'maintenance', 'Enable preventive maintenance schedules and auto work order generation'],
      ['maintenance.auto_create_wo_on_alert', 'false',    'maintenance', 'Auto-create a work order when an asset maintenance alert is triggered'],
      ['maintenance.require_spare_parts_check','true',    'maintenance', 'Check spare parts availability before starting a maintenance work order'],
      ['maintenance.downtime_tracking',       'true',     'maintenance', 'Track machine downtime duration against each maintenance work order'],
      ['maintenance.wo_approval_required',    'false',    'maintenance', 'Require supervisor approval before a maintenance work order can be started'],
      ['maintenance.default_priority',        'medium',   'maintenance', 'Default priority for new maintenance work orders: low, medium, high, critical'],
      ['maintenance.sla_hours_critical',      '4',        'maintenance', 'SLA response time in hours for critical priority work orders'],
      ['maintenance.sla_hours_high',          '24',       'maintenance', 'SLA response time in hours for high priority work orders'],
      // ── TRANSPORT ───────────────────────────────────────────────────────
      ['transport.route_optimization_enabled','false',    'transport', 'Enable automatic route optimization for delivery trips'],
      ['transport.gps_tracking_enabled',      'false',    'transport', 'Enable GPS/live location tracking for transport vehicles'],
      ['transport.driver_license_check',      'true',     'transport', 'Validate driver license validity before assigning to a trip'],
      ['transport.vehicle_fitness_check',     'true',     'transport', 'Check vehicle fitness certificate expiry before assigning to a trip'],
      ['transport.auto_assign_vehicle',       'false',    'transport', 'Automatically assign the nearest available vehicle to a new trip'],
      ['transport.fuel_log_required',         'true',     'transport', 'Require fuel log entry before closing a completed trip'],
      ['transport.max_load_enforcement',      'true',     'transport', 'Block trip creation if cargo weight exceeds vehicle max load capacity'],
      // ── LOGISTICS ───────────────────────────────────────────────────────
      ['logistics.gate_pass_required',        'true',     'logistics', 'Require an approved gate pass for all material movements in/out of premises'],
      ['logistics.auto_gate_pass_on_delivery','false',    'logistics', 'Auto-generate outward gate pass when a delivery is confirmed'],
      ['logistics.auto_gate_pass_on_gr',      'false',    'logistics', 'Auto-generate inward gate pass when a goods receipt is created'],
      ['logistics.gate_pass_expiry_hours',    '24',       'logistics', 'Gate pass validity in hours after approval (0 = no expiry)'],
      ['logistics.vehicle_log_required',      'true',     'logistics', 'Require vehicle in/out log at gate for every movement'],
      ['logistics.visitor_pass_enabled',      'true',     'logistics', 'Enable visitor pass management at gate'],
    ];

    for (const [key, value, group, desc] of configs) {
      await query(
        `INSERT INTO sys_config (config_key, config_value, config_group, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (config_key) DO NOTHING`,
        [key, value, group, desc]);
    }

    console.log('[Production] Schema init complete');
  } catch (e) {
    console.error('[Production] Schema init error:', e.message);
  }
}

// ========= OVERVIEW =========
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [boms, orders, workCenters, scrap, overdue] = await Promise.all([
      query(`SELECT COUNT(*) as total,
             COUNT(*) FILTER(WHERE status='released') as released,
             COUNT(*) FILTER(WHERE status='draft') as draft,
             COUNT(*) FILTER(WHERE status='obsolete') as obsolete
             FROM pp_bom_headers WHERE is_active = true`),
      query(`SELECT COUNT(*) as total,
             COUNT(*) FILTER(WHERE status='draft') as planned,
             COUNT(*) FILTER(WHERE status='confirmed') as released,
             COUNT(*) FILTER(WHERE status='in_process') as in_process,
             COUNT(*) FILTER(WHERE status='completed') as completed,
             COALESCE(SUM(completed_qty) FILTER(WHERE status='completed'), 0) as total_produced,
             COALESCE(SUM(COALESCE(scrap_qty,0)), 0) as total_scrap
             FROM pp_production_orders`),
      query(`SELECT COUNT(*) as total FROM pp_work_centers WHERE is_active = true`),
      query(`SELECT COALESCE(SUM(COALESCE(scrap_qty,0)),0) as total_scrap,
             COALESCE(SUM(completed_qty),0) as total_produced
             FROM pp_production_orders WHERE status='completed'`),
      query(`SELECT COUNT(*) as count FROM pp_production_orders
             WHERE status IN ('draft','confirmed','in_process')
             AND planned_end < CURRENT_DATE`),
    ]);
    successResponse(res, {
      boms: boms.rows[0],
      orders: orders.rows[0],
      workCenters: workCenters.rows[0],
      scrap: scrap.rows[0],
      overdue: overdue.rows[0],
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= BOM =========
router.get('/bom', authenticate, async (req, res) => {
  try {
    const { search, status, page = 1 } = req.query;
    let sql = `SELECT b.*, m.material_code, m.material_name, p.plant_code, u.uom_code,
               (SELECT COUNT(*) FROM pp_bom_items WHERE bom_id = b.id) as component_count
               FROM pp_bom_headers b
               LEFT JOIN mm_materials m ON b.material_id = m.id
               LEFT JOIN org_plants p ON b.plant_id = p.id
               LEFT JOIN mm_units_of_measure u ON b.uom_id = u.id
               WHERE b.is_active = true`;
    const params = []; let idx = 1;
    if (search) { sql += ` AND (m.material_code ILIKE $${idx} OR m.material_name ILIKE $${idx} OR b.bom_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (status) { sql += ` AND b.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY m.material_code`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/bom/:id', authenticate, async (req, res) => {
  try {
    const header = await query(
      `SELECT b.*, m.material_code, m.material_name, p.plant_code, u.uom_code
       FROM pp_bom_headers b LEFT JOIN mm_materials m ON b.material_id = m.id
       LEFT JOIN org_plants p ON b.plant_id = p.id LEFT JOIN mm_units_of_measure u ON b.uom_id = u.id
       WHERE b.id = $1`, [req.params.id]);
    if (!header.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT bi.*, m.material_code, m.material_name, u.uom_code
       FROM pp_bom_items bi LEFT JOIN mm_materials m ON bi.component_id = m.id
       LEFT JOIN mm_units_of_measure u ON bi.uom_id = u.id
       WHERE bi.bom_id = $1 ORDER BY bi.line_number`, [req.params.id]);
    successResponse(res, { ...header.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/bom', authenticate, async (req, res) => {
  try {
    const { material_id, plant_id, bom_name, base_quantity, uom_id, status, items, bom_usage, valid_from, valid_to } = req.body;
    if (!material_id || !items?.length) return errorResponse(res, 'Material and components required', 400);

    const result = await transaction(async (client) => {
      const plantRes = plant_id ? { rows: [{ id: plant_id }] } : await client.query(`SELECT id FROM org_plants LIMIT 1`);
      const h = await client.query(
        `INSERT INTO pp_bom_headers (material_id, plant_id, bom_name, base_quantity, uom_id, status, version, bom_usage, valid_from, valid_to)
         VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9) RETURNING *`,
        [material_id, plantRes.rows[0]?.id, bom_name, base_quantity || 1, uom_id, status || 'released',
         bom_usage || '1', valid_from || null, valid_to || null]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.component_id) continue;
        await client.query(
          `INSERT INTO pp_bom_items (bom_id, line_number, component_id, quantity, uom_id, scrap_percent)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [h.rows[0].id, i + 1, it.component_id, it.quantity, it.uom_id, it.scrap_percent || 0]);
      }
      return h.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'bom', result.id, null, req.body, req);
    successResponse(res, result, 'BOM created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// UPDATE BOM (only draft/released)
router.put('/bom/:id', authenticate, async (req, res) => {
  try {
    const { bom_name, base_quantity, uom_id, items, bom_usage, valid_from, valid_to } = req.body;
    const current = await query(`SELECT * FROM pp_bom_headers WHERE id=$1`, [req.params.id]);
    if (!current.rows.length) return errorResponse(res, 'Not found', 404);
    if (current.rows[0].status === 'obsolete') return errorResponse(res, 'Cannot edit an obsolete BOM', 400);

    const result = await transaction(async (client) => {
      const bom = await client.query(
        `UPDATE pp_bom_headers SET bom_name=COALESCE($1,bom_name), base_quantity=COALESCE($2,base_quantity),
         uom_id=COALESCE($3,uom_id), bom_usage=COALESCE($4,bom_usage),
         valid_from=COALESCE($5,valid_from), valid_to=$6,
         updated_at=NOW() WHERE id=$7 RETURNING *`,
        [bom_name, base_quantity, uom_id, bom_usage || null, valid_from || null, valid_to || null, req.params.id]);
      if (items?.length) {
        await client.query(`DELETE FROM pp_bom_items WHERE bom_id=$1`, [req.params.id]);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (!it.component_id) continue;
          await client.query(
            `INSERT INTO pp_bom_items (bom_id, line_number, component_id, quantity, uom_id, scrap_percent)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.params.id, i + 1, it.component_id, it.quantity, it.uom_id, it.scrap_percent || 0]);
        }
      }
      return bom.rows[0];
    });
    successResponse(res, result, 'BOM updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/bom/:id/release', authenticate, async (req, res) => {
  try {
    const r = await query(`UPDATE pp_bom_headers SET status='released', updated_at=NOW() WHERE id=$1 AND status='draft' RETURNING *`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'BOM not found or not in draft status', 400);
    successResponse(res, r.rows[0], 'BOM released');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/bom/:id/obsolete', authenticate, async (req, res) => {
  try {
    const r = await query(`UPDATE pp_bom_headers SET status='obsolete', updated_at=NOW() WHERE id=$1 AND status='released' RETURNING *`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'BOM not found or not in released status', 400);
    successResponse(res, r.rows[0], 'BOM marked obsolete');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/bom/:id', authenticate, async (req, res) => {
  try {
    const deps = await query('SELECT COUNT(*) FROM pp_production_orders WHERE bom_id = $1', [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, 'Cannot delete — production orders reference this BOM', 400);
    await query('DELETE FROM pp_bom_items WHERE bom_id = $1', [req.params.id]);
    await query('DELETE FROM pp_routings WHERE bom_id = $1', [req.params.id]);
    await query('DELETE FROM pp_bom_headers WHERE id = $1', [req.params.id]);
    successResponse(res, null, 'BOM deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= PRODUCTION ORDERS =========
router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT po.*, m.material_code, m.material_name, p.plant_code, u.uom_code,
               b.bom_name, b.status as bom_status
               FROM pp_production_orders po
               LEFT JOIN mm_materials m ON po.material_id = m.id
               LEFT JOIN org_plants p ON po.plant_id = p.id
               LEFT JOIN mm_units_of_measure u ON po.uom_id = u.id
               LEFT JOIN pp_bom_headers b ON po.bom_id = b.id
               WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND po.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (po.doc_number ILIKE $${idx} OR m.material_name ILIKE $${idx} OR po.lot_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY po.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const order = await query(
      `SELECT po.*, m.material_code, m.material_name, p.plant_code, u.uom_code,
              b.bom_name, rt.routing_name
       FROM pp_production_orders po
       LEFT JOIN mm_materials m ON po.material_id = m.id
       LEFT JOIN org_plants p ON po.plant_id = p.id
       LEFT JOIN mm_units_of_measure u ON po.uom_id = u.id
       LEFT JOIN pp_bom_headers b ON po.bom_id = b.id
       LEFT JOIN pp_routings rt ON po.routing_id = rt.id
       WHERE po.id = $1`, [req.params.id]);
    if (!order.rows.length) return errorResponse(res, 'Not found', 404);
    const o = order.rows[0];

    // Get routing operations
    let routingOps = [];
    if (o.routing_id) {
      const ops = await query(
        `SELECT ro.*, wc.wc_code, wc.wc_name
         FROM pp_routing_operations ro
         LEFT JOIN pp_work_centers wc ON ro.work_center_id = wc.id
         WHERE ro.routing_id = $1 ORDER BY ro.operation_no`, [o.routing_id]);
      routingOps = ops.rows;
    }

    // Get BOM components with required vs available stock
    let components = [];
    if (o.bom_id) {
      const comps = await query(
        `SELECT bi.*, m.material_code, m.material_name, u.uom_code,
         COALESCE(s.qty,0) as available_stock
         FROM pp_bom_items bi
         LEFT JOIN mm_materials m ON bi.component_id = m.id
         LEFT JOIN mm_units_of_measure u ON bi.uom_id = u.id
         LEFT JOIN (SELECT material_id, plant_id, SUM(quantity) as qty FROM inv_stock GROUP BY material_id, plant_id) s
           ON s.material_id = bi.component_id AND s.plant_id = $2
         WHERE bi.bom_id = $1 ORDER BY bi.line_number`,
        [o.bom_id, o.plant_id]);
      components = comps.rows.map(c => ({
        ...c,
        required_qty: parseFloat(c.quantity) * parseFloat(o.planned_qty),
        sufficient: parseFloat(c.available_stock) >= parseFloat(c.quantity) * parseFloat(o.planned_qty),
      }));
    }
    successResponse(res, { ...o, components, routing_operations: routingOps });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/orders', authenticate, async (req, res) => {
  try {
    const { material_id, bom_id, planned_qty, uom_id, plant_id, planned_start, planned_end, priority, lot_number, order_type } = req.body;
    if (!material_id || !planned_qty) return errorResponse(res, 'Material and quantity required', 400);
    const docNumber = await getNextNumber('PRD');
    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]);
    const plantRes = plant_id ? { rows: [{ id: plant_id }] } : await query(`SELECT id FROM org_plants LIMIT 1`);
    const { routing_id } = req.body;
    const uuid = v => (v === '' || v == null) ? null : v;
    const result = await query(
      `INSERT INTO pp_production_orders (doc_number, company_id, plant_id, material_id, bom_id, routing_id,
        planned_qty, uom_id, planned_start, planned_end, priority, lot_number, order_type, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14) RETURNING *`,
      [docNumber, compRes.rows[0]?.id, plantRes.rows[0]?.id, material_id, uuid(bom_id),
       uuid(routing_id), planned_qty, uom_id, planned_start, planned_end,
       priority || 'medium', lot_number || null, order_type || 'PP01', req.user.id]);
    await auditLog(req.user.id, 'CREATE', 'production_order', result.rows[0].id, null, { doc_number: docNumber }, req);
    successResponse(res, result.rows[0], 'Production order created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const p = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `UPDATE pp_production_orders SET planned_qty=COALESCE($1,planned_qty), planned_start=COALESCE($2,planned_start),
       planned_end=COALESCE($3,planned_end), priority=COALESCE($4,priority),
       bom_id=COALESCE($5,bom_id), routing_id=$6, lot_number=COALESCE($7,lot_number),
       order_type=COALESCE($8,order_type), updated_at=NOW()
       WHERE id=$9 AND status IN ('draft','confirmed') RETURNING *`,
      [p.planned_qty, p.planned_start, p.planned_end, p.priority,
       uuid(p.bom_id), uuid(p.routing_id), p.lot_number, p.order_type || null, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or already in process/completed', 404);
    successResponse(res, result.rows[0], 'Production order updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ── helper: check component availability for a production order ──────────────
async function checkComponentAvailability(orderId, plannedQty, plantId) {
  const order = await query(
    `SELECT po.bom_id, po.plant_id FROM pp_production_orders po WHERE po.id = $1`, [orderId]);
  if (!order.rows.length || !order.rows[0].bom_id) return { ok: true, shortages: [] };

  const usePlant = plantId || order.rows[0].plant_id ||
    (await query(`SELECT id FROM org_plants WHERE is_active=true ORDER BY plant_code LIMIT 1`)).rows[0]?.id;

  const bom = await query(
    `SELECT bi.component_id, bi.quantity, bi.scrap_percent,
     m.material_code, m.material_name,
     COALESCE(SUM(s.quantity), 0) as available_qty
     FROM pp_bom_items bi
     JOIN mm_materials m ON m.id = bi.component_id
     LEFT JOIN inv_stock s ON s.material_id = bi.component_id AND s.plant_id = $2
     WHERE bi.bom_id = $1
     GROUP BY bi.component_id, bi.quantity, bi.scrap_percent, m.material_code, m.material_name`,
    [order.rows[0].bom_id, usePlant]);

  const shortages = [];
  for (const comp of bom.rows) {
    const scrapFactor = 1 + (parseFloat(comp.scrap_percent || 0) / 100);
    const required    = parseFloat(comp.quantity) * parseFloat(plannedQty) * scrapFactor;
    const available   = parseFloat(comp.available_qty);
    if (available < required) {
      shortages.push({
        material_code: comp.material_code,
        material_name: comp.material_name,
        required: required.toFixed(3),
        available: available.toFixed(3),
        shortage: (required - available).toFixed(3),
      });
    }
  }
  return { ok: shortages.length === 0, shortages };
}

// Release: draft → confirmed  (checks BOM exists + component availability)
router.post('/orders/:id/release', authenticate, async (req, res) => {
  try {
    const order = await query(
      `SELECT po.*, m.material_code FROM pp_production_orders po
       LEFT JOIN mm_materials m ON m.id = po.material_id
       WHERE po.id = $1 AND po.status = 'draft'`, [req.params.id]);
    if (!order.rows.length) return errorResponse(res, 'Order not found or not in draft', 400);
    const o = order.rows[0];

    // 1. BOM must be assigned
    if (!o.bom_id) return errorResponse(res, `Cannot release: no BOM assigned to production order for ${o.material_code}`, 400);

    // 2. Routing required check (config-driven)
    const requireRouting = await getConfigBool('production.require_routing_on_order', false);
    if (requireRouting && !o.routing_id) {
      return errorResponse(res, 'Cannot release: no routing assigned and production.require_routing_on_order is enabled', 400);
    }

    // 3. Component availability check — warn (include shortages in response) but do NOT block release
    const availability = await checkComponentAvailability(req.params.id, o.planned_qty, o.plant_id);

    await query(`UPDATE pp_production_orders SET status='confirmed', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    await auditLog(req.user.id, 'RELEASE', 'production_order', req.params.id, null, {}, req);

    const message = availability.ok
      ? 'Production order released — all components available'
      : `Production order released with component shortages: ${availability.shortages.map(s => `${s.material_code} (need ${s.required}, have ${s.available})`).join('; ')}`;

    successResponse(res, { ...o, component_shortages: availability.shortages }, message);
  } catch (err) { errorResponse(res, err.message); }
});

// Start: confirmed → in_process  (blocks if components unavailable)
router.post('/orders/:id/start', authenticate, async (req, res) => {
  try {
    const order = await query(
      `SELECT po.*, m.material_code FROM pp_production_orders po
       LEFT JOIN mm_materials m ON m.id = po.material_id
       WHERE po.id = $1 AND po.status = 'confirmed'`, [req.params.id]);
    if (!order.rows.length) return errorResponse(res, 'Order not found or not confirmed', 400);
    const o = order.rows[0];

    // Hard block: components must be available to start
    const availability = await checkComponentAvailability(req.params.id, o.planned_qty, o.plant_id);
    if (!availability.ok) {
      return errorResponse(res,
        `Cannot start — insufficient components: ${availability.shortages.map(s => `${s.material_code} (need ${s.required}, have ${s.available})`).join('; ')}`,
        400);
    }

    await query(
      `UPDATE pp_production_orders SET status='in_process', actual_start=CURRENT_DATE, actual_start_date=CURRENT_DATE, updated_at=NOW() WHERE id=$1`,
      [req.params.id]);
    await auditLog(req.user.id, 'START', 'production_order', req.params.id, null, {}, req);
    successResponse(res, null, 'Production started — all components confirmed available');
  } catch (err) { errorResponse(res, err.message); }
});

// Record partial output for an in-process order (no stock movement, no status change)
router.post('/orders/:id/record-output', authenticate, async (req, res) => {
  try {
    const { completed_qty, scrap_qty } = req.body;
    if (completed_qty === undefined || completed_qty === null || completed_qty === '') return errorResponse(res, 'Completed quantity required', 400);
    const order = await query(
      `SELECT po.*, m.material_code FROM pp_production_orders po
       LEFT JOIN mm_materials m ON m.id = po.material_id
       WHERE po.id = $1 AND po.status = 'in_process'`, [req.params.id]);
    if (!order.rows.length) return errorResponse(res, 'Order not found or not in process', 400);
    const o = order.rows[0];
    const newCompleted = parseFloat(completed_qty);
    const newScrap = parseFloat(scrap_qty || 0);
    if (newCompleted + newScrap > parseFloat(o.planned_qty)) {
      return errorResponse(res, `Completed + scrap (${newCompleted + newScrap}) cannot exceed planned qty (${o.planned_qty})`, 400);
    }
    await query(
      `UPDATE pp_production_orders SET completed_qty=$1, scrap_qty=$2, updated_at=NOW() WHERE id=$3`,
      [newCompleted, newScrap, req.params.id]);
    successResponse(res, { completed_qty: newCompleted, scrap_qty: newScrap }, 'Progress recorded');
  } catch (err) { errorResponse(res, err.message); }
});

// Complete: confirmed/in_process → completed
router.post('/orders/:id/complete', authenticate, async (req, res) => {
  try {
    const { completed_qty, scrap_qty, plant_id, sloc_id } = req.body;
    if (!completed_qty || parseFloat(completed_qty) <= 0) return errorResponse(res, 'Completed quantity required', 400);

    const order = await query(
      `SELECT po.*, m.material_code, m.material_name, m.base_uom_id
       FROM pp_production_orders po
       LEFT JOIN mm_materials m ON po.material_id = m.id
       WHERE po.id = $1`, [req.params.id]);
    if (!order.rows.length) return errorResponse(res, 'Not found', 404);
    if (!['confirmed', 'in_process'].includes(order.rows[0].status)) {
      return errorResponse(res, 'Order must be confirmed or in process to complete', 400);
    }

    const o = order.rows[0];
    const finishedQty = parseFloat(completed_qty);
    const scrappedQty = parseFloat(scrap_qty || 0);

    const result = await transaction(async (client) => {
      const usePlant = plant_id || o.plant_id ||
        (await client.query(`SELECT id FROM org_plants WHERE is_active=true ORDER BY plant_code LIMIT 1`)).rows[0]?.id;
      const useSloc = sloc_id ||
        (await client.query(`SELECT id FROM org_storage_locations WHERE plant_id=$1 AND is_active=true ORDER BY sloc_code LIMIT 1`, [usePlant])).rows[0]?.id;

      if (!usePlant || !useSloc) throw new Error('Plant and storage location required');

      // 1. Issue BOM components from stock
      if (o.bom_id) {
        const bomItems = await client.query(
          `SELECT bi.*, m.material_code, m.material_name, m.base_uom_id
           FROM pp_bom_items bi
           LEFT JOIN mm_materials m ON bi.component_id = m.id
           WHERE bi.bom_id = $1`, [o.bom_id]);

        const smIssueDoc = await getNextNumber('SM');
        const componentErrors = [];

        for (let i = 0; i < bomItems.rows.length; i++) {
          const comp = bomItems.rows[i];
          // Adjust for scrap percent
          const scrapFactor = 1 + (parseFloat(comp.scrap_percent || 0) / 100);
          const requiredQty = parseFloat(comp.quantity) * finishedQty * scrapFactor;

          const stock = await client.query(
            `SELECT id, quantity, sloc_id FROM inv_stock
             WHERE material_id=$1 AND plant_id=$2 AND quantity > 0
             ORDER BY quantity DESC LIMIT 1`,
            [comp.component_id, usePlant]);

          if (!stock.rows.length || parseFloat(stock.rows[0].quantity) < requiredQty) {
            const avail = stock.rows[0]?.quantity || 0;
            componentErrors.push(`${comp.material_name || comp.component_id}: need ${requiredQty.toFixed(3)}, available ${avail}`);
            continue;
          }

          await client.query(
            `INSERT INTO inv_stock_movements (doc_number, line_number, movement_type, material_id, plant_id, sloc_id, quantity, uom_id, reference_type, reference_id, created_by)
             VALUES ($1,$2,'issue',$3,$4,$5,$6,$7,'production_order',$8,$9)`,
            [smIssueDoc, i + 1, comp.component_id, usePlant, stock.rows[0].sloc_id,
             requiredQty, comp.uom_id || comp.base_uom_id, req.params.id, req.user.id]);

          await client.query(`UPDATE inv_stock SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
            [requiredQty, stock.rows[0].id]);
        }

        if (componentErrors.length) {
          throw new Error(`Insufficient components: ${componentErrors.join('; ')}`);
        }
      }

      // 2. Receipt finished product into stock (only good qty, not scrap)
      if (finishedQty > 0) {
        const smReceiptDoc = await getNextNumber('SM');
        await client.query(
          `INSERT INTO inv_stock_movements (doc_number, line_number, movement_type, material_id, plant_id, sloc_id, quantity, uom_id, reference_type, reference_id, created_by)
           VALUES ($1,1,'receipt',$2,$3,$4,$5,$6,'production_order',$7,$8)`,
          [smReceiptDoc, o.material_id, usePlant, useSloc, finishedQty, o.base_uom_id, req.params.id, req.user.id]);

        const existing = await client.query(
          `SELECT id FROM inv_stock WHERE material_id=$1 AND plant_id=$2 AND sloc_id=$3`,
          [o.material_id, usePlant, useSloc]);
        if (existing.rows.length) {
          await client.query(`UPDATE inv_stock SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`, [finishedQty, existing.rows[0].id]);
        } else {
          await client.query(`INSERT INTO inv_stock (material_id, plant_id, sloc_id, quantity) VALUES ($1,$2,$3,$4)`, [o.material_id, usePlant, useSloc, finishedQty]);
        }
      }

      // 3. Update production order
      await client.query(
        `UPDATE pp_production_orders SET status='completed', completed_qty=$1, scrap_qty=$2, actual_end=CURRENT_DATE, updated_at=NOW() WHERE id=$3`,
        [finishedQty, scrappedQty, req.params.id]);

      return { completed_qty: finishedQty, scrap_qty: scrappedQty, components_issued: true, product_receipted: true };
    });

    await auditLog(req.user.id, 'COMPLETE', 'production_order', req.params.id, null, result, req);
    successResponse(res, result, 'Production order completed — components issued, finished product receipted');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/orders/:id', authenticate, async (req, res) => {
  try {
    const o = await query('SELECT status FROM pp_production_orders WHERE id = $1', [req.params.id]);
    if (!o.rows.length) return errorResponse(res, 'Not found', 404);
    if (o.rows[0].status !== 'draft') return errorResponse(res, 'Only draft production orders can be deleted', 400);
    await query('DELETE FROM pp_production_orders WHERE id = $1', [req.params.id]);
    successResponse(res, null, 'Production order deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= WORK CENTERS =========
router.get('/work-centers', authenticate, async (_req, res) => {
  try {
    const result = await query(
      `SELECT wc.id, wc.wc_code, wc.wc_name, wc.capacity_qty, wc.capacity_uom,
              wc.cost_per_hour, wc.wc_category, wc.is_active,
              p.plant_code, p.plant_name,
              cc.cc_code, cc.cc_name,
              (SELECT COUNT(*) FROM pp_routing_operations ro
               JOIN pp_routings r ON ro.routing_id = r.id
               WHERE ro.work_center_id = wc.id AND r.is_active = true) as routing_op_count
       FROM pp_work_centers wc
       LEFT JOIN org_plants p ON wc.plant_id = p.id
       LEFT JOIN org_cost_centers cc ON wc.cost_center_id = cc.id
       WHERE wc.is_active = true ORDER BY wc.wc_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/work-centers', authenticate, async (req, res) => {
  try {
    const { wc_code, wc_name, plant_id, cost_center_id, capacity_qty, capacity_uom, cost_per_hour, wc_category } = req.body;
    if (!wc_code || !wc_name) return errorResponse(res, 'Code and name required', 400);
    const uuid = v => (v === '' || v == null) ? null : v;
    const r = await query(
      `INSERT INTO pp_work_centers (wc_code, wc_name, plant_id, cost_center_id, capacity_qty, capacity_uom, cost_per_hour, wc_category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [wc_code.toUpperCase(), wc_name, uuid(plant_id), uuid(cost_center_id),
       capacity_qty || null, capacity_uom || 'HR', cost_per_hour || null, wc_category || 'machine']);
    await auditLog(req.user.id, 'CREATE', 'work_center', r.rows[0].id, null, req.body, req);
    successResponse(res, r.rows[0], 'Work center created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/work-centers/:id', authenticate, async (req, res) => {
  try {
    const { wc_code, wc_name, plant_id, cost_center_id, capacity_qty, capacity_uom, cost_per_hour, wc_category } = req.body;
    const uuid = v => (v === '' || v == null) ? null : v;
    const r = await query(
      `UPDATE pp_work_centers SET
         wc_code=COALESCE($1,wc_code), wc_name=COALESCE($2,wc_name),
         plant_id=COALESCE($3,plant_id), cost_center_id=$4,
         capacity_qty=$5, capacity_uom=COALESCE($6,capacity_uom),
         cost_per_hour=$7, wc_category=COALESCE($8,wc_category)
       WHERE id=$9 RETURNING *`,
      [wc_code, wc_name, uuid(plant_id), uuid(cost_center_id),
       capacity_qty || null, capacity_uom, cost_per_hour || null,
       wc_category || null, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'Work center updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/work-centers/:id', authenticate, async (req, res) => {
  try {
    const used = await query(
      `SELECT COUNT(*) FROM pp_routing_operations WHERE work_center_id=$1`, [req.params.id]);
    if (parseInt(used.rows[0].count) > 0)
      return errorResponse(res, 'Cannot delete — work center is used in routing operations', 400);
    await query(`UPDATE pp_work_centers SET is_active=false WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Work center deactivated');
  } catch (err) { errorResponse(res, err.message); }
});

// Work Center Loading — capacity utilization based on routing operations
router.get('/work-center-loading', authenticate, async (_req, res) => {
  try {
    const result = await query(
      `SELECT wc.id, wc.wc_code, wc.wc_name,
              COALESCE(wc.capacity_qty, 8) as daily_capacity,
              wc.capacity_uom,
              COUNT(DISTINCT po.id) FILTER(WHERE po.status IN ('confirmed','in_process')) as active_orders,
              COALESCE(SUM(ro.run_time * po.planned_qty / 60.0)
                FILTER(WHERE po.status IN ('confirmed','in_process')), 0) as scheduled_hours,
              COALESCE(wc.capacity_qty, 8) * 5 as weekly_capacity_hours
       FROM pp_work_centers wc
       LEFT JOIN pp_routing_operations ro ON ro.work_center_id = wc.id
       LEFT JOIN pp_routings rt ON ro.routing_id = rt.id
       LEFT JOIN pp_production_orders po ON po.routing_id = rt.id
       WHERE wc.is_active = true
       GROUP BY wc.id, wc.wc_code, wc.wc_name, wc.capacity_qty, wc.capacity_uom
       ORDER BY wc.wc_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= STANDALONE ROUTING =========
router.get('/routings', authenticate, async (req, res) => {
  try {
    const { search, material_id } = req.query;
    let sql = `SELECT rt.id, rt.routing_name, rt.material_id, rt.plant_id,
               rt.routing_status, rt.task_list_type, rt.is_active,
               m.material_code, m.material_name, p.plant_code,
               (SELECT COUNT(*) FROM pp_routing_operations WHERE routing_id = rt.id) as operation_count
               FROM pp_routings rt
               LEFT JOIN mm_materials m ON rt.material_id = m.id
               LEFT JOIN org_plants p ON rt.plant_id = p.id
               WHERE rt.is_active = true`;
    const params = []; let idx = 1;
    if (search) { sql += ` AND (rt.routing_name ILIKE $${idx} OR m.material_code ILIKE $${idx} OR m.material_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (material_id) { sql += ` AND rt.material_id = $${idx++}`; params.push(material_id); }
    sql += ` ORDER BY m.material_code, rt.routing_name`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/routings/:id', authenticate, async (req, res) => {
  try {
    const header = await query(
      `SELECT rt.*, m.material_code, m.material_name, p.plant_code, p.plant_name
       FROM pp_routings rt
       LEFT JOIN mm_materials m ON rt.material_id = m.id
       LEFT JOIN org_plants p ON rt.plant_id = p.id
       WHERE rt.id = $1`, [req.params.id]);
    if (!header.rows.length) return errorResponse(res, 'Not found', 404);
    const ops = await query(
      `SELECT ro.*, wc.wc_code, wc.wc_name
       FROM pp_routing_operations ro
       LEFT JOIN pp_work_centers wc ON ro.work_center_id = wc.id
       WHERE ro.routing_id = $1 ORDER BY ro.operation_no`, [req.params.id]);
    successResponse(res, { ...header.rows[0], operations: ops.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/routings', authenticate, async (req, res) => {
  try {
    const { routing_name, material_id, plant_id, operations, routing_status, task_list_type } = req.body;
    if (!routing_name) return errorResponse(res, 'Routing name required', 400);
    const uuid = v => (v === '' || v == null) ? null : v;
    const result = await transaction(async (client) => {
      const usePlant = uuid(plant_id) ||
        (await client.query(`SELECT id FROM org_plants WHERE is_active=true LIMIT 1`)).rows[0]?.id;
      const rt = await client.query(
        `INSERT INTO pp_routings (routing_name, material_id, plant_id, routing_status, task_list_type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [routing_name, uuid(material_id), usePlant, routing_status || 'active', task_list_type || 'N']);
      for (let i = 0; i < (operations || []).length; i++) {
        const op = operations[i];
        if (!op.operation_name) continue;
        await client.query(
          `INSERT INTO pp_routing_operations
             (routing_id, operation_no, operation_name, work_center_id, setup_time, run_time, time_unit, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [rt.rows[0].id, op.operation_no || (i + 1) * 10, op.operation_name,
           uuid(op.work_center_id), op.setup_time || 0, op.run_time || 0,
           op.time_unit || 'MIN', op.description || '']);
      }
      return rt.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'routing', result.id, null, { routing_name }, req);
    successResponse(res, result, 'Routing created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/routings/:id', authenticate, async (req, res) => {
  try {
    const { routing_name, material_id, plant_id, operations, routing_status, task_list_type } = req.body;
    const uuid = v => (v === '' || v == null) ? null : v;
    const result = await transaction(async (client) => {
      const rt = await client.query(
        `UPDATE pp_routings SET routing_name=COALESCE($1,routing_name),
         material_id=COALESCE($2,material_id), plant_id=COALESCE($3,plant_id),
         routing_status=COALESCE($4,routing_status), task_list_type=COALESCE($5,task_list_type)
         WHERE id=$6 RETURNING *`,
        [routing_name, uuid(material_id), uuid(plant_id), routing_status || null, task_list_type || null, req.params.id]);
      if (!rt.rows.length) throw new Error('Not found');
      if (operations !== undefined) {
        await client.query(`DELETE FROM pp_routing_operations WHERE routing_id=$1`, [req.params.id]);
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          if (!op.operation_name) continue;
          await client.query(
            `INSERT INTO pp_routing_operations
               (routing_id, operation_no, operation_name, work_center_id, setup_time, run_time, time_unit, description)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [req.params.id, op.operation_no || (i + 1) * 10, op.operation_name,
             uuid(op.work_center_id), op.setup_time || 0, op.run_time || 0,
             op.time_unit || 'MIN', op.description || '']);
        }
      }
      return rt.rows[0];
    });
    successResponse(res, result, 'Routing updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/routings/:id', authenticate, async (req, res) => {
  try {
    const used = await query(
      `SELECT COUNT(*) FROM pp_production_orders WHERE routing_id=$1`, [req.params.id]);
    if (parseInt(used.rows[0].count) > 0)
      return errorResponse(res, 'Cannot delete — routing is used in production orders', 400);
    await query(`DELETE FROM pp_routing_operations WHERE routing_id=$1`, [req.params.id]);
    await query(`UPDATE pp_routings SET is_active=false WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Routing deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// MRP (Material Requirements Planning)
// ============================================
router.get('/mrp-runs', authenticate, async (req, res) => {
  try {
    successResponse(res, (await query(
      `SELECT mr.*, u.first_name || ' ' || u.last_name as run_by
       FROM pp_mrp_runs mr LEFT JOIN sys_users u ON mr.created_by = u.id
       ORDER BY mr.run_date DESC`)).rows);
  } catch (e) { errorResponse(res, e.message); }
});

router.post('/mrp/run', authenticate, async (req, res) => {
  try {
    const { planning_horizon_days } = req.body;
    const horizon = planning_horizon_days || 30;

    // Read MRP configuration
    const cfgRows = await query(
      `SELECT config_key, config_value FROM sys_config
       WHERE config_key IN ('production.planning_strategy','production.mrp_consider_safety_stock',
                            'production.mrp_consider_open_po','production.mrp_consider_reorder_points',
                            'production.default_lead_time_days')`);
    const cfg = {};
    for (const r of cfgRows.rows) cfg[r.config_key] = r.config_value;
    const globalStrategy   = cfg['production.planning_strategy'] || 'MTS';           // MTS | MTO | MIXED
    const considerOpenPO   = (cfg['production.mrp_consider_open_po'] || 'true') === 'true';
    const considerReorder  = (cfg['production.mrp_consider_reorder_points'] || 'true') === 'true';
    const defaultLeadDays  = parseInt(cfg['production.default_lead_time_days'] || '7');

    const run = await query(
      `INSERT INTO pp_mrp_runs (planning_horizon_days, created_by) VALUES ($1, $2) RETURNING *`,
      [horizon, req.user.id]);
    const runId = run.rows[0].id;

    let totalReqs = 0, plannedOrders = 0;
    const processedMaterials = new Set();

    // ── STEP 0: Open production orders — explode BOM components to find purchase needs
    const openProdOrders = await query(
      `SELECT po.id, po.material_id, po.planned_qty, po.bom_id,
       COALESCE(po.completed_qty, 0) as completed_qty,
       m.material_code, m.material_name
       FROM pp_production_orders po
       JOIN mm_materials m ON po.material_id = m.id
       WHERE po.status IN ('confirmed','in_process') AND po.bom_id IS NOT NULL`);

    for (const order of openProdOrders.rows) {
      const remainingQty = parseFloat(order.planned_qty) - parseFloat(order.completed_qty);
      if (remainingQty <= 0) continue;

      const bomItems = await query(
        `SELECT bi.component_id, bi.quantity, bi.scrap_percent,
         COALESCE(cm.lead_time_days, $2) as lead_days
         FROM pp_bom_items bi
         JOIN mm_materials cm ON cm.id = bi.component_id
         WHERE bi.bom_id = $1`, [order.bom_id, defaultLeadDays]);

      for (const comp of bomItems.rows) {
        const scrapFactor = 1 + (parseFloat(comp.scrap_percent || 0) / 100);
        const compRequired = parseFloat(comp.quantity) * remainingQty * scrapFactor;
        const compStock = await query(`SELECT COALESCE(SUM(quantity), 0) as qty FROM inv_stock WHERE material_id = $1`, [comp.component_id]);
        let compOnOrder = 0;
        if (considerOpenPO) {
          const compPO = await query(
            `SELECT COALESCE(SUM(poi.quantity - COALESCE(poi.received_qty,0)), 0) as qty FROM pur_po_items poi
             JOIN pur_purchase_orders po ON poi.po_id = po.id
             WHERE poi.material_id = $1 AND po.status IN ('confirmed','partially_received')`, [comp.component_id]);
          compOnOrder = Math.max(0, parseFloat(compPO.rows[0].qty));
        }
        const compAvail = parseFloat(compStock.rows[0].qty) + compOnOrder;
        const compShortage = compRequired - compAvail;
        const compAction = compShortage > 0 ? 'purchase' : 'sufficient';
        const compLead = parseInt(comp.lead_days) || defaultLeadDays;

        if (!processedMaterials.has(comp.component_id)) {
          await query(
            `INSERT INTO pp_mrp_results (mrp_run_id, material_id, requirement_qty, available_stock, on_order_qty, shortage_qty, action_type, suggested_order_qty, suggested_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE + ($9::int * INTERVAL '1 day'))`,
            [runId, comp.component_id, compRequired, compStock.rows[0].qty, compOnOrder,
             Math.max(0, compShortage), compAction, Math.max(0, compShortage), compLead]);
          processedMaterials.add(comp.component_id);
          totalReqs++;
          if (compShortage > 0) plannedOrders++;
        }
      }
    }

    // ── STEP 1: SO demand — confirmed SOs only, within horizon OR no delivery date set
    const demand = await query(
      `SELECT soi.material_id, m.material_name, m.material_code,
       SUM(soi.quantity - COALESCE(soi.delivered_qty, 0)) as demand_qty,
       m.reorder_point, m.reorder_quantity,
       COALESCE(m.planning_strategy, $2) as mat_strategy,
       COALESCE(m.lead_time_days, $3) as lead_days
       FROM sd_so_items soi
       JOIN sd_sales_orders so ON soi.so_id = so.id
       JOIN mm_materials m ON soi.material_id = m.id
       WHERE so.status IN ('confirmed','in_process','partially_delivered')
       AND (so.delivery_date IS NULL OR so.delivery_date <= CURRENT_DATE + $1 * INTERVAL '1 day')
       AND soi.quantity > COALESCE(soi.delivered_qty, 0)
       GROUP BY soi.material_id, m.material_name, m.material_code, m.reorder_point,
                m.reorder_quantity, m.planning_strategy, m.lead_time_days
       HAVING SUM(soi.quantity - COALESCE(soi.delivered_qty, 0)) > 0`,
      [horizon, globalStrategy, defaultLeadDays]);

    for (const d of demand.rows) {
      const leadDays = parseInt(d.lead_days) || defaultLeadDays;

      const stock = await query(`SELECT COALESCE(SUM(quantity), 0) as qty FROM inv_stock WHERE material_id = $1`, [d.material_id]);
      let onOrderQty = 0;
      if (considerOpenPO) {
        const onOrder = await query(
          `SELECT COALESCE(SUM(poi.quantity - COALESCE(poi.received_qty,0)), 0) as qty FROM pur_po_items poi
           JOIN pur_purchase_orders po ON poi.po_id = po.id
           WHERE poi.material_id = $1 AND po.status IN ('confirmed','partially_received')`, [d.material_id]);
        onOrderQty = Math.max(0, parseFloat(onOrder.rows[0].qty));
      }
      const stockQty  = parseFloat(stock.rows[0].qty);
      const available = stockQty + onOrderQty;
      const demandQty = parseFloat(d.demand_qty);
      const shortage  = demandQty - available;
      const action    = shortage > 0 ? 'purchase'
                      : (stockQty < parseFloat(d.reorder_point || 0) ? 'reorder' : 'sufficient');
      const suggestedQty = shortage > 0 ? Math.max(shortage, parseFloat(d.reorder_quantity || shortage)) : 0;

      await query(
        `INSERT INTO pp_mrp_results (mrp_run_id, material_id, requirement_qty, available_stock, on_order_qty, shortage_qty, action_type, suggested_order_qty, suggested_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE + ($9::int * INTERVAL '1 day'))`,
        [runId, d.material_id, d.demand_qty, stock.rows[0].qty, onOrderQty,
         Math.max(0, shortage), action, suggestedQty, leadDays]);
      processedMaterials.add(d.material_id);
      totalReqs++;
      if (shortage > 0 || action === 'reorder') plannedOrders++;

      // ── BOM explosion: plan components for finished goods
      const bom = await query(
        `SELECT bi.component_id, bi.quantity, bi.scrap_percent, COALESCE(cm.lead_time_days, $2) as lead_days
         FROM pp_bom_headers h
         JOIN pp_bom_items bi ON bi.bom_id = h.id
         JOIN mm_materials cm ON cm.id = bi.component_id
         WHERE h.material_id = $1 AND h.status = 'released' AND h.is_active = true
         ORDER BY h.version DESC LIMIT 100`, [d.material_id, defaultLeadDays]);

      for (const comp of bom.rows) {
        if (processedMaterials.has(comp.component_id)) continue;
        const scrapFactor = 1 + (parseFloat(comp.scrap_percent || 0) / 100);
        const compRequired = parseFloat(comp.quantity) * parseFloat(d.demand_qty) * scrapFactor;
        const compStock = await query(`SELECT COALESCE(SUM(quantity), 0) as qty FROM inv_stock WHERE material_id = $1`, [comp.component_id]);
        let compOnOrder = 0;
        if (considerOpenPO) {
          const compPO = await query(
            `SELECT COALESCE(SUM(poi.quantity - COALESCE(poi.received_qty,0)), 0) as qty FROM pur_po_items poi
             JOIN pur_purchase_orders po ON poi.po_id = po.id
             WHERE poi.material_id = $1 AND po.status IN ('confirmed','partially_received')`, [comp.component_id]);
          compOnOrder = Math.max(0, parseFloat(compPO.rows[0].qty));
        }
        const compAvail = parseFloat(compStock.rows[0].qty) + compOnOrder;
        const compShortage = compRequired - compAvail;
        if (compShortage > 0) {
          const compLead = parseInt(comp.lead_days) || defaultLeadDays;
          await query(
            `INSERT INTO pp_mrp_results (mrp_run_id, material_id, requirement_qty, available_stock, on_order_qty, shortage_qty, action_type, suggested_order_qty, suggested_date)
             VALUES ($1,$2,$3,$4,$5,$6,'purchase',$7,CURRENT_DATE + ($8::int * INTERVAL '1 day'))
             ON CONFLICT DO NOTHING`,
            [runId, comp.component_id, compRequired, compStock.rows[0].qty, compOnOrder,
             compShortage, compShortage, compLead]);
          processedMaterials.add(comp.component_id);
          totalReqs++;
          plannedOrders++;
        }
      }
    }

    // ── STEP 2: Reorder-point alerts (MTS and MIXED only; skip for pure MTO)
    if (globalStrategy !== 'MTO' && considerReorder) {
      const mtsFilter = globalStrategy === 'MIXED'
        ? `AND COALESCE(m.planning_strategy, 'MTS') IN ('MTS','MIXED')`
        : '';
      const reorderAlerts = await query(
        `SELECT m.id, m.material_code, m.reorder_point, m.reorder_quantity,
         COALESCE(s.qty, 0) as stock_qty, COALESCE(m.lead_time_days, ${defaultLeadDays}) as lead_days
         FROM mm_materials m
         LEFT JOIN (SELECT material_id, SUM(quantity) as qty FROM inv_stock GROUP BY material_id) s ON s.material_id = m.id
         WHERE m.reorder_point > 0 AND COALESCE(s.qty, 0) <= m.reorder_point
         AND m.id NOT IN (SELECT material_id FROM pp_mrp_results WHERE mrp_run_id = $1) ${mtsFilter}`,
        [runId]);

      for (const r of reorderAlerts.rows) {
        await query(
          `INSERT INTO pp_mrp_results (mrp_run_id, material_id, requirement_qty, available_stock, on_order_qty, shortage_qty, action_type, suggested_order_qty, suggested_date)
           VALUES ($1,$2,0,$3,0,$4,'reorder',$5,CURRENT_DATE + ($6::int * INTERVAL '1 day'))`,
          [runId, r.id, r.stock_qty,
           Math.max(0, parseFloat(r.reorder_point) - parseFloat(r.stock_qty)),
           r.reorder_quantity || parseFloat(r.reorder_point),
           parseInt(r.lead_days) || defaultLeadDays]);
        totalReqs++;
        plannedOrders++;
      }
    }

    await query(
      `UPDATE pp_mrp_runs SET status='completed', total_requirements=$1, planned_orders_created=$2 WHERE id=$3`,
      [totalReqs, plannedOrders, runId]);

    successResponse(res, { run_id: runId, total_requirements: totalReqs, planned_orders: plannedOrders }, `MRP run complete [strategy: ${globalStrategy}]`);
  } catch (e) { errorResponse(res, e.message); }
});

router.get('/mrp-runs/:id/results', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT mr.*, m.material_code, m.material_name, u.uom_code
       FROM pp_mrp_results mr
       JOIN mm_materials m ON mr.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON m.base_uom_id = u.id
       WHERE mr.mrp_run_id = $1 ORDER BY mr.shortage_qty DESC`,
      [req.params.id]);
    successResponse(res, r.rows);
  } catch (e) { errorResponse(res, e.message); }
});

// Convert MRP result to Purchase Requisition
router.post('/mrp-results/:id/create-pr', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT mr.*, m.material_code FROM pp_mrp_results mr JOIN mm_materials m ON mr.material_id = m.id
       WHERE mr.id = $1 AND mr.is_processed = false`,
      [req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or already processed', 404);
    const r = result.rows[0];
    const docNum = await getNextNumber('PR');
    const pr = await query(
      `INSERT INTO pur_requisitions (doc_number, required_date, status, description, total_amount, requester_id)
       VALUES ($1, CURRENT_DATE, 'approved', $2, 0, $3) RETURNING *`,
      [docNum, `MRP auto-generated for ${r.material_code}`, req.user.id]);
    await query(`UPDATE pp_mrp_results SET is_processed = true WHERE id = $1`, [req.params.id]);
    successResponse(res, { requisition_id: pr.rows[0].id, doc_number: docNum }, 'PR created from MRP');
  } catch (e) { errorResponse(res, e.message); }
});

// Convert MRP result to Production Order (for manufactured items)
router.post('/mrp-results/:id/create-order', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT mr.*, m.material_code, m.material_name FROM pp_mrp_results mr
       JOIN mm_materials m ON mr.material_id = m.id
       WHERE mr.id = $1 AND mr.is_processed = false`,
      [req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or already processed', 404);
    const r = result.rows[0];

    // Find released BOM for this material
    const bom = await query(
      `SELECT id FROM pp_bom_headers WHERE material_id=$1 AND status='released' AND is_active=true ORDER BY version DESC LIMIT 1`,
      [r.material_id]);

    const docNumber = await getNextNumber('PRD');
    const plant = await query(`SELECT id FROM org_plants WHERE is_active=true LIMIT 1`);
    const order = await query(
      `INSERT INTO pp_production_orders (doc_number, plant_id, material_id, bom_id, planned_qty, planned_start, planned_end, priority, status, created_by)
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,'medium','draft',$7) RETURNING *`,
      [docNumber, plant.rows[0]?.id, r.material_id, bom.rows[0]?.id || null,
       r.suggested_order_qty, r.suggested_date, req.user.id]);

    await query(`UPDATE pp_mrp_results SET is_processed = true WHERE id = $1`, [r.id]);
    successResponse(res, { order_id: order.rows[0].id, doc_number: docNumber }, 'Production order created from MRP');
  } catch (e) { errorResponse(res, e.message); }
});

// ── Raise Purchase Requisitions for all shortage components of a production order ──
router.post('/orders/:id/raise-shortage-prs', authenticate, async (req, res) => {
  try {
    const order = await query(
      `SELECT po.*, m.material_code, m.material_name
       FROM pp_production_orders po
       LEFT JOIN mm_materials m ON po.material_id = m.id
       WHERE po.id = $1`, [req.params.id]);
    if (!order.rows.length) return errorResponse(res, 'Order not found', 404);
    const o = order.rows[0];
    if (!o.bom_id) return errorResponse(res, 'No BOM assigned — cannot determine required components', 400);

    const usePlant = o.plant_id ||
      (await query(`SELECT id FROM org_plants WHERE is_active=true ORDER BY plant_code LIMIT 1`)).rows[0]?.id;

    // Get all BOM components with current stock
    const comps = await query(
      `SELECT bi.component_id, bi.quantity, bi.scrap_percent,
              m.material_code, m.material_name, m.base_uom_id, u.uom_code,
              COALESCE(m.lead_time_days, 7) as lead_days,
              COALESCE(s.qty, 0) as available_qty
       FROM pp_bom_items bi
       JOIN mm_materials m ON m.id = bi.component_id
       LEFT JOIN mm_units_of_measure u ON u.id = m.base_uom_id
       LEFT JOIN (SELECT material_id, plant_id, SUM(quantity) as qty
                  FROM inv_stock GROUP BY material_id, plant_id) s
         ON s.material_id = bi.component_id AND s.plant_id = $2
       WHERE bi.bom_id = $1`,
      [o.bom_id, usePlant]);

    // Identify shortages
    const shortages = [];
    for (const c of comps.rows) {
      const scrapFactor = 1 + (parseFloat(c.scrap_percent || 0) / 100);
      const required    = parseFloat(c.quantity) * parseFloat(o.planned_qty) * scrapFactor;
      const available   = parseFloat(c.available_qty);
      if (available < required) {
        shortages.push({
          component_id: c.component_id,
          material_code: c.material_code,
          material_name: c.material_name,
          base_uom_id:   c.base_uom_id,
          uom_code:      c.uom_code,
          required,
          available,
          shortage:   required - available,
          lead_days:  parseInt(c.lead_days) || 7,
        });
      }
    }

    if (!shortages.length) {
      return successResponse(res,
        { shortages_count: 0, prs: [] },
        'No shortages — all components have sufficient stock');
    }

    // Check for any existing open PRs for this production order to avoid duplicates
    const existingPR = await query(
      `SELECT id, doc_number FROM pur_requisitions
       WHERE description ILIKE $1 AND status NOT IN ('cancelled','rejected')
       ORDER BY created_at DESC LIMIT 1`,
      [`%${o.doc_number}%`]);
    if (existingPR.rows.length) {
      return errorResponse(res,
        `A Purchase Requisition (${existingPR.rows[0].doc_number}) already exists for this production order. Review it in Procurement → Requisitions.`,
        409);
    }

    // Create one PR with one line per shortage material
    const docNum = await getNextNumber('PR');
    const pr = await transaction(async (client) => {
      const prHeader = await client.query(
        `INSERT INTO pur_requisitions (doc_number, required_date, status, description, total_amount, requester_id)
         VALUES ($1, CURRENT_DATE, 'approved', $2, 0, $3) RETURNING *`,
        [docNum,
         `Component shortage — ${o.material_code} / ${o.doc_number}`,
         req.user.id]);
      const prId = prHeader.rows[0].id;

      for (let i = 0; i < shortages.length; i++) {
        const s = shortages[i];
        await client.query(
          `INSERT INTO pur_requisition_items
             (requisition_id, line_number, material_id, description, quantity, uom_id, required_date, status)
           VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE + ($7::int * INTERVAL '1 day'),'draft')`,
          [prId, i + 1, s.component_id,
           `Shortage for ${o.doc_number}: need ${s.shortage.toFixed(3)} (have ${s.available.toFixed(3)})`,
           parseFloat(s.shortage.toFixed(3)), s.base_uom_id, s.lead_days || 0]);
      }
      return prHeader.rows[0];
    });

    await auditLog(req.user.id, 'CREATE', 'purchase_requisition', pr.id, null,
      { source: 'production_shortage', production_order_id: req.params.id, doc_number: pr.doc_number }, req);

    successResponse(res, {
      pr_id:          pr.id,
      pr_doc_number:  docNum,
      shortages_count: shortages.length,
      shortages: shortages.map(s => ({
        material_code: s.material_code,
        material_name: s.material_name,
        shortage_qty:  parseFloat(s.shortage.toFixed(3)),
        uom_code:      s.uom_code,
      })),
    }, `PR ${docNum} raised with ${shortages.length} shortage item(s)`);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= BULK OPERATIONS =========
router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const tables = { bom: 'pp_bom_headers', orders: 'pp_production_orders' };
    const table = tables[entity];
    if (!table) return errorResponse(res, 'Unknown entity', 400);
    if (entity === 'bom') {
      await query(`DELETE FROM pp_bom_items WHERE bom_id = ANY($1::uuid[])`, [ids]);
      await query(`DELETE FROM pp_routings WHERE bom_id = ANY($1::uuid[])`, [ids]);
    }
    const r = await query(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
