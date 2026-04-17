import { query } from '../config/database.js';

const migrations = [
  // ===================================================
  // ENUM ADDITIONS
  // ===================================================
  `DO $$ BEGIN ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'partially_received'; EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'partially_delivered'; EXCEPTION WHEN duplicate_object THEN null; END $$`,

  // ===================================================
  // COMPANY SETTINGS - GSTIN, PAN, CIN, Logo
  // ===================================================
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS gstin VARCHAR(15)`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS pan VARCHAR(10)`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS cin VARCHAR(21)`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS logo_url TEXT`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS fiscal_year_start INT DEFAULT 4`, // April=4 for India
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'INR'`,

  // ===================================================
  // BUSINESS PARTNERS - GST, PAN, Bank, Addresses
  // ===================================================
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

  // ===================================================
  // MATERIALS - HSN/SAC Code
  // ===================================================
  `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,
  `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS sac_code VARCHAR(6)`,
  `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18`,

  // ===================================================
  // AP INVOICE - Line Items table, GST fields, Vendor Invoice#
  // ===================================================
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS vendor_invoice_number VARCHAR(50)`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS vendor_gstin VARCHAR(15)`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS grn_reference UUID`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending'`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES sys_users(id)`,

  `CREATE TABLE IF NOT EXISTS fi_ap_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES fi_ap_invoices(id) ON DELETE CASCADE,
    line_number INT DEFAULT 1,
    material_id UUID REFERENCES mm_materials(id),
    description TEXT,
    hsn_code VARCHAR(8),
    quantity DECIMAL(12,3) DEFAULT 1,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    unit_price DECIMAL(15,4) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    cgst_rate DECIMAL(5,2) DEFAULT 0,
    sgst_rate DECIMAL(5,2) DEFAULT 0,
    igst_rate DECIMAL(5,2) DEFAULT 0,
    cgst_amount DECIMAL(15,2) DEFAULT 0,
    sgst_amount DECIMAL(15,2) DEFAULT 0,
    igst_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    gl_account_id UUID REFERENCES fi_gl_accounts(id)
  )`,

  // ===================================================
  // AR INVOICE - Line Items table, GST fields
  // ===================================================
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15)`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(50)`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS shipping_address TEXT`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS billing_address TEXT`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS so_reference UUID`,

  `CREATE TABLE IF NOT EXISTS fi_ar_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES fi_ar_invoices(id) ON DELETE CASCADE,
    line_number INT DEFAULT 1,
    material_id UUID REFERENCES mm_materials(id),
    description TEXT,
    hsn_code VARCHAR(8),
    quantity DECIMAL(12,3) DEFAULT 1,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    unit_price DECIMAL(15,4) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    cgst_rate DECIMAL(5,2) DEFAULT 0,
    sgst_rate DECIMAL(5,2) DEFAULT 0,
    igst_rate DECIMAL(5,2) DEFAULT 0,
    cgst_amount DECIMAL(15,2) DEFAULT 0,
    sgst_amount DECIMAL(15,2) DEFAULT 0,
    igst_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0
  )`,

  // ===================================================
  // PAYMENTS - Invoice linking, Bank details, UTR
  // ===================================================
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS linked_invoice_id UUID`,
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS linked_invoice_type VARCHAR(10)`, // 'ap' or 'ar'
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS bank_account_id UUID`,
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS utr_number VARCHAR(50)`,
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS value_date DATE`,
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(20) DEFAULT 'uncleared'`,
  `ALTER TABLE fi_payments ADD COLUMN IF NOT EXISTS tds_amount DECIMAL(15,2) DEFAULT 0`,

  // ===================================================
  // JOURNAL ENTRIES - Type, Cost Center, Period
  // ===================================================
  `ALTER TABLE fi_journal_headers ADD COLUMN IF NOT EXISTS journal_type VARCHAR(20) DEFAULT 'general'`,
  `ALTER TABLE fi_journal_headers ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
  `ALTER TABLE fi_journal_headers ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES sys_users(id)`,
  `ALTER TABLE fi_journal_lines ADD COLUMN IF NOT EXISTS line_description TEXT`,
  `ALTER TABLE fi_journal_lines ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
  `ALTER TABLE fi_journal_lines ADD COLUMN IF NOT EXISTS project_id UUID`,

  // ===================================================
  // GL ACCOUNTS - Parent, Description, Opening Balance
  // ===================================================
  `ALTER TABLE fi_gl_accounts ADD COLUMN IF NOT EXISTS parent_account_id UUID REFERENCES fi_gl_accounts(id)`,
  `ALTER TABLE fi_gl_accounts ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE fi_gl_accounts ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE fi_gl_accounts ADD COLUMN IF NOT EXISTS default_cost_center_id UUID`,
  `ALTER TABLE fi_gl_accounts ADD COLUMN IF NOT EXISTS tax_category VARCHAR(20)`,

  // ===================================================
  // QUOTATIONS - GST, Sales Rep, Addresses, Terms
  // ===================================================
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS quotation_date_issued DATE DEFAULT CURRENT_DATE`,
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES sys_users(id)`,
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15)`,
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS billing_address TEXT`,
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS shipping_address TEXT`,
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`,
  `ALTER TABLE sd_quotations ADD COLUMN IF NOT EXISTS revision_number INT DEFAULT 1`,
  `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,
  `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE sd_quotation_items ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 0`,

  // ===================================================
  // SALES ORDERS - Customer PO#, Warehouse, GST
  // ===================================================
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS customer_po_number VARCHAR(50)`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS promised_delivery_date DATE`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS shipping_method VARCHAR(50)`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS partial_delivery_allowed BOOLEAN DEFAULT true`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS internal_notes TEXT`,
  `ALTER TABLE sd_sales_orders ADD COLUMN IF NOT EXISTS customer_gstin VARCHAR(15)`,
  `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,
  `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE sd_so_items ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 0`,

  // ===================================================
  // DELIVERIES - E-Way Bill, Carrier, Tracking
  // ===================================================
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS eway_bill_number VARCHAR(20)`,
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(100)`,
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS lr_number VARCHAR(50)`,
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS actual_delivery_date DATE`,
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS delivery_address TEXT`,
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)`,
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(20)`,

  // ===================================================
  // PURCHASE REQUISITIONS - Department, Approver, Reason
  // ===================================================
  `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS department_id UUID`,
  `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS cost_center_id UUID`,
  `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS justification TEXT`,
  `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES bp_business_partners(id)`,
  `ALTER TABLE pur_requisitions ADD COLUMN IF NOT EXISTS project_id UUID`,

  // ===================================================
  // PURCHASE ORDERS - GST, Delivery Address, Terms
  // ===================================================
  `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS vendor_gstin VARCHAR(15)`,
  `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`,
  `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`,
  `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8)`,
  `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS cgst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS sgst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS igst_rate DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS delivery_date DATE`,
  `ALTER TABLE pur_po_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) DEFAULT 0`,

  // ===================================================
  // GOODS RECEIPTS - Accepted/Rejected Qty, Inspection
  // ===================================================
  `ALTER TABLE pur_gr_items ADD COLUMN IF NOT EXISTS accepted_qty DECIMAL(12,3)`,
  `ALTER TABLE pur_gr_items ADD COLUMN IF NOT EXISTS rejected_qty DECIMAL(12,3) DEFAULT 0`,
  `ALTER TABLE pur_gr_items ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
  `ALTER TABLE pur_gr_items ADD COLUMN IF NOT EXISTS inspection_status VARCHAR(20) DEFAULT 'pending'`,
  `ALTER TABLE pur_gr_items ADD COLUMN IF NOT EXISTS vendor_dc_number VARCHAR(50)`,
  `ALTER TABLE pur_goods_receipts ADD COLUMN IF NOT EXISTS transporter_name VARCHAR(100)`,
  `ALTER TABLE pur_goods_receipts ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(20)`,

  // ===================================================
  // STOCK MOVEMENTS - Reference, Reason, Value
  // ===================================================
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS reason TEXT`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,4) DEFAULT 0`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS total_value DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS destination_plant_id UUID`,
  `ALTER TABLE inv_stock_movements ADD COLUMN IF NOT EXISTS destination_sloc_id UUID`,

  // ===================================================
  // EMPLOYEES - PAN, Aadhaar, PF, ESI, Bank
  // ===================================================
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS pf_number VARCHAR(22)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS uan_number VARCHAR(12)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS esi_number VARCHAR(17)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(30)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(15)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES hr_employees(id)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS date_of_birth DATE`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS date_of_confirmation DATE`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS date_of_leaving DATE`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS notice_period_days INT DEFAULT 30`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS grade VARCHAR(20)`,

  // ===================================================
  // CRM - Sales Rep, Contact Person, Next Action
  // ===================================================
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES sys_users(id)`,
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100)`,
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS next_action TEXT`,
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS next_action_date DATE`,
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(100)`,
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS linked_quotation_id UUID`,
  `ALTER TABLE crm_opportunities ADD COLUMN IF NOT EXISTS competitors TEXT`,

  // ===================================================
  // PROJECTS - PM, Type, Tasks, Milestones
  // ===================================================
  `ALTER TABLE ps_projects ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES sys_users(id)`,
  `ALTER TABLE ps_projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(20) DEFAULT 'external'`,
  `ALTER TABLE ps_projects ADD COLUMN IF NOT EXISTS percent_complete DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE ps_projects ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(15,2) DEFAULT 0`,

  `CREATE TABLE IF NOT EXISTS ps_project_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES ps_projects(id) ON DELETE CASCADE,
    task_name VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES sys_users(id),
    status VARCHAR(20) DEFAULT 'todo',
    priority VARCHAR(20) DEFAULT 'medium',
    start_date DATE,
    due_date DATE,
    completed_date DATE,
    estimated_hours DECIMAL(8,2),
    actual_hours DECIMAL(8,2),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS ps_project_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES ps_projects(id) ON DELETE CASCADE,
    milestone_name VARCHAR(200) NOT NULL,
    due_date DATE,
    completed_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ===================================================
  // QUALITY - Inspection Type, Criteria, Accepted/Rejected
  // ===================================================
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS inspection_type VARCHAR(20) DEFAULT 'incoming'`,
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS reference_doc_type VARCHAR(30)`,
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS reference_doc_id UUID`,
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS inspection_date DATE DEFAULT CURRENT_DATE`,
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS accepted_qty DECIMAL(12,3)`,
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS rejected_qty DECIMAL(12,3) DEFAULT 0`,
  `ALTER TABLE qm_inspection_lots ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,

  `CREATE TABLE IF NOT EXISTS qm_inspection_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id UUID REFERENCES qm_inspection_lots(id) ON DELETE CASCADE,
    parameter_name VARCHAR(100) NOT NULL,
    specification TEXT,
    actual_value TEXT,
    result VARCHAR(20) DEFAULT 'pending',
    remarks TEXT
  )`,

  // ===================================================
  // TRANSPORT - E-Way Bill, Driver, LR Number
  // ===================================================
  `ALTER TABLE tm_shipments ADD COLUMN IF NOT EXISTS eway_bill_number VARCHAR(20)`,
  `ALTER TABLE tm_shipments ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)`,
  `ALTER TABLE tm_shipments ADD COLUMN IF NOT EXISTS driver_license VARCHAR(20)`,
  `ALTER TABLE tm_shipments ADD COLUMN IF NOT EXISTS lr_number VARCHAR(50)`,
  `ALTER TABLE tm_shipments ADD COLUMN IF NOT EXISTS actual_delivery_date DATE`,
  `ALTER TABLE tm_shipments ADD COLUMN IF NOT EXISTS distance_km DECIMAL(10,2)`,
  `ALTER TABLE tm_carriers ADD COLUMN IF NOT EXISTS gstin VARCHAR(15)`,
  `ALTER TABLE tm_carriers ADD COLUMN IF NOT EXISTS pan VARCHAR(10)`,
  `ALTER TABLE tm_carriers ADD COLUMN IF NOT EXISTS bank_account VARCHAR(30)`,
  `ALTER TABLE tm_carriers ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(15)`,
  `ALTER TABLE tm_vehicles ADD COLUMN IF NOT EXISTS default_driver VARCHAR(100)`,
  `ALTER TABLE tm_vehicles ADD COLUMN IF NOT EXISTS insurance_expiry DATE`,
  `ALTER TABLE tm_vehicles ADD COLUMN IF NOT EXISTS fitness_expiry DATE`,
  `ALTER TABLE tm_vehicles ADD COLUMN IF NOT EXISTS puc_expiry DATE`,
  `ALTER TABLE tm_vehicles ADD COLUMN IF NOT EXISTS last_service_date DATE`,

  // ===================================================
  // MAINTENANCE - Work Order#, Downtime, Resolution
  // ===================================================
  `ALTER TABLE pm_maintenance_orders ADD COLUMN IF NOT EXISTS reported_problem TEXT`,
  `ALTER TABLE pm_maintenance_orders ADD COLUMN IF NOT EXISTS resolution TEXT`,
  `ALTER TABLE pm_maintenance_orders ADD COLUMN IF NOT EXISTS root_cause TEXT`,
  `ALTER TABLE pm_maintenance_orders ADD COLUMN IF NOT EXISTS downtime_hours DECIMAL(8,2)`,
  `ALTER TABLE pm_maintenance_orders ADD COLUMN IF NOT EXISTS next_maintenance_date DATE`,

  // ===================================================
  // ASSETS - Depreciation method, GL mapping, Vendor
  // ===================================================
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(10) DEFAULT 'SLM'`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS depreciation_rate DECIMAL(5,2)`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS gl_account_asset UUID REFERENCES fi_gl_accounts(id)`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS gl_account_depreciation UUID REFERENCES fi_gl_accounts(id)`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES bp_business_partners(id)`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS po_reference UUID`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS insurance_policy VARCHAR(50)`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS insurance_expiry DATE`,
  `ALTER TABLE am_assets ADD COLUMN IF NOT EXISTS warranty_expiry DATE`,

  // ===================================================
  // BOM - Version, Effective dates
  // ===================================================
  `ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS version_number INT DEFAULT 1`,
  `ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT CURRENT_DATE`,
  `ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS effective_to DATE`,
  `ALTER TABLE pp_bom_headers ADD COLUMN IF NOT EXISTS standard_cost DECIMAL(15,2) DEFAULT 0`,

  // ===================================================
  // PRODUCTION ORDERS - Planned dates, Scrap, Labour
  // ===================================================
  `ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS scrap_qty DECIMAL(12,3) DEFAULT 0`,
  `ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS scrap_reason TEXT`,
  `ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS actual_labour_hours DECIMAL(8,2)`,
  `ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS linked_so_id UUID`,

  // ===================================================
  // TAX MASTER TABLE (P1 Critical)
  // ===================================================
  `CREATE TABLE IF NOT EXISTS fi_tax_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tax_code VARCHAR(20) UNIQUE NOT NULL,
    tax_name VARCHAR(100) NOT NULL,
    tax_type VARCHAR(20) DEFAULT 'GST',
    cgst_rate DECIMAL(5,2) DEFAULT 0,
    sgst_rate DECIMAL(5,2) DEFAULT 0,
    igst_rate DECIMAL(5,2) DEFAULT 0,
    cess_rate DECIMAL(5,2) DEFAULT 0,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    applicable_on VARCHAR(20) DEFAULT 'both',
    gl_account_cgst UUID REFERENCES fi_gl_accounts(id),
    gl_account_sgst UUID REFERENCES fi_gl_accounts(id),
    gl_account_igst UUID REFERENCES fi_gl_accounts(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ===================================================
  // RETURNS - Structured fields
  // ===================================================
  `ALTER TABLE sd_returns ADD COLUMN IF NOT EXISTS return_reason_code VARCHAR(20)`,
  `ALTER TABLE sd_returns ADD COLUMN IF NOT EXISTS original_invoice_id UUID`,
  `ALTER TABLE sd_returns ADD COLUMN IF NOT EXISTS refund_or_exchange VARCHAR(10) DEFAULT 'refund'`,
  `ALTER TABLE sd_returns ADD COLUMN IF NOT EXISTS return_warehouse_id UUID`,
  `ALTER TABLE sd_return_items ADD COLUMN IF NOT EXISTS condition VARCHAR(20) DEFAULT 'good'`,
];

// Seed tax master data
const taxMasterSeed = [
  ['GST0', 'GST Exempt', 'GST', 0, 0, 0, 0, 'both'],
  ['GST5', 'GST 5%', 'GST', 2.5, 2.5, 5, 0, 'both'],
  ['GST12', 'GST 12%', 'GST', 6, 6, 12, 0, 'both'],
  ['GST18', 'GST 18%', 'GST', 9, 9, 18, 0, 'both'],
  ['GST28', 'GST 28%', 'GST', 14, 14, 28, 0, 'both'],
  ['IGST5', 'IGST 5%', 'GST', 0, 0, 5, 0, 'goods'],
  ['IGST12', 'IGST 12%', 'GST', 0, 0, 12, 0, 'goods'],
  ['IGST18', 'IGST 18%', 'GST', 0, 0, 18, 0, 'goods'],
  ['IGST28', 'IGST 28%', 'GST', 0, 0, 28, 0, 'goods'],
  ['TDS194C', 'TDS u/s 194C - Contractor', 'TDS', 0, 0, 0, 1, 'services'],
  ['TDS194J', 'TDS u/s 194J - Professional', 'TDS', 0, 0, 0, 10, 'services'],
];

export async function runPhase14() {
  console.log('🚀 Running Phase 14 migrations (250+ field review)...');

  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
    } catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
        console.log(`Phase 14 migration ${i + 1} note:`, err.message.substring(0, 100));
      }
    }
  }

  // Seed tax master
  for (const [code, name, type, cgst, sgst, igst, cess, applicable] of taxMasterSeed) {
    try {
      await query(
        `INSERT INTO fi_tax_master (tax_code, tax_name, tax_type, cgst_rate, sgst_rate, igst_rate, cess_rate, applicable_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tax_code) DO NOTHING`,
        [code, name, type, cgst, sgst, igst, cess, applicable]);
    } catch {}
  }

  console.log('✅ Phase 14 complete — 140+ fields added, Tax Master seeded');
}
