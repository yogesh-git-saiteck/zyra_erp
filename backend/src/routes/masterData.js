import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate, friendlyError } from '../utils/helpers.js';

const router = Router();

// ========= COMPANIES =========
router.get('/companies', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM org_companies WHERE is_active = true ORDER BY company_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= PLANTS =========
router.get('/plants', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.company_name FROM org_plants p
       JOIN org_companies c ON p.company_id = c.id
       WHERE p.is_active = true ORDER BY p.plant_code`
    );
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= STORAGE LOCATIONS =========
router.get('/storage-locations', authenticate, async (req, res) => {
  try {
    const { plant_id } = req.query;
    let sql = `SELECT sl.*, p.plant_code, p.plant_name FROM org_storage_locations sl
               JOIN org_plants p ON sl.plant_id = p.id WHERE sl.is_active = true`;
    const params = [];
    if (plant_id) { sql += ` AND sl.plant_id = $1`; params.push(plant_id); }
    sql += ` ORDER BY sl.sloc_code`;
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= SALES ORGANIZATIONS =========
router.get('/sales-organizations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, c.company_name FROM org_sales_organizations s
       JOIN org_companies c ON s.company_id = c.id WHERE s.is_active = true`
    );
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= COST CENTERS =========
router.get('/cost-centers', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT cc.*, c.company_name, pc.pc_name as profit_center_name
       FROM org_cost_centers cc
       JOIN org_companies c ON cc.company_id = c.id
       LEFT JOIN org_profit_centers pc ON cc.profit_center_id = pc.id
       WHERE cc.is_active = true ORDER BY cc.cc_code`
    );
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= PROFIT CENTERS =========
router.get('/profit-centers', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT pc.*, c.company_name FROM org_profit_centers pc
       JOIN org_companies c ON pc.company_id = c.id WHERE pc.is_active = true`
    );
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= BUSINESS PARTNERS =========
router.get('/business-partners', authenticate, async (req, res) => {
  try {
    const { type, search, page = 1, all } = req.query;
    let sql = `SELECT bp.*, pt.term_name as payment_term
               FROM bp_business_partners bp
               LEFT JOIN fi_payment_terms pt ON bp.payment_term_id = pt.id
               WHERE bp.is_active = true`;
    const params = [];
    let idx = 1;
    if (type) { sql += ` AND bp.bp_type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND (bp.display_name ILIKE $${idx++} OR bp.bp_number ILIKE $${idx})`; params.push(`%${search}%`); idx++; params.push(`%${search}%`); }
    sql += ` ORDER BY bp.display_name`;
    if (!all) sql = paginate(sql, parseInt(page), 50);
    const result = await query(sql, params);
    const countSql = `SELECT COUNT(*) FROM bp_business_partners WHERE is_active = true ${type ? `AND bp_type = '${type}'` : ''}`;
    const countResult = await query(countSql);
    successResponse(res, { rows: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/business-partners', authenticate, async (req, res) => {
  try {
    const bp = req.body;
    const bpNumber = await getNextNumber('BP');
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `INSERT INTO bp_business_partners (bp_number, bp_type, company_id, company_name, display_name, first_name, last_name,
        email, phone, address_line1, city, state, postal_code, country, currency, payment_term_id, credit_limit, tax_id,
        gstin, pan, bank_account_number, bank_ifsc, bank_name, tds_category, billing_address, shipping_address, contact_person, credit_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
      [bpNumber, bp.bp_type, uuid(bp.company_id), bp.company_name, bp.display_name || bp.company_name || `${bp.first_name} ${bp.last_name}`,
       bp.first_name, bp.last_name, bp.email, bp.phone, bp.address_line1, bp.city, bp.state,
       bp.postal_code, bp.country, bp.currency || 'INR', uuid(bp.payment_term_id), num(bp.credit_limit), bp.tax_id,
       bp.gstin, bp.pan, bp.bank_account_number, bp.bank_ifsc, bp.bank_name, bp.tds_category,
       bp.billing_address, bp.shipping_address, bp.contact_person, num(bp.credit_days)]
    );
    await auditLog(req.user.id, 'CREATE', 'business_partner', result.rows[0].id, null, bp, req);
    successResponse(res, result.rows[0], 'Business partner created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/business-partners/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT bp.*, pt.term_name as payment_term FROM bp_business_partners bp
       LEFT JOIN fi_payment_terms pt ON bp.payment_term_id = pt.id WHERE bp.id = $1`, [req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, result.rows[0]);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/business-partners/:id', authenticate, async (req, res) => {
  try {
    const bp = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `UPDATE bp_business_partners SET display_name=$1, company_name=$2, email=$3, phone=$4,
       address_line1=$5, city=$6, state=$7, postal_code=$8, country=$9, credit_limit=$10,
       payment_term_id=$11, gstin=$12, pan=$13, bank_account_number=$14, bank_ifsc=$15,
       bank_name=$16, tds_category=$17, billing_address=$18, shipping_address=$19,
       contact_person=$20, credit_days=$21, updated_at=NOW() WHERE id=$22 RETURNING *`,
      [bp.display_name, bp.company_name, bp.email, bp.phone, bp.address_line1,
       bp.city, bp.state, bp.postal_code, bp.country, num(bp.credit_limit), uuid(bp.payment_term_id),
       bp.gstin, bp.pan, bp.bank_account_number, bp.bank_ifsc, bp.bank_name, bp.tds_category,
       bp.billing_address, bp.shipping_address, bp.contact_person, num(bp.credit_days), req.params.id]
    );
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= MATERIALS =========
// List materials with plant count and total stock
router.get('/materials', authenticate, async (req, res) => {
  try {
    const { search, type, group, page = 1, all } = req.query;
    let sql = `SELECT m.*, mt.type_name, mt.is_produced, mt.is_purchased, mg.group_name, u.uom_code as base_uom,
               (SELECT string_agg(p.plant_code, ', ' ORDER BY p.plant_code)
                FROM mm_material_plant_data mpd JOIN org_plants p ON mpd.plant_id = p.id
                WHERE mpd.material_id = m.id) as assigned_plants,
               (SELECT COUNT(*) FROM mm_material_plant_data mpd WHERE mpd.material_id = m.id)::int as plant_count,
               (SELECT COALESCE(SUM(s.quantity),0) FROM inv_stock s WHERE s.material_id = m.id)::numeric as total_stock
               FROM mm_materials m
               LEFT JOIN mm_material_types mt ON m.material_type_id = mt.id
               LEFT JOIN mm_material_groups mg ON m.material_group_id = mg.id
               LEFT JOIN mm_units_of_measure u ON m.base_uom_id = u.id
               WHERE m.is_active = true`;
    const params = []; let idx = 1;
    if (search) { sql += ` AND (m.material_name ILIKE $${idx} OR m.material_code ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (type) { sql += ` AND m.material_type_id = $${idx++}`; params.push(type); }
    if (group) { sql += ` AND m.material_group_id = $${idx++}`; params.push(group); }
    sql += ` ORDER BY m.material_code`;
    if (!all) sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Material detail with plant data + stock per location
router.get('/materials/:id', authenticate, async (req, res) => {
  try {
    const mat = await query(
      `SELECT m.*, mt.type_name, mg.group_name, u.uom_code as base_uom
       FROM mm_materials m
       LEFT JOIN mm_material_types mt ON m.material_type_id = mt.id
       LEFT JOIN mm_material_groups mg ON m.material_group_id = mg.id
       LEFT JOIN mm_units_of_measure u ON m.base_uom_id = u.id WHERE m.id = $1`, [req.params.id]);
    if (!mat.rows.length) return errorResponse(res, 'Not found', 404);
    const plants = await query(
      `SELECT mpd.*, p.plant_code, p.plant_name FROM mm_material_plant_data mpd
       JOIN org_plants p ON mpd.plant_id = p.id WHERE mpd.material_id = $1`, [req.params.id]);
    const stock = await query(
      `SELECT s.*, p.plant_code, p.plant_name, sl.sloc_code, sl.sloc_name
       FROM inv_stock s LEFT JOIN org_plants p ON s.plant_id = p.id
       LEFT JOIN org_storage_locations sl ON s.sloc_id = sl.id
       WHERE s.material_id = $1 AND s.quantity > 0 ORDER BY p.plant_code`, [req.params.id]);
    successResponse(res, { ...mat.rows[0], plant_data: plants.rows, stock: stock.rows });
  } catch (err) { errorResponse(res, err.message); }
});

// CREATE material with plant assignments
router.post('/materials', authenticate, async (req, res) => {
  try {
    const m = req.body;
    if (!m.material_name) return errorResponse(res, 'Material name is required', 400);
    if (!m.plants?.length) return errorResponse(res, 'At least one plant must be assigned', 400);

    const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const result = await transaction(async (client) => {
      const code = await getNextNumber('MAT');
      const mat = await client.query(
        `INSERT INTO mm_materials (material_code, material_name, description, material_type_id, material_group_id,
          base_uom_id, standard_price, sales_price, currency, is_batch_managed, is_serial_managed,
          hsn_code, sac_code, gst_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [code, m.material_name, m.description || null, uuid(m.material_type_id), uuid(m.material_group_id),
         uuid(m.base_uom_id), num(m.standard_price), num(m.sales_price), m.currency || 'INR',
         m.is_batch_managed || false, m.is_serial_managed || false,
         m.hsn_code || null, m.sac_code || null, num(m.gst_rate) || null]);

      for (const p of m.plants) {
        if (!p.plant_id) continue;
        await client.query(
          `INSERT INTO mm_material_plant_data (material_id, plant_id, reorder_point, safety_stock,
            min_lot_size, max_lot_size, procurement_type, lead_time_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [mat.rows[0].id, p.plant_id, num(p.reorder_point), num(p.safety_stock),
           num(p.min_lot_size), num(p.max_lot_size), p.procurement_type || 'external', num(p.lead_time_days)]);
      }
      return mat.rows[0];
    });
    await auditLog(req.user.id, 'CREATE', 'material', result.id, null, m, req);
    successResponse(res, result, 'Material created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// UPDATE material with plant data
router.put('/materials/:id', authenticate, async (req, res) => {
  try {
    const m = req.body;
    // Helper: empty string → null for UUIDs, → 0 for numbers
    const num = (v) => (v === '' || v === null || v === undefined) ? 0 : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const result = await transaction(async (client) => {
      const mat = await client.query(
        `UPDATE mm_materials SET material_name=$1, description=$2, material_type_id=$3, material_group_id=$4,
         base_uom_id=$5, standard_price=$6, sales_price=$7, is_batch_managed=$8, is_serial_managed=$9,
         hsn_code=$10, sac_code=$11, gst_rate=$12, updated_at=NOW()
         WHERE id=$13 RETURNING *`,
        [m.material_name, m.description || null, uuid(m.material_type_id), uuid(m.material_group_id),
         uuid(m.base_uom_id), num(m.standard_price), num(m.sales_price), m.is_batch_managed || false,
         m.is_serial_managed || false, m.hsn_code || null, m.sac_code || null, num(m.gst_rate) || null, req.params.id]);
      if (m.plants) {
        const plantIds = m.plants.filter(p => p.plant_id).map(p => p.plant_id);
        if (plantIds.length) {
          await client.query(`DELETE FROM mm_material_plant_data WHERE material_id=$1 AND plant_id != ALL($2::uuid[])`, [req.params.id, plantIds]);
        }
        for (const p of m.plants) {
          if (!p.plant_id) continue;
          await client.query(
            `INSERT INTO mm_material_plant_data (material_id, plant_id, reorder_point, safety_stock, procurement_type, lead_time_days)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (material_id, plant_id) DO UPDATE SET
             reorder_point=EXCLUDED.reorder_point, safety_stock=EXCLUDED.safety_stock,
             procurement_type=EXCLUDED.procurement_type, lead_time_days=EXCLUDED.lead_time_days`,
            [req.params.id, p.plant_id, num(p.reorder_point), num(p.safety_stock), p.procurement_type || 'external', num(p.lead_time_days)]);
        }
      }
      return mat.rows[0];
    });
    await auditLog(req.user.id, 'UPDATE', 'material', req.params.id, null, m, req);
    successResponse(res, result, 'Material updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= LOOKUP DATA =========
// ============================================
// MATERIAL TYPES CRUD
// ============================================
router.get('/material-types', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM mm_material_types WHERE is_active = true ORDER BY type_name`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post("/material-types", authenticate, async (req, res) => {
  try {
    const { type_code, type_name, is_stocked, is_purchased, is_sold, is_produced } = req.body;
    if (!type_code || !type_name) return errorResponse(res, "Type code and name are required", 400);
    const r = await query("INSERT INTO mm_material_types (type_code, type_name, is_stocked, is_purchased, is_sold, is_produced) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [type_code.toUpperCase(), type_name, is_stocked !== false, is_purchased !== false, is_sold !== false, is_produced || false]);
    successResponse(res, r.rows[0], "Material type created", 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.put("/material-types/:id", authenticate, async (req, res) => {
  try {
    const { type_name, is_stocked, is_purchased, is_sold, is_produced, is_active } = req.body;
    const r = await query("UPDATE mm_material_types SET type_name=COALESCE($1,type_name), is_stocked=COALESCE($2,is_stocked), is_purchased=COALESCE($3,is_purchased), is_sold=COALESCE($4,is_sold), is_produced=COALESCE($5,is_produced), is_active=COALESCE($6,is_active) WHERE id=$7 RETURNING *",
      [type_name, is_stocked, is_purchased, is_sold, is_produced, is_active, req.params.id]);
    if (!r.rows.length) return errorResponse(res, "Not found", 404);
    successResponse(res, r.rows[0], "Updated");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/material-types/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT COUNT(*) FROM mm_materials WHERE material_type_id = $1", [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, "Cannot delete — " + deps.rows[0].count + " materials use this type", 400);
    await query("DELETE FROM mm_material_types WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Material type deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.get('/material-groups', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM mm_material_groups WHERE is_active = true ORDER BY group_name`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post("/material-groups", authenticate, async (req, res) => {
  try {
    const { group_code, group_name, parent_id } = req.body;
    if (!group_code || !group_name) return errorResponse(res, "Group code and name are required", 400);
    const r = await query("INSERT INTO mm_material_groups (group_code, group_name, parent_id) VALUES ($1,$2,$3) RETURNING *",
      [group_code.toUpperCase(), group_name, parent_id || null]);
    successResponse(res, r.rows[0], "Material group created", 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.put("/material-groups/:id", authenticate, async (req, res) => {
  try {
    const { group_name, parent_id, is_active } = req.body;
    const r = await query("UPDATE mm_material_groups SET group_name=COALESCE($1,group_name), parent_id=$2, is_active=COALESCE($3,is_active) WHERE id=$4 RETURNING *",
      [group_name, parent_id || null, is_active, req.params.id]);
    if (!r.rows.length) return errorResponse(res, "Not found", 404);
    successResponse(res, r.rows[0], "Updated");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/material-groups/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT COUNT(*) FROM mm_materials WHERE material_group_id = $1", [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, "Cannot delete — " + deps.rows[0].count + " materials use this group", 400);
    await query("DELETE FROM mm_material_groups WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Material group deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// ========= UOM =========
router.get('/uom', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM mm_units_of_measure ORDER BY uom_code`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/uom', authenticate, async (req, res) => {
  try {
    const { uom_code, uom_name, uom_type, decimal_places } = req.body;
    if (!uom_code || !uom_name) return errorResponse(res, 'UOM code and name required', 400);
    const r = await query(`INSERT INTO mm_units_of_measure (uom_code, uom_name, uom_type, decimal_places) VALUES ($1,$2,$3,$4) RETURNING *`,
      [uom_code.toUpperCase(), uom_name, uom_type || null, parseInt(decimal_places) || 0]);
    successResponse(res, r.rows[0], 'UOM created', 201);
  } catch (err) { errorResponse(res, err.message.includes('unique') ? 'UOM code already exists' : err.message); }
});
router.put('/uom/:id', authenticate, async (req, res) => {
  try {
    const { uom_name, uom_type, decimal_places } = req.body;
    const r = await query(`UPDATE mm_units_of_measure SET uom_name=$1, uom_type=$2, decimal_places=$3 WHERE id=$4 RETURNING *`,
      [uom_name, uom_type || null, parseInt(decimal_places) || 0, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'UOM updated');
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/uom/:id', authenticate, async (req, res) => {
  try {
    const usage = await query(`SELECT COUNT(*) FROM mm_materials WHERE base_uom_id=$1`, [req.params.id]);
    if (parseInt(usage.rows[0].count) > 0) return errorResponse(res, 'Cannot delete — UOM is used in materials', 400);
    await query(`DELETE FROM mm_units_of_measure WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'UOM deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= PAYMENT TERMS =========
router.get('/payment-terms', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM fi_payment_terms WHERE is_active = true ORDER BY term_code`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/payment-terms', authenticate, async (req, res) => {
  try {
    const { term_code, term_name, days_net, days_discount, discount_percent } = req.body;
    if (!term_code || !term_name) return errorResponse(res, 'Term code and name required', 400);
    const r = await query(`INSERT INTO fi_payment_terms (term_code, term_name, days_net, days_discount, discount_percent) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [term_code.toUpperCase(), term_name, parseInt(days_net) || 30, days_discount ? parseInt(days_discount) : null, discount_percent ? parseFloat(discount_percent) : null]);
    successResponse(res, r.rows[0], 'Payment term created', 201);
  } catch (err) { errorResponse(res, err.message.includes('unique') ? 'Term code already exists' : err.message); }
});
router.put('/payment-terms/:id', authenticate, async (req, res) => {
  try {
    const { term_name, days_net, days_discount, discount_percent } = req.body;
    const r = await query(`UPDATE fi_payment_terms SET term_name=$1, days_net=$2, days_discount=$3, discount_percent=$4 WHERE id=$5 RETURNING *`,
      [term_name, parseInt(days_net) || 30, days_discount ? parseInt(days_discount) : null, discount_percent ? parseFloat(discount_percent) : null, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'Payment term updated');
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/payment-terms/:id', authenticate, async (req, res) => {
  try {
    const usage = await query(`SELECT COUNT(*) FROM sd_sales_orders WHERE payment_term_id=$1`, [req.params.id]);
    if (parseInt(usage.rows[0].count) > 0) return errorResponse(res, 'Cannot delete — payment term is used in orders', 400);
    await query(`UPDATE fi_payment_terms SET is_active=false WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Payment term deactivated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= TAX CODES =========
router.get('/tax-codes', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM fi_tax_codes WHERE is_active = true ORDER BY tax_code`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/tax-codes', authenticate, async (req, res) => {
  try {
    const { tax_code, tax_name, description, tax_rate, tax_type } = req.body;
    if (!tax_code || !tax_name || tax_rate === undefined) return errorResponse(res, 'Code, name, and rate required', 400);
    const compRes = await query(`SELECT id FROM org_companies ORDER BY created_at LIMIT 1`);
    const companyId = compRes.rows[0]?.id;
    const r = await query(`INSERT INTO fi_tax_codes (company_id, tax_code, tax_name, description, tax_rate, tax_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId, tax_code.toUpperCase(), tax_name, description || null, parseFloat(tax_rate), tax_type || 'gst']);
    successResponse(res, r.rows[0], 'Tax code created', 201);
  } catch (err) { errorResponse(res, err.message.includes('unique') ? 'Tax code already exists' : err.message); }
});
router.put('/tax-codes/:id', authenticate, async (req, res) => {
  try {
    const { tax_name, description, tax_rate, tax_type } = req.body;
    const r = await query(`UPDATE fi_tax_codes SET tax_name=$1, description=$2, tax_rate=$3, tax_type=$4 WHERE id=$5 RETURNING *`,
      [tax_name, description || null, parseFloat(tax_rate), tax_type || 'gst', req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'Tax code updated');
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/tax-codes/all', authenticate, async (req, res) => {
  try {
    await query(`UPDATE fi_tax_codes SET is_active=false`);
    successResponse(res, null, 'All tax codes deactivated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/tax-codes/:id', authenticate, async (req, res) => {
  try {
    await query(`UPDATE fi_tax_codes SET is_active=false WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Tax code deactivated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= INCOTERMS =========
router.get('/incoterms', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM sys_incoterms WHERE is_active=true ORDER BY code`)).rows); } catch (err) { errorResponse(res, err.message); }
});
router.post('/incoterms', authenticate, async (req, res) => {
  try {
    const { code, name, description } = req.body;
    if (!code || !name) return errorResponse(res, 'Code and name required', 400);
    const r = await query(`INSERT INTO sys_incoterms (code, name, description) VALUES ($1,$2,$3) RETURNING *`,
      [code.toUpperCase(), name, description || null]);
    successResponse(res, r.rows[0], 'Incoterm created', 201);
  } catch (err) { errorResponse(res, err.message.includes('unique') ? 'Code already exists' : err.message); }
});
router.put('/incoterms/:id', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    const r = await query(`UPDATE sys_incoterms SET name=$1, description=$2 WHERE id=$3 RETURNING *`, [name, description || null, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'Incoterm updated');
  } catch (err) { errorResponse(res, err.message); }
});
router.delete('/incoterms/:id', authenticate, async (req, res) => {
  try {
    await query(`UPDATE sys_incoterms SET is_active=false WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Incoterm deactivated');
  } catch (err) { errorResponse(res, err.message); }
});
router.get('/currencies', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM fi_currencies WHERE is_active = true ORDER BY currency_code`)).rows); } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// CHART OF ACCOUNTS (COA)
// ============================================
router.get('/chart-of-accounts', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT c.*, comp.company_code, comp.company_name,
              (SELECT COUNT(*) FROM fi_gl_accounts g WHERE g.coa_id = c.id AND g.is_active = true) as account_count
       FROM fi_chart_of_accounts c
       LEFT JOIN org_companies comp ON c.company_id = comp.id
       ORDER BY c.coa_code`);
    successResponse(res, r.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/chart-of-accounts', authenticate, async (req, res) => {
  try {
    const { coa_code, coa_name, company_id } = req.body;
    if (!coa_code || !coa_name) return errorResponse(res, 'COA code and name are required', 400);
    if (!company_id) return errorResponse(res, 'Company is required', 400);
    const r = await query(
      `INSERT INTO fi_chart_of_accounts (coa_code, coa_name, company_id) VALUES ($1,$2,$3) RETURNING *`,
      [coa_code.toUpperCase(), coa_name, company_id]);
    successResponse(res, r.rows[0], 'Chart of Accounts created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.put('/chart-of-accounts/:id', authenticate, async (req, res) => {
  try {
    const { coa_name, is_active } = req.body;
    const r = await query(`UPDATE fi_chart_of_accounts SET coa_name=COALESCE($1,coa_name), is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING *`,
      [coa_name, is_active, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'Updated');
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.delete('/chart-of-accounts/:id', authenticate, async (req, res) => {
  try {
    const usage = await query(`SELECT COUNT(*) FROM fi_gl_accounts WHERE coa_id = $1 AND is_active = true`, [req.params.id]);
    if (parseInt(usage.rows[0].count) > 0) return errorResponse(res, `Cannot delete — ${usage.rows[0].count} active GL accounts linked to this COA`, 400);
    await query(`DELETE FROM fi_chart_of_accounts WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Deleted');
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// Seed GL accounts from a standard template
router.post('/chart-of-accounts/:id/seed-template', authenticate, async (req, res) => {
  try {
    const coaId = req.params.id;
    const { template } = req.body;
    const coa = await query(`SELECT * FROM fi_chart_of_accounts WHERE id = $1`, [coaId]);
    if (!coa.rows.length) return errorResponse(res, 'Chart of Accounts not found', 404);

    const TEMPLATES = {
      standard: [
        { account_code: '1000', account_name: 'Cash and Cash Equivalents', account_type: 'asset', account_group: 'Current Assets', is_posting: true },
        { account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset', account_group: 'Current Assets', is_posting: true, is_reconciliation: true },
        { account_code: '1200', account_name: 'Inventory', account_type: 'asset', account_group: 'Current Assets', is_posting: true },
        { account_code: '1300', account_name: 'Prepaid Expenses', account_type: 'asset', account_group: 'Current Assets', is_posting: true },
        { account_code: '1500', account_name: 'Property Plant and Equipment', account_type: 'asset', account_group: 'Fixed Assets', is_posting: true },
        { account_code: '1600', account_name: 'Accumulated Depreciation', account_type: 'asset', account_group: 'Fixed Assets', is_posting: true },
        { account_code: '2000', account_name: 'Accounts Payable', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true, is_reconciliation: true },
        { account_code: '2100', account_name: 'Accrued Liabilities', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true },
        { account_code: '2200', account_name: 'GST / Tax Payable', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true },
        { account_code: '2500', account_name: 'Long Term Loans', account_type: 'liability', account_group: 'Long Term Liabilities', is_posting: true },
        { account_code: '3000', account_name: 'Share Capital', account_type: 'equity', account_group: 'Equity', is_posting: true },
        { account_code: '3100', account_name: 'Retained Earnings', account_type: 'equity', account_group: 'Equity', is_posting: true },
        { account_code: '4000', account_name: 'Sales Revenue', account_type: 'revenue', account_group: 'Revenue', is_posting: true },
        { account_code: '4100', account_name: 'Other Income', account_type: 'revenue', account_group: 'Revenue', is_posting: true },
        { account_code: '5000', account_name: 'Cost of Goods Sold', account_type: 'expense', account_group: 'Cost of Sales', is_posting: true },
        { account_code: '6000', account_name: 'Salaries and Wages', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6100', account_name: 'Rent Expense', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6200', account_name: 'Utilities Expense', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6300', account_name: 'Depreciation Expense', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6400', account_name: 'Marketing and Advertising', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6500', account_name: 'Professional Fees', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6900', account_name: 'Miscellaneous Expenses', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '7000', account_name: 'Interest Expense', account_type: 'expense', account_group: 'Finance Costs', is_posting: true },
        { account_code: '7100', account_name: 'Bank Charges', account_type: 'expense', account_group: 'Finance Costs', is_posting: true },
      ],
      manufacturing: [
        { account_code: '1000', account_name: 'Cash and Cash Equivalents', account_type: 'asset', account_group: 'Current Assets', is_posting: true },
        { account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset', account_group: 'Current Assets', is_posting: true, is_reconciliation: true },
        { account_code: '1200', account_name: 'Raw Material Inventory', account_type: 'asset', account_group: 'Inventory', is_posting: true },
        { account_code: '1210', account_name: 'Work In Progress', account_type: 'asset', account_group: 'Inventory', is_posting: true },
        { account_code: '1220', account_name: 'Finished Goods Inventory', account_type: 'asset', account_group: 'Inventory', is_posting: true },
        { account_code: '1500', account_name: 'Plant and Machinery', account_type: 'asset', account_group: 'Fixed Assets', is_posting: true },
        { account_code: '2000', account_name: 'Accounts Payable', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true, is_reconciliation: true },
        { account_code: '2200', account_name: 'GST / Tax Payable', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true },
        { account_code: '3000', account_name: 'Share Capital', account_type: 'equity', account_group: 'Equity', is_posting: true },
        { account_code: '3100', account_name: 'Retained Earnings', account_type: 'equity', account_group: 'Equity', is_posting: true },
        { account_code: '4000', account_name: 'Product Sales Revenue', account_type: 'revenue', account_group: 'Revenue', is_posting: true },
        { account_code: '5000', account_name: 'Raw Materials Cost', account_type: 'expense', account_group: 'Cost of Production', is_posting: true },
        { account_code: '5100', account_name: 'Direct Labour', account_type: 'expense', account_group: 'Cost of Production', is_posting: true },
        { account_code: '5200', account_name: 'Manufacturing Overhead', account_type: 'expense', account_group: 'Cost of Production', is_posting: true },
        { account_code: '6000', account_name: 'Salaries and Wages', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6300', account_name: 'Depreciation', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '7000', account_name: 'Interest Expense', account_type: 'expense', account_group: 'Finance Costs', is_posting: true },
      ],
      services: [
        { account_code: '1000', account_name: 'Cash and Cash Equivalents', account_type: 'asset', account_group: 'Current Assets', is_posting: true },
        { account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset', account_group: 'Current Assets', is_posting: true, is_reconciliation: true },
        { account_code: '1300', account_name: 'Prepaid Expenses', account_type: 'asset', account_group: 'Current Assets', is_posting: true },
        { account_code: '2000', account_name: 'Accounts Payable', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true, is_reconciliation: true },
        { account_code: '2200', account_name: 'GST / Tax Payable', account_type: 'liability', account_group: 'Current Liabilities', is_posting: true },
        { account_code: '3000', account_name: 'Share Capital', account_type: 'equity', account_group: 'Equity', is_posting: true },
        { account_code: '3100', account_name: 'Retained Earnings', account_type: 'equity', account_group: 'Equity', is_posting: true },
        { account_code: '4000', account_name: 'Service Revenue', account_type: 'revenue', account_group: 'Revenue', is_posting: true },
        { account_code: '4100', account_name: 'Consulting Income', account_type: 'revenue', account_group: 'Revenue', is_posting: true },
        { account_code: '6000', account_name: 'Salaries and Wages', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6100', account_name: 'Rent Expense', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6200', account_name: 'Utilities Expense', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6400', account_name: 'Marketing and Advertising', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '6500', account_name: 'Professional Fees', account_type: 'expense', account_group: 'Operating Expenses', is_posting: true },
        { account_code: '7000', account_name: 'Interest Expense', account_type: 'expense', account_group: 'Finance Costs', is_posting: true },
      ],
    };

    const accounts = TEMPLATES[template] || TEMPLATES['standard'];
    let created = 0;
    for (const acc of accounts) {
      try {
        await query(
          `INSERT INTO fi_gl_accounts (coa_id, account_code, account_name, account_type, account_group, is_posting, is_reconciliation, balance_direction)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
          [coaId, acc.account_code, acc.account_name, acc.account_type, acc.account_group || null,
           acc.is_posting !== false, acc.is_reconciliation || false,
           (acc.account_type === 'asset' || acc.account_type === 'expense') ? 'debit' : 'credit']);
        created++;
      } catch {}
    }
    successResponse(res, { created, template: template || 'standard' }, `${created} GL accounts seeded from ${template || 'standard'} template`);
  } catch (err) { errorResponse(res, err.message); }
});

// Clear all GL accounts for a COA (no journal entries must exist)
router.delete('/chart-of-accounts/:id/gl-accounts', authenticate, async (req, res) => {
  try {
    const coaId = req.params.id;
    // Check if any GL accounts have journal entries
    const usage = await query(
      `SELECT COUNT(*) FROM fi_journal_lines jl JOIN fi_gl_accounts g ON jl.gl_account_id = g.id WHERE g.coa_id = $1`, [coaId]);
    if (parseInt(usage.rows[0].count) > 0) {
      return errorResponse(res, `Cannot clear — ${usage.rows[0].count} journal entries exist against these GL accounts. Delete journal entries first.`, 400);
    }
    const r = await query(`DELETE FROM fi_gl_accounts WHERE coa_id = $1`, [coaId]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} GL accounts deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

// ============================================
// GL ACCOUNTS
// ============================================
router.get('/gl-accounts', authenticate, async (req, res) => {
  try {
    const { type, search } = req.query;
    let sql = `SELECT g.*, c.coa_code FROM fi_gl_accounts g JOIN fi_chart_of_accounts c ON g.coa_id = c.id WHERE g.is_active = true`;
    const params = []; let idx = 1;
    if (type) { sql += ` AND g.account_type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND (g.account_code ILIKE $${idx} OR g.account_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY g.account_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/gl-accounts', authenticate, async (req, res) => {
  try {
    const { account_code, account_name, account_type, account_group, is_reconciliation, is_posting, currency, balance_direction, coa_id } = req.body;
    if (!account_code || !account_name || !account_type) return errorResponse(res, 'Account code, name, and type are required', 400);
    let useCoa = coa_id;
    if (!useCoa) {
      const coaRes = await query(`SELECT id FROM fi_chart_of_accounts LIMIT 1`);
      if (!coaRes.rows.length) return errorResponse(res, 'No Chart of Accounts found. Create one first under Finance → Chart of Accounts.', 400);
      useCoa = coaRes.rows[0].id;
    }
    const result = await query(
      `INSERT INTO fi_gl_accounts (coa_id, account_code, account_name, account_type, account_group, is_reconciliation, is_posting, currency, balance_direction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [useCoa, account_code, account_name, account_type, account_group || null, is_reconciliation || false, is_posting !== false, currency || null,
       balance_direction || (account_type === 'asset' || account_type === 'expense' ? 'debit' : 'credit')]);
    await auditLog(req.user.id, 'CREATE', 'gl_account', result.rows[0].id, null, req.body, req);
    successResponse(res, result.rows[0], 'GL Account created', 201);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.put('/gl-accounts/:id', authenticate, async (req, res) => {
  try {
    const { account_name, account_group, is_reconciliation, is_posting, currency } = req.body;
    const result = await query(
      `UPDATE fi_gl_accounts SET account_name=$1, account_group=$2, is_reconciliation=$3, is_posting=$4, currency=$5 WHERE id=$6 RETURNING *`,
      [account_name, account_group, is_reconciliation || false, is_posting !== false, currency || null, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, result.rows[0], 'GL Account updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/gl-accounts/:id', authenticate, async (req, res) => {
  try {
    const usage = await query(`SELECT COUNT(*) FROM fi_journal_lines WHERE gl_account_id = $1`, [req.params.id]);
    if (parseInt(usage.rows[0].count) > 0) {
      await query(`UPDATE fi_gl_accounts SET is_active = false WHERE id = $1`, [req.params.id]);
      return successResponse(res, null, 'GL Account deactivated (has posted transactions)');
    }
    await query(`DELETE FROM fi_gl_accounts WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'GL Account deleted');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete("/business-partners/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT (SELECT COUNT(*) FROM sd_quotations WHERE customer_id=$1)+(SELECT COUNT(*) FROM sd_sales_orders WHERE customer_id=$1)+(SELECT COUNT(*) FROM pur_purchase_orders WHERE vendor_id=$1)+(SELECT COUNT(*) FROM fi_ap_invoices WHERE vendor_id=$1)+(SELECT COUNT(*) FROM fi_ar_invoices WHERE customer_id=$1) as cnt", [req.params.id]);
    if (parseInt(deps.rows[0].cnt) > 0) return errorResponse(res, "Cannot delete — this business partner has transactions (quotations, orders, or invoices)", 400);
    await query("DELETE FROM bp_business_partners WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Business Partner deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/materials/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT (SELECT COUNT(*) FROM sd_quotation_items WHERE material_id=$1)+(SELECT COUNT(*) FROM sd_so_items WHERE material_id=$1)+(SELECT COUNT(*) FROM pur_po_items WHERE material_id=$1)+(SELECT COUNT(*) FROM inv_stock WHERE material_id=$1) as cnt", [req.params.id]);
    if (parseInt(deps.rows[0].cnt) > 0) return errorResponse(res, "Cannot delete — this material has transactions or stock records", 400);
    await query("DELETE FROM mm_material_plant_data WHERE material_id = $1", [req.params.id]);
    await query("DELETE FROM mm_material_pricing WHERE material_id = $1", [req.params.id]);
    await query("DELETE FROM mm_materials WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Material deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
// ============================================================
// SERVICE MASTER (mm_services)
// ============================================================
router.get('/services', authenticate, async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `SELECT s.*, u.uom_code, u.uom_name FROM mm_services s LEFT JOIN mm_units_of_measure u ON s.uom_id=u.id WHERE s.is_active=true`;
    const params = [];
    if (search) { sql += ` AND (s.service_name ILIKE $1 OR s.service_code ILIKE $1 OR s.sac_code ILIKE $1)`; params.push(`%${search}%`); }
    sql += ` ORDER BY s.service_code`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/services/:id', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT s.*, u.uom_code, u.uom_name FROM mm_services s LEFT JOIN mm_units_of_measure u ON s.uom_id=u.id WHERE s.id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0]);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/services', authenticate, async (req, res) => {
  try {
    const m = req.body;
    if (!m.service_name) return errorResponse(res, 'Service name is required', 400);
    if (!m.sac_code) return errorResponse(res, 'SAC code is required', 400);
    const code = await getNextNumber('SVC');
    const r = await query(
      `INSERT INTO mm_services (service_code, service_name, description, sac_code, service_category, uom_id, standard_rate, currency, gst_rate, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, m.service_name, m.description||null, m.sac_code, m.service_category||null,
       m.uom_id||null, parseFloat(m.standard_rate)||0, m.currency||'INR', parseFloat(m.gst_rate)||18, m.notes||null]);
    successResponse(res, r.rows[0], 'Service created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/services/:id', authenticate, async (req, res) => {
  try {
    const m = req.body;
    if (!m.service_name) return errorResponse(res, 'Service name is required', 400);
    const r = await query(
      `UPDATE mm_services SET service_name=$1, description=$2, sac_code=$3, service_category=$4,
       uom_id=$5, standard_rate=$6, currency=$7, gst_rate=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [m.service_name, m.description||null, m.sac_code||null, m.service_category||null,
       m.uom_id||null, parseFloat(m.standard_rate)||0, m.currency||'INR', parseFloat(m.gst_rate)||18,
       m.notes||null, req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0], 'Service updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/services/:id', authenticate, async (req, res) => {
  try {
    await query(`UPDATE mm_services SET is_active=false WHERE id=$1`, [req.params.id]);
    successResponse(res, null, 'Service deleted');
  } catch (err) { errorResponse(res, err.message); }
});

export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const checks = {
      'business-partners': { table: 'bp_business_partners', deps: "SELECT COUNT(*) FROM sd_quotations WHERE customer_id = ANY($1::uuid[])" },
      'materials': { table: 'mm_materials', deps: "SELECT COUNT(*) FROM sd_quotation_items WHERE material_id = ANY($1::uuid[])", pre: ["DELETE FROM mm_material_plant_data WHERE material_id = ANY($1::uuid[])", "DELETE FROM mm_material_pricing WHERE material_id = ANY($1::uuid[])"] },
      'gl-accounts': { table: 'fi_gl_accounts', deps: "SELECT COUNT(*) FROM fi_journal_lines WHERE gl_account_id = ANY($1::uuid[])" },
      'material-types': { table: 'mm_material_types', deps: "SELECT COUNT(*) FROM mm_materials WHERE material_type_id = ANY($1::uuid[])" },
      'material-groups': { table: 'mm_material_groups', deps: "SELECT COUNT(*) FROM mm_materials WHERE material_group_id = ANY($1::uuid[])" },
    };
    const cfg = checks[entity];
    if (!cfg) return errorResponse(res, 'Unknown entity: ' + entity, 400);
    if (cfg.deps) {
      const d = await query(cfg.deps, [ids]);
      if (parseInt(d.rows[0].count) > 0) return errorResponse(res, `Cannot delete — ${d.rows[0].count} dependent records exist`, 400);
    }
    if (cfg.pre) { for (const sql of cfg.pre) await query(sql, [ids]); }
    const r = await query(`DELETE FROM ${cfg.table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} records deleted`);
  } catch (err) { errorResponse(res, err.message); }
});

// Materials with stock availability (for sales cycle)
router.get('/materials-with-stock', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.id, m.material_code, m.material_name, m.material_type, m.base_uom_id, m.hsn_code,
              m.gst_rate, m.standard_price, m.selling_price,
              COALESCE(SUM(s.quantity), 0) as total_stock
       FROM mm_materials m
       LEFT JOIN inv_stock s ON m.id = s.material_id
       WHERE m.is_active = true
       GROUP BY m.id
       HAVING COALESCE(SUM(s.quantity), 0) > 0
       ORDER BY m.material_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Stock locations for a specific material (plants + slocs with stock)
router.get('/materials/:id/stock-locations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.plant_id, s.sloc_id, s.quantity,
              p.plant_code, p.plant_name,
              sl.sloc_code, sl.sloc_name
       FROM inv_stock s
       LEFT JOIN org_plants p ON s.plant_id = p.id
       LEFT JOIN org_storage_locations sl ON s.sloc_id = sl.id
       WHERE s.material_id = $1 AND s.quantity > 0
       ORDER BY p.plant_code, sl.sloc_code`, [req.params.id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});
