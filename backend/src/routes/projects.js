import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';

const router = Router();

router.get('/projects', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT p.*, u.first_name || ' ' || u.last_name as manager_name,
               bp.display_name as customer_name, pc.pc_name as profit_center_name
               FROM ps_projects p
               LEFT JOIN sys_users u ON p.manager_id = u.id
               LEFT JOIN bp_business_partners bp ON p.customer_id = bp.id
               LEFT JOIN org_profit_centers pc ON p.profit_center_id = pc.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND p.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (p.project_code ILIKE $${idx} OR p.project_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY p.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/projects', authenticate, async (req, res) => {
  try {
    const p = req.body;
    const code = await getNextNumber('PRJ');
    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]); // fallback
    const result = await query(
      `INSERT INTO ps_projects (project_code, project_name, company_id, manager_id, customer_id,
        start_date, end_date, budget, profit_center_id, description, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [code, p.project_name, compRes.rows[0]?.id, p.manager_id || req.user.id, p.customer_id,
       p.start_date, p.end_date, p.budget, p.profit_center_id, p.description, p.status || 'planning']);
    await auditLog(req.user.id, 'CREATE', 'project', result.rows[0].id, null, { project_code: code }, req);
    successResponse(res, result.rows[0], 'Project created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/projects/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    await query(`UPDATE ps_projects SET status=$1, updated_at=NOW() WHERE id=$2`, [status, req.params.id]);
    successResponse(res, null, 'Status updated');
  } catch (err) { errorResponse(res, err.message); }
});

// UPDATE project
router.put('/projects/:id', authenticate, async (req, res) => {
  try {
    const p = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const result = await query(
      `UPDATE ps_projects SET project_name=COALESCE($1,project_name), manager_id=$2, customer_id=$3,
       start_date=$4, end_date=$5, budget=$6, description=$7, status=COALESCE($8,status),
       project_manager_id=$9, project_type=COALESCE($10,project_type), percent_complete=$11, actual_cost=$12,
       profit_center_id=$14
       WHERE id=$13 RETURNING *`,
      [p.project_name, uuid(p.manager_id), uuid(p.customer_id), p.start_date||null, p.end_date||null,
       num(p.budget), p.description, p.status, uuid(p.project_manager_id), p.project_type,
       num(p.percent_complete), num(p.actual_cost), req.params.id, uuid(p.profit_center_id)]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, result.rows[0], 'Project updated');
  } catch (err) { errorResponse(res, err.message); }
});

// GET project detail with tasks + milestones
router.get('/projects/:id', authenticate, async (req, res) => {
  try {
    const project = await query(
      `SELECT p.*, u.first_name || ' ' || u.last_name as manager_name, bp.display_name as customer_name
       FROM ps_projects p LEFT JOIN sys_users u ON p.manager_id = u.id
       LEFT JOIN bp_business_partners bp ON p.customer_id = bp.id WHERE p.id = $1`, [req.params.id]);
    if (!project.rows.length) return errorResponse(res, 'Not found', 404);
    const tasks = await query(
      `SELECT t.*, u.first_name || ' ' || u.last_name as assigned_name
       FROM ps_project_tasks t LEFT JOIN sys_users u ON t.assigned_to = u.id
       WHERE t.project_id = $1 ORDER BY t.sort_order, t.created_at`, [req.params.id]);
    const milestones = await query(
      `SELECT * FROM ps_project_milestones WHERE project_id = $1 ORDER BY due_date`, [req.params.id]);
    successResponse(res, { ...project.rows[0], tasks: tasks.rows, milestones: milestones.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= TASKS =========
router.post('/projects/:id/tasks', authenticate, async (req, res) => {
  try {
    const t = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `INSERT INTO ps_project_tasks (project_id, task_name, description, assigned_to, status, priority, start_date, due_date, estimated_hours, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, t.task_name, t.description, uuid(t.assigned_to), t.status||'todo', t.priority||'medium',
       t.start_date||null, t.due_date||null, t.estimated_hours||null, t.sort_order||0]);
    // Update project % completion
    await updateProjectCompletion(req.params.id);
    successResponse(res, result.rows[0], 'Task created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/tasks/:id', authenticate, async (req, res) => {
  try {
    const t = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `UPDATE ps_project_tasks SET task_name=COALESCE($1,task_name), description=$2, assigned_to=$3,
       status=COALESCE($4,status), priority=COALESCE($5,priority), start_date=$6, due_date=$7,
       estimated_hours=$8, actual_hours=$9, completed_date=$10 WHERE id=$11 RETURNING *`,
      [t.task_name, t.description, uuid(t.assigned_to), t.status, t.priority,
       t.start_date||null, t.due_date||null, t.estimated_hours||null, t.actual_hours||null,
       t.status === 'done' ? new Date() : null, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    // Update project % completion
    if (result.rows[0].project_id) await updateProjectCompletion(result.rows[0].project_id);
    successResponse(res, result.rows[0], 'Task updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    const task = await query(`SELECT project_id FROM ps_project_tasks WHERE id=$1`, [req.params.id]);
    await query(`DELETE FROM ps_project_tasks WHERE id=$1`, [req.params.id]);
    if (task.rows[0]) await updateProjectCompletion(task.rows[0].project_id);
    successResponse(res, null, 'Task deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= MILESTONES =========
router.post('/projects/:id/milestones', authenticate, async (req, res) => {
  try {
    const m = req.body;
    const result = await query(
      `INSERT INTO ps_project_milestones (project_id, milestone_name, due_date, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, m.milestone_name, m.due_date||null, m.status||'pending']);
    successResponse(res, result.rows[0], 'Milestone created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/milestones/:id', authenticate, async (req, res) => {
  try {
    const m = req.body;
    const result = await query(
      `UPDATE ps_project_milestones SET milestone_name=COALESCE($1,milestone_name),
       due_date=$2, status=COALESCE($3,status), completed_date=$4 WHERE id=$5 RETURNING *`,
      [m.milestone_name, m.due_date||null, m.status, m.status === 'completed' ? new Date() : null, req.params.id]);
    successResponse(res, result.rows[0], 'Milestone updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    await query(`DELETE FROM ps_project_tasks WHERE project_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM ps_project_milestones WHERE project_id = ANY($1::uuid[])`, [ids]);
    await query(`DELETE FROM ps_wbs_elements WHERE project_id = ANY($1::uuid[])`, [ids]);
    const r = await query(`DELETE FROM ps_projects WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, err.message); }
});

// Helper: auto-compute project % complete from tasks
async function updateProjectCompletion(projectId) {
  try {
    const result = await query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='done') as done FROM ps_project_tasks WHERE project_id=$1`, [projectId]);
    const total = parseInt(result.rows[0].total);
    const pct = total > 0 ? Math.round((parseInt(result.rows[0].done) / total) * 100) : 0;
    await query(`UPDATE ps_projects SET percent_complete=$1 WHERE id=$2`, [pct, projectId]);
  } catch {}
}

export default router;
