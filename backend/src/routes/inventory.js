import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';
import { getConfigBool } from '../utils/configService.js';

const router = Router();

// ========= STOCK OVERVIEW =========
router.get('/stock', authenticate, async (req, res) => {
  try {
    const { plant_id, sloc_id, search, page = 1 } = req.query;
    let sql = `SELECT s.*, m.material_code, m.material_name, mt.type_name,
               p.plant_code, p.plant_name, sl.sloc_code, sl.sloc_name,
               u.uom_code, m.standard_price,
               (s.quantity * COALESCE(m.standard_price, 0)) as stock_value
               FROM inv_stock s
               JOIN mm_materials m ON s.material_id = m.id
               LEFT JOIN mm_material_types mt ON m.material_type_id = mt.id
               LEFT JOIN org_plants p ON s.plant_id = p.id
               LEFT JOIN org_storage_locations sl ON s.sloc_id = sl.id
               LEFT JOIN mm_units_of_measure u ON m.base_uom_id = u.id
               WHERE s.quantity > 0`;
    const params = []; let idx = 1;
    if (plant_id) { sql += ` AND s.plant_id = $${idx++}`; params.push(plant_id); }
    if (sloc_id) { sql += ` AND s.sloc_id = $${idx++}`; params.push(sloc_id); }
    if (search) { sql += ` AND (m.material_code ILIKE $${idx} OR m.material_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY m.material_code`;
    sql = paginate(sql, parseInt(page), 100);
    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Stock summary
router.get('/stock-summary', authenticate, async (req, res) => {
  try {
    const [total, byPlant, lowStock, value] = await Promise.all([
      query(`SELECT COUNT(DISTINCT material_id) as materials, COALESCE(SUM(quantity),0) as total_qty FROM inv_stock WHERE quantity > 0`),
      query(`SELECT p.plant_code, p.plant_name, COUNT(DISTINCT s.material_id) as materials, COALESCE(SUM(s.quantity),0) as qty
             FROM inv_stock s JOIN org_plants p ON s.plant_id = p.id WHERE s.quantity > 0 GROUP BY p.id ORDER BY p.plant_code`),
      query(`SELECT COUNT(*) as count FROM inv_stock s
             JOIN mm_material_plant_data mpd ON s.material_id = mpd.material_id AND s.plant_id = mpd.plant_id
             WHERE s.quantity <= mpd.reorder_point AND s.quantity > 0`),
      query(`SELECT COALESCE(SUM(s.quantity * COALESCE(m.standard_price, 0)),0) as total_value
             FROM inv_stock s JOIN mm_materials m ON s.material_id = m.id WHERE s.quantity > 0`),
    ]);
    successResponse(res, {
      totalMaterials: total.rows[0]?.materials || 0,
      totalQuantity: total.rows[0]?.total_qty || 0,
      totalValue: value.rows[0]?.total_value || 0,
      lowStockCount: lowStock.rows[0]?.count || 0,
      byPlant: byPlant.rows,
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= STOCK MOVEMENTS =========
router.get('/movements', authenticate, async (req, res) => {
  try {
    const { type, search, page = 1 } = req.query;
    let sql = `SELECT sm.*, m.material_code, m.material_name, p.plant_code,
               sl.sloc_code, u.uom_code, usr.first_name || ' ' || usr.last_name as created_by_name
               FROM inv_stock_movements sm
               LEFT JOIN mm_materials m ON sm.material_id = m.id
               LEFT JOIN org_plants p ON sm.plant_id = p.id
               LEFT JOIN org_storage_locations sl ON sm.sloc_id = sl.id
               LEFT JOIN mm_units_of_measure u ON sm.uom_id = u.id
               LEFT JOIN sys_users usr ON sm.created_by = usr.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (type) { sql += ` AND sm.movement_type = $${idx++}`; params.push(type); }
    if (search) { sql += ` AND (sm.doc_number ILIKE $${idx} OR m.material_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY sm.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Post stock movement — with auto GL posting
router.post('/movements', authenticate, async (req, res) => {
  try {
    const { movement_type, material_id, plant_id, sloc_id, quantity, batch_number, uom_id,
            reference_type, reference_id, cost_center_id, project_id,
            to_plant_id, to_sloc_id, reason } = req.body;
    if (!material_id || !plant_id || !quantity || !movement_type) return errorResponse(res, 'Material, plant, quantity, and type required', 400);
    if (['issue', 'scrap'].includes(movement_type) && !cost_center_id && !project_id) return errorResponse(res, 'Cost center or project required for goods issue/scrap', 400);
    if (movement_type === 'transfer' && !to_plant_id && !to_sloc_id) return errorResponse(res, 'Destination plant or storage location required for transfer', 400);

    const toUuid = (v) => (v === '' || v === null || v === undefined) ? null : v;

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber('SM');
      const qty = parseFloat(quantity);

      // Get material value (standard price)
      const mat = await client.query(`SELECT standard_price FROM mm_materials WHERE id = $1`, [material_id]);
      const unitPrice = parseFloat(mat.rows[0]?.standard_price || 0);
      const valueAmt = qty * unitPrice;

      // Insert movement
      const mv = await client.query(
        `INSERT INTO inv_stock_movements (doc_number, movement_type, material_id, plant_id, sloc_id,
          batch_number, quantity, uom_id, reference_type, reference_id, cost_center_id, project_id,
          to_plant_id, to_sloc_id, reason, value_amount, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [docNumber, movement_type, material_id, plant_id, toUuid(sloc_id), batch_number,
         qty, toUuid(uom_id), reference_type, toUuid(reference_id), toUuid(cost_center_id), toUuid(project_id),
         toUuid(to_plant_id), toUuid(to_sloc_id), reason, valueAmt, req.user.id]);

      // Update source stock (decrease for issue/scrap/transfer, increase for receipt/return)
      const delta = ['receipt', 'return'].includes(movement_type) ? qty : -qty;
      // BUG #3 FIX: Add row locking to prevent race conditions in concurrent stock updates
      const existing = await client.query(
        `SELECT id, quantity FROM inv_stock WHERE material_id=$1 AND plant_id=$2 AND COALESCE(sloc_id::text,'')=COALESCE($3::text,'') FOR UPDATE`,
        [material_id, plant_id, toUuid(sloc_id)]);

      if (existing.rows.length) {
        const newQty = parseFloat(existing.rows[0].quantity) + delta;
        if (newQty < 0) {
          const allowNegative = await getConfigBool('inventory.negative_stock_allowed', false);
          if (!allowNegative && !['adjustment'].includes(movement_type)) {
            throw new Error(`Insufficient stock. Available: ${existing.rows[0].quantity}`);
          }
        }
        const storedQty = (newQty < 0 && !(await getConfigBool('inventory.negative_stock_allowed', false))) ? 0 : newQty;
        await client.query(`UPDATE inv_stock SET quantity=$1, updated_at=NOW() WHERE id=$2`, [storedQty, existing.rows[0].id]);
      } else {
        if (delta < 0) {
          const allowNegative = await getConfigBool('inventory.negative_stock_allowed', false);
          if (!allowNegative) throw new Error('No stock available for this material/plant');
          await client.query(`INSERT INTO inv_stock (material_id, plant_id, sloc_id, quantity) VALUES ($1,$2,$3,$4)`, [material_id, plant_id, toUuid(sloc_id), delta]);
        } else {
          await client.query(`INSERT INTO inv_stock (material_id, plant_id, sloc_id, quantity) VALUES ($1,$2,$3,$4)`, [material_id, plant_id, toUuid(sloc_id), delta]);
        }
      }

      // For transfers: add stock at destination
      if (movement_type === 'transfer') {
        const destPlant = to_plant_id || plant_id;
        const destSloc = to_sloc_id || null;
        // BUG #3 FIX: Add row locking to destination stock as well
        const destStock = await client.query(
          `SELECT id, quantity FROM inv_stock WHERE material_id=$1 AND plant_id=$2 AND COALESCE(sloc_id::text,'')=COALESCE($3::text,'') FOR UPDATE`,
          [material_id, destPlant, toUuid(destSloc)]);
        if (destStock.rows.length) {
          await client.query(`UPDATE inv_stock SET quantity=quantity+$1, updated_at=NOW() WHERE id=$2`, [qty, destStock.rows[0].id]);
        } else {
          await client.query(`INSERT INTO inv_stock (material_id, plant_id, sloc_id, quantity) VALUES ($1,$2,$3,$4)`, [material_id, destPlant, toUuid(destSloc), qty]);
        }
      }

      // GL Posting — auto-post JE for goods issue, scrap, adjustment, inter-plant transfer
      const shouldPostGL = ['issue', 'scrap', 'adjustment', 'return'].includes(movement_type)
        || (movement_type === 'transfer' && to_plant_id && to_plant_id !== plant_id);

      if (shouldPostGL && valueAmt > 0) {
        const jeDocNum = await getNextNumber('JE');
        const compRes = await client.query(`SELECT company_id FROM org_plants WHERE id = $1`, [plant_id]);
        const companyId = compRes.rows[0]?.company_id;

        const je = await client.query(
          `INSERT INTO fi_journal_headers (doc_number, company_id, posting_date, document_date, reference, description,
            currency, total_debit, total_credit, status, created_by, posted_by, posted_at)
           VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,$3,$4,'INR',$5,$5,'posted',$6,$6,NOW()) RETURNING *`,
          [jeDocNum, companyId, `SM:${docNumber}`, `${TYPE_LABELS[movement_type] || movement_type} — ${docNumber}`,
           valueAmt.toFixed(2), req.user.id]);

        // Resolve GL accounts from mapping
        const inventoryGl = (await client.query(`SELECT gl_account_id FROM fi_gl_mapping WHERE mapping_key='inventory_stock' AND gl_account_id IS NOT NULL`)).rows[0]?.gl_account_id
          || (await client.query(`SELECT id FROM fi_gl_accounts WHERE (account_name ILIKE '%stock in hand%' OR account_name ILIKE '%inventory%') AND is_active=true LIMIT 1`)).rows[0]?.id;
        const cogsGl = (await client.query(`SELECT gl_account_id FROM fi_gl_mapping WHERE mapping_key='cogs' AND gl_account_id IS NOT NULL`)).rows[0]?.gl_account_id
          || (await client.query(`SELECT id FROM fi_gl_accounts WHERE (account_name ILIKE '%cost of goods%' OR account_name ILIKE '%cogs%') AND is_active=true LIMIT 1`)).rows[0]?.id;

        let ln = 0;
        if (movement_type === 'issue') {
          // Goods Issue: Dr COGS/Expense, Cr Inventory
          if (cogsGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description, cost_center_id) VALUES ($1,$2,$3,$4,0,$5,$6)`, [je.rows[0].id, ln, cogsGl, valueAmt, `COGS — ${docNumber}`, toUuid(cost_center_id)]); }
          if (inventoryGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,0,$4,$5)`, [je.rows[0].id, ln, inventoryGl, valueAmt, `Inventory reduction — ${docNumber}`]); }
        } else if (movement_type === 'scrap') {
          // Scrap: Dr Scrap/Write-off Expense, Cr Inventory
          const writeOffGl = (await client.query(`SELECT id FROM fi_gl_accounts WHERE (account_name ILIKE '%write off%' OR account_name ILIKE '%scrap%' OR account_name ILIKE '%stock adjustment%') AND is_active=true LIMIT 1`)).rows[0]?.id || cogsGl;
          if (writeOffGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description, cost_center_id) VALUES ($1,$2,$3,$4,0,$5,$6)`, [je.rows[0].id, ln, writeOffGl, valueAmt, `Scrap — ${docNumber}`, toUuid(cost_center_id)]); }
          if (inventoryGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,0,$4,$5)`, [je.rows[0].id, ln, inventoryGl, valueAmt, `Inventory write-off — ${docNumber}`]); }
        } else if (movement_type === 'adjustment') {
          // Adjustment: Dr/Cr Inventory, Cr/Dr Stock Adjustment
          const adjGl = (await client.query(`SELECT id FROM fi_gl_accounts WHERE (account_name ILIKE '%stock adjustment%' OR account_name ILIKE '%adjustment%') AND account_type='expense' AND is_active=true LIMIT 1`)).rows[0]?.id || cogsGl;
          if (adjGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description, cost_center_id) VALUES ($1,$2,$3,$4,0,$5,$6)`, [je.rows[0].id, ln, adjGl, valueAmt, `Stock adjustment — ${docNumber}`, toUuid(cost_center_id)]); }
          if (inventoryGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,0,$4,$5)`, [je.rows[0].id, ln, inventoryGl, valueAmt, `Inventory adjusted — ${docNumber}`]); }
        } else if (movement_type === 'return') {
          // Return: Dr Inventory, Cr COGS (reverse of issue)
          if (inventoryGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, inventoryGl, valueAmt, `Inventory return — ${docNumber}`]); }
          if (cogsGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description, cost_center_id) VALUES ($1,$2,$3,0,$4,$5,$6)`, [je.rows[0].id, ln, cogsGl, valueAmt, `COGS reversal — ${docNumber}`, toUuid(cost_center_id)]); }
        } else if (movement_type === 'transfer' && to_plant_id && to_plant_id !== plant_id) {
          // Inter-plant transfer: Dr Dest Plant Inventory, Cr Source Plant Inventory
          if (inventoryGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,$4,0,$5)`, [je.rows[0].id, ln, inventoryGl, valueAmt, `Transfer In — ${docNumber} (dest plant)`]); }
          if (inventoryGl) { ln++; await client.query(`INSERT INTO fi_journal_lines (header_id, line_number, gl_account_id, debit_amount, credit_amount, description) VALUES ($1,$2,$3,0,$4,$5)`, [je.rows[0].id, ln, inventoryGl, valueAmt, `Transfer Out — ${docNumber} (source plant)`]); }
        }

        await client.query(`UPDATE inv_stock_movements SET journal_id = $1 WHERE id = $2`, [je.rows[0].id, mv.rows[0].id]);
      }

      return mv.rows[0];
    });

    await auditLog(req.user.id, 'CREATE', 'stock_movement', result.id, null, { movement_type, material_id, quantity }, req);
    successResponse(res, result, 'Stock movement posted' + (['issue', 'scrap', 'adjustment', 'return'].includes(movement_type) || (movement_type === 'transfer' && to_plant_id && to_plant_id !== plant_id) ? ' — GL auto-posted' : ''), 201);
  } catch (err) { errorResponse(res, err.message); }
});

const TYPE_LABELS = { receipt: 'Goods Receipt', issue: 'Goods Issue', transfer: 'Stock Transfer', return: 'Goods Return', adjustment: 'Stock Adjustment', scrap: 'Scrap' };

// ============================================
// INVENTORY TURNOVER REPORT
// ============================================
router.get('/turnover', authenticate, async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const result = await query(
      `SELECT m.material_code, m.material_name, m.standard_price,
              COALESCE(stk.quantity, 0) as current_stock,
              COALESCE(stk.quantity * CAST(m.standard_price AS numeric), 0) as stock_value,
              COALESCE(iss.total_issued, 0) as total_issued,
              COALESCE(rec.total_received, 0) as total_received,
              CASE WHEN COALESCE(stk.quantity, 0) > 0
                THEN ROUND((COALESCE(iss.total_issued, 0)::numeric / COALESCE(stk.quantity, 1)::numeric)::numeric, 2)
                ELSE 0 END as turnover_ratio,
              CASE WHEN COALESCE(iss.total_issued, 0) > 0
                THEN ROUND(((COALESCE(stk.quantity, 0)::numeric / NULLIF(COALESCE(iss.total_issued, 1)::numeric / $1::numeric, 0)) )::numeric, 0)
                ELSE 999 END as days_of_supply,
              mv.last_movement
       FROM mm_materials m
       LEFT JOIN (SELECT material_id, SUM(quantity) as quantity FROM inv_stock WHERE quantity > 0 GROUP BY material_id) stk ON m.id = stk.material_id
       LEFT JOIN (SELECT material_id, SUM(quantity) as total_issued FROM inv_stock_movements
         WHERE movement_type IN ('issue','scrap') AND posting_date >= CURRENT_DATE - ($1 || ' months')::INTERVAL GROUP BY material_id) iss ON m.id = iss.material_id
       LEFT JOIN (SELECT material_id, SUM(quantity) as total_received FROM inv_stock_movements
         WHERE movement_type = 'receipt' AND posting_date >= CURRENT_DATE - ($1 || ' months')::INTERVAL GROUP BY material_id) rec ON m.id = rec.material_id
       LEFT JOIN (SELECT material_id, MAX(posting_date) as last_movement FROM inv_stock_movements GROUP BY material_id) mv ON m.id = mv.material_id
       WHERE COALESCE(stk.quantity, 0) > 0
       ORDER BY turnover_ratio ASC`, [parseInt(months)]);

    // Categorize
    const rows = result.rows.map(r => ({
      ...r,
      category: parseFloat(r.turnover_ratio) === 0 ? 'dead'
        : parseFloat(r.turnover_ratio) < 1 ? 'slow'
        : parseFloat(r.turnover_ratio) < 4 ? 'normal'
        : 'fast',
    }));

    const summary = {
      totalItems: rows.length,
      deadStock: rows.filter(r => r.category === 'dead').length,
      slowMoving: rows.filter(r => r.category === 'slow').length,
      normalMoving: rows.filter(r => r.category === 'normal').length,
      fastMoving: rows.filter(r => r.category === 'fast').length,
      totalStockValue: rows.reduce((s, r) => s + parseFloat(r.stock_value || 0), 0),
      deadStockValue: rows.filter(r => r.category === 'dead').reduce((s, r) => s + parseFloat(r.stock_value || 0), 0),
    };

    successResponse(res, { rows, summary });
  } catch (err) { errorResponse(res, err.message); }
});

export default router;


router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const r = await query(`DELETE FROM inv_stock_movements WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
