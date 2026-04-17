import { query } from '../config/database.js';

// ================================================================
// COLUMN FIXER — runs before everything else
// Ensures ALL columns referenced in route files actually exist.
// Each ALTER TABLE ADD COLUMN IF NOT EXISTS is idempotent.
// ================================================================
export async function fixMissingColumns() {
  console.log('🔧 Checking for missing columns...');
  let fixed = 0;

  const alters = [
    // org_plants
    `ALTER TABLE org_plants ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
    `ALTER TABLE org_plants ADD COLUMN IF NOT EXISTS email VARCHAR(100)`,

    // org_storage_locations
    `ALTER TABLE org_storage_locations ADD COLUMN IF NOT EXISTS sloc_type VARCHAR(30) DEFAULT 'general'`,
    `ALTER TABLE org_storage_locations ADD COLUMN IF NOT EXISTS description TEXT`,

    // org_sales_organizations
    `ALTER TABLE org_sales_organizations ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
    `ALTER TABLE org_sales_organizations ADD COLUMN IF NOT EXISTS description TEXT`,

    // org_cost_centers
    `ALTER TABLE org_cost_centers ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
    `ALTER TABLE org_cost_centers ADD COLUMN IF NOT EXISTS description TEXT`,

    // org_profit_centers
    `ALTER TABLE org_profit_centers ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
    `ALTER TABLE org_profit_centers ADD COLUMN IF NOT EXISTS description TEXT`,

    // org_companies — letterhead + GST
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS gstin VARCHAR(15)`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS pan VARCHAR(10)`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS cin VARCHAR(21)`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS bank_details TEXT`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS digital_signature_url TEXT`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS letterhead_line1 TEXT`,
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS letterhead_line2 TEXT`,

    // bp_business_partners — GST, banking, contacts
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS gstin VARCHAR(15)`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS pan VARCHAR(10)`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(30)`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(15)`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS tds_category VARCHAR(20)`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS billing_address TEXT`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS shipping_address TEXT`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS credit_days INT DEFAULT 30`,
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100)`,

    // hr_employees — personal, statutory, payroll
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS email VARCHAR(100)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS position_title VARCHAR(100)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS date_of_birth DATE`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS pf_number VARCHAR(22)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS uan_number VARCHAR(12)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS esi_number VARCHAR(17)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(30)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(15)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS grade VARCHAR(20)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS notice_period_days INT DEFAULT 30`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS basic_salary DECIMAL(15,2)`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS hra_percent DECIMAL(5,2) DEFAULT 40`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS da_percent DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS special_allowance DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS conveyance_allowance DECIMAL(15,2) DEFAULT 1600`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS medical_allowance DECIMAL(15,2) DEFAULT 1250`,
    `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(10) DEFAULT 'new'`,

    // mm_materials — GST
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS sac_code VARCHAR(6)`,
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18`,

    // fi_ap_invoices — GST breakdown
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS vendor_invoice_number VARCHAR(50)`,
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS vendor_gstin VARCHAR(15)`,
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0`,

    // fi_ar_invoices — GST breakdown
    `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15)`,
    `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
    `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0`,

    // fi_payments — banking
    `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS utr_number VARCHAR(30)`,
    `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50)`,

    // fi_journal_headers
    `ALTER TABLE fi_journal_headers ADD COLUMN IF NOT EXISTS journal_type VARCHAR(20)`,

    // fi_journal_lines — fix column name (some routes use journal_id, schema uses header_id)
    // This is handled by using COALESCE in queries, no ALTER needed

    // sd_sales_orders
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS customer_po_number VARCHAR(50)`,

    // pur_requisitions
    `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS department VARCHAR(50)`,
    `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS justification TEXT`,

    // sd_quotations
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) DEFAULT 'goods'`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(20)`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS project_id UUID`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS payment_term_id UUID`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS delivery_terms VARCHAR(50)`,
    `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS sales_rep VARCHAR(100)`,

    // sd_quotation_items
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS plant_id UUID`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(10)`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS delivery_date DATE`,

    // sd_sales_orders
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) DEFAULT 'goods'`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS customer_po_number VARCHAR(50)`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(20)`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS project_id UUID`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS delivery_terms VARCHAR(50)`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'normal'`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(50)`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS internal_notes TEXT`,
    `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS plant_id UUID`,


    // GL Account per line item for budget tracking
    `ALTER TABLE pur_requisition_items ADD COLUMN IF NOT EXISTS gl_account_id UUID`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS gl_account_id UUID`,
    `ALTER TABLE pur_gr_items ADD COLUMN IF NOT EXISTS gl_account_id UUID`,
    // sd_so_items
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(10)`,
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS delivery_date DATE`,
    `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,

    // sd_deliveries
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) DEFAULT 'goods'`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS eway_bill_number VARCHAR(20)`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS eway_bill_date DATE`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS carrier VARCHAR(100)`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS lr_number VARCHAR(50)`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(30)`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)`,
    `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS ship_to_address TEXT`,

    // sd_delivery_items
    `ALTER TABLE sd_delivery_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,
    `ALTER TABLE sd_delivery_items ADD COLUMN IF NOT EXISTS batch_number VARCHAR(50)`,
    `ALTER TABLE sd_delivery_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(10)`,

    // sd_billing
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) DEFAULT 'goods'`,
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS ar_invoice_id UUID`,
    `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS journal_id UUID`,

    // sys_users
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS default_company_id UUID REFERENCES org_companies(id)`,
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS allowed_companies UUID[] DEFAULT '{}'`,

    // sys_number_ranges
    `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS pattern VARCHAR(100)`,
    `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS include_fy BOOLEAN DEFAULT false`,
    `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS include_company BOOLEAN DEFAULT false`,
    `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS reset_yearly BOOLEAN DEFAULT false`,
    `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS fiscal_year_start INT DEFAULT 4`,
    `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS pad_length INT DEFAULT 5`,

    // fi_fiscal_periods — extend existing table
    `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES org_companies(id)`,

    // pur_rfq — supplier quotation fields
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR'`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS validity_date DATE`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50)`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS delivery_terms VARCHAR(100)`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS notes TEXT`,

    // pur_purchase_orders — link to quotation
    `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS rfq_id UUID REFERENCES pur_rfq(id)`,

    // org_companies — state for GST type determination
    `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS state VARCHAR(50)`,

    // bp_business_partners — company_id
    `ALTER TABLE bp_business_partners ADD COLUMN IF NOT EXISTS company_id UUID`,

    // pur_requisitions — doc_type (goods/service)
    `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS doc_type VARCHAR(10) DEFAULT 'goods'`,

    // pur_requisition_items — plant/store per line, total_amount, converted_qty
    `ALTER TABLE pur_requisition_items ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_requisition_items ADD COLUMN IF NOT EXISTS plant_id UUID`,
    `ALTER TABLE pur_requisition_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,
    `ALTER TABLE pur_requisition_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,
    `ALTER TABLE pur_requisition_items ADD COLUMN IF NOT EXISTS converted_qty DECIMAL(12,3) DEFAULT 0`,

    // pur_rfq — doc_type, payment_term_id
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS doc_type VARCHAR(10) DEFAULT 'goods'`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS payment_term_id UUID`,

    // pur_rfq_items — plant/store per line
    `ALTER TABLE pur_rfq_items ADD COLUMN IF NOT EXISTS plant_id UUID`,
    `ALTER TABLE pur_rfq_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,

    // pur_po_items — discount and delivery date per line
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS delivery_date DATE`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS plant_id UUID`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,

    // pur_purchase_orders — cost_center/project
    `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
    `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS project_id UUID`,
    `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS doc_type VARCHAR(10) DEFAULT 'goods'`,

    // pur_goods_receipts — doc_type
    `ALTER TABLE pur_goods_receipts ADD COLUMN IF NOT EXISTS doc_type VARCHAR(10) DEFAULT 'goods'`,
    // Backfill existing GR doc_type from PO
    `UPDATE pur_goods_receipts gr SET doc_type = po.doc_type FROM pur_purchase_orders po WHERE gr.po_id = po.id AND gr.doc_type IS NULL AND po.doc_type IS NOT NULL`,

    // pur_rfq — cost_center/project
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS project_id UUID`,
    `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS period_year INT`,
    `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS period_month INT`,
    `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open'`,
    `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES sys_users(id)`,
    `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
  ];

  for (const sql of alters) {
    try {
      await query(sql);
      fixed++;
    } catch (err) {
      // Only log real errors, not "already exists"
      if (!err.message.includes('already exists') && !err.message.includes('duplicate') && !err.message.includes('multiple primary'))
        console.log(`  ⚠️  ${sql.substring(0, 80)}... → ${err.message.substring(0, 60)}`);
    }
  }

  // Also fix nullable constraints that block inserts
  const nullFixes = [
    `ALTER TABLE fi_fiscal_periods ALTER COLUMN period_no DROP NOT NULL`,
    `ALTER TABLE fi_fiscal_periods ALTER COLUMN fiscal_year_id DROP NOT NULL`,
  ];
  for (const sql of nullFixes) {
    try { await query(sql); } catch {}
  }

  console.log(`✅ Column check complete (${fixed} statements processed)`);

  // Ensure all users have a default_company_id
  try {
    await query(`UPDATE sys_users SET default_company_id = (SELECT id FROM org_companies WHERE is_active=true ORDER BY company_code LIMIT 1) WHERE default_company_id IS NULL`);
  } catch {}

  // Add 'paid' to doc_status enum if not present (some invoice flows need it)
  try { await query(`ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'paid'`); } catch {}
  try { await query(`ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'confirmed'`); } catch {}
  try { await query(`ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'partially_received'`); } catch {}
  try { await query(`ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'processing'`); } catch {}

  // Set default company state for GST if not set
  try { await query(`UPDATE org_companies SET state='33-Tamil Nadu' WHERE state IS NULL OR state=''`); } catch {}
}

// GL Account Mapping — dynamic mapping for auto-JE creation
const glMappingSQL = [
  `CREATE TABLE IF NOT EXISTS fi_gl_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mapping_key VARCHAR(50) UNIQUE NOT NULL,
    mapping_label VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    gl_account_id UUID REFERENCES fi_gl_accounts(id),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

export async function ensureGLMapping(pool) {
  for (const sql of glMappingSQL) {
    try { await pool.query(sql); } catch {}
  }
}

// Stock movements — cost center, project, transfer fields, GL posting
const stockMovementCols = [
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS project_id UUID`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS to_plant_id UUID`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS to_sloc_id UUID`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS reason TEXT`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS value_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS journal_id UUID`,
];

export async function ensureStockMovementCols(pool) {
  for (const sql of stockMovementCols) {
    try { await pool.query(sql); } catch {}
  }
}

const budgetMrpFixes = [
  `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
  `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS gl_account_id UUID`,
  `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS company_id UUID`,
  `ALTER TABLE pp_mrp_runs ADD COLUMN IF NOT EXISTS plant_id UUID`,
  `ALTER TABLE pp_mrp_runs ADD COLUMN IF NOT EXISTS company_id UUID`,
];
export async function ensureBudgetMrpCols(pool) {
  for (const sql of budgetMrpFixes) { try { await pool.query(sql); } catch {} }
}

const pettyCashSQL = [
  `CREATE TABLE IF NOT EXISTS fi_petty_cash_funds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fund_name VARCHAR(100) NOT NULL,
    custodian_id UUID REFERENCES sys_users(id),
    plant_id UUID REFERENCES org_plants(id),
    gl_account_id UUID REFERENCES fi_gl_accounts(id),
    float_amount DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS fi_petty_cash_txns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fund_id UUID REFERENCES fi_petty_cash_funds(id),
    doc_number VARCHAR(20) NOT NULL,
    txn_date DATE DEFAULT CURRENT_DATE,
    txn_type VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    expense_gl_id UUID REFERENCES fi_gl_accounts(id),
    cost_center_id UUID,
    project_id UUID,
    receipt_number VARCHAR(50),
    paid_to VARCHAR(100),
    journal_id UUID,
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];
export async function ensurePettyCash(pool) {
  for (const sql of pettyCashSQL) { try { await pool.query(sql); } catch {} }
}

export async function ensurePCNumberRange(pool) {
  try { await pool.query(`INSERT INTO sys_number_ranges (entity, prefix, current_number) VALUES ('PC','PC-',10000) ON CONFLICT DO NOTHING`); } catch {}
}

const salesProfitCenterCols = [
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS profit_center_id UUID`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS profit_center_id UUID`,
  `ALTER TABLE sd_billing ADD COLUMN IF NOT EXISTS profit_center_id UUID`,
];
export async function ensureSalesProfitCenter(pool) {
  for (const sql of salesProfitCenterCols) { try { await pool.query(sql); } catch {} }
}

export async function fixDefaultCurrency(pool) {
  try { await pool.query(`UPDATE org_companies SET currency = 'INR' WHERE currency = 'USD' OR currency IS NULL`); } catch {}
}

export async function ensurePOItemGstRate(pool) {
  const sqls = [
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS plant_id UUID`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS storage_location_id UUID`,
    `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(20)`,
  ];
  for (const s of sqls) { try { await pool.query(s); } catch {} }
}

// Service Master — mm_services table
const serviceMasterSQL = [
  `CREATE TABLE IF NOT EXISTS mm_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_code VARCHAR(30) UNIQUE NOT NULL,
    service_name VARCHAR(200) NOT NULL,
    description TEXT,
    sac_code VARCHAR(10),
    service_category VARCHAR(100),
    uom_id UUID REFERENCES mm_units_of_measure(id),
    standard_rate DECIMAL(15,4) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    gst_rate DECIMAL(5,2) DEFAULT 18,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];
export async function ensureServiceMaster(pool) {
  for (const sql of serviceMasterSQL) { try { await pool.query(sql); } catch {} }
  try { await pool.query(`INSERT INTO sys_number_ranges (object_type, prefix, current_number) VALUES ('SVC','SVC-',1000) ON CONFLICT (object_type) DO NOTHING`); } catch {}
}

export async function ensureBudgetColumns(pool) {
  const sqls = [
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS budget_type VARCHAR(20) DEFAULT 'annual'`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS annual_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m1 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m2 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m3 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m4 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m5 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m6 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m7 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m8 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m9 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m10 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m11 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS m12 DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS approved_by UUID`,
    `ALTER TABLE fi_budgets ADD COLUMN IF NOT EXISTS profit_center_id UUID`,
  ];
  for (const s of sqls) { try { await pool.query(s); } catch {} }
}
