import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, paginate } from '../utils/helpers.js';

const router = Router();

// ========= OPPORTUNITIES =========
router.get('/opportunities', authenticate, async (req, res) => {
  try {
    const { stage, status, search, page = 1 } = req.query;
    let sql = `SELECT o.*, bp.display_name as customer_name, bp.bp_number,
               u.first_name || ' ' || u.last_name as owner_name
               FROM crm_opportunities o
               LEFT JOIN bp_business_partners bp ON o.customer_id = bp.id
               LEFT JOIN sys_users u ON o.owner_id = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (stage) { sql += ` AND o.stage = $${idx++}`; params.push(stage); }
    if (status) { sql += ` AND o.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (o.opportunity_name ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY o.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/opportunities', authenticate, async (req, res) => {
  try {
    const o = req.body;
    const result = await query(
      `INSERT INTO crm_opportunities (opportunity_name, customer_id, owner_id, stage, probability,
        expected_value, currency, expected_close, source, description, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open') RETURNING *`,
      [o.opportunity_name, o.customer_id, o.owner_id || req.user.id, o.stage || 'prospect',
       o.probability || 10, o.expected_value, o.currency || 'INR', o.expected_close,
       o.source, o.description]);
    await auditLog(req.user.id, 'CREATE', 'opportunity', result.rows[0].id, null, o, req);
    successResponse(res, result.rows[0], 'Opportunity created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/opportunities/:id', authenticate, async (req, res) => {
  try {
    const o = req.body;
    const result = await query(
      `UPDATE crm_opportunities SET opportunity_name=$1, stage=$2, probability=$3,
        expected_value=$4, expected_close=$5, description=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [o.opportunity_name, o.stage, o.probability, o.expected_value, o.expected_close, o.description, req.params.id]);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/opportunities/:id/won', authenticate, async (req, res) => {
  try {
    await query(`UPDATE crm_opportunities SET status='won', stage='closed_won', probability=100, won_date=CURRENT_DATE, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Opportunity marked as Won');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/opportunities/:id/lost', authenticate, async (req, res) => {
  try {
    const { lost_reason } = req.body;
    await query(`UPDATE crm_opportunities SET status='lost', stage='closed_lost', probability=0, lost_reason=$1, updated_at=NOW() WHERE id=$2`, [lost_reason, req.params.id]);
    successResponse(res, null, 'Opportunity marked as Lost');
  } catch (err) { errorResponse(res, err.message); }
});

// Pipeline summary
router.get('/pipeline', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_value),0) as value
       FROM crm_opportunities WHERE status = 'open'
       GROUP BY stage ORDER BY
       CASE stage WHEN 'prospect' THEN 1 WHEN 'qualification' THEN 2 WHEN 'proposal' THEN 3
       WHEN 'negotiation' THEN 4 WHEN 'closed_won' THEN 5 ELSE 6 END`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= ACTIVITIES =========
router.get('/activities', authenticate, async (req, res) => {
  try {
    const { bp_id, opportunity_id, status, page = 1 } = req.query;
    let sql = `SELECT a.*, bp.display_name as bp_name, o.opportunity_name,
               u.first_name || ' ' || u.last_name as owner_name
               FROM crm_activities a
               LEFT JOIN bp_business_partners bp ON a.bp_id = bp.id
               LEFT JOIN crm_opportunities o ON a.opportunity_id = o.id
               LEFT JOIN sys_users u ON a.owner_id = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (bp_id) { sql += ` AND a.bp_id = $${idx++}`; params.push(bp_id); }
    if (opportunity_id) { sql += ` AND a.opportunity_id = $${idx++}`; params.push(opportunity_id); }
    if (status) { sql += ` AND a.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY a.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/activities', authenticate, async (req, res) => {
  try {
    const a = req.body;
    const result = await query(
      `INSERT INTO crm_activities (activity_type, subject, description, bp_id, opportunity_id,
        owner_id, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'open') RETURNING *`,
      [a.activity_type, a.subject, a.description, a.bp_id, a.opportunity_id,
       a.owner_id || req.user.id, a.due_date]);
    successResponse(res, result.rows[0], 'Activity created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/activities/:id/complete', authenticate, async (req, res) => {
  try {
    await query(`UPDATE crm_activities SET status='completed', completed_at=NOW() WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Activity completed');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete("/opportunities/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT COUNT(*) FROM crm_activities WHERE opportunity_id = $1", [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, "Cannot delete — activities exist for this opportunity. Delete activities first.", 400);
    await query("DELETE FROM crm_opportunities WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Opportunity deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/activities/:id", authenticate, async (req, res) => {
  try { await query("DELETE FROM crm_activities WHERE id = $1", [req.params.id]); successResponse(res, null, "Activity deleted"); }
  catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const tables = { 'opportunities': 'crm_opportunities', 'activities': 'crm_activities' };
    const table = tables[entity];
    if (!table) return errorResponse(res, 'Unknown entity', 400);
    const r = await query(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
