import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber } from '../utils/helpers.js';

const router = Router();

router.get('/overview', authenticate, async (req, res) => {
  try {
    const [plants, slocs, stockBySloc, movements] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM org_plants WHERE is_active = true`),
      query(`SELECT COUNT(*) as total FROM org_storage_locations WHERE is_active = true`),
      query(`SELECT sl.sloc_code, sl.sloc_name, p.plant_code,
             COUNT(DISTINCT s.material_id) as materials, COALESCE(SUM(s.quantity),0) as qty
             FROM org_storage_locations sl
             LEFT JOIN org_plants p ON sl.plant_id = p.id
             LEFT JOIN inv_stock s ON sl.id = s.sloc_id AND s.quantity > 0
             GROUP BY sl.id, sl.sloc_code, sl.sloc_name, p.plant_code
             ORDER BY p.plant_code, sl.sloc_code`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE movement_type='receipt') as receipts,
             COUNT(*) FILTER(WHERE movement_type='issue') as issues,
             COUNT(*) FILTER(WHERE movement_type='transfer') as transfers
             FROM inv_stock_movements WHERE posting_date >= CURRENT_DATE - INTERVAL '30 days'`),
    ]);
    successResponse(res, {
      plants: plants.rows[0], storageLocs: slocs.rows[0],
      stockBySloc: stockBySloc.rows, movements: movements.rows[0],
    });
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/locations', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT sl.*, p.plant_code, p.plant_name,
        (SELECT COUNT(DISTINCT s.material_id) FROM inv_stock s WHERE s.sloc_id = sl.id AND s.quantity > 0) as material_count,
        (SELECT COALESCE(SUM(s.quantity),0) FROM inv_stock s WHERE s.sloc_id = sl.id AND s.quantity > 0) as total_qty
       FROM org_storage_locations sl
       JOIN org_plants p ON sl.plant_id = p.id
       WHERE sl.is_active = true
       ORDER BY p.plant_code, sl.sloc_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/location-stock/:slocId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, m.material_code, m.material_name, u.uom_code
       FROM inv_stock s
       JOIN mm_materials m ON s.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON m.base_uom_id = u.id
       WHERE s.sloc_id = $1 AND s.quantity > 0
       ORDER BY m.material_code`, [req.params.slocId]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= P4-30: BIN MANAGEMENT =========
router.get('/bins', authenticate, async (req, res) => {
  try {
    const { sloc_id, show_inactive } = req.query;
    let sql = `SELECT b.*, sl.sloc_code, sl.sloc_name, p.plant_code
               FROM wm_bins b
               JOIN org_storage_locations sl ON b.sloc_id = sl.id
               JOIN org_plants p ON sl.plant_id = p.id`;
    const params = []; let idx = 1;
    const conds = [];
    if (!show_inactive) conds.push(`b.is_active = true`);
    if (sloc_id) { conds.push(`b.sloc_id = $${idx++}`); params.push(sloc_id); }
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY sl.sloc_code, b.aisle, b.rack, b.level`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/bins', authenticate, async (req, res) => {
  try {
    const b = req.body;
    if (!b.bin_code || !b.sloc_id) return errorResponse(res, 'Bin code and storage location required', 400);
    const result = await query(
      `INSERT INTO wm_bins (bin_code, sloc_id, bin_type, aisle, rack, level, max_capacity)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.bin_code, b.sloc_id, b.bin_type||'storage', b.aisle, b.rack, b.level, b.max_capacity||null]);
    successResponse(res, result.rows[0], 'Bin created', 201);
  } catch (err) {
    if (err.message.includes('duplicate')) return errorResponse(res, 'Bin code already exists in this location', 400);
    errorResponse(res, err.message);
  }
});

router.post('/bins/generate', authenticate, async (req, res) => {
  try {
    const { sloc_id, aisles, racks_per_aisle, levels_per_rack } = req.body;
    if (!sloc_id) return errorResponse(res, 'Storage location required', 400);
    let count = 0;
    for (let a = 1; a <= (aisles||1); a++) {
      for (let r = 1; r <= (racks_per_aisle||1); r++) {
        for (let l = 1; l <= (levels_per_rack||1); l++) {
          const code = `${String.fromCharCode(64+a)}-${String(r).padStart(2,'0')}-${String(l).padStart(2,'0')}`;
          try {
            await query(`INSERT INTO wm_bins (bin_code, sloc_id, aisle, rack, level) VALUES ($1,$2,$3,$4,$5)`,
              [code, sloc_id, String.fromCharCode(64+a), String(r), String(l)]);
            count++;
          } catch {}
        }
      }
    }
    successResponse(res, { created: count }, `${count} bins generated`);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= P4-30: CYCLE COUNT =========
router.get('/cycle-counts', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT cc.*, p.plant_code, p.plant_name, sl.sloc_code, sl.sloc_name,
               u.first_name || ' ' || u.last_name as counted_by_name,
               (SELECT COUNT(*) FROM wm_cycle_count_items ci WHERE ci.cycle_count_id = cc.id) as item_count,
               (SELECT COUNT(*) FROM wm_cycle_count_items ci WHERE ci.cycle_count_id = cc.id AND ci.variance != 0) as variance_count
               FROM wm_cycle_counts cc
               LEFT JOIN org_plants p ON cc.plant_id = p.id
               LEFT JOIN org_storage_locations sl ON cc.sloc_id = sl.id
               LEFT JOIN sys_users u ON cc.counted_by = u.id`;
    const params = []; let idx = 1;
    if (status) { sql += ` WHERE cc.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY cc.count_date DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/cycle-counts', authenticate, async (req, res) => {
  try {
    const c = req.body;
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const ccNum = await getNextNumber('CC');

    const result = await query(
      `INSERT INTO wm_cycle_counts (count_number, plant_id, sloc_id, count_date, counted_by, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'planned') RETURNING *`,
      [ccNum, uuid(c.plant_id), uuid(c.sloc_id), c.count_date || new Date(), uuid(c.counted_by) || req.user.id, c.notes]);

    // Auto-populate items from current stock at this location
    if (c.sloc_id) {
      const stock = await query(
        `SELECT material_id, SUM(quantity) as system_qty FROM inv_stock WHERE sloc_id = $1 AND quantity > 0 GROUP BY material_id`,
        [c.sloc_id]);
      for (const s of stock.rows) {
        await query(
          `INSERT INTO wm_cycle_count_items (cycle_count_id, material_id, system_qty) VALUES ($1,$2,$3)`,
          [result.rows[0].id, s.material_id, s.system_qty]);
      }
    }

    successResponse(res, result.rows[0], 'Cycle count created with stock items', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/cycle-counts/:id', authenticate, async (req, res) => {
  try {
    const cc = await query(
      `SELECT cc.*, p.plant_code, sl.sloc_code, sl.sloc_name FROM wm_cycle_counts cc
       LEFT JOIN org_plants p ON cc.plant_id = p.id
       LEFT JOIN org_storage_locations sl ON cc.sloc_id = sl.id WHERE cc.id = $1`, [req.params.id]);
    if (!cc.rows.length) return errorResponse(res, 'Not found', 404);
    const items = await query(
      `SELECT ci.*, m.material_code, m.material_name, u.uom_code
       FROM wm_cycle_count_items ci
       LEFT JOIN mm_materials m ON ci.material_id = m.id
       LEFT JOIN mm_units_of_measure u ON m.base_uom_id = u.id
       WHERE ci.cycle_count_id = $1 ORDER BY m.material_code`, [req.params.id]);
    successResponse(res, { ...cc.rows[0], items: items.rows });
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/cycle-counts/:id/count', authenticate, async (req, res) => {
  try {
    const { items } = req.body;
    for (const item of (items || [])) {
      const counted = parseFloat(item.counted_qty || 0);
      const system = parseFloat(item.system_qty || 0);
      await query(
        `UPDATE wm_cycle_count_items SET counted_qty=$1, variance=$2, variance_reason=$3, status='counted'
         WHERE id=$4`,
        [counted, counted - system, item.variance_reason || null, item.id]);
    }
    await query(`UPDATE wm_cycle_counts SET status='counted', counted_by=$1 WHERE id=$2`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Count recorded');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/cycle-counts/:id/approve', authenticate, async (req, res) => {
  try {
    // Approve and adjust inventory based on counted quantities
    const cc = await query(`SELECT * FROM wm_cycle_counts WHERE id=$1`, [req.params.id]);
    if (!cc.rows.length) return errorResponse(res, 'Not found', 404);

    const items = await query(`SELECT * FROM wm_cycle_count_items WHERE cycle_count_id=$1 AND variance != 0`, [req.params.id]);

    for (const item of items.rows) {
      if (item.variance && parseFloat(item.variance) !== 0) {
        // Create adjustment stock movement
        const smNum = await getNextNumber('SM');
        await query(
          `INSERT INTO inv_stock_movements (doc_number, movement_type, material_id, plant_id, sloc_id, quantity, reference_type, reference_id, reason, created_by)
           VALUES ($1, 'adjustment', $2, $3, $4, $5, 'cycle_count', $6, $7, $8)`,
          [smNum, item.material_id, cc.rows[0].plant_id, cc.rows[0].sloc_id,
           Math.abs(parseFloat(item.variance)), req.params.id, item.variance_reason || 'Cycle count adjustment', req.user.id]);

        // Adjust actual stock
        await query(
          `UPDATE inv_stock SET quantity = quantity + $1, updated_at = NOW()
           WHERE material_id = $2 AND plant_id = $3 AND sloc_id = $4`,
          [parseFloat(item.variance), item.material_id, cc.rows[0].plant_id, cc.rows[0].sloc_id]);
      }
    }

    await query(`UPDATE wm_cycle_counts SET status='approved', approved_by=$1 WHERE id=$2`, [req.user.id, req.params.id]);
    await query(`UPDATE wm_cycle_count_items SET status='approved' WHERE cycle_count_id=$1`, [req.params.id]);
    successResponse(res, null, 'Cycle count approved — inventory adjusted');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete("/bins/:id", authenticate, async (req, res) => {
  try {
    await query("DELETE FROM wm_bins WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Bin deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});

router.post("/bins/bulk-delete", authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return errorResponse(res, "No bins selected", 400);
    const r = await query("DELETE FROM wm_bins WHERE id = ANY($1::uuid[])", [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} bins deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;
