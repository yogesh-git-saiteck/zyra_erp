import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

const router = Router();

// ============================================
// BARCODE CONFIGURATION
// ============================================
const BARCODE_ENTITIES = {
  material: {
    label: 'Materials', table: 'mm_materials', code_field: 'material_code', name_field: 'material_name',
    barcode_type: 'code128', fields: ['material_code', 'material_name', 'standard_price'],
    use_cases: ['Label printing', 'Goods receipt scanning', 'Stock movement', 'Cycle count', 'POS checkout'],
  },
  asset: {
    label: 'Assets', table: 'am_assets', code_field: 'asset_code', name_field: 'asset_name',
    barcode_type: 'qrcode', fields: ['asset_code', 'asset_name', 'location', 'serial_number'],
    use_cases: ['Asset tagging', 'Physical verification', 'Maintenance scanning'],
  },
  employee: {
    label: 'Employees', table: 'hr_employees', code_field: 'employee_number', name_field: 'employee_number',
    barcode_type: 'qrcode', fields: ['employee_number'],
    use_cases: ['ID badge', 'Attendance check-in/out', 'Access control'],
  },
  storage_location: {
    label: 'Storage Locations', table: 'org_storage_locations', code_field: 'sloc_code', name_field: 'sloc_name',
    barcode_type: 'qrcode', fields: ['sloc_code', 'sloc_name'],
    use_cases: ['Warehouse bin labels', 'Put-away scanning', 'Location lookup'],
  },
  sales_order: {
    label: 'Sales Orders', table: 'sd_sales_orders', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'qrcode', fields: ['doc_number', 'total_amount', 'status'],
    use_cases: ['Delivery scanning', 'Picking list', 'Order tracking'],
  },
  purchase_order: {
    label: 'Purchase Orders', table: 'pur_purchase_orders', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'qrcode', fields: ['doc_number', 'total_amount', 'status'],
    use_cases: ['Goods receipt scanning', 'Vendor delivery verification'],
  },
  delivery: {
    label: 'Deliveries', table: 'sd_deliveries', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'code128', fields: ['doc_number', 'status'],
    use_cases: ['Driver scanning', 'POD confirmation', 'Dispatch gate'],
  },
  shipment: {
    label: 'Shipments', table: 'tm_shipments', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'code128', fields: ['doc_number', 'tracking_number', 'status'],
    use_cases: ['Tracking', 'Dispatch/arrival scanning'],
  },
  invoice_ar: {
    label: 'AR Invoices', table: 'fi_ar_invoices', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'qrcode', fields: ['doc_number', 'total_amount', 'due_date'],
    use_cases: ['Payment scanning', 'UPI/QR payment link'],
  },
  invoice_ap: {
    label: 'AP Invoices', table: 'fi_ap_invoices', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'qrcode', fields: ['doc_number', 'total_amount', 'due_date'],
    use_cases: ['Payment processing', 'Invoice matching'],
  },
  production_order: {
    label: 'Production Orders', table: 'pp_production_orders', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'code128', fields: ['doc_number', 'status'],
    use_cases: ['Shop floor scanning', 'Start/complete production'],
  },
  inspection_lot: {
    label: 'Inspection Lots', table: 'qm_inspection_lots', code_field: 'doc_number', name_field: 'doc_number',
    barcode_type: 'qrcode', fields: ['doc_number', 'result'],
    use_cases: ['Quality check scanning', 'Pass/fail recording'],
  },
  business_partner: {
    label: 'Business Partners', table: 'bp_business_partners', code_field: 'bp_number', name_field: 'display_name',
    barcode_type: 'qrcode', fields: ['bp_number', 'display_name', 'email', 'phone'],
    use_cases: ['Contact card (vCard)', 'Vendor badge'],
  },
};

// Get barcode config — what entities support barcodes
router.get('/config', authenticate, (req, res) => {
  const config = Object.entries(BARCODE_ENTITIES).map(([key, val]) => ({
    entity_key: key, ...val, table: undefined,
  }));
  successResponse(res, config);
});

// Get barcode types available
router.get('/types', authenticate, (req, res) => {
  successResponse(res, [
    { key: 'code128', label: 'Code 128', description: 'High-density alphanumeric. Best for: materials, shipments, production orders', maxLength: 80 },
    { key: 'ean13', label: 'EAN-13', description: 'International product code. Best for: retail products', maxLength: 13 },
    { key: 'code39', label: 'Code 39', description: 'Alphanumeric, widely supported. Best for: simple labels', maxLength: 43 },
    { key: 'qrcode', label: 'QR Code', description: 'Stores URLs, JSON, vCard. Best for: assets, invoices, contact cards', maxLength: 4296 },
    { key: 'datamatrix', label: 'Data Matrix', description: 'Compact 2D. Best for: small items, electronics', maxLength: 2335 },
    { key: 'pdf417', label: 'PDF417', description: 'High-capacity 2D. Best for: documents with lots of data', maxLength: 1850 },
  ]);
});

// Generate barcode data for a specific record
router.get('/generate/:entity/:id', authenticate, async (req, res) => {
  try {
    const { entity, id } = req.params;
    const { type } = req.query; // Override barcode type
    const config = BARCODE_ENTITIES[entity];
    if (!config) return errorResponse(res, `Unsupported entity: ${entity}`, 400);

    const result = await query(`SELECT * FROM ${config.table} WHERE id = $1`, [id]);
    if (!result.rows.length) return errorResponse(res, 'Record not found', 404);

    const record = result.rows[0];
    const code = record[config.code_field];
    const barcodeType = type || config.barcode_type;

    // Build data payload based on type
    let barcodeData;
    if (barcodeType === 'qrcode') {
      // QR codes can hold structured data
      const payload = {};
      for (const f of config.fields) { if (record[f] !== undefined) payload[f] = record[f]; }
      payload._entity = entity;
      payload._id = id;
      barcodeData = JSON.stringify(payload);
    } else {
      barcodeData = code;
    }

    successResponse(res, {
      entity, id, code, name: record[config.name_field],
      barcode_type: barcodeType, barcode_data: barcodeData,
      fields: config.fields.reduce((acc, f) => { acc[f] = record[f]; return acc; }, {}),
    });
  } catch (err) { errorResponse(res, err.message); }
});

// Bulk generate barcodes for multiple records
router.post('/generate-bulk/:entity', authenticate, async (req, res) => {
  try {
    const { entity } = req.params;
    const { ids, type } = req.body;
    const config = BARCODE_ENTITIES[entity];
    if (!config) return errorResponse(res, `Unsupported entity: ${entity}`, 400);
    if (!ids?.length) return errorResponse(res, 'IDs required', 400);

    const result = await query(`SELECT * FROM ${config.table} WHERE id = ANY($1::uuid[])`, [ids]);
    const barcodeType = type || config.barcode_type;

    const barcodes = result.rows.map(record => {
      const code = record[config.code_field];
      let barcodeData;
      if (barcodeType === 'qrcode') {
        const payload = { _entity: entity, _id: record.id };
        for (const f of config.fields) { if (record[f] !== undefined) payload[f] = record[f]; }
        barcodeData = JSON.stringify(payload);
      } else {
        barcodeData = code;
      }
      return { id: record.id, code, name: record[config.name_field], barcode_type: barcodeType, barcode_data: barcodeData };
    });

    successResponse(res, barcodes);
  } catch (err) { errorResponse(res, err.message); }
});

// Scanner lookup — decode scanned barcode and find the record
router.post('/scan', authenticate, async (req, res) => {
  try {
    const { scanned_data } = req.body;
    if (!scanned_data) return errorResponse(res, 'No data scanned', 400);

    // Try to parse as JSON (QR code)
    let parsed = null;
    try { parsed = JSON.parse(scanned_data); } catch {}

    if (parsed && parsed._entity && parsed._id) {
      const config = BARCODE_ENTITIES[parsed._entity];
      if (config) {
        const result = await query(`SELECT * FROM ${config.table} WHERE id = $1`, [parsed._id]);
        if (result.rows.length) {
          return successResponse(res, {
            found: true, entity: parsed._entity, record: result.rows[0],
            entity_label: config.label, code: result.rows[0][config.code_field],
          });
        }
      }
    }

    // Try plain text lookup across all entities
    for (const [entityKey, config] of Object.entries(BARCODE_ENTITIES)) {
      try {
        const result = await query(`SELECT * FROM ${config.table} WHERE ${config.code_field} = $1 LIMIT 1`, [scanned_data]);
        if (result.rows.length) {
          return successResponse(res, {
            found: true, entity: entityKey, record: result.rows[0],
            entity_label: config.label, code: scanned_data,
          });
        }
      } catch {}
    }

    successResponse(res, { found: false, scanned_data, message: 'No matching record found' });
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
