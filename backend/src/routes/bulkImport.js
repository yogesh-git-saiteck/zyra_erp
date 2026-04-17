import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber } from '../utils/helpers.js';
import multer from 'multer';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

// ===================================================
// TEMPLATE DEFINITIONS — columns for each entity
// ===================================================
const TEMPLATES = {
  business_partners: {
    sheetName: 'Business Partners',
    columns: [
      { header: 'Type *', key: 'bp_type', width: 12, note: 'customer / vendor / both', example: 'customer' },
      { header: 'Display Name *', key: 'display_name', width: 25, example: 'Acme Corporation' },
      { header: 'Company Name', key: 'company_name', width: 25, example: 'Acme Corp Pvt Ltd' },
      { header: 'GSTIN', key: 'gstin', width: 18, note: '15 chars', example: '33AABCU9603R1ZM' },
      { header: 'PAN', key: 'pan', width: 12, note: '10 chars', example: 'AABCU9603R' },
      { header: 'Email', key: 'email', width: 25, example: 'info@acme.com' },
      { header: 'Phone', key: 'phone', width: 15, example: '+91-44-12345678' },
      { header: 'Contact Person', key: 'contact_person', width: 20, example: 'Rajesh Kumar' },
      { header: 'Address', key: 'address_line1', width: 30, example: '123 Industrial Area' },
      { header: 'City', key: 'city', width: 15, example: 'Chennai' },
      { header: 'State', key: 'state', width: 15, example: 'Tamil Nadu' },
      { header: 'Postal Code', key: 'postal_code', width: 12, example: '600001' },
      { header: 'Country', key: 'country', width: 10, example: 'IN' },
      { header: 'Credit Limit', key: 'credit_limit', width: 14, note: 'number', example: '500000' },
      { header: 'Credit Days', key: 'credit_days', width: 12, note: 'number', example: '30' },
      { header: 'TDS Category', key: 'tds_category', width: 14, note: '194C/194J/194H/194I', example: '194C' },
      { header: 'Bank Name', key: 'bank_name', width: 20, example: 'State Bank of India' },
      { header: 'Bank Account', key: 'bank_account_number', width: 20, example: '1234567890' },
      { header: 'Bank IFSC', key: 'bank_ifsc', width: 14, example: 'SBIN0001234' },
      { header: 'Billing Address', key: 'billing_address', width: 30, example: '123 Industrial Area, Chennai' },
      { header: 'Shipping Address', key: 'shipping_address', width: 30, example: 'Warehouse, Ambattur' },
    ],
  },
  materials: {
    sheetName: 'Materials',
    columns: [
      { header: 'Material Name *', key: 'material_name', width: 30, example: 'Steel Rod 10mm' },
      { header: 'Description', key: 'description', width: 35, example: 'Mild steel round bar 10mm diameter' },
      { header: 'Material Type Code', key: 'material_type_code', width: 18, note: 'FERT/ROH/HALB/HIBE/DIEN', example: 'ROH' },
      { header: 'Material Group Code', key: 'material_group_code', width: 18, note: 'ELEC/MECH/RAW/PACK', example: 'RAW' },
      { header: 'UoM Code *', key: 'uom_code', width: 10, note: 'EA/KG/L/M/PC/BOX/SET', example: 'KG' },
      { header: 'Standard Price', key: 'standard_price', width: 14, example: '85.50' },
      { header: 'Sales Price', key: 'sales_price', width: 14, example: '120.00' },
      { header: 'HSN Code', key: 'hsn_code', width: 12, note: '4-8 digits', example: '72142000' },
      { header: 'SAC Code', key: 'sac_code', width: 10, note: 'for services', example: '' },
      { header: 'GST Rate %', key: 'gst_rate', width: 12, note: '0/5/12/18/28', example: '18' },
      { header: 'Batch Managed', key: 'is_batch_managed', width: 14, note: 'true/false', example: 'false' },
      { header: 'Serial Managed', key: 'is_serial_managed', width: 14, note: 'true/false', example: 'false' },
      { header: 'Plant Code', key: 'plant_code', width: 12, note: 'e.g. P100 — assigns to plant', example: 'P100' },
      { header: 'Reorder Point', key: 'reorder_point', width: 14, note: 'plant-level min stock trigger', example: '100' },
      { header: 'Safety Stock', key: 'safety_stock', width: 12, note: 'plant-level buffer', example: '50' },
      { header: 'Min Lot Size', key: 'min_lot_size', width: 12, note: 'minimum order qty', example: '10' },
      { header: 'Max Lot Size', key: 'max_lot_size', width: 12, note: 'maximum order qty', example: '5000' },
      { header: 'Procurement Type', key: 'procurement_type', width: 16, note: 'external/internal/both', example: 'external' },
      { header: 'Lead Time (days)', key: 'lead_time_days', width: 16, note: 'supplier lead time', example: '7' },
    ],
  },
  employees: {
    sheetName: 'Employees',
    columns: [
      { header: 'First Name *', key: 'first_name', width: 18, example: 'Rajesh' },
      { header: 'Last Name *', key: 'last_name', width: 18, example: 'Kumar' },
      { header: 'Email *', key: 'email', width: 25, example: 'rajesh.kumar@company.com' },
      { header: 'Phone', key: 'phone', width: 15, example: '9876543210' },
      { header: 'Department Code', key: 'department_code', width: 16, note: 'MGMT/FIN/SALES/PROD/HR', example: 'PROD' },
      { header: 'Designation', key: 'position_title', width: 20, example: 'Senior Engineer' },
      { header: 'Hire Date', key: 'hire_date', width: 14, note: 'YYYY-MM-DD', example: '2024-01-15' },
      { header: 'Employment Type', key: 'employment_type', width: 16, note: 'full_time/part_time/contract', example: 'full_time' },
      { header: 'Basic Salary', key: 'basic_salary', width: 14, note: 'monthly', example: '35000' },
      { header: 'HRA %', key: 'hra_percent', width: 10, note: 'default 40', example: '40' },
      { header: 'Date of Birth', key: 'date_of_birth', width: 14, note: 'YYYY-MM-DD', example: '1990-05-20' },
      { header: 'Gender', key: 'gender', width: 10, note: 'male/female/other', example: 'male' },
      { header: 'PAN', key: 'pan_number', width: 12, example: 'ABCDE1234F' },
      { header: 'Aadhaar', key: 'aadhaar_number', width: 14, example: '123456789012' },
      { header: 'PF Number', key: 'pf_number', width: 22, example: 'TN/CHN/12345/123' },
      { header: 'UAN', key: 'uan_number', width: 14, example: '100012345678' },
      { header: 'ESI Number', key: 'esi_number', width: 18, example: '' },
      { header: 'Bank Name', key: 'bank_name', width: 20, example: 'HDFC Bank' },
      { header: 'Bank Account', key: 'bank_account_number', width: 20, example: '50100123456789' },
      { header: 'Bank IFSC', key: 'bank_ifsc', width: 14, example: 'HDFC0001234' },
      { header: 'Grade', key: 'grade', width: 10, example: 'L5' },
      { header: 'Notice Period (days)', key: 'notice_period_days', width: 18, example: '60' },
      { header: 'Emergency Contact', key: 'emergency_contact_name', width: 20, example: 'Priya Kumar' },
      { header: 'Emergency Phone', key: 'emergency_contact_phone', width: 15, example: '9876543211' },
    ],
  },
  gl_accounts: {
    sheetName: 'GL Accounts',
    columns: [
      { header: 'Account Code *', key: 'account_code', width: 14, example: '410100' },
      { header: 'Account Name *', key: 'account_name', width: 30, example: 'Sales Revenue - Domestic' },
      { header: 'Account Type *', key: 'account_type', width: 14, note: 'asset/liability/equity/revenue/expense', example: 'revenue' },
      { header: 'Account Group', key: 'account_group', width: 20, note: 'e.g. Current Assets', example: 'Operating Revenue' },
      { header: 'Description', key: 'description', width: 35, example: 'Revenue from domestic product sales' },
      { header: 'Allow Posting', key: 'allow_posting', width: 14, note: 'true/false', example: 'true' },
      { header: 'Opening Balance', key: 'opening_balance', width: 16, note: 'for migration', example: '0' },
      { header: 'Tax Category', key: 'tax_category', width: 14, note: 'taxable/exempt', example: '' },
      { header: 'Currency', key: 'currency', width: 10, note: 'e.g. INR', example: 'INR' },
    ],
  },
  plants: {
    sheetName: 'Plants',
    columns: [
      { header: 'Plant Code *', key: 'plant_code', width: 12, note: 'unique code', example: 'P200' },
      { header: 'Plant Name *', key: 'plant_name', width: 30, example: 'Chennai Manufacturing Unit' },
      { header: 'Company Code *', key: 'company_code', width: 14, note: 'must exist e.g. 1000', example: '1000' },
      { header: 'Address', key: 'address_line1', width: 30, example: '45 Industrial Estate' },
      { header: 'City', key: 'city', width: 15, example: 'Chennai' },
      { header: 'State', key: 'state', width: 15, example: 'Tamil Nadu' },
      { header: 'Postal Code', key: 'postal_code', width: 12, example: '600032' },
      { header: 'Country', key: 'country', width: 10, note: '2-3 letter code', example: 'IN' },
      { header: 'Phone', key: 'phone', width: 15, example: '+91-44-28361234' },
      { header: 'Email', key: 'email', width: 25, example: 'plant.chennai@company.com' },
    ],
  },
  storage_locations: {
    sheetName: 'Storage Locations',
    columns: [
      { header: 'SLoc Code *', key: 'sloc_code', width: 12, note: 'unique per plant', example: 'RM02' },
      { header: 'SLoc Name *', key: 'sloc_name', width: 25, example: 'Raw Materials Store 2' },
      { header: 'Plant Code *', key: 'plant_code', width: 12, note: 'must exist e.g. P100', example: 'P100' },
      { header: 'Type', key: 'sloc_type', width: 16, note: 'general/raw_material/finished_goods/wip/quarantine/scrap', example: 'raw_material' },
      { header: 'Description', key: 'description', width: 30, example: 'Secondary raw material storage' },
    ],
  },
  cost_centers: {
    sheetName: 'Cost Centers',
    columns: [
      { header: 'CC Code *', key: 'cc_code', width: 12, note: 'unique code', example: 'CC4010' },
      { header: 'CC Name *', key: 'cc_name', width: 25, example: 'IT Department' },
      { header: 'Company Code *', key: 'company_code', width: 14, note: 'must exist', example: '1000' },
      { header: 'Category', key: 'category', width: 16, note: 'operational/admin/production/sales/research', example: 'admin' },
      { header: 'Profit Center Code', key: 'pc_code', width: 18, note: 'must exist e.g. PC1000', example: 'PC1000' },
      { header: 'Description', key: 'description', width: 30, example: 'Information Technology department costs' },
    ],
  },
  profit_centers: {
    sheetName: 'Profit Centers',
    columns: [
      { header: 'PC Code *', key: 'pc_code', width: 12, note: 'unique code', example: 'PC3000' },
      { header: 'PC Name *', key: 'pc_name', width: 25, example: 'Services Division' },
      { header: 'Company Code *', key: 'company_code', width: 14, note: 'must exist', example: '1000' },
      { header: 'Description', key: 'description', width: 30, example: 'Revenue center for services business' },
    ],
  },
};

// ===================================================
// DOWNLOAD TEMPLATE — generates styled Excel with headers + example row + instructions
// ===================================================
router.get('/template/:entity', authenticate, (req, res) => {
  try {
    const entity = req.params.entity;
    const tpl = TEMPLATES[entity];
    if (!tpl) return errorResponse(res, `Unknown entity: ${entity}. Valid: ${Object.keys(TEMPLATES).join(', ')}`, 400);

    const wb = XLSX.utils.book_new();

    // Data sheet with headers + example row
    const headers = tpl.columns.map(c => c.header);
    const examples = tpl.columns.map(c => c.example || '');
    const wsData = [headers, examples];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = tpl.columns.map(c => ({ wch: c.width || 15 }));
    XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName);

    // Instructions sheet
    const instrData = [
      ['Zyra — Bulk Import Template'],
      [''],
      ['Entity:', entity.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())],
      [''],
      ['Instructions:'],
      ['1. Fill in data starting from Row 2 (Row 1 is the header — DO NOT modify headers)'],
      ['2. Row 2 contains example data — replace or delete it before uploading'],
      ['3. Fields marked with * are mandatory'],
      ['4. Dates must be in YYYY-MM-DD format (e.g. 2024-01-15)'],
      ['5. Boolean fields: use true/false'],
      ['6. Numbers: use plain numbers without commas or currency symbols'],
      ['7. Save the file as .xlsx and upload via the Import button'],
      [''],
      ['Column Reference:'],
    ];
    tpl.columns.forEach(c => {
      instrData.push([c.header, c.key, c.note || '', c.example || '']);
    });
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
    wsInstr['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 30 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    // Write to buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Zyra_${entity}_template.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  } catch (err) { errorResponse(res, err.message); }
});

// ===================================================
// UPLOAD + IMPORT — parse Excel and create records
// ===================================================
router.post('/import/:entity', authenticate, upload.single('file'), async (req, res) => {
  try {
    const entity = req.params.entity;
    const tpl = TEMPLATES[entity];
    if (!tpl) return errorResponse(res, `Unknown entity: ${entity}`, 400);
    if (!req.file) return errorResponse(res, 'No file uploaded', 400);

    // Parse Excel
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) return errorResponse(res, 'File is empty or has no data rows', 400);

    // Map header names to keys
    const headerMap = {};
    tpl.columns.forEach(c => { headerMap[c.header] = c.key; });

    // Convert rows from header-keyed to key-keyed
    const mapped = rows.map((row, idx) => {
      const obj = {};
      for (const [header, val] of Object.entries(row)) {
        const key = headerMap[header] || headerMap[header.replace(' *', '')] || header;
        obj[key] = typeof val === 'string' ? val.trim() : val;
      }
      obj._rowNum = idx + 2; // Excel row number for error reporting
      return obj;
    });

    // Process by entity type
    let result;
    switch (entity) {
      case 'business_partners': result = await importBusinessPartners(mapped, req.user.id); break;
      case 'materials': result = await importMaterials(mapped, req.user.id); break;
      case 'employees': result = await importEmployees(mapped, req.user.id); break;
      case 'gl_accounts': result = await importGLAccounts(mapped, req.user.id); break;
      case 'plants': result = await importPlants(mapped, req.user.id); break;
      case 'storage_locations': result = await importStorageLocations(mapped, req.user.id); break;
      case 'cost_centers': result = await importCostCenters(mapped, req.user.id); break;
      case 'profit_centers': result = await importProfitCenters(mapped, req.user.id); break;
      default: return errorResponse(res, `Import not supported for ${entity}`, 400);
    }

    // Cleanup temp file
    try { fs.unlinkSync(req.file.path); } catch {}

    successResponse(res, result, `Import complete: ${result.created} created, ${result.errors.length} errors`);
  } catch (err) {
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    errorResponse(res, err.message);
  }
});

// ===================================================
// IMPORT HANDLERS PER ENTITY
// ===================================================

async function importBusinessPartners(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const num = (v) => (v === '' || v == null) ? null : parseFloat(v);
  const uuid = (v) => (v === '' || v == null) ? null : v;

  for (const row of rows) {
    try {
      if (!row.display_name) { results.errors.push({ row: row._rowNum, error: 'Display Name is required' }); continue; }
      const bpType = (row.bp_type || 'customer').toLowerCase();
      if (!['customer', 'vendor', 'both'].includes(bpType)) { results.errors.push({ row: row._rowNum, error: `Invalid type: ${row.bp_type}` }); continue; }

      const bpNumber = await getNextNumber('BP');
      await query(
        `INSERT INTO bp_business_partners (bp_number, bp_type, display_name, company_name, email, phone,
          contact_person, address_line1, city, state, postal_code, country, credit_limit, credit_days,
          gstin, pan, tds_category, bank_name, bank_account_number, bank_ifsc,
          billing_address, shipping_address, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'INR')`,
        [bpNumber, bpType, row.display_name, row.company_name, row.email, row.phone,
         row.contact_person, row.address_line1, row.city, row.state, row.postal_code, row.country || 'IN',
         num(row.credit_limit), num(row.credit_days),
         row.gstin, row.pan, row.tds_category, row.bank_name, row.bank_account_number, row.bank_ifsc,
         row.billing_address, row.shipping_address]);
      results.created++;
    } catch (err) {
      results.errors.push({ row: row._rowNum, name: row.display_name, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importMaterials(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const num = (v) => (v === '' || v == null) ? null : parseFloat(v);

  // Pre-load lookups
  const types = (await query(`SELECT id, type_code FROM mm_material_types`)).rows;
  const groups = (await query(`SELECT id, group_code FROM mm_material_groups`)).rows;
  const uoms = (await query(`SELECT id, uom_code FROM mm_units_of_measure`)).rows;
  const plants = (await query(`SELECT id, plant_code FROM org_plants`)).rows;

  for (const row of rows) {
    try {
      if (!row.material_name) { results.errors.push({ row: row._rowNum, error: 'Material Name is required' }); continue; }

      const typeId = row.material_type_code ? types.find(t => t.type_code === String(row.material_type_code).toUpperCase())?.id : null;
      const groupId = row.material_group_code ? groups.find(g => g.group_code === String(row.material_group_code).toUpperCase())?.id : null;
      const uomId = row.uom_code ? uoms.find(u => u.uom_code === String(row.uom_code).toUpperCase())?.id : uoms.find(u => u.uom_code === 'EA')?.id;

      if (!uomId) { results.errors.push({ row: row._rowNum, error: `Unknown UoM: ${row.uom_code}` }); continue; }

      const matCode = await getNextNumber('MAT');
      const matResult = await query(
        `INSERT INTO mm_materials (material_code, material_name, description, material_type_id, material_group_id,
          base_uom_id, standard_price, sales_price, hsn_code, sac_code, gst_rate,
          is_batch_managed, is_serial_managed, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'INR') RETURNING id`,
        [matCode, row.material_name, row.description, typeId, groupId, uomId,
         num(row.standard_price) || 0, num(row.sales_price) || 0,
         row.hsn_code, row.sac_code, num(row.gst_rate),
         row.is_batch_managed === 'true' || row.is_batch_managed === true,
         row.is_serial_managed === 'true' || row.is_serial_managed === true]);

      const materialId = matResult.rows[0].id;

      // Create plant-level data if plant code is provided
      if (row.plant_code) {
        const plant = plants.find(p => p.plant_code === String(row.plant_code));
        if (plant) {
          await query(
            `INSERT INTO mm_material_plant_data (material_id, plant_id, reorder_point, safety_stock,
              min_lot_size, max_lot_size, procurement_type, lead_time_days)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [materialId, plant.id, num(row.reorder_point), num(row.safety_stock),
             num(row.min_lot_size), num(row.max_lot_size),
             row.procurement_type || 'external', num(row.lead_time_days) || 0]);
        } else {
          results.errors.push({ row: row._rowNum, name: row.material_name, error: `Material created but plant '${row.plant_code}' not found — plant data skipped` });
        }
      }

      results.created++;
    } catch (err) {
      results.errors.push({ row: row._rowNum, name: row.material_name, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importEmployees(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const num = (v) => (v === '' || v == null) ? null : parseFloat(v);

  // Pre-load departments
  const depts = (await query(`SELECT id, dept_code FROM hr_departments`)).rows;

  for (const row of rows) {
    try {
      if (!row.first_name || !row.last_name) { results.errors.push({ row: row._rowNum, error: 'First Name and Last Name required' }); continue; }
      if (!row.email) { results.errors.push({ row: row._rowNum, error: 'Email is required' }); continue; }

      const deptId = row.department_code ? depts.find(d => d.dept_code === row.department_code.toUpperCase())?.id : null;
      const empNumber = await getNextNumber('EMP');

      await query(
        `INSERT INTO hr_employees (employee_number, first_name, last_name, email, phone, department_id,
          hire_date, employment_type, salary, basic_salary, hra_percent,
          date_of_birth, gender, pan_number, aadhaar_number, pf_number, uan_number, esi_number,
          bank_name, bank_account_number, bank_ifsc, grade, notice_period_days,
          emergency_contact_name, emergency_contact_phone, status, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'active','INR')`,
        [empNumber, row.first_name, row.last_name, row.email, row.phone, deptId,
         row.hire_date || null, row.employment_type || 'full_time',
         num(row.basic_salary), num(row.basic_salary), num(row.hra_percent) || 40,
         row.date_of_birth || null, row.gender,
         row.pan_number, row.aadhaar_number, row.pf_number, row.uan_number, row.esi_number,
         row.bank_name, row.bank_account_number, row.bank_ifsc, row.grade, num(row.notice_period_days) || 30,
         row.emergency_contact_name, row.emergency_contact_phone]);
      results.created++;
    } catch (err) {
      results.errors.push({ row: row._rowNum, name: `${row.first_name} ${row.last_name}`, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importGLAccounts(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const num = (v) => (v === '' || v == null) ? null : parseFloat(v);

  const coaRes = await query(`SELECT id FROM fi_chart_of_accounts LIMIT 1`);
  const coaId = coaRes.rows[0]?.id;
  if (!coaId) { return { created: 0, skipped: 0, errors: [{ row: 0, error: 'No Chart of Accounts found. Create one first in Settings.' }] }; }

  for (const row of rows) {
    try {
      if (!row.account_code || !row.account_name) { results.errors.push({ row: row._rowNum, error: 'Account Code and Name required' }); continue; }
      const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];
      const acType = (row.account_type || '').toLowerCase();
      if (!validTypes.includes(acType)) { results.errors.push({ row: row._rowNum, error: `Invalid type: ${row.account_type}. Use: ${validTypes.join('/')}` }); continue; }

      await query(
        `INSERT INTO fi_gl_accounts (coa_id, account_code, account_name, account_type, account_group,
          description, is_posting, opening_balance, tax_category, currency, balance_direction)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [coaId, row.account_code, row.account_name, acType, row.account_group,
         row.description, row.allow_posting !== 'false', num(row.opening_balance) || 0,
         row.tax_category || null, row.currency || null,
         (acType === 'asset' || acType === 'expense') ? 'debit' : 'credit']);
      results.created++;
    } catch (err) {
      if (err.message.includes('duplicate')) { results.skipped++; }
      else results.errors.push({ row: row._rowNum, code: row.account_code, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importPlants(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const companies = (await query(`SELECT id, company_code FROM org_companies`)).rows;

  for (const row of rows) {
    try {
      if (!row.plant_code || !row.plant_name) { results.errors.push({ row: row._rowNum, error: 'Plant Code and Name required' }); continue; }
      if (!row.company_code) { results.errors.push({ row: row._rowNum, error: 'Company Code required' }); continue; }
      const company = companies.find(c => c.company_code === String(row.company_code));
      if (!company) { results.errors.push({ row: row._rowNum, error: `Company '${row.company_code}' not found` }); continue; }

      await query(
        `INSERT INTO org_plants (plant_code, plant_name, company_id, address_line1, city, state, postal_code, country, phone, email)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [row.plant_code, row.plant_name, company.id, row.address_line1, row.city, row.state, row.postal_code, row.country || 'IN', row.phone, row.email]);
      results.created++;
    } catch (err) {
      if (err.message.includes('duplicate')) { results.skipped++; results.errors.push({ row: row._rowNum, name: row.plant_code, error: 'Plant code already exists — skipped' }); }
      else results.errors.push({ row: row._rowNum, name: row.plant_code, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importStorageLocations(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const plants = (await query(`SELECT id, plant_code FROM org_plants`)).rows;

  for (const row of rows) {
    try {
      if (!row.sloc_code || !row.sloc_name) { results.errors.push({ row: row._rowNum, error: 'SLoc Code and Name required' }); continue; }
      if (!row.plant_code) { results.errors.push({ row: row._rowNum, error: 'Plant Code required' }); continue; }
      const plant = plants.find(p => p.plant_code === String(row.plant_code));
      if (!plant) { results.errors.push({ row: row._rowNum, error: `Plant '${row.plant_code}' not found` }); continue; }

      await query(
        `INSERT INTO org_storage_locations (sloc_code, sloc_name, plant_id, sloc_type, description)
         VALUES ($1,$2,$3,$4,$5)`,
        [row.sloc_code, row.sloc_name, plant.id, row.sloc_type || 'general', row.description]);
      results.created++;
    } catch (err) {
      if (err.message.includes('duplicate')) { results.skipped++; }
      else results.errors.push({ row: row._rowNum, name: row.sloc_code, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importCostCenters(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const companies = (await query(`SELECT id, company_code FROM org_companies`)).rows;
  const pcs = (await query(`SELECT id, pc_code FROM org_profit_centers`)).rows;

  for (const row of rows) {
    try {
      if (!row.cc_code || !row.cc_name) { results.errors.push({ row: row._rowNum, error: 'CC Code and Name required' }); continue; }
      if (!row.company_code) { results.errors.push({ row: row._rowNum, error: 'Company Code required' }); continue; }
      const company = companies.find(c => c.company_code === String(row.company_code));
      if (!company) { results.errors.push({ row: row._rowNum, error: `Company '${row.company_code}' not found` }); continue; }
      const pcId = row.pc_code ? pcs.find(p => p.pc_code === String(row.pc_code))?.id : null;

      await query(
        `INSERT INTO org_cost_centers (cc_code, cc_name, company_id, category, profit_center_id, description)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.cc_code, row.cc_name, company.id, row.category || 'operational', pcId, row.description]);
      results.created++;
    } catch (err) {
      if (err.message.includes('duplicate')) { results.skipped++; }
      else results.errors.push({ row: row._rowNum, name: row.cc_code, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

async function importProfitCenters(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  const companies = (await query(`SELECT id, company_code FROM org_companies`)).rows;

  for (const row of rows) {
    try {
      if (!row.pc_code || !row.pc_name) { results.errors.push({ row: row._rowNum, error: 'PC Code and Name required' }); continue; }
      if (!row.company_code) { results.errors.push({ row: row._rowNum, error: 'Company Code required' }); continue; }
      const company = companies.find(c => c.company_code === String(row.company_code));
      if (!company) { results.errors.push({ row: row._rowNum, error: `Company '${row.company_code}' not found` }); continue; }

      await query(
        `INSERT INTO org_profit_centers (pc_code, pc_name, company_id, description)
         VALUES ($1,$2,$3,$4)`,
        [row.pc_code, row.pc_name, company.id, row.description]);
      results.created++;
    } catch (err) {
      if (err.message.includes('duplicate')) { results.skipped++; }
      else results.errors.push({ row: row._rowNum, name: row.pc_code, error: err.message.substring(0, 100) });
    }
  }
  return results;
}

export default router;
