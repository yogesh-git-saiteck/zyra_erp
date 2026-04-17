import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate, auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';

const router = Router();

// Overview
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [carriers, vehicles, shipments] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE is_active) as active FROM tm_carriers`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE current_status='available') as available,
             COUNT(*) FILTER(WHERE current_status='in_transit') as in_transit FROM tm_vehicles`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='planned') as planned,
             COUNT(*) FILTER(WHERE status='in_transit') as in_transit,
             COUNT(*) FILTER(WHERE status='delivered') as delivered,
             COALESCE(SUM(freight_cost),0) as total_cost FROM tm_shipments`),
    ]);
    successResponse(res, { carriers: carriers.rows[0], vehicles: vehicles.rows[0], shipments: shipments.rows[0] });
  } catch (err) { errorResponse(res, err.message); }
});

// ===== CARRIERS =====
router.get('/carriers', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM tm_vehicles v WHERE v.carrier_id = c.id) as vehicle_count,
       (SELECT COUNT(*) FROM tm_shipments s WHERE s.carrier_id = c.id) as shipment_count
       FROM tm_carriers c ORDER BY c.carrier_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/carriers', authenticate, async (req, res) => {
  try {
    const { carrier_code, carrier_name, carrier_type, contact_name, phone, email, address, license_number } = req.body;
    if (!carrier_code || !carrier_name) return errorResponse(res, 'Code and name required', 400);
    const result = await query(
      `INSERT INTO tm_carriers (carrier_code, carrier_name, carrier_type, contact_name, phone, email, address, license_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [carrier_code, carrier_name, carrier_type || 'road', contact_name, phone, email, address, license_number]);
    await auditLog(req.user.id, 'CREATE', 'carrier', result.rows[0].id, null, { carrier_code }, req);
    successResponse(res, result.rows[0], 'Carrier created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/carriers/:id', authenticate, async (req, res) => {
  try {
    const c = req.body;
    const result = await query(
      `UPDATE trn_carriers SET carrier_name=COALESCE($1,carrier_name), carrier_type=COALESCE($2,carrier_type),
       contact_person=COALESCE($3,contact_person), phone=COALESCE($4,phone), email=COALESCE($5,email),
       license_number=COALESCE($6,license_number), is_active=COALESCE($7,is_active), updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [c.carrier_name, c.carrier_type, c.contact_person, c.phone, c.email, c.license_number, c.is_active, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, result.rows[0], 'Carrier updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ===== VEHICLES =====
router.get('/vehicles', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT v.*, c.carrier_code, c.carrier_name FROM tm_vehicles v
       LEFT JOIN tm_carriers c ON v.carrier_id = c.id ORDER BY v.vehicle_number`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/vehicles', authenticate, async (req, res) => {
  try {
    const { carrier_id, vehicle_number, vehicle_type, capacity_kg, capacity_volume, fuel_type } = req.body;
    if (!vehicle_number) return errorResponse(res, 'Vehicle number required', 400);
    const result = await query(
      `INSERT INTO tm_vehicles (carrier_id, vehicle_number, vehicle_type, capacity_kg, capacity_volume, fuel_type)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [carrier_id, vehicle_number, vehicle_type || 'truck', capacity_kg, capacity_volume, fuel_type]);
    successResponse(res, result.rows[0], 'Vehicle added', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/vehicles/:id', authenticate, async (req, res) => {
  try {
    const v = req.body;
    const result = await query(
      `UPDATE tm_vehicles SET carrier_id=COALESCE($1,carrier_id), vehicle_number=COALESCE($2,vehicle_number),
       vehicle_type=COALESCE($3,vehicle_type), capacity_kg=COALESCE($4,capacity_kg),
       capacity_volume=COALESCE($5,capacity_volume), fuel_type=COALESCE($6,fuel_type) WHERE id=$7 RETURNING *`,
      [v.carrier_id, v.vehicle_number, v.vehicle_type, v.capacity_kg, v.capacity_volume, v.fuel_type, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, result.rows[0], 'Vehicle updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ===== SHIPMENTS =====
router.get('/shipments', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT s.*, c.carrier_code, c.carrier_name, v.vehicle_number, v.vehicle_type,
               p.plant_code, bp.display_name as customer_name
               FROM tm_shipments s
               LEFT JOIN tm_carriers c ON s.carrier_id = c.id
               LEFT JOIN tm_vehicles v ON s.vehicle_id = v.id
               LEFT JOIN org_plants p ON s.origin_plant_id = p.id
               LEFT JOIN bp_business_partners bp ON s.customer_id = bp.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND s.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (s.doc_number ILIKE $${idx} OR s.tracking_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY s.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/shipments', authenticate, async (req, res) => {
  try {
    const s = req.body;
    const docNumber = await getNextNumber('SHP');
    const result = await query(
      `INSERT INTO tm_shipments (doc_number, shipment_type, carrier_id, vehicle_id, origin_plant_id,
       destination_address, destination_city, customer_id, reference_type, reference_id,
       planned_date, weight_kg, freight_cost, tracking_number, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [docNumber, s.shipment_type || 'outbound', s.carrier_id, s.vehicle_id, s.origin_plant_id,
       s.destination_address, s.destination_city, s.customer_id, s.reference_type, s.reference_id,
       s.planned_date, s.weight_kg, s.freight_cost, s.tracking_number, s.notes, req.user.id]);
    await auditLog(req.user.id, 'CREATE', 'shipment', result.rows[0].id, null, { doc_number: docNumber }, req);
    successResponse(res, result.rows[0], 'Shipment created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/shipments/:id', authenticate, async (req, res) => {
  try {
    const s = req.body;
    const result = await query(
      `UPDATE tm_shipments SET carrier_id=COALESCE($1,carrier_id), vehicle_id=$2,
       destination_address=COALESCE($3,destination_address), destination_city=COALESCE($4,destination_city),
       planned_date=COALESCE($5,planned_date), weight_kg=COALESCE($6,weight_kg),
       freight_cost=COALESCE($7,freight_cost), tracking_number=COALESCE($8,tracking_number), notes=COALESCE($9,notes)
       WHERE id=$10 AND status='planned' RETURNING *`,
      [s.carrier_id, s.vehicle_id, s.destination_address, s.destination_city,
       s.planned_date, s.weight_kg, s.freight_cost, s.tracking_number, s.notes, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found or not in planned status', 404);
    successResponse(res, result.rows[0], 'Shipment updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/shipments/:id/dispatch', authenticate, async (req, res) => {
  try {
    await query(`UPDATE tm_shipments SET status='in_transit', actual_departure=NOW() WHERE id=$1 AND status='planned'`, [req.params.id]);
    // Update vehicle status
    const ship = await query(`SELECT vehicle_id FROM tm_shipments WHERE id=$1`, [req.params.id]);
    if (ship.rows[0]?.vehicle_id) await query(`UPDATE tm_vehicles SET current_status='in_transit' WHERE id=$1`, [ship.rows[0].vehicle_id]);
    successResponse(res, null, 'Shipment dispatched');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/shipments/:id/deliver', authenticate, async (req, res) => {
  try {
    await query(`UPDATE tm_shipments SET status='delivered', actual_arrival=NOW() WHERE id=$1 AND status='in_transit'`, [req.params.id]);
    const ship = await query(`SELECT vehicle_id FROM tm_shipments WHERE id=$1`, [req.params.id]);
    if (ship.rows[0]?.vehicle_id) await query(`UPDATE tm_vehicles SET current_status='available' WHERE id=$1`, [ship.rows[0].vehicle_id]);
    successResponse(res, null, 'Shipment delivered');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete("/carriers/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT COUNT(*) FROM tm_shipments WHERE carrier_id = $1", [req.params.id]);
    if (parseInt(deps.rows[0].count) > 0) return errorResponse(res, "Cannot delete — shipments exist for this carrier", 400);
    await query("DELETE FROM tm_carriers WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Carrier deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/vehicles/:id", authenticate, async (req, res) => {
  try { await query("DELETE FROM tm_vehicles WHERE id = $1", [req.params.id]); successResponse(res, null, "Vehicle deleted"); }
  catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/shipments/:id", authenticate, async (req, res) => {
  try {
    const s = await query("SELECT status FROM tm_shipments WHERE id = $1", [req.params.id]);
    if (!s.rows.length) return errorResponse(res, "Not found", 404);
    if (s.rows[0].status !== "planned") return errorResponse(res, "Only planned shipments can be deleted", 400);
    await query("DELETE FROM tm_shipment_items WHERE shipment_id = $1", [req.params.id]);
    await query("DELETE FROM tm_shipments WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Shipment deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const tables = { 'shipments': 'tm_shipments', 'carriers': 'tm_carriers', 'vehicles': 'tm_vehicles' };
    const table = tables[entity];
    if (!table) return errorResponse(res, 'Unknown entity', 400);
    if (entity === 'shipments') await query(`DELETE FROM tm_shipment_items WHERE shipment_id = ANY($1::uuid[])`, [ids]);
    const r = await query(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
