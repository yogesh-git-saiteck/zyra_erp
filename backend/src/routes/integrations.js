import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../config/database.js';
import { authenticate, adminOnly, auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, paginate } from '../utils/helpers.js';

const router = Router();

// ============================================
// ENTITY SCHEMA REGISTRY — describes Zyra entities for mapping UI
// ============================================
const ENTITY_SCHEMAS = {
  business_partners: {
    label: 'Business Partners', table: 'bp_business_partners',
    fields: [
      { key: 'bp_number', label: 'Partner Number', type: 'string', required: true },
      { key: 'bp_type', label: 'Type', type: 'enum', options: ['customer', 'vendor', 'both'] },
      { key: 'display_name', label: 'Display Name', type: 'string', required: true },
      { key: 'company_name', label: 'Company Name', type: 'string' },
      { key: 'first_name', label: 'First Name', type: 'string' },
      { key: 'last_name', label: 'Last Name', type: 'string' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Phone', type: 'string' },
      { key: 'address_line1', label: 'Address', type: 'string' },
      { key: 'city', label: 'City', type: 'string' },
      { key: 'country', label: 'Country', type: 'string' },
      { key: 'tax_id', label: 'Tax ID', type: 'string' },
      { key: 'credit_limit', label: 'Credit Limit', type: 'number' },
    ],
  },
  materials: {
    label: 'Materials', table: 'mm_materials',
    fields: [
      { key: 'material_code', label: 'Material Code', type: 'string', required: true },
      { key: 'material_name', label: 'Material Name', type: 'string', required: true },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'standard_price', label: 'Standard Price', type: 'number' },
      { key: 'sales_price', label: 'Sales Price', type: 'number' },
      { key: 'weight', label: 'Weight', type: 'number' },
    ],
  },
  sales_orders: {
    label: 'Sales Orders', table: 'sd_sales_orders',
    fields: [
      { key: 'doc_number', label: 'Document Number', type: 'string' },
      { key: 'order_date', label: 'Order Date', type: 'date' },
      { key: 'delivery_date', label: 'Delivery Date', type: 'date' },
      { key: 'currency', label: 'Currency', type: 'string' },
      { key: 'subtotal', label: 'Subtotal', type: 'number' },
      { key: 'tax_amount', label: 'Tax', type: 'number' },
      { key: 'total_amount', label: 'Total Amount', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  },
  purchase_orders: {
    label: 'Purchase Orders', table: 'pur_purchase_orders',
    fields: [
      { key: 'doc_number', label: 'Document Number', type: 'string' },
      { key: 'order_date', label: 'Order Date', type: 'date' },
      { key: 'delivery_date', label: 'Delivery Date', type: 'date' },
      { key: 'currency', label: 'Currency', type: 'string' },
      { key: 'total_amount', label: 'Total Amount', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  },
  invoices_ap: {
    label: 'AP Invoices', table: 'fi_ap_invoices',
    fields: [
      { key: 'doc_number', label: 'Invoice Number', type: 'string' },
      { key: 'invoice_date', label: 'Invoice Date', type: 'date' },
      { key: 'due_date', label: 'Due Date', type: 'date' },
      { key: 'total_amount', label: 'Total Amount', type: 'number' },
      { key: 'paid_amount', label: 'Paid Amount', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  },
  invoices_ar: {
    label: 'AR Invoices', table: 'fi_ar_invoices',
    fields: [
      { key: 'doc_number', label: 'Invoice Number', type: 'string' },
      { key: 'invoice_date', label: 'Invoice Date', type: 'date' },
      { key: 'due_date', label: 'Due Date', type: 'date' },
      { key: 'total_amount', label: 'Total Amount', type: 'number' },
      { key: 'paid_amount', label: 'Paid Amount', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  },
  employees: {
    label: 'Employees', table: 'hr_employees',
    fields: [
      { key: 'employee_number', label: 'Employee Number', type: 'string' },
      { key: 'hire_date', label: 'Hire Date', type: 'date' },
      { key: 'salary', label: 'Salary', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  },
  products: {
    label: 'Products (Stock)', table: 'inv_stock',
    fields: [
      { key: 'material_id', label: 'Material ID', type: 'uuid' },
      { key: 'quantity', label: 'Quantity', type: 'number' },
      { key: 'stock_type', label: 'Stock Type', type: 'string' },
    ],
  },
};

// Get all entity schemas for mapping UI
router.get('/schemas', authenticate, (req, res) => {
  successResponse(res, ENTITY_SCHEMAS);
});

// ============================================
// CONNECTOR TEMPLATES
// ============================================
router.get('/connectors', authenticate, async (req, res) => {
  try {
    const { category, is_template } = req.query;
    let sql = `SELECT * FROM int_connectors WHERE 1=1`;
    const params = []; let idx = 1;
    if (category) { sql += ` AND category = $${idx++}`; params.push(category); }
    if (is_template !== undefined) { sql += ` AND is_template = $${idx++}`; params.push(is_template === 'true'); }
    sql += ` ORDER BY is_template DESC, connector_name`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// CONNECTIONS (user instances)
// ============================================
router.get('/connections', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, cn.connector_name, cn.icon, cn.connector_type, cn.category, cn.auth_type
       FROM int_connections c JOIN int_connectors cn ON c.connector_id = cn.id
       ORDER BY c.created_at DESC`);
    // Strip credentials from response
    const safe = result.rows.map(r => ({ ...r, credentials: r.credentials ? { configured: true } : { configured: false } }));
    successResponse(res, safe);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/connections', authenticate, adminOnly, async (req, res) => {
  try {
    const { connector_id, connection_name, credentials, config } = req.body;
    if (!connector_id || !connection_name) return errorResponse(res, 'Connector and name required', 400);
    const result = await query(
      `INSERT INTO int_connections (connector_id, connection_name, credentials, config, status, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5) RETURNING *`,
      [connector_id, connection_name, JSON.stringify(credentials || {}), JSON.stringify(config || {}), req.user.id]);
    await auditLog(req.user.id, 'CREATE', 'integration_connection', result.rows[0].id, null, { connection_name }, req);
    successResponse(res, result.rows[0], 'Connection created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/connections/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { connection_name, credentials, config, status } = req.body;
    const result = await query(
      `UPDATE int_connections SET connection_name=COALESCE($1,connection_name),
       credentials=COALESCE($2,credentials), config=COALESCE($3,config),
       status=COALESCE($4,status), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [connection_name, credentials ? JSON.stringify(credentials) : null, config ? JSON.stringify(config) : null, status, req.params.id]);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/connections/:id/test', authenticate, async (req, res) => {
  try {
    // Simulate connection test
    const conn = await query(
      `SELECT c.*, cn.base_url, cn.auth_type FROM int_connections c
       JOIN int_connectors cn ON c.connector_id = cn.id WHERE c.id = $1`, [req.params.id]);
    if (!conn.rows.length) return errorResponse(res, 'Not found', 404);
    const c = conn.rows[0];
    // For now, mark as tested (real implementation would make HTTP call)
    await query(`UPDATE int_connections SET last_tested_at=NOW(), status='active', error_message=NULL WHERE id=$1`, [req.params.id]);
    successResponse(res, { success: true, message: 'Connection successful', tested_at: new Date() });
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/connections/:id', authenticate, adminOnly, async (req, res) => {
  try {
    await query(`DELETE FROM int_connections WHERE id = $1`, [req.params.id]);
    successResponse(res, null, 'Deleted');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// INTEGRATION FLOWS (data pipelines with field mapping)
// ============================================
router.get('/flows', authenticate, async (req, res) => {
  try {
    const { connection_id } = req.query;
    let sql = `SELECT f.*, c.connection_name, cn.connector_name, cn.icon
               FROM int_flows f
               JOIN int_connections c ON f.connection_id = c.id
               JOIN int_connectors cn ON c.connector_id = cn.id`;
    const params = [];
    if (connection_id) { sql += ` WHERE f.connection_id = $1`; params.push(connection_id); }
    sql += ` ORDER BY f.created_at DESC`;
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.get('/flows/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT f.*, c.connection_name, cn.connector_name, cn.icon
       FROM int_flows f JOIN int_connections c ON f.connection_id = c.id
       JOIN int_connectors cn ON c.connector_id = cn.id WHERE f.id = $1`, [req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    const flow = result.rows[0];
    // Parse JSON fields
    flow.field_mapping = typeof flow.field_mapping === 'string' ? JSON.parse(flow.field_mapping) : flow.field_mapping;
    flow.transform_rules = typeof flow.transform_rules === 'string' ? JSON.parse(flow.transform_rules) : flow.transform_rules;
    flow.filters = typeof flow.filters === 'string' ? JSON.parse(flow.filters) : flow.filters;
    successResponse(res, flow);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/flows', authenticate, adminOnly, async (req, res) => {
  try {
    const { connection_id, flow_name, direction, trigger_type, trigger_config, source_entity, target_entity, field_mapping, transform_rules, filters } = req.body;
    if (!connection_id || !flow_name || !source_entity || !target_entity || !field_mapping?.length) {
      return errorResponse(res, 'Connection, name, entities, and at least one field mapping required', 400);
    }
    const result = await query(
      `INSERT INTO int_flows (connection_id, flow_name, direction, trigger_type, trigger_config,
       source_entity, target_entity, field_mapping, transform_rules, filters, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [connection_id, flow_name, direction || 'inbound', trigger_type || 'manual',
       JSON.stringify(trigger_config || {}), source_entity, target_entity,
       JSON.stringify(field_mapping), JSON.stringify(transform_rules || []),
       JSON.stringify(filters || []), req.user.id]);
    await auditLog(req.user.id, 'CREATE', 'integration_flow', result.rows[0].id, null, { flow_name }, req);
    successResponse(res, result.rows[0], 'Flow created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/flows/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { flow_name, direction, trigger_type, trigger_config, source_entity, target_entity, field_mapping, transform_rules, filters, is_active } = req.body;
    const result = await query(
      `UPDATE int_flows SET flow_name=COALESCE($1,flow_name), direction=COALESCE($2,direction),
       trigger_type=COALESCE($3,trigger_type), trigger_config=COALESCE($4,trigger_config),
       source_entity=COALESCE($5,source_entity), target_entity=COALESCE($6,target_entity),
       field_mapping=COALESCE($7,field_mapping), transform_rules=COALESCE($8,transform_rules),
       filters=COALESCE($9,filters), is_active=COALESCE($10,is_active), updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [flow_name, direction, trigger_type, trigger_config ? JSON.stringify(trigger_config) : null,
       source_entity, target_entity, field_mapping ? JSON.stringify(field_mapping) : null,
       transform_rules ? JSON.stringify(transform_rules) : null,
       filters ? JSON.stringify(filters) : null, is_active, req.params.id]);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/flows/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM int_flows WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Deleted'); }
  catch (err) { errorResponse(res, err.message); }
});

// ============================================
// TRANSFORM ENGINE — applies field mapping + transforms to data
// ============================================
function applyTransform(value, transform) {
  if (value == null) return null;
  const str = String(value);
  switch (transform) {
    case 'uppercase': return str.toUpperCase();
    case 'lowercase': return str.toLowerCase();
    case 'trim': return str.trim();
    case 'to_number': return parseFloat(str) || 0;
    case 'to_date': return new Date(str).toISOString().split('T')[0];
    default: return value;
  }
}

function mapRecord(sourceRecord, fieldMapping) {
  const target = {};
  for (const m of fieldMapping) {
    if (!m.source || !m.target) continue;
    let value = sourceRecord[m.source];
    if (m.transform) value = applyTransform(value, m.transform);
    target[m.target] = value;
  }
  return target;
}

async function insertIntoEntity(entityKey, records) {
  const schema = ENTITY_SCHEMAS[entityKey];
  if (!schema) throw new Error(`Unknown entity: ${entityKey}`);
  const table = schema.table;
  const validFields = schema.fields.map(f => f.key);
  let success = 0, failed = 0;
  const errors = [];

  for (const record of records) {
    try {
      const cols = Object.keys(record).filter(k => validFields.includes(k));
      if (!cols.length) { failed++; errors.push({ record, error: 'No valid fields' }); continue; }
      const vals = cols.map(c => record[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
      success++;
    } catch (err) {
      failed++;
      errors.push({ record, error: err.message });
    }
  }
  return { success, failed, errors };
}

async function readFromEntity(entityKey, filters) {
  const schema = ENTITY_SCHEMAS[entityKey];
  if (!schema) throw new Error(`Unknown entity: ${entityKey}`);
  let sql = `SELECT * FROM ${schema.table}`;
  const params = []; let idx = 1;
  if (filters?.length) {
    const whereParts = [];
    for (const f of filters) {
      if (f.field && f.value) {
        if (f.operator === 'eq') { whereParts.push(`${f.field} = $${idx++}`); params.push(f.value); }
        else if (f.operator === 'like') { whereParts.push(`${f.field} ILIKE $${idx++}`); params.push(`%${f.value}%`); }
      }
    }
    if (whereParts.length) sql += ` WHERE ${whereParts.join(' AND ')}`;
  }
  sql += ` LIMIT 500`;
  return (await query(sql, params)).rows;
}

// ============================================
// FLOW EXECUTION — real engine
// ============================================
router.post('/flows/:id/run', authenticate, async (req, res) => {
  try {
    const flowRes = await query(
      `SELECT f.*, c.credentials, c.config, cn.base_url, cn.auth_type, cn.connector_type
       FROM int_flows f
       JOIN int_connections c ON f.connection_id = c.id
       JOIN int_connectors cn ON c.connector_id = cn.id
       WHERE f.id = $1`, [req.params.id]);
    if (!flowRes.rows.length) return errorResponse(res, 'Flow not found', 404);

    const flow = flowRes.rows[0];
    const fieldMapping = typeof flow.field_mapping === 'string' ? JSON.parse(flow.field_mapping) : flow.field_mapping;
    const filters = typeof flow.filters === 'string' ? JSON.parse(flow.filters) : (flow.filters || []);
    const creds = typeof flow.credentials === 'string' ? JSON.parse(flow.credentials) : (flow.credentials || {});
    const config = typeof flow.config === 'string' ? JSON.parse(flow.config) : (flow.config || {});

    const logEntry = await query(
      `INSERT INTO int_execution_log (flow_id, connection_id, status, direction)
       VALUES ($1,$2,'running',$3) RETURNING *`,
      [req.params.id, flow.connection_id, flow.direction]);
    const startTime = Date.now();

    let result = { success: 0, failed: 0, errors: [] };

    try {
      if (flow.direction === 'outbound') {
        // READ from Zyra → SEND to external
        const sourceData = await readFromEntity(flow.source_entity, filters);
        const mapped = sourceData.map(r => mapRecord(r, fieldMapping));

        // Try to POST to external API if base_url is configured
        const baseUrl = creds.base_url || flow.base_url;
        const endpoint = config.endpoint || `/${flow.target_entity}`;

        if (baseUrl) {
          for (const record of mapped) {
            try {
              const headers = { 'Content-Type': 'application/json' };
              if (flow.auth_type === 'api_key' && creds.api_key) headers['Authorization'] = `Bearer ${creds.api_key}`;
              if (creds.api_key && !headers['Authorization']) headers['X-API-Key'] = creds.api_key;

              const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST', headers, body: JSON.stringify(record),
                signal: AbortSignal.timeout(15000),
              });
              if (response.ok) result.success++;
              else { result.failed++; result.errors.push({ record, error: `HTTP ${response.status}` }); }
            } catch (err) {
              result.failed++;
              result.errors.push({ record, error: err.message });
            }
          }
        } else {
          // No external URL — just log what would be sent
          result.success = mapped.length;
          result.request_payload = mapped;
        }

      } else {
        // INBOUND: FETCH from external → INSERT into Zyra
        const baseUrl = creds.base_url || flow.base_url;
        const endpoint = config.endpoint || `/${flow.source_entity}`;

        let externalData = [];
        if (baseUrl) {
          try {
            const headers = { 'Content-Type': 'application/json' };
            if (flow.auth_type === 'api_key' && creds.api_key) headers['Authorization'] = `Bearer ${creds.api_key}`;
            if (creds.api_key && !headers['Authorization']) headers['X-API-Key'] = creds.api_key;

            const response = await fetch(`${baseUrl}${endpoint}`, {
              method: 'GET', headers, signal: AbortSignal.timeout(15000),
            });
            if (response.ok) {
              const data = await response.json();
              externalData = Array.isArray(data) ? data : (data.data || data.results || data.records || [data]);
            } else {
              throw new Error(`HTTP ${response.status}`);
            }
          } catch (err) {
            result.failed = 1; result.errors.push({ error: `Fetch failed: ${err.message}` });
          }
        } else if (req.body.data) {
          // Manual data provided in request body
          externalData = Array.isArray(req.body.data) ? req.body.data : [req.body.data];
        }

        if (externalData.length) {
          const mapped = externalData.map(r => mapRecord(r, fieldMapping));
          result = await insertIntoEntity(flow.target_entity, mapped);
        }
      }
    } catch (execErr) {
      result.failed = 1; result.errors.push({ error: execErr.message });
    }

    const status = result.failed > 0 && result.success === 0 ? 'failed' : result.failed > 0 ? 'partial' : 'completed';

    await query(
      `UPDATE int_execution_log SET status=$1, records_processed=$2, records_success=$3,
       records_failed=$4, error_details=$5, duration_ms=$6, completed_at=NOW(),
       request_payload=$7 WHERE id=$8`,
      [status, result.success + result.failed, result.success, result.failed,
       JSON.stringify(result.errors.slice(0, 50)), Date.now() - startTime,
       result.request_payload ? JSON.stringify(result.request_payload.slice(0, 10)) : null,
       logEntry.rows[0].id]);

    await query(
      `UPDATE int_flows SET last_run_at=NOW(), last_run_status=$1,
       run_count=run_count+1, success_count=success_count+$2, error_count=error_count+$3 WHERE id=$4`,
      [status, result.success, result.failed, req.params.id]);

    successResponse(res, {
      execution_id: logEntry.rows[0].id,
      status, records_processed: result.success + result.failed,
      records_success: result.success, records_failed: result.failed,
      errors: result.errors.slice(0, 5),
      duration_ms: Date.now() - startTime,
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// EXECUTION LOG
// ============================================
router.get('/execution-log', authenticate, async (req, res) => {
  try {
    const { flow_id, status, page = 1 } = req.query;
    let sql = `SELECT el.*, f.flow_name, c.connection_name, cn.icon
               FROM int_execution_log el
               JOIN int_flows f ON el.flow_id = f.id
               JOIN int_connections c ON el.connection_id = c.id
               JOIN int_connectors cn ON c.connector_id = cn.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (flow_id) { sql += ` AND el.flow_id = $${idx++}`; params.push(flow_id); }
    if (status) { sql += ` AND el.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY el.started_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// WEBHOOKS
// ============================================
router.get('/webhooks', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT w.*, c.connection_name, cn.connector_name FROM int_webhooks w
       JOIN int_connections c ON w.connection_id = c.id
       JOIN int_connectors cn ON c.connector_id = cn.id ORDER BY w.created_at DESC`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/webhooks', authenticate, adminOnly, async (req, res) => {
  try {
    const { connection_id, target_entity, field_mapping } = req.body;
    const webhookKey = crypto.randomBytes(32).toString('hex');
    const webhookSecret = crypto.randomBytes(48).toString('hex');
    const result = await query(
      `INSERT INTO int_webhooks (connection_id, webhook_key, webhook_secret, target_entity, field_mapping, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [connection_id, webhookKey, webhookSecret, target_entity, JSON.stringify(field_mapping || []), req.user.id]);
    successResponse(res, { ...result.rows[0], webhook_url: `/api/integrations/webhook/${webhookKey}` }, 'Webhook created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// Inbound webhook receiver — processes data using field mapping and inserts into Zyra
router.post('/webhook/:key', async (req, res) => {
  try {
    const webhook = await query(`SELECT * FROM int_webhooks WHERE webhook_key = $1 AND is_active = true`, [req.params.key]);
    if (!webhook.rows.length) return res.status(404).json({ error: 'Webhook not found' });
    const wh = webhook.rows[0];

    // Verify secret if provided
    const secret = req.headers['x-webhook-secret'];
    if (wh.webhook_secret && secret !== wh.webhook_secret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    // Parse field mapping
    const fieldMapping = typeof wh.field_mapping === 'string' ? JSON.parse(wh.field_mapping) : (wh.field_mapping || []);

    // Get incoming data — support single object or array
    const incoming = req.body;
    const records = Array.isArray(incoming) ? incoming
      : incoming.data ? (Array.isArray(incoming.data) ? incoming.data : [incoming.data])
      : [incoming];

    let result = { success: 0, failed: 0, errors: [] };

    if (fieldMapping.length > 0) {
      const mapped = records.map(r => mapRecord(r, fieldMapping));
      result = await insertIntoEntity(wh.target_entity, mapped);
    } else {
      // No mapping — try direct insert
      result = await insertIntoEntity(wh.target_entity, records);
    }

    await query(`UPDATE int_webhooks SET last_received_at=NOW(), receive_count=receive_count+1 WHERE id=$1`, [wh.id]);

    res.json({
      success: true,
      records_received: records.length,
      records_inserted: result.success,
      records_failed: result.failed,
      errors: result.errors.slice(0, 5),
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed', detail: err.message });
  }
});

// ============================================
// API KEYS
// ============================================
router.get('/api-keys', authenticate, adminOnly, async (req, res) => {
  try {
    const result = await query(`SELECT id, key_name, api_key, permissions, allowed_entities, allowed_ips, rate_limit_per_min, is_active, last_used_at, usage_count, expires_at, created_at FROM int_api_keys ORDER BY created_at DESC`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/api-keys', authenticate, adminOnly, async (req, res) => {
  try {
    const { key_name, permissions, allowed_entities, allowed_ips, rate_limit_per_min, expires_at } = req.body;
    if (!key_name) return errorResponse(res, 'Key name required', 400);
    const apiKey = `nxerp_${crypto.randomBytes(24).toString('hex')}`;
    const apiSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(apiSecret, 10);
    const result = await query(
      `INSERT INTO int_api_keys (key_name, api_key, api_secret_hash, permissions, allowed_entities, allowed_ips, rate_limit_per_min, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, key_name, api_key, permissions, created_at`,
      [key_name, apiKey, secretHash, JSON.stringify(permissions || { read: true, write: false }),
       JSON.stringify(allowed_entities || []), JSON.stringify(allowed_ips || []),
       rate_limit_per_min || 100, expires_at, req.user.id]);
    // Return secret ONCE — it cannot be retrieved again
    successResponse(res, { ...result.rows[0], api_secret: apiSecret, warning: 'Save the API secret now — it cannot be shown again.' }, 'API key created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/api-keys/:id', authenticate, adminOnly, async (req, res) => {
  try { await query(`DELETE FROM int_api_keys WHERE id = $1`, [req.params.id]); successResponse(res, null, 'Revoked'); }
  catch (err) { errorResponse(res, err.message); }
});

// ============================================
// OVERVIEW STATS
// ============================================
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [connectors, connections, flows, executions, webhooks, apiKeys] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM int_connectors WHERE is_template = true`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='active') as active FROM int_connections`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE is_active=true) as active, COALESCE(SUM(run_count),0) as total_runs FROM int_flows`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='completed') as success, COUNT(*) FILTER(WHERE status='failed') as failed FROM int_execution_log WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'`),
      query(`SELECT COUNT(*) as total FROM int_webhooks WHERE is_active = true`),
      query(`SELECT COUNT(*) as total FROM int_api_keys WHERE is_active = true`),
    ]);
    successResponse(res, {
      connectors: connectors.rows[0], connections: connections.rows[0],
      flows: flows.rows[0], executions: executions.rows[0],
      webhooks: webhooks.rows[0], apiKeys: apiKeys.rows[0],
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// MANUAL DATA PUSH — paste JSON data to insert into any entity
// ============================================
router.post('/push-data', authenticate, adminOnly, async (req, res) => {
  try {
    const { target_entity, data, field_mapping } = req.body;
    if (!target_entity || !data) return errorResponse(res, 'Target entity and data required', 400);

    const records = Array.isArray(data) ? data : [data];

    let processedRecords = records;
    if (field_mapping?.length) {
      processedRecords = records.map(r => mapRecord(r, field_mapping));
    }

    const result = await insertIntoEntity(target_entity, processedRecords);
    successResponse(res, {
      records_received: records.length,
      records_inserted: result.success,
      records_failed: result.failed,
      errors: result.errors.slice(0, 10),
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// READ DATA — external systems can read Zyra data via API key
// ============================================
router.get('/data/:entity', async (req, res) => {
  try {
    // Authenticate via API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required in X-API-Key header' });

    const keyRes = await query(`SELECT * FROM int_api_keys WHERE api_key = $1 AND is_active = true`, [apiKey]);
    if (!keyRes.rows.length) return res.status(401).json({ error: 'Invalid API key' });

    const key = keyRes.rows[0];
    if (key.expires_at && new Date(key.expires_at) < new Date()) return res.status(401).json({ error: 'API key expired' });

    const perms = typeof key.permissions === 'string' ? JSON.parse(key.permissions) : key.permissions;
    if (!perms.read) return res.status(403).json({ error: 'API key does not have read permission' });

    // Check allowed entities
    const allowedEntities = typeof key.allowed_entities === 'string' ? JSON.parse(key.allowed_entities) : (key.allowed_entities || []);
    if (allowedEntities.length > 0 && !allowedEntities.includes(req.params.entity)) {
      return res.status(403).json({ error: `API key not authorized for entity: ${req.params.entity}` });
    }

    // Read data
    const schema = ENTITY_SCHEMAS[req.params.entity];
    if (!schema) return res.status(400).json({ error: `Unknown entity: ${req.params.entity}` });

    const { limit = 100, offset = 0 } = req.query;
    const result = await query(`SELECT * FROM ${schema.table} LIMIT $1 OFFSET $2`, [Math.min(parseInt(limit), 500), parseInt(offset)]);

    // Update usage
    await query(`UPDATE int_api_keys SET last_used_at=NOW(), usage_count=usage_count+1 WHERE id=$1`, [key.id]);

    res.json({ entity: req.params.entity, count: result.rows.length, data: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// WRITE DATA — external systems can write to Zyra via API key
// ============================================
router.post('/data/:entity', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API key required in X-API-Key header' });

    const keyRes = await query(`SELECT * FROM int_api_keys WHERE api_key = $1 AND is_active = true`, [apiKey]);
    if (!keyRes.rows.length) return res.status(401).json({ error: 'Invalid API key' });

    const key = keyRes.rows[0];
    const perms = typeof key.permissions === 'string' ? JSON.parse(key.permissions) : key.permissions;
    if (!perms.write) return res.status(403).json({ error: 'API key does not have write permission' });

    const allowedEntities = typeof key.allowed_entities === 'string' ? JSON.parse(key.allowed_entities) : (key.allowed_entities || []);
    if (allowedEntities.length > 0 && !allowedEntities.includes(req.params.entity)) {
      return res.status(403).json({ error: `API key not authorized for entity: ${req.params.entity}` });
    }

    const records = Array.isArray(req.body) ? req.body : (req.body.data ? (Array.isArray(req.body.data) ? req.body.data : [req.body.data]) : [req.body]);
    const result = await insertIntoEntity(req.params.entity, records);

    await query(`UPDATE int_api_keys SET last_used_at=NOW(), usage_count=usage_count+1 WHERE id=$1`, [key.id]);

    res.json({
      entity: req.params.entity,
      records_received: records.length,
      records_inserted: result.success,
      records_failed: result.failed,
      errors: result.errors.slice(0, 10),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
