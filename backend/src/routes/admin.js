import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse, paginate } from '../utils/helpers.js';

const router = Router();

// ========= AUDIT LOG =========
router.get('/audit-log', authenticate, async (req, res) => {
  try {
    const { entity_type, action, user_id, date_from, date_to, page = 1 } = req.query;
    let sql = `SELECT al.*, u.first_name || ' ' || u.last_name as user_name, u.username
               FROM sys_audit_log al LEFT JOIN sys_users u ON al.user_id = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (entity_type) { sql += ` AND al.entity_type = $${idx++}`; params.push(entity_type); }
    if (action) { sql += ` AND al.action = $${idx++}`; params.push(action); }
    if (user_id) { sql += ` AND al.user_id = $${idx++}`; params.push(user_id); }
    if (date_from) { sql += ` AND al.created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND al.created_at <= $${idx++}::date + INTERVAL '1 day'`; params.push(date_to); }
    sql += ` ORDER BY al.created_at DESC`;
    sql = paginate(sql, parseInt(page), 100);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/audit-log/stats', authenticate, async (req, res) => {
  try {
    const [total, byAction, byEntity, byUser] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM sys_audit_log`),
      query(`SELECT action, COUNT(*) as count FROM sys_audit_log GROUP BY action ORDER BY count DESC LIMIT 10`),
      query(`SELECT entity_type, COUNT(*) as count FROM sys_audit_log WHERE entity_type IS NOT NULL GROUP BY entity_type ORDER BY count DESC LIMIT 10`),
      query(`SELECT u.first_name || ' ' || u.last_name as name, COUNT(*) as count FROM sys_audit_log al JOIN sys_users u ON al.user_id = u.id GROUP BY u.id, u.first_name, u.last_name ORDER BY count DESC LIMIT 10`),
    ]);
    successResponse(res, { total: total.rows[0]?.total, byAction: byAction.rows, byEntity: byEntity.rows, byUser: byUser.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= CUSTOM FIELDS =========
router.get('/custom-fields', authenticate, async (req, res) => {
  try {
    const { entity_type } = req.query;
    let sql = `SELECT * FROM sys_custom_fields WHERE is_active = true`;
    const params = [];
    if (entity_type) { sql += ` AND entity_type = $1`; params.push(entity_type); }
    sql += ` ORDER BY entity_type, sort_order`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/custom-fields', authenticate, async (req, res) => {
  try {
    const { entity_type, field_name, field_label, field_type, is_required, default_value, options, sort_order } = req.body;
    if (!entity_type || !field_name || !field_label || !field_type) return errorResponse(res, 'Entity type, name, label, and type required', 400);
    const result = await query(
      `INSERT INTO sys_custom_fields (entity_type, field_name, field_label, field_type, is_required, default_value, options, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [entity_type, field_name, field_label, field_type, is_required || false, default_value, options ? JSON.stringify(options) : null, sort_order || 0]);
    successResponse(res, result.rows[0], 'Custom field created', 201);
  } catch (err) {
    if (err.message.includes('duplicate')) return errorResponse(res, 'Field name already exists for this entity', 400);
    errorResponse(res, err.message);
  }
});

router.delete('/custom-fields/:id', authenticate, async (req, res) => {
  try {
    await query(`UPDATE sys_custom_fields SET is_active = false WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= NUMBER RANGES =========
router.get('/number-ranges', authenticate, async (req, res) => {
  try {
    successResponse(res, (await query(`SELECT * FROM sys_number_ranges ORDER BY object_type`)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/number-ranges/:id', authenticate, async (req, res) => {
  try {
    const { prefix, current_number } = req.body;
    const result = await query(
      `UPDATE sys_number_ranges SET prefix=COALESCE($1,prefix), current_number=COALESCE($2,current_number) WHERE id=$3 RETURNING *`,
      [prefix, current_number, req.params.id]);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= SYSTEM CONFIG =========
router.get('/config', authenticate, async (req, res) => {
  try {
    const { group } = req.query;
    let sql = `SELECT * FROM sys_config`;
    const params = [];
    if (group) { sql += ` WHERE config_group = $1`; params.push(group); }
    sql += ` ORDER BY config_group, config_key`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/config/:id', authenticate, async (req, res) => {
  try {
    const { config_value } = req.body;
    const result = await query(`UPDATE sys_config SET config_value=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [config_value, req.params.id]);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= REPORT BUILDER (dynamic query) =========
router.post('/report-query', authenticate, async (req, res) => {
  try {
    const { entity, columns, filters, sort_by, sort_dir, limit } = req.body;

    // Whitelist allowed tables
    const allowedEntities = {
      'business_partners': 'bp_business_partners',
      'materials': 'mm_materials',
      'sales_orders': 'sd_sales_orders',
      'purchase_orders': 'pur_purchase_orders',
      'journal_entries': 'fi_journal_headers',
      'ap_invoices': 'fi_ap_invoices',
      'ar_invoices': 'fi_ar_invoices',
      'payments': 'fi_payments',
      'employees': 'hr_employees',
      'assets': 'am_assets',
      'stock': 'inv_stock',
      'opportunities': 'crm_opportunities',
      'projects': 'ps_projects',
    };

    const table = allowedEntities[entity];
    if (!table) return errorResponse(res, 'Invalid entity', 400);

    const selectCols = columns?.length ? columns.join(', ') : '*';
    let sql = `SELECT ${selectCols} FROM ${table}`;

    const whereParts = [];
    const params = [];
    let idx = 1;
    if (filters) {
      for (const f of filters) {
        if (f.operator === 'like') { whereParts.push(`${f.field} ILIKE $${idx++}`); params.push(`%${f.value}%`); }
        else if (f.operator === 'eq') { whereParts.push(`${f.field} = $${idx++}`); params.push(f.value); }
        else if (f.operator === 'gt') { whereParts.push(`${f.field} > $${idx++}`); params.push(f.value); }
        else if (f.operator === 'lt') { whereParts.push(`${f.field} < $${idx++}`); params.push(f.value); }
        else if (f.operator === 'gte') { whereParts.push(`${f.field} >= $${idx++}`); params.push(f.value); }
        else if (f.operator === 'lte') { whereParts.push(`${f.field} <= $${idx++}`); params.push(f.value); }
      }
    }
    if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;
    if (sort_by) sql += ` ORDER BY ${sort_by} ${sort_dir === 'desc' ? 'DESC' : 'ASC'}`;
    sql += ` LIMIT ${Math.min(parseInt(limit) || 100, 500)}`;

    const result = await query(sql, params);
    successResponse(res, { rows: result.rows, rowCount: result.rowCount, sql: sql.replace(/\$\d+/g, '?') });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// MODULE CONFIGURATION
// ============================================
router.get('/modules', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM sys_module_config ORDER BY sort_order`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Public endpoint — returns enabled module keys (used by sidebar without admin check)
router.get('/modules/enabled', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT module_key FROM sys_module_config WHERE is_enabled = true ORDER BY sort_order`);
    successResponse(res, result.rows.map(r => r.module_key));
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/modules/:key/toggle', authenticate, async (req, res) => {
  try {
    const { is_enabled } = req.body;
    const mod = await query(`SELECT * FROM sys_module_config WHERE module_key = $1`, [req.params.key]);
    if (!mod.rows.length) return errorResponse(res, 'Module not found', 404);
    if (mod.rows[0].is_mandatory && !is_enabled) return errorResponse(res, 'Cannot disable mandatory module', 400);

    // If disabling, check for existing data
    if (!is_enabled) {
      const dataChecks = {
        procurement: [
          { table: 'pur_requisitions', label: 'Purchase Requisitions' },
          { table: 'pur_purchase_orders', label: 'Purchase Orders' },
          { table: 'pur_goods_receipts', label: 'Goods Receipts' },
        ],
        production: [
          { table: 'pp_bom_headers', label: 'Bills of Material' },
          { table: 'pp_production_orders', label: 'Production Orders' },
        ],
        warehouse: [
          { table: 'org_storage_locations', label: 'Storage Locations', condition: "is_active = true" },
        ],
        assets: [
          { table: 'am_assets', label: 'Assets' },
        ],
        hr: [
          { table: 'hr_employees', label: 'Employees' },
          { table: 'hr_leave_requests', label: 'Leave Requests' },
          { table: 'hr_attendance', label: 'Attendance Records' },
        ],
        crm: [
          { table: 'crm_opportunities', label: 'Opportunities' },
          { table: 'crm_activities', label: 'Activities' },
        ],
        projects: [
          { table: 'ps_projects', label: 'Projects' },
        ],
        quality: [
          { table: 'qm_inspection_lots', label: 'Inspection Lots' },
        ],
        maintenance: [
          { table: 'pm_maintenance_orders', label: 'Maintenance Orders' },
        ],
        transport: [
          { table: 'tm_shipments', label: 'Shipments' },
          { table: 'tm_carriers', label: 'Carriers' },
        ],
      };

      const checks = dataChecks[req.params.key];
      if (checks) {
        const blockingData = [];
        for (const check of checks) {
          try {
            const countSql = check.condition
              ? `SELECT COUNT(*) as cnt FROM ${check.table} WHERE ${check.condition}`
              : `SELECT COUNT(*) as cnt FROM ${check.table}`;
            const r = await query(countSql);
            const cnt = parseInt(r.rows[0].cnt);
            if (cnt > 0) blockingData.push({ entity: check.label, count: cnt, table: check.table });
          } catch {}
        }
        if (blockingData.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Cannot disable module — existing data found',
            code: 'MODULE_HAS_DATA',
            blocking_data: blockingData,
            message: `This module contains ${blockingData.reduce((s, d) => s + d.count, 0)} record(s) across ${blockingData.length} entit${blockingData.length > 1 ? 'ies' : 'y'}. Delete or archive the data first.`,
          });
        }
      }
    }

    await query(
      `UPDATE sys_module_config SET is_enabled = $1, enabled_by = $2, enabled_at = NOW(), updated_at = NOW() WHERE module_key = $3`,
      [is_enabled, req.user.id, req.params.key]);
    successResponse(res, null, `Module ${is_enabled ? 'enabled' : 'disabled'}`);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/modules/:key/config', authenticate, async (req, res) => {
  try {
    const { config } = req.body;
    await query(`UPDATE sys_module_config SET config = $1, updated_at = NOW() WHERE module_key = $2`,
      [JSON.stringify(config), req.params.key]);
    successResponse(res, null, 'Module config updated');
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
