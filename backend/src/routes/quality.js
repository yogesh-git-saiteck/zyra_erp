import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';

const router = Router();

router.get('/overview', authenticate, async (req, res) => {
  try {
    const [lots, results] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE result='pending') as pending,
             COUNT(*) FILTER(WHERE result='pass') as passed, COUNT(*) FILTER(WHERE result='fail') as failed
             FROM qm_inspection_lots`),
      query(`SELECT result, COUNT(*) as count FROM qm_inspection_lots WHERE result != 'pending' GROUP BY result`),
    ]);
    successResponse(res, { lots: lots.rows[0], results: results.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/inspections', authenticate, async (req, res) => {
  try {
    const { result, search, page = 1 } = req.query;
    let sql = `SELECT qi.*, m.material_code, m.material_name, p.plant_code,
               u.first_name || ' ' || u.last_name as inspector_name
               FROM qm_inspection_lots qi
               LEFT JOIN mm_materials m ON qi.material_id = m.id
               LEFT JOIN org_plants p ON qi.plant_id = p.id
               LEFT JOIN sys_users u ON qi.inspector_id = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (result) { sql += ` AND qi.result = $${idx++}`; params.push(result); }
    if (search) { sql += ` AND (qi.doc_number ILIKE $${idx} OR m.material_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY qi.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/inspections', authenticate, async (req, res) => {
  try {
    const { material_id, plant_id, quantity, sample_size, reference_type, reference_id, notes } = req.body;
    if (!material_id) return errorResponse(res, 'Material required', 400);
    const docNumber = await getNextNumber('QI');
    const plantRes = plant_id ? { rows: [{ id: plant_id }] } : await query(`SELECT id FROM org_plants LIMIT 1`);
    const result = await query(
      `INSERT INTO qm_inspection_lots (doc_number, material_id, plant_id, quantity, sample_size,
        reference_type, reference_id, inspector_id, notes, result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') RETURNING *`,
      [docNumber, material_id, plantRes.rows[0]?.id, quantity, sample_size,
       reference_type, reference_id, req.user.id, notes]);
    await auditLog(req.user.id, 'CREATE', 'inspection_lot', result.rows[0].id, null, { doc_number: docNumber }, req);
    successResponse(res, result.rows[0], 'Inspection lot created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/inspections/:id', authenticate, async (req, res) => {
  try {
    const q = req.body;
    const result = await query(
      `UPDATE qm_inspection_lots SET sample_size=COALESCE($1,sample_size), notes=COALESCE($2,notes),
       quantity=COALESCE($3,quantity) WHERE id=$4 AND result='pending' RETURNING *`,
      [q.sample_size, q.notes, q.quantity, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or already completed', 404);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/inspections/:id/result', authenticate, async (req, res) => {
  try {
    const { result, notes, accepted_qty, rejected_qty, rejection_reason } = req.body;
    if (!['pass', 'fail', 'conditional'].includes(result)) return errorResponse(res, 'Invalid result', 400);
    await query(
      `UPDATE qm_inspection_lots SET result=$1, notes=COALESCE($2,notes), inspector_id=$3,
       accepted_qty=$4, rejected_qty=$5, rejection_reason=$6 WHERE id=$7`,
      [result, notes, req.user.id, accepted_qty||null, rejected_qty||0, rejection_reason, req.params.id]);
    await auditLog(req.user.id, 'UPDATE', 'inspection_lot', req.params.id, null, { result }, req);
    successResponse(res, null, `Inspection ${result}`);
  } catch (err) { errorResponse(res, err.message); }
});

// GET inspection detail with criteria
router.get('/inspections/:id', authenticate, async (req, res) => {
  try {
    const insp = await query(
      `SELECT q.*, m.material_code, m.material_name, p.plant_code, p.plant_name,
              u.first_name || ' ' || u.last_name as inspector_name
       FROM qm_inspection_lots q
       LEFT JOIN mm_materials m ON q.material_id = m.id
       LEFT JOIN org_plants p ON q.plant_id = p.id
       LEFT JOIN sys_users u ON q.inspector_id = u.id WHERE q.id = $1`, [req.params.id]);
    if (!insp.rows.length) return errorResponse(res, 'Not found', 404);
    const criteria = await query(`SELECT * FROM qm_inspection_criteria WHERE inspection_id = $1 ORDER BY id`, [req.params.id]);
    successResponse(res, { ...insp.rows[0], criteria: criteria.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= INSPECTION CRITERIA =========
router.post('/inspections/:id/criteria', authenticate, async (req, res) => {
  try {
    const { criteria } = req.body;
    if (!criteria?.length) return errorResponse(res, 'At least one criterion required', 400);
    for (const c of criteria) {
      await query(
        `INSERT INTO qm_inspection_criteria (inspection_id, parameter_name, specification, actual_value, result, remarks)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, c.parameter_name, c.specification, c.actual_value, c.result||'pending', c.remarks]);
    }
    successResponse(res, null, 'Criteria added');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/criteria/:id', authenticate, async (req, res) => {
  try {
    const c = req.body;
    const result = await query(
      `UPDATE qm_inspection_criteria SET actual_value=$1, result=$2, remarks=$3 WHERE id=$4 RETURNING *`,
      [c.actual_value, c.result||'pending', c.remarks, req.params.id]);
    successResponse(res, result.rows[0], 'Criterion updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= NCR (Non-Conformance Reports) =========
router.get('/ncr', authenticate, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT n.*, u1.first_name || ' ' || u1.last_name as raised_by_name,
               u2.first_name || ' ' || u2.last_name as assigned_to_name,
               q.doc_number as inspection_number, m.material_name
               FROM qm_ncr n
               LEFT JOIN sys_users u1 ON n.raised_by = u1.id
               LEFT JOIN sys_users u2 ON n.assigned_to = u2.id
               LEFT JOIN qm_inspection_lots q ON n.inspection_id = q.id
               LEFT JOIN mm_materials m ON q.material_id = m.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND n.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (n.ncr_number ILIKE $${idx} OR n.description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY n.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/ncr', authenticate, async (req, res) => {
  try {
    const n = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const ncrNum = await getNextNumber('NCR');
    const result = await query(
      `INSERT INTO qm_ncr (ncr_number, inspection_id, ncr_type, severity, description, assigned_to, raised_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open') RETURNING *`,
      [ncrNum, uuid(n.inspection_id), n.ncr_type||'material', n.severity||'minor', n.description, uuid(n.assigned_to), req.user.id]);
    successResponse(res, result.rows[0], 'NCR created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/ncr/:id', authenticate, async (req, res) => {
  try {
    const n = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `UPDATE qm_ncr SET root_cause=$1, corrective_action=$2, preventive_action=$3, status=$4,
       assigned_to=$5, closed_date=$6 WHERE id=$7 RETURNING *`,
      [n.root_cause, n.corrective_action, n.preventive_action, n.status,
       uuid(n.assigned_to), n.status === 'closed' ? new Date() : null, req.params.id]);
    successResponse(res, result.rows[0], 'NCR updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete("/inspections/:id", authenticate, async (req, res) => {
  try {
    const q = await query("SELECT status FROM qm_inspection_lots WHERE id = $1", [req.params.id]);
    if (!q.rows.length) return errorResponse(res, "Not found", 404);
    if (q.rows[0].status !== "pending") return errorResponse(res, "Only pending inspections can be deleted", 400);
    await query("DELETE FROM qm_inspection_criteria WHERE inspection_lot_id = $1", [req.params.id]);
    await query("DELETE FROM qm_inspection_lots WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Inspection deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    await query(`DELETE FROM qm_inspection_criteria WHERE inspection_lot_id = ANY($1::uuid[])`, [ids]);
    const r = await query(`DELETE FROM qm_inspection_lots WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
