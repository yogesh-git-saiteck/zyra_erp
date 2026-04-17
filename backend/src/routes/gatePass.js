import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';

const router = Router();

// ── Create tables on startup ─────────────────────────────────────────────────
;(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS lo_gate_passes (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        doc_number       VARCHAR(30)  UNIQUE NOT NULL,
        pass_type        VARCHAR(10)  NOT NULL CHECK (pass_type IN ('RGP','NRGP')),
        status           VARCHAR(30)  NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','approved','issued','partially_returned','returned','closed','cancelled')),
        company_id       UUID REFERENCES org_companies(id),
        plant_id         UUID REFERENCES org_plants(id),
        party_id         UUID REFERENCES bp_business_partners(id),
        party_name       VARCHAR(200),
        party_type       VARCHAR(20),
        purpose          TEXT,
        issue_date       DATE         NOT NULL DEFAULT CURRENT_DATE,
        expected_return_date DATE,
        actual_return_date   DATE,
        vehicle_number   VARCHAR(50),
        driver_name      VARCHAR(100),
        driver_contact   VARCHAR(30),
        gate_number      VARCHAR(20),
        security_name    VARCHAR(100),
        reference_doc    VARCHAR(50),
        notes            TEXT,
        approved_by      UUID REFERENCES sys_users(id),
        approved_at      TIMESTAMPTZ,
        issued_by        UUID REFERENCES sys_users(id),
        issued_at        TIMESTAMPTZ,
        created_by       UUID REFERENCES sys_users(id),
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS lo_gate_pass_items (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        gate_pass_id   UUID NOT NULL REFERENCES lo_gate_passes(id) ON DELETE CASCADE,
        line_number    INT  NOT NULL,
        material_id    UUID REFERENCES mm_materials(id),
        description    VARCHAR(255) NOT NULL,
        quantity       DECIMAL(15,3) NOT NULL DEFAULT 1,
        uom_id         UUID REFERENCES mm_units_of_measure(id),
        uom_code       VARCHAR(20),
        serial_number  VARCHAR(100),
        batch_number   VARCHAR(100),
        unit_value     DECIMAL(15,2) DEFAULT 0,
        remarks        VARCHAR(255),
        returned_qty   DECIMAL(15,3) NOT NULL DEFAULT 0
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS lo_gate_pass_returns (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        gate_pass_id     UUID NOT NULL REFERENCES lo_gate_passes(id),
        gate_pass_item_id UUID NOT NULL REFERENCES lo_gate_pass_items(id),
        returned_qty     DECIMAL(15,3) NOT NULL,
        return_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        condition        VARCHAR(30) DEFAULT 'good' CHECK (condition IN ('good','damaged','partial','lost')),
        received_by      UUID REFERENCES sys_users(id),
        notes            TEXT
      )
    `);

    console.log('[GatePass] Tables ready');
  } catch (e) {
    console.error('[GatePass] Table init error:', e.message);
  }
})();

// ── Helper ───────────────────────────────────────────────────────────────────
async function fetchGatePass(id) {
  const hdr = await query(`
    SELECT gp.*,
      bp.display_name  AS party_display,
      bp.bp_number,
      pl.plant_name,
      pl.plant_code,
      u1.first_name || ' ' || u1.last_name AS created_by_name,
      u2.first_name || ' ' || u2.last_name AS approved_by_name,
      u3.first_name || ' ' || u3.last_name AS issued_by_name
    FROM lo_gate_passes gp
    LEFT JOIN bp_business_partners bp ON gp.party_id = bp.id
    LEFT JOIN org_plants pl            ON gp.plant_id  = pl.id
    LEFT JOIN sys_users u1             ON gp.created_by  = u1.id
    LEFT JOIN sys_users u2             ON gp.approved_by = u2.id
    LEFT JOIN sys_users u3             ON gp.issued_by   = u3.id
    WHERE gp.id = $1
  `, [id]);
  if (!hdr.rows.length) return null;

  const items = await query(`
    SELECT i.*, m.material_code, m.material_name, u.uom_code AS uom_code_ref
    FROM lo_gate_pass_items i
    LEFT JOIN mm_materials m ON i.material_id = m.id
    LEFT JOIN mm_units_of_measure u ON i.uom_id = u.id
    WHERE i.gate_pass_id = $1
    ORDER BY i.line_number
  `, [id]);

  const returns = await query(`
    SELECT r.*, u.first_name || ' ' || u.last_name AS received_by_name
    FROM lo_gate_pass_returns r
    LEFT JOIN sys_users u ON r.received_by = u.id
    WHERE r.gate_pass_id = $1
    ORDER BY r.return_date
  `, [id]);

  return { ...hdr.rows[0], items: items.rows, returns: returns.rows };
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [stats, overdue] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE pass_type='RGP')  AS total_rgp,
          COUNT(*) FILTER (WHERE pass_type='NRGP') AS total_nrgp,
          COUNT(*) FILTER (WHERE status='draft')   AS drafts,
          COUNT(*) FILTER (WHERE status='issued' AND pass_type='RGP') AS rgp_issued,
          COUNT(*) FILTER (WHERE status='issued' AND pass_type='NRGP') AS nrgp_issued,
          COUNT(*) FILTER (WHERE status='partially_returned') AS partial_returns,
          COUNT(*) FILTER (WHERE status='returned' OR status='closed') AS completed
        FROM lo_gate_passes
      `),
      query(`
        SELECT COUNT(*) AS overdue
        FROM lo_gate_passes
        WHERE pass_type='RGP'
          AND status IN ('issued','partially_returned')
          AND expected_return_date < CURRENT_DATE
      `)
    ]);
    successResponse(res, { ...stats.rows[0], overdue: overdue.rows[0].overdue });
  } catch (err) { errorResponse(res, err.message); }
});

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { pass_type, status, search, page = 1 } = req.query;
    let sql = `
      SELECT gp.id, gp.doc_number, gp.pass_type, gp.status,
        gp.issue_date, gp.expected_return_date, gp.actual_return_date,
        gp.party_name, gp.purpose, gp.vehicle_number,
        gp.created_at, gp.updated_at,
        bp.display_name AS party_display, bp.bp_number,
        pl.plant_name,
        u.first_name || ' ' || u.last_name AS created_by_name,
        COUNT(i.id) AS item_count
      FROM lo_gate_passes gp
      LEFT JOIN bp_business_partners bp ON gp.party_id = bp.id
      LEFT JOIN org_plants pl            ON gp.plant_id  = pl.id
      LEFT JOIN sys_users u              ON gp.created_by = u.id
      LEFT JOIN lo_gate_pass_items i     ON i.gate_pass_id = gp.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (pass_type) { sql += ` AND gp.pass_type = $${idx++}`; params.push(pass_type); }
    if (status)    { sql += ` AND gp.status    = $${idx++}`; params.push(status); }
    if (search)    {
      sql += ` AND (gp.doc_number ILIKE $${idx} OR gp.party_name ILIKE $${idx} OR bp.display_name ILIKE $${idx} OR gp.vehicle_number ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }
    sql += ` GROUP BY gp.id, bp.display_name, bp.bp_number, pl.plant_name, u.first_name, u.last_name`;
    sql += ` ORDER BY gp.created_at DESC`;
    const r = await query(paginate(sql, page), params);
    successResponse(res, r.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const gp = await fetchGatePass(req.params.id);
    if (!gp) return errorResponse(res, 'Gate pass not found', 404);
    successResponse(res, gp);
  } catch (err) { errorResponse(res, err.message); }
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      pass_type, company_id, plant_id, party_id, party_name, party_type,
      purpose, issue_date, expected_return_date,
      vehicle_number, driver_name, driver_contact,
      gate_number, security_name, reference_doc, notes,
      items = []
    } = req.body;

    if (!pass_type || !['RGP','NRGP'].includes(pass_type))
      return errorResponse(res, 'pass_type must be RGP or NRGP', 400);
    if (!items.length)
      return errorResponse(res, 'At least one item is required', 400);
    if (pass_type === 'RGP' && !expected_return_date)
      return errorResponse(res, 'Expected return date is required for RGP', 400);

    const result = await transaction(async (client) => {
      const docNumber = await getNextNumber(pass_type);

      const gp = await client.query(`
        INSERT INTO lo_gate_passes
          (doc_number, pass_type, company_id, plant_id, party_id, party_name, party_type,
           purpose, issue_date, expected_return_date,
           vehicle_number, driver_name, driver_contact,
           gate_number, security_name, reference_doc, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING *
      `, [docNumber, pass_type, company_id||null, plant_id||null,
          party_id||null, party_name||null, party_type||null,
          purpose||null, issue_date||new Date().toISOString().split('T')[0],
          expected_return_date||null, vehicle_number||null,
          driver_name||null, driver_contact||null,
          gate_number||null, security_name||null, reference_doc||null,
          notes||null, req.user.id]);

      const gpId = gp.rows[0].id;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(`
          INSERT INTO lo_gate_pass_items
            (gate_pass_id, line_number, material_id, description, quantity,
             uom_id, uom_code, serial_number, batch_number, unit_value, remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [gpId, i+1, it.material_id||null, it.description, it.quantity||1,
            it.uom_id||null, it.uom_code||null, it.serial_number||null,
            it.batch_number||null, it.unit_value||0, it.remarks||null]);
      }

      await auditLog(client, req.user.id, 'CREATE', 'gate_pass', gpId, null, gp.rows[0]);
      return gp.rows[0];
    });

    successResponse(res, result, `${pass_type} ${result.doc_number} created`, 201);
  } catch (err) { errorResponse(res, err.message); }
});

// ── UPDATE (draft only) ───────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query(`SELECT * FROM lo_gate_passes WHERE id=$1`, [req.params.id]);
    if (!existing.rows.length) return errorResponse(res, 'Gate pass not found', 404);
    if (!['draft'].includes(existing.rows[0].status))
      return errorResponse(res, 'Only draft gate passes can be edited', 400);

    const {
      party_id, party_name, party_type, purpose, issue_date, expected_return_date,
      vehicle_number, driver_name, driver_contact, gate_number, security_name,
      reference_doc, notes, plant_id, company_id, items = []
    } = req.body;

    if (!items.length) return errorResponse(res, 'At least one item is required', 400);

    const result = await transaction(async (client) => {
      await client.query(`
        UPDATE lo_gate_passes SET
          party_id=$1, party_name=$2, party_type=$3, purpose=$4,
          issue_date=$5, expected_return_date=$6,
          vehicle_number=$7, driver_name=$8, driver_contact=$9,
          gate_number=$10, security_name=$11, reference_doc=$12,
          notes=$13, plant_id=$14, company_id=$15, updated_at=NOW()
        WHERE id=$16
      `, [party_id||null, party_name||null, party_type||null, purpose||null,
          issue_date, expected_return_date||null,
          vehicle_number||null, driver_name||null, driver_contact||null,
          gate_number||null, security_name||null, reference_doc||null,
          notes||null, plant_id||null, company_id||null, req.params.id]);

      await client.query(`DELETE FROM lo_gate_pass_items WHERE gate_pass_id=$1`, [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(`
          INSERT INTO lo_gate_pass_items
            (gate_pass_id, line_number, material_id, description, quantity,
             uom_id, uom_code, serial_number, batch_number, unit_value, remarks)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [req.params.id, i+1, it.material_id||null, it.description, it.quantity||1,
            it.uom_id||null, it.uom_code||null, it.serial_number||null,
            it.batch_number||null, it.unit_value||0, it.remarks||null]);
      }
      return (await client.query(`SELECT * FROM lo_gate_passes WHERE id=$1`, [req.params.id])).rows[0];
    });

    successResponse(res, result, 'Gate pass updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ── APPROVE ────────────────────────────────────────────────────────────────────
router.post('/:id/approve', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM lo_gate_passes WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Gate pass not found', 404);
    if (r.rows[0].status !== 'draft') return errorResponse(res, 'Only draft gate passes can be approved', 400);

    await query(`
      UPDATE lo_gate_passes
      SET status='approved', approved_by=$1, approved_at=NOW(), updated_at=NOW()
      WHERE id=$2
    `, [req.user.id, req.params.id]);

    successResponse(res, { id: req.params.id, status: 'approved' }, 'Gate pass approved');
  } catch (err) { errorResponse(res, err.message); }
});

// ── ISSUE (gate release) ───────────────────────────────────────────────────────
router.post('/:id/issue', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM lo_gate_passes WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Gate pass not found', 404);
    if (r.rows[0].status !== 'approved') return errorResponse(res, 'Gate pass must be approved before issuing', 400);

    const { gate_number, security_name, vehicle_number, driver_name } = req.body;

    await query(`
      UPDATE lo_gate_passes
      SET status='issued', issued_by=$1, issued_at=NOW(), updated_at=NOW(),
          gate_number=COALESCE($2, gate_number),
          security_name=COALESCE($3, security_name),
          vehicle_number=COALESCE($4, vehicle_number),
          driver_name=COALESCE($5, driver_name)
      WHERE id=$6
    `, [req.user.id, gate_number||null, security_name||null, vehicle_number||null, driver_name||null, req.params.id]);

    successResponse(res, { id: req.params.id, status: 'issued' }, 'Gate pass issued — goods released');
  } catch (err) { errorResponse(res, err.message); }
});

// ── RECORD RETURN (RGP only) ───────────────────────────────────────────────────
router.post('/:id/return', authenticate, async (req, res) => {
  try {
    const gp = await fetchGatePass(req.params.id);
    if (!gp) return errorResponse(res, 'Gate pass not found', 404);
    if (gp.pass_type !== 'RGP') return errorResponse(res, 'Returns only apply to RGP', 400);
    if (!['issued','partially_returned'].includes(gp.status))
      return errorResponse(res, 'Gate pass must be issued to record a return', 400);

    const { returns = [] } = req.body; // [{ gate_pass_item_id, returned_qty, condition, notes }]
    if (!returns.length) return errorResponse(res, 'No return items provided', 400);

    await transaction(async (client) => {
      for (const ret of returns) {
        const item = gp.items.find(i => i.id === ret.gate_pass_item_id);
        if (!item) continue;
        const maxReturn = parseFloat(item.quantity) - parseFloat(item.returned_qty);
        const qty = Math.min(parseFloat(ret.returned_qty || 0), maxReturn);
        if (qty <= 0) continue;

        await client.query(`
          INSERT INTO lo_gate_pass_returns
            (gate_pass_id, gate_pass_item_id, returned_qty, condition, received_by, notes)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [gp.id, ret.gate_pass_item_id, qty, ret.condition||'good', req.user.id, ret.notes||null]);

        await client.query(`
          UPDATE lo_gate_pass_items
          SET returned_qty = returned_qty + $1
          WHERE id=$2
        `, [qty, ret.gate_pass_item_id]);
      }

      // Check if fully returned
      const itemCheck = await client.query(`
        SELECT SUM(quantity) AS total, SUM(returned_qty) AS returned
        FROM lo_gate_pass_items WHERE gate_pass_id=$1
      `, [gp.id]);
      const { total, returned } = itemCheck.rows[0];
      const newStatus = parseFloat(returned) >= parseFloat(total)
        ? 'returned' : 'partially_returned';

      await client.query(`
        UPDATE lo_gate_passes SET status=$1, updated_at=NOW(),
          actual_return_date = CASE WHEN $1='returned' THEN CURRENT_DATE ELSE actual_return_date END
        WHERE id=$2
      `, [newStatus, gp.id]);
    });

    successResponse(res, { id: req.params.id }, 'Return recorded successfully');
  } catch (err) { errorResponse(res, err.message); }
});

// ── CLOSE ──────────────────────────────────────────────────────────────────────
router.post('/:id/close', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM lo_gate_passes WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Gate pass not found', 404);
    if (!['issued','partially_returned','returned','approved'].includes(r.rows[0].status))
      return errorResponse(res, 'Cannot close gate pass in current status', 400);

    await query(`UPDATE lo_gate_passes SET status='closed', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    successResponse(res, { id: req.params.id, status: 'closed' }, 'Gate pass closed');
  } catch (err) { errorResponse(res, err.message); }
});

// ── CANCEL ─────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const r = await query(`SELECT * FROM lo_gate_passes WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Gate pass not found', 404);
    if (['closed','cancelled','returned'].includes(r.rows[0].status))
      return errorResponse(res, 'Cannot cancel gate pass in current status', 400);

    await query(`UPDATE lo_gate_passes SET status='cancelled', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    successResponse(res, { id: req.params.id, status: 'cancelled' }, 'Gate pass cancelled');
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
