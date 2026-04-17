import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';
import { checkBusinessRules } from '../utils/ruleEngine.js';

const router = Router();

router.get('/overview', authenticate, async (req, res) => {
  try {
    const [assets, classes, depreciation] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='active') as active,
             COALESCE(SUM(acquisition_cost),0) as total_cost, COALESCE(SUM(net_book_value),0) as total_nbv,
             COALESCE(SUM(accumulated_depreciation),0) as total_dep FROM am_assets`),
      query(`SELECT COUNT(*) as total FROM am_asset_classes`),
      query(`SELECT COUNT(*) as total FROM am_depreciation_runs`),
    ]);
    successResponse(res, { assets: assets.rows[0], classes: classes.rows[0], depreciation: depreciation.rows[0] });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/assets', authenticate, async (req, res) => {
  try {
    const { status, class_id, search, page = 1 } = req.query;
    let sql = `SELECT a.*, ac.class_name, ac.depreciation_method, p.plant_code, cc.cc_code, cc.cc_name
               FROM am_assets a
               LEFT JOIN am_asset_classes ac ON a.class_id = ac.id
               LEFT JOIN org_plants p ON a.plant_id = p.id
               LEFT JOIN org_cost_centers cc ON a.cost_center_id = cc.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND a.status = $${idx++}`; params.push(status); }
    if (class_id) { sql += ` AND a.class_id = $${idx++}`; params.push(class_id); }
    if (search) { sql += ` AND (a.asset_code ILIKE $${idx} OR a.asset_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY a.asset_code`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/assets', authenticate, async (req, res) => {
  try {
    const a = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const brCheck = await checkBusinessRules('asset', { ...a, acquisition_cost: num(a.acquisition_cost) }, 'before_save');
    if (brCheck.blocked) return errorResponse(res, brCheck.message, 422);

    const assetCode = await getNextNumber('AST');
    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]); // fallback
    const nbv = num(a.acquisition_cost) - num(a.salvage_value);
    const result = await query(
      `INSERT INTO am_assets (asset_code, asset_name, description, class_id, company_id, plant_id,
        cost_center_id, acquisition_date, acquisition_cost, salvage_value, net_book_value,
        useful_life_months, depreciation_start_date, location, serial_number, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active') RETURNING *`,
      [assetCode, a.asset_name, a.description, uuid(a.class_id), compRes.rows[0]?.id, uuid(a.plant_id),
       uuid(a.cost_center_id), a.acquisition_date || null, num(a.acquisition_cost), num(a.salvage_value), nbv,
       a.useful_life_months || 60, a.depreciation_start_date || a.acquisition_date || null, a.location, a.serial_number]);
    await auditLog(req.user.id, 'CREATE', 'asset', result.rows[0].id, null, { asset_code: assetCode }, req);
    successResponse(res, result.rows[0], 'Asset created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/assets/:id', authenticate, async (req, res) => {
  try {
    const a = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const brCheck = await checkBusinessRules('asset', { ...a, acquisition_cost: parseFloat(a.acquisition_cost || 0) }, 'before_save');
    if (brCheck.blocked) return errorResponse(res, brCheck.message, 422);

    const result = await query(
      `UPDATE am_assets SET asset_name=$1, description=$2, class_id=$3, plant_id=$4, cost_center_id=$5,
       location=$6, serial_number=$7, useful_life_months=$8, updated_at=NOW() WHERE id=$9 RETURNING *`,
      [a.asset_name, a.description, uuid(a.class_id), uuid(a.plant_id), uuid(a.cost_center_id),
       a.location, a.serial_number, a.useful_life_months || 60, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    await auditLog(req.user.id, 'UPDATE', 'asset', req.params.id, null, a, req);
    successResponse(res, result.rows[0], 'Asset updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/assets/:id/dispose', authenticate, async (req, res) => {
  try {
    const { disposal_amount } = req.body;
    await query(`UPDATE am_assets SET status='disposed', disposed_date=CURRENT_DATE, disposal_amount=$1 WHERE id=$2`, [disposal_amount || 0, req.params.id]);
    successResponse(res, null, 'Asset disposed');
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/classes', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM am_asset_classes WHERE is_active = true ORDER BY class_code`)).rows); }
  catch (err) { errorResponse(res, err.message); }
});

router.delete("/assets/:id", authenticate, async (req, res) => {
  try {
    const a = await query("SELECT status FROM am_assets WHERE id = $1", [req.params.id]);
    if (!a.rows.length) return errorResponse(res, "Not found", 404);
    if (a.rows[0].status === "disposed") return errorResponse(res, "Cannot delete disposed assets", 400);
    const deps = await query("SELECT COUNT(*) FROM am_depreciation_runs WHERE asset_id = $1", [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, "Cannot delete — depreciation runs exist", 400);
    await query("DELETE FROM am_assets WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Asset deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const r = await query(`DELETE FROM am_assets WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
