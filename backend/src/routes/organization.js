import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

const router = Router();
const clean = (v) => (v === '' || v === null || v === undefined) ? null : v;

// ========== COMPANIES ==========
router.get('/companies', authenticate, async (req, res) => {
  try {
    const { show_inactive } = req.query;
    let sql = `SELECT c.*, (SELECT COUNT(*) FROM org_plants p WHERE p.company_id = c.id) as plant_count FROM org_companies c`;
    if (!show_inactive) sql += ` WHERE c.is_active = true`;
    sql += ` ORDER BY c.company_code`;
    successResponse(res, (await query(sql)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/companies', authenticate, async (req, res) => {
  try {
    const c = req.body;
    if (!c.company_code || !c.company_name) return errorResponse(res, 'Company Code and Name are required', 400);
    const r = await query(
      `INSERT INTO org_companies (company_code, company_name, country, currency, address_line1, city, state, postal_code, phone, email, tax_id, gstin, pan, cin, logo_url, fiscal_year_start, bank_details, terms_and_conditions, digital_signature_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [c.company_code, c.company_name, c.country||'IN', c.currency||'INR', c.address_line1, c.city, c.state, c.postal_code, c.phone, c.email, c.tax_id, c.gstin, c.pan, c.cin, c.logo_url, c.fiscal_year_start||4, c.bank_details, c.terms_and_conditions, c.digital_signature_url]);
    await auditLog(req.user.id, 'CREATE', 'company', r.rows[0].id, null, c, req);
    successResponse(res, r.rows[0], 'Company created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/companies/:id', authenticate, async (req, res) => {
  try {
    const c = req.body;
    const r = await query(
      `UPDATE org_companies SET company_name=COALESCE($1,company_name), country=COALESCE($2,country), currency=COALESCE($3,currency),
       address_line1=$4, city=$5, state=$6, postal_code=$7, phone=$8, email=$9, tax_id=$10, gstin=$11, pan=$12, cin=$13, logo_url=$14,
       fiscal_year_start=$15, bank_details=$16, terms_and_conditions=$17, digital_signature_url=$18 WHERE id=$19 RETURNING *`,
      [c.company_name, c.country, c.currency, c.address_line1, c.city, c.state, c.postal_code, c.phone, c.email, c.tax_id, c.gstin, c.pan, c.cin, c.logo_url, c.fiscal_year_start||4, c.bank_details, c.terms_and_conditions, c.digital_signature_url, req.params.id]);
    successResponse(res, r.rows[0], 'Company updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/companies/:id/toggle', authenticate, async (req, res) => {
  try { const r = await query(`UPDATE org_companies SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [req.params.id]); successResponse(res, r.rows[0]); }
  catch (err) { errorResponse(res, err.message); }
});

router.delete('/companies/:id', authenticate, async (req, res) => {
  try {
    const chk = await query(`SELECT COUNT(*) as c FROM org_plants WHERE company_id=$1`, [req.params.id]);
    if (parseInt(chk.rows[0].c) > 0) return errorResponse(res, 'Cannot delete — company has plants. Deactivate instead.', 400);
    await query(`DELETE FROM org_companies WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========== PLANTS → belong to Company ==========
router.get('/plants', authenticate, async (req, res) => {
  try {
    const { show_inactive, company_id } = req.query;
    let sql = `SELECT p.*, c.company_name, c.company_code FROM org_plants p JOIN org_companies c ON p.company_id = c.id`;
    const conds = []; const params = []; let i = 1;
    if (!show_inactive) conds.push(`p.is_active = true`);
    if (company_id) { conds.push(`p.company_id = $${i++}`); params.push(company_id); }
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY c.company_code, p.plant_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/plants', authenticate, async (req, res) => {
  try {
    const p = req.body;
    if (!p.plant_code || !p.plant_name) return errorResponse(res, 'Plant Code and Name are required', 400);
    if (!p.company_id) return errorResponse(res, 'Company is required — every plant must belong to a company', 400);
    const r = await query(
      `INSERT INTO org_plants (plant_code, plant_name, company_id, address_line1, city, state, postal_code, country, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [p.plant_code, p.plant_name, p.company_id, p.address_line1, p.city, p.state, p.postal_code, p.country||'IN', p.phone, p.email]);
    await auditLog(req.user.id, 'CREATE', 'plant', r.rows[0].id, null, p, req);
    successResponse(res, r.rows[0], 'Plant created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/plants/:id', authenticate, async (req, res) => {
  try {
    const p = req.body;
    const r = await query(
      `UPDATE org_plants SET plant_name=COALESCE($1,plant_name), company_id=COALESCE($2,company_id),
       address_line1=$3, city=$4, state=$5, postal_code=$6, country=$7, phone=$8, email=$9 WHERE id=$10 RETURNING *`,
      [p.plant_name, clean(p.company_id), p.address_line1, p.city, p.state, p.postal_code, p.country, p.phone, p.email, req.params.id]);
    successResponse(res, r.rows[0], 'Plant updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/plants/:id/toggle', authenticate, async (req, res) => {
  try { const r = await query(`UPDATE org_plants SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [req.params.id]); successResponse(res, r.rows[0]); }
  catch (err) { errorResponse(res, err.message); }
});

router.delete('/plants/:id', authenticate, async (req, res) => {
  try {
    const chk = await query(`SELECT COUNT(*) as c FROM org_storage_locations WHERE plant_id=$1`, [req.params.id]);
    if (parseInt(chk.rows[0].c) > 0) return errorResponse(res, 'Cannot delete — plant has storage locations. Deactivate instead.', 400);
    await query(`DELETE FROM org_plants WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========== STORAGE LOCATIONS → belong to Plant (Company derived) ==========
router.get('/storage-locations', authenticate, async (req, res) => {
  try {
    const { plant_id, company_id, show_inactive } = req.query;
    let sql = `SELECT sl.*, p.plant_code, p.plant_name, c.company_code, c.company_name
               FROM org_storage_locations sl JOIN org_plants p ON sl.plant_id = p.id JOIN org_companies c ON p.company_id = c.id`;
    const conds = []; const params = []; let i = 1;
    if (!show_inactive) conds.push(`sl.is_active = true`);
    if (plant_id) { conds.push(`sl.plant_id = $${i++}`); params.push(plant_id); }
    if (company_id) { conds.push(`p.company_id = $${i++}`); params.push(company_id); }
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY c.company_code, p.plant_code, sl.sloc_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/storage-locations', authenticate, async (req, res) => {
  try {
    const s = req.body;
    if (!s.sloc_code || !s.sloc_name) return errorResponse(res, 'SLoc Code and Name are required', 400);
    if (!s.plant_id) return errorResponse(res, 'Plant is required', 400);
    const r = await query(`INSERT INTO org_storage_locations (sloc_code, sloc_name, plant_id, sloc_type, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [s.sloc_code, s.sloc_name, s.plant_id, s.sloc_type||'general', s.description]);
    successResponse(res, r.rows[0], 'Storage location created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/storage-locations/:id', authenticate, async (req, res) => {
  try {
    const s = req.body;
    const r = await query(`UPDATE org_storage_locations SET sloc_name=COALESCE($1,sloc_name), sloc_type=COALESCE($2,sloc_type), description=$3 WHERE id=$4 RETURNING *`,
      [s.sloc_name, s.sloc_type, s.description, req.params.id]);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/storage-locations/:id/toggle', authenticate, async (req, res) => {
  try { const r = await query(`UPDATE org_storage_locations SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [req.params.id]); successResponse(res, r.rows[0]); }
  catch (err) { errorResponse(res, err.message); }
});

router.delete('/storage-locations/:id', authenticate, async (req, res) => {
  try { await query(`DELETE FROM org_storage_locations WHERE id=$1`, [req.params.id]); successResponse(res, null, 'Deleted'); }
  catch (err) { errorResponse(res, err.message); }
});

// ========== SALES ORGANIZATIONS → assigned to Plant ==========
router.get('/sales-organizations', authenticate, async (req, res) => {
  try {
    const { show_inactive, company_id, plant_id } = req.query;
    let sql = `SELECT s.*, c.company_name, c.company_code, p.plant_code, p.plant_name
               FROM org_sales_organizations s JOIN org_companies c ON s.company_id = c.id LEFT JOIN org_plants p ON s.plant_id = p.id`;
    const conds = []; const params = []; let i = 1;
    if (!show_inactive) conds.push(`s.is_active = true`);
    if (company_id) { conds.push(`s.company_id = $${i++}`); params.push(company_id); }
    if (plant_id) { conds.push(`s.plant_id = $${i++}`); params.push(plant_id); }
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY s.sales_org_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/sales-organizations', authenticate, async (req, res) => {
  try {
    const s = req.body;
    if (!s.sales_org_code || !s.sales_org_name) return errorResponse(res, 'Code and Name required', 400);
    if (!s.company_id) return errorResponse(res, 'Company is required', 400);
    if (!s.plant_id) return errorResponse(res, 'Plant is required — sales org must be assigned to a plant', 400);
    const r = await query(`INSERT INTO org_sales_organizations (sales_org_code, sales_org_name, company_id, plant_id, currency, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [s.sales_org_code, s.sales_org_name, s.company_id, s.plant_id, s.currency||'INR', s.description]);
    successResponse(res, r.rows[0], 'Sales organization created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/sales-organizations/:id', authenticate, async (req, res) => {
  try {
    const s = req.body;
    const r = await query(`UPDATE org_sales_organizations SET sales_org_name=COALESCE($1,sales_org_name), currency=$2, description=$3, plant_id=$4 WHERE id=$5 RETURNING *`,
      [s.sales_org_name, s.currency, s.description, clean(s.plant_id), req.params.id]);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/sales-organizations/:id/toggle', authenticate, async (req, res) => {
  try { const r = await query(`UPDATE org_sales_organizations SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [req.params.id]); successResponse(res, r.rows[0]); }
  catch (err) { errorResponse(res, err.message); }
});

// ========== PROFIT CENTERS → Company + Plant ==========
router.get('/profit-centers', authenticate, async (req, res) => {
  try {
    const { show_inactive, company_id, plant_id } = req.query;
    let sql = `SELECT pc.*, c.company_name, c.company_code, p.plant_code, p.plant_name
               FROM org_profit_centers pc JOIN org_companies c ON pc.company_id = c.id LEFT JOIN org_plants p ON pc.plant_id = p.id`;
    const conds = []; const params = []; let i = 1;
    if (!show_inactive) conds.push(`pc.is_active = true`);
    if (company_id) { conds.push(`pc.company_id = $${i++}`); params.push(company_id); }
    if (plant_id) { conds.push(`pc.plant_id = $${i++}`); params.push(plant_id); }
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY pc.pc_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/profit-centers', authenticate, async (req, res) => {
  try {
    const pc = req.body;
    if (!pc.pc_code || !pc.pc_name) return errorResponse(res, 'Code and Name required', 400);
    if (!pc.company_id) return errorResponse(res, 'Company is required', 400);
    const r = await query(`INSERT INTO org_profit_centers (pc_code, pc_name, company_id, plant_id, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [pc.pc_code, pc.pc_name, pc.company_id, clean(pc.plant_id), pc.description]);
    successResponse(res, r.rows[0], 'Profit center created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/profit-centers/:id', authenticate, async (req, res) => {
  try {
    const pc = req.body;
    const r = await query(`UPDATE org_profit_centers SET pc_name=COALESCE($1,pc_name), description=$2, plant_id=$3 WHERE id=$4 RETURNING *`,
      [pc.pc_name, pc.description, clean(pc.plant_id), req.params.id]);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/profit-centers/:id/toggle', authenticate, async (req, res) => {
  try { const r = await query(`UPDATE org_profit_centers SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [req.params.id]); successResponse(res, r.rows[0]); }
  catch (err) { errorResponse(res, err.message); }
});

// ========== COST CENTERS → Company + Plant ==========
router.get('/cost-centers', authenticate, async (req, res) => {
  try {
    const { show_inactive, company_id, plant_id } = req.query;
    let sql = `SELECT cc.*, c.company_name, c.company_code, p.plant_code, p.plant_name, pc.pc_code as profit_center_code, pc.pc_name as profit_center_name
               FROM org_cost_centers cc JOIN org_companies c ON cc.company_id = c.id LEFT JOIN org_plants p ON cc.plant_id = p.id LEFT JOIN org_profit_centers pc ON cc.profit_center_id = pc.id`;
    const conds = []; const params = []; let i = 1;
    if (!show_inactive) conds.push(`cc.is_active = true`);
    if (company_id) { conds.push(`cc.company_id = $${i++}`); params.push(company_id); }
    if (plant_id) { conds.push(`cc.plant_id = $${i++}`); params.push(plant_id); }
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY cc.cc_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/cost-centers', authenticate, async (req, res) => {
  try {
    const cc = req.body;
    if (!cc.cc_code || !cc.cc_name) return errorResponse(res, 'Code and Name required', 400);
    if (!cc.company_id) return errorResponse(res, 'Company is required', 400);
    const r = await query(`INSERT INTO org_cost_centers (cc_code, cc_name, company_id, plant_id, category, profit_center_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cc.cc_code, cc.cc_name, cc.company_id, clean(cc.plant_id), cc.category||'operational', clean(cc.profit_center_id), cc.description]);
    successResponse(res, r.rows[0], 'Cost center created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/cost-centers/:id', authenticate, async (req, res) => {
  try {
    const cc = req.body;
    const r = await query(`UPDATE org_cost_centers SET cc_name=COALESCE($1,cc_name), category=$2, profit_center_id=$3, description=$4, plant_id=$5 WHERE id=$6 RETURNING *`,
      [cc.cc_name, cc.category, clean(cc.profit_center_id), cc.description, clean(cc.plant_id), req.params.id]);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/cost-centers/:id/toggle', authenticate, async (req, res) => {
  try { const r = await query(`UPDATE org_cost_centers SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [req.params.id]); successResponse(res, r.rows[0]); }
  catch (err) { errorResponse(res, err.message); }
});

export default router;
