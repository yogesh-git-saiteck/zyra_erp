import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';

const router = Router();

router.get('/orders', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT mo.*, a.asset_code, a.asset_name, p.plant_code,
               u.first_name || ' ' || u.last_name as assigned_name
               FROM pm_maintenance_orders mo
               LEFT JOIN am_assets a ON mo.asset_id = a.id
               LEFT JOIN org_plants p ON mo.plant_id = p.id
               LEFT JOIN sys_users u ON mo.assigned_to = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND mo.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (mo.doc_number ILIKE $${idx} OR a.asset_name ILIKE $${idx} OR mo.description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY mo.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/orders', authenticate, async (req, res) => {
  try {
    const m = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const docNumber = await getNextNumber('MO');
    const plantRes = await query(`SELECT id FROM org_plants LIMIT 1`);
    const result = await query(
      `INSERT INTO pm_maintenance_orders (doc_number, asset_id, plant_id, order_type, priority,
        description, planned_start, planned_end, assigned_to, estimated_cost, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11) RETURNING *`,
      [docNumber, uuid(m.asset_id), uuid(m.plant_id) || plantRes.rows[0]?.id, m.order_type || 'corrective',
       m.priority || 'medium', m.description, m.planned_start || null, m.planned_end || null,
       uuid(m.assigned_to), num(m.estimated_cost), req.user.id]);
    await auditLog(req.user.id, 'CREATE', 'maintenance_order', result.rows[0].id, null, { doc_number: docNumber }, req);
    successResponse(res, result.rows[0], 'Maintenance order created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/orders/:id', authenticate, async (req, res) => {
  try {
    const m = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `UPDATE pm_maintenance_orders SET asset_id=COALESCE($1,asset_id), order_type=COALESCE($2,order_type),
       priority=COALESCE($3,priority), description=COALESCE($4,description), planned_start=COALESCE($5,planned_start),
       planned_end=COALESCE($6,planned_end), assigned_to=$7, estimated_cost=COALESCE($8,estimated_cost)
       WHERE id=$9 AND status='draft' RETURNING *`,
      [uuid(m.asset_id), m.order_type, m.priority, m.description, m.planned_start || null, m.planned_end || null, uuid(m.assigned_to), num(m.estimated_cost), req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or not in draft status', 404);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/orders/:id/complete', authenticate, async (req, res) => {
  try {
    const { actual_cost } = req.body;
    await query(`UPDATE pm_maintenance_orders SET status='completed', actual_end=CURRENT_DATE, actual_cost=$1 WHERE id=$2`, [actual_cost || 0, req.params.id]);
    successResponse(res, null, 'Maintenance order completed');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete("/orders/:id", authenticate, async (req, res) => {
  try {
    const o = await query("SELECT status FROM pm_maintenance_orders WHERE id = $1", [req.params.id]);
    if (!o.rows.length) return errorResponse(res, "Not found", 404);
    if (o.rows[0].status !== "draft") return errorResponse(res, "Only draft maintenance orders can be deleted", 400);
    await query("DELETE FROM pm_maintenance_orders WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Maintenance order deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const r = await query(`DELETE FROM pm_maintenance_orders WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
