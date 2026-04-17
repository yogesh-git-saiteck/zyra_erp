import { query } from '../config/database.js';

export async function runPhase18() {
  console.log('🚀 Running Phase 18 (Budget, Expenses, MRP)...');

  const migrations = [
    // Add 'paid' to doc_status enum for invoice status tracking
    `ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'paid'`,
    `ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'confirmed'`,
    `ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'partially_received'`,
    `ALTER TYPE doc_status ADD VALUE IF NOT EXISTS 'processing'`,

    // ===================================================
    // 1. BUDGET MANAGEMENT
    // ===================================================
    `CREATE TABLE IF NOT EXISTS fi_budgets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id UUID REFERENCES org_companies(id),
      cost_center_id UUID REFERENCES org_cost_centers(id),
      gl_account_id UUID REFERENCES fi_gl_accounts(id),
      fiscal_year INT NOT NULL,
      budget_type VARCHAR(20) DEFAULT 'annual',
      annual_amount DECIMAL(15,2) DEFAULT 0,
      m1 DECIMAL(15,2) DEFAULT 0, m2 DECIMAL(15,2) DEFAULT 0, m3 DECIMAL(15,2) DEFAULT 0,
      m4 DECIMAL(15,2) DEFAULT 0, m5 DECIMAL(15,2) DEFAULT 0, m6 DECIMAL(15,2) DEFAULT 0,
      m7 DECIMAL(15,2) DEFAULT 0, m8 DECIMAL(15,2) DEFAULT 0, m9 DECIMAL(15,2) DEFAULT 0,
      m10 DECIMAL(15,2) DEFAULT 0, m11 DECIMAL(15,2) DEFAULT 0, m12 DECIMAL(15,2) DEFAULT 0,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'draft',
      approved_by UUID REFERENCES sys_users(id),
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ===================================================
    // 2. EXPENSE CLAIMS
    // ===================================================
    `CREATE TABLE IF NOT EXISTS hr_expense_claims (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      doc_number VARCHAR(20) UNIQUE NOT NULL,
      company_id UUID REFERENCES org_companies(id),
      employee_id UUID REFERENCES hr_employees(id),
      claim_date DATE DEFAULT CURRENT_DATE,
      description TEXT,
      total_amount DECIMAL(15,2) DEFAULT 0,
      approved_amount DECIMAL(15,2) DEFAULT 0,
      currency VARCHAR(3) DEFAULT 'INR',
      status VARCHAR(20) DEFAULT 'draft',
      approved_by UUID REFERENCES sys_users(id),
      approved_at TIMESTAMPTZ,
      paid_via VARCHAR(20),
      payment_date DATE,
      cost_center_id UUID REFERENCES org_cost_centers(id),
      project_id UUID,
      notes TEXT,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS hr_expense_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      claim_id UUID REFERENCES hr_expense_claims(id) ON DELETE CASCADE,
      line_number INT DEFAULT 1,
      expense_date DATE NOT NULL,
      expense_type VARCHAR(50) NOT NULL,
      description TEXT,
      amount DECIMAL(15,2) NOT NULL,
      receipt_number VARCHAR(30),
      is_billable BOOLEAN DEFAULT false,
      gl_account_id UUID REFERENCES fi_gl_accounts(id)
    )`,

    // ===================================================
    // 3. MRP — Material Requirements Planning
    // ===================================================
    `CREATE TABLE IF NOT EXISTS pp_mrp_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id UUID REFERENCES org_companies(id),
      plant_id UUID REFERENCES org_plants(id),
      run_date TIMESTAMPTZ DEFAULT NOW(),
      planning_horizon_days INT DEFAULT 30,
      status VARCHAR(20) DEFAULT 'running',
      total_demand_items INT DEFAULT 0,
      total_planned_orders INT DEFAULT 0,
      total_shortfalls INT DEFAULT 0,
      run_by UUID REFERENCES sys_users(id),
      completed_at TIMESTAMPTZ
    )`,

    `CREATE TABLE IF NOT EXISTS pp_mrp_results (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      mrp_run_id UUID REFERENCES pp_mrp_runs(id) ON DELETE CASCADE,
      material_id UUID REFERENCES mm_materials(id),
      plant_id UUID REFERENCES org_plants(id),
      current_stock DECIMAL(12,3) DEFAULT 0,
      total_demand DECIMAL(12,3) DEFAULT 0,
      total_supply DECIMAL(12,3) DEFAULT 0,
      net_requirement DECIMAL(12,3) DEFAULT 0,
      planned_order_qty DECIMAL(12,3) DEFAULT 0,
      reorder_point DECIMAL(12,3) DEFAULT 0,
      safety_stock DECIMAL(12,3) DEFAULT 0,
      lead_time_days INT DEFAULT 0,
      action VARCHAR(30),
      status VARCHAR(20) DEFAULT 'open'
    )`,

    // Number ranges for new entities
    `INSERT INTO sys_number_ranges (object_type, prefix, current_number) VALUES ('EXP','EXP-',0) ON CONFLICT (object_type) DO NOTHING`,

    // ===================================================
    // 4. SUPPLIER QUOTATION (between PR and PO)
    // ===================================================
    // Extend existing pur_rfq table
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR'`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS subtotal DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS validity_date DATE`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50)`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS delivery_terms VARCHAR(100)`,
    `ALTER TABLE pur_rfq ADD COLUMN IF NOT EXISTS notes TEXT`,

    // RFQ/Quotation line items
    `CREATE TABLE IF NOT EXISTS pur_rfq_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      rfq_id UUID REFERENCES pur_rfq(id) ON DELETE CASCADE,
      pr_item_id UUID,
      line_number INT DEFAULT 1,
      material_id UUID REFERENCES mm_materials(id),
      description TEXT,
      quantity DECIMAL(12,3) NOT NULL,
      uom_id UUID REFERENCES mm_units_of_measure(id),
      unit_price DECIMAL(15,4) DEFAULT 0,
      discount_percent DECIMAL(5,2) DEFAULT 0,
      tax_rate DECIMAL(5,2) DEFAULT 18,
      total_amount DECIMAL(15,2) DEFAULT 0,
      delivery_date DATE,
      hsn_code VARCHAR(8),
      remarks TEXT
    )`,

    // Link PO back to quotation
    `ALTER TABLE pur_purchase_orders ADD COLUMN IF NOT EXISTS rfq_id UUID REFERENCES pur_rfq(id)`,
  ];

  for (const sql of migrations) {
    try { await query(sql); }
    catch (err) { if (!err.message.includes('already exists') && !err.message.includes('duplicate')) console.log(`Phase 18:`, err.message.substring(0, 80)); }
  }

  console.log('✅ Phase 18 complete — Budget, Expense Claims, MRP');
}
