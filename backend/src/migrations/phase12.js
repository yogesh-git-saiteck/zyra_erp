import { query } from '../config/database.js';

export async function runPhase12Migrations() {
  console.log('🚀 Running Phase 12 migrations (25 Enterprise Features)...');

  const migrations = [
    // ===== 1. BANK RECONCILIATION =====
    `CREATE TABLE IF NOT EXISTS fi_bank_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      account_code VARCHAR(20) NOT NULL UNIQUE,
      account_name VARCHAR(100) NOT NULL,
      bank_name VARCHAR(100),
      branch VARCHAR(100),
      account_number VARCHAR(50),
      ifsc_code VARCHAR(20),
      swift_code VARCHAR(20),
      currency VARCHAR(3) DEFAULT 'USD',
      gl_account_id UUID REFERENCES fi_gl_accounts(id),
      opening_balance DECIMAL(15,2) DEFAULT 0,
      current_balance DECIMAL(15,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS fi_bank_statements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      bank_account_id UUID REFERENCES fi_bank_accounts(id),
      statement_date DATE NOT NULL,
      reference VARCHAR(100),
      description TEXT,
      debit_amount DECIMAL(15,2) DEFAULT 0,
      credit_amount DECIMAL(15,2) DEFAULT 0,
      balance DECIMAL(15,2),
      is_reconciled BOOLEAN DEFAULT false,
      matched_payment_id UUID,
      matched_journal_id UUID,
      imported_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 2. MULTI-CURRENCY (fi_exchange_rates already exists — add missing columns) =====
    `ALTER TABLE fi_exchange_rates ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';`,

    // ===== 3. TAX MANAGEMENT (fi_tax_codes already exists — add missing columns) =====
    `ALTER TABLE fi_tax_codes ADD COLUMN IF NOT EXISTS is_compound BOOLEAN DEFAULT false;`,
    `ALTER TABLE fi_tax_codes ADD COLUMN IF NOT EXISTS components JSONB DEFAULT '[]';`,
    `ALTER TABLE fi_tax_codes ADD COLUMN IF NOT EXISTS tax_category VARCHAR(20) DEFAULT 'gst';`,
    `ALTER TABLE fi_tax_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`,
    `CREATE TABLE IF NOT EXISTS fi_tax_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tax_code_id UUID REFERENCES fi_tax_codes(id),
      entity_type VARCHAR(30),
      entity_id UUID,
      taxable_amount DECIMAL(15,2),
      tax_amount DECIMAL(15,2),
      tax_date DATE,
      direction VARCHAR(10) DEFAULT 'output',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 4. CREDIT CONTROL =====
    `CREATE TABLE IF NOT EXISTS fi_credit_holds (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_id UUID REFERENCES bp_business_partners(id),
      hold_type VARCHAR(20) DEFAULT 'credit_limit',
      reason TEXT,
      held_by UUID REFERENCES sys_users(id),
      released_by UUID REFERENCES sys_users(id),
      held_at TIMESTAMPTZ DEFAULT NOW(),
      released_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT true
    );`,

    // ===== 5. PAYROLL =====
    `CREATE TABLE IF NOT EXISTS hr_payroll_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      run_date DATE NOT NULL,
      period_month INT NOT NULL,
      period_year INT NOT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      total_gross DECIMAL(15,2) DEFAULT 0,
      total_deductions DECIMAL(15,2) DEFAULT 0,
      total_net DECIMAL(15,2) DEFAULT 0,
      employee_count INT DEFAULT 0,
      journal_id UUID,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(period_month, period_year)
    );`,
    `CREATE TABLE IF NOT EXISTS hr_payslips (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payroll_run_id UUID REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES hr_employees(id),
      basic_salary DECIMAL(12,2),
      hra DECIMAL(12,2) DEFAULT 0,
      da DECIMAL(12,2) DEFAULT 0,
      other_allowances DECIMAL(12,2) DEFAULT 0,
      gross_salary DECIMAL(12,2),
      pf_deduction DECIMAL(12,2) DEFAULT 0,
      tax_deduction DECIMAL(12,2) DEFAULT 0,
      other_deductions DECIMAL(12,2) DEFAULT 0,
      total_deductions DECIMAL(12,2),
      net_salary DECIMAL(12,2),
      working_days INT DEFAULT 0,
      leave_days INT DEFAULT 0
    );`,

    // ===== 6. DOCUMENT ATTACHMENTS =====
    `ALTER TABLE sys_attachments ADD COLUMN IF NOT EXISTS file_size INT DEFAULT 0;`,
    `ALTER TABLE sys_attachments ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);`,

    // ===== 7. REORDER ALERTS =====
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS reorder_point DECIMAL(12,3) DEFAULT 0;`,
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS reorder_quantity DECIMAL(12,3) DEFAULT 0;`,
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS safety_stock DECIMAL(12,3) DEFAULT 0;`,
    `ALTER TABLE mm_materials ADD COLUMN IF NOT EXISTS lead_time_days INT DEFAULT 0;`,

    // ===== 8. MRP =====
    `CREATE TABLE IF NOT EXISTS pp_mrp_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      run_date TIMESTAMPTZ DEFAULT NOW(),
      planning_horizon_days INT DEFAULT 30,
      status VARCHAR(20) DEFAULT 'running',
      total_requirements INT DEFAULT 0,
      planned_orders_created INT DEFAULT 0,
      created_by UUID REFERENCES sys_users(id)
    );`,
    `CREATE TABLE IF NOT EXISTS pp_mrp_results (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      mrp_run_id UUID REFERENCES pp_mrp_runs(id) ON DELETE CASCADE,
      material_id UUID REFERENCES mm_materials(id),
      requirement_qty DECIMAL(12,3),
      available_stock DECIMAL(12,3),
      on_order_qty DECIMAL(12,3),
      shortage_qty DECIMAL(12,3),
      action_type VARCHAR(20),
      suggested_order_qty DECIMAL(12,3),
      suggested_date DATE,
      is_processed BOOLEAN DEFAULT false
    );`,

    // ===== 9. BUDGETING =====
    `CREATE TABLE IF NOT EXISTS fi_budgets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      budget_name VARCHAR(100) NOT NULL,
      fiscal_year INT NOT NULL,
      cost_center VARCHAR(50),
      gl_account_id UUID REFERENCES fi_gl_accounts(id),
      period_type VARCHAR(10) DEFAULT 'annual',
      budget_amount DECIMAL(15,2) NOT NULL,
      actual_amount DECIMAL(15,2) DEFAULT 0,
      committed_amount DECIMAL(15,2) DEFAULT 0,
      available_amount DECIMAL(15,2) GENERATED ALWAYS AS (budget_amount - actual_amount - committed_amount) STORED,
      status VARCHAR(20) DEFAULT 'active',
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS fi_budget_lines (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      budget_id UUID REFERENCES fi_budgets(id) ON DELETE CASCADE,
      period_month INT,
      budget_amount DECIMAL(15,2) DEFAULT 0,
      actual_amount DECIMAL(15,2) DEFAULT 0
    );`,

    // ===== 10. PORTAL TOKENS =====
    `CREATE TABLE IF NOT EXISTS sys_portal_users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      partner_id UUID REFERENCES bp_business_partners(id),
      email VARCHAR(200) NOT NULL UNIQUE,
      password_hash VARCHAR(256) NOT NULL,
      portal_type VARCHAR(20) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 11. EMAIL QUEUE =====
    `CREATE TABLE IF NOT EXISTS sys_email_queue (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      to_email VARCHAR(200) NOT NULL,
      cc_email VARCHAR(500),
      subject VARCHAR(300) NOT NULL,
      body_html TEXT NOT NULL,
      template_key VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending',
      attempts INT DEFAULT 0,
      error_message TEXT,
      scheduled_at TIMESTAMPTZ DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 12. PERIOD CLOSING =====
    `CREATE TABLE IF NOT EXISTS fi_periods (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      period_year INT NOT NULL,
      period_month INT NOT NULL,
      status VARCHAR(20) DEFAULT 'open',
      closed_by UUID REFERENCES sys_users(id),
      closed_at TIMESTAMPTZ,
      carry_forward_journal_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(period_year, period_month)
    );`,

    // ===== 13. RETURNS & CREDIT NOTES =====
    `CREATE TABLE IF NOT EXISTS sd_returns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      doc_number VARCHAR(20) NOT NULL UNIQUE,
      return_type VARCHAR(20) DEFAULT 'customer',
      customer_id UUID REFERENCES bp_business_partners(id),
      original_so_id UUID,
      original_delivery_id UUID,
      return_date DATE DEFAULT CURRENT_DATE,
      reason TEXT,
      total_amount DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'draft',
      credit_note_id UUID,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS sd_return_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      return_id UUID REFERENCES sd_returns(id) ON DELETE CASCADE,
      material_id UUID REFERENCES mm_materials(id),
      quantity DECIMAL(12,3),
      unit_price DECIMAL(12,2),
      reason VARCHAR(100),
      condition VARCHAR(20) DEFAULT 'good'
    );`,
    `CREATE TABLE IF NOT EXISTS fi_credit_notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      doc_number VARCHAR(20) NOT NULL UNIQUE,
      note_type VARCHAR(20) DEFAULT 'credit',
      partner_id UUID REFERENCES bp_business_partners(id),
      reference_invoice_id UUID,
      reference_return_id UUID,
      note_date DATE DEFAULT CURRENT_DATE,
      total_amount DECIMAL(15,2),
      status VARCHAR(20) DEFAULT 'draft',
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 14. PRICING ENGINE =====
    `CREATE TABLE IF NOT EXISTS sd_price_lists (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      list_name VARCHAR(100) NOT NULL,
      list_type VARCHAR(20) DEFAULT 'standard',
      currency VARCHAR(3) DEFAULT 'USD',
      valid_from DATE,
      valid_to DATE,
      customer_group VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      priority INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE TABLE IF NOT EXISTS sd_price_list_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      price_list_id UUID REFERENCES sd_price_lists(id) ON DELETE CASCADE,
      material_id UUID REFERENCES mm_materials(id),
      unit_price DECIMAL(12,2) NOT NULL,
      min_quantity DECIMAL(12,3) DEFAULT 1,
      max_quantity DECIMAL(12,3),
      discount_percent DECIMAL(5,2) DEFAULT 0
    );`,

    // ===== 15. 2FA =====
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);`,
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;`,
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS backup_codes JSONB DEFAULT '[]';`,

    // ===== 16. INTER-COMPANY =====
    `CREATE TABLE IF NOT EXISTS ic_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      from_company_id UUID REFERENCES org_companies(id),
      to_company_id UUID REFERENCES org_companies(id),
      transaction_type VARCHAR(20),
      source_doc_type VARCHAR(30),
      source_doc_id UUID,
      mirror_doc_type VARCHAR(30),
      mirror_doc_id UUID,
      amount DECIMAL(15,2),
      currency VARCHAR(3) DEFAULT 'USD',
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 17. BATCH/SERIAL TRACKING =====
    `CREATE TABLE IF NOT EXISTS inv_batches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      material_id UUID REFERENCES mm_materials(id),
      batch_number VARCHAR(50) NOT NULL,
      manufacture_date DATE,
      expiry_date DATE,
      quantity DECIMAL(12,3) DEFAULT 0,
      plant_id UUID REFERENCES org_plants(id),
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(material_id, batch_number)
    );`,
    `CREATE TABLE IF NOT EXISTS inv_serial_numbers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      material_id UUID REFERENCES mm_materials(id),
      serial_number VARCHAR(100) NOT NULL UNIQUE,
      batch_id UUID REFERENCES inv_batches(id),
      status VARCHAR(20) DEFAULT 'in_stock',
      current_location VARCHAR(100),
      warranty_end DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 18. VERSION HISTORY =====
    `CREATE TABLE IF NOT EXISTS sys_versions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      version_number INT NOT NULL,
      data_snapshot JSONB NOT NULL,
      changed_fields JSONB DEFAULT '[]',
      changed_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_versions_entity ON sys_versions(entity_type, entity_id, version_number DESC);`,

    // ===== 19. USER ACTIVITY =====
    `CREATE TABLE IF NOT EXISTS sys_user_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES sys_users(id),
      session_token VARCHAR(128),
      ip_address VARCHAR(45),
      user_agent TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      last_active_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT true
    );`,
    `CREATE TABLE IF NOT EXISTS sys_page_views (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES sys_users(id),
      page_path VARCHAR(200),
      page_title VARCHAR(100),
      duration_seconds INT,
      viewed_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 20. API RATE MONITORING =====
    `CREATE TABLE IF NOT EXISTS sys_api_usage_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      api_key_id UUID,
      endpoint VARCHAR(200),
      method VARCHAR(10),
      status_code INT,
      response_time_ms INT,
      ip_address VARCHAR(45),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 21. DATA ARCHIVING =====
    `CREATE TABLE IF NOT EXISTS sys_archive_policies (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      table_name VARCHAR(100) NOT NULL,
      condition_field VARCHAR(50),
      condition_operator VARCHAR(10),
      condition_value VARCHAR(100),
      retention_days INT DEFAULT 365,
      archive_table VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      records_archived INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 22. RECURRING DOCUMENTS =====
    `CREATE TABLE IF NOT EXISTS sys_recurring_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      template_name VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      document_data JSONB NOT NULL,
      frequency VARCHAR(20) DEFAULT 'monthly',
      next_run_date DATE,
      last_run_date DATE,
      occurrences_created INT DEFAULT 0,
      max_occurrences INT,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ===== 25. NOTIFICATION CENTER =====
    `CREATE TABLE IF NOT EXISTS sys_notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES sys_users(id),
      title VARCHAR(200) NOT NULL,
      message TEXT,
      notification_type VARCHAR(30) DEFAULT 'info',
      entity_type VARCHAR(50),
      entity_id UUID,
      link VARCHAR(200),
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_notif_user ON sys_notifications(user_id, is_read, created_at DESC);`,
  ];

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate'))
        console.error(`Phase 12 migration ${i} failed:`, err.message);
    }
  }

  // Seed currencies first (needed for exchange rates FK)
  const currencies = [['USD','US Dollar','$',2],['EUR','Euro','€',2],['GBP','British Pound','£',2],['JPY','Japanese Yen','¥',0],['INR','Indian Rupee','₹',2],['CNY','Chinese Yuan','¥',2],['AUD','Australian Dollar','A$',2],['CAD','Canadian Dollar','C$',2]];
  for (const [code, name, sym, dec] of currencies) {
    try { await query(`INSERT INTO fi_currencies (currency_code, currency_name, symbol, decimal_places) VALUES ($1,$2,$3,$4) ON CONFLICT (currency_code) DO NOTHING`, [code, name, sym, dec]); } catch {}
  }

  // Seed tax codes (using existing column names: tax_rate, tax_type + new columns: tax_category, components)
  const taxCodes = [
    ['GST5', 'GST 5%', 'output', 5, 'gst', '[{"name":"CGST","rate":2.5},{"name":"SGST","rate":2.5}]'],
    ['GST12', 'GST 12%', 'output', 12, 'gst', '[{"name":"CGST","rate":6},{"name":"SGST","rate":6}]'],
    ['GST18', 'GST 18%', 'output', 18, 'gst', '[{"name":"CGST","rate":9},{"name":"SGST","rate":9}]'],
    ['GST28', 'GST 28%', 'output', 28, 'gst', '[{"name":"CGST","rate":14},{"name":"SGST","rate":14}]'],
    ['IGST5', 'IGST 5%', 'output', 5, 'igst', '[]'],
    ['IGST18', 'IGST 18%', 'output', 18, 'igst', '[]'],
    ['VAT20', 'VAT 20%', 'output', 20, 'vat', '[]'],
    ['VAT10', 'VAT 10%', 'output', 10, 'vat', '[]'],
    ['ST8', 'Sales Tax 8%', 'output', 8, 'sales_tax', '[]'],
    ['EXEMPT', 'Tax Exempt', 'output', 0, 'exempt', '[]'],
  ];
  for (const [code, name, type, rate, cat, comp] of taxCodes) {
    try {
      await query(`INSERT INTO fi_tax_codes (tax_code, tax_name, tax_type, tax_rate, tax_category, components)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT DO NOTHING`, [code, name, type, rate, cat, comp]);
    } catch {}
  }

  // Seed exchange rates (using existing columns: exchange_rate, rate_date)
  const rates = [['USD','INR',83.50],['USD','EUR',0.92],['USD','GBP',0.79],['EUR','INR',90.76],['GBP','INR',105.70],['USD','JPY',149.50]];
  for (const [from, to, rt] of rates) {
    try {
      const ex = await query(`SELECT id FROM fi_exchange_rates WHERE from_currency = $1 AND to_currency = $2 AND rate_date = CURRENT_DATE`, [from, to]);
      if (!ex.rows.length) {
        await query(`INSERT INTO fi_exchange_rates (from_currency, to_currency, exchange_rate, rate_date) VALUES ($1,$2,$3,CURRENT_DATE)`, [from, to, rt]);
      }
    } catch {}
  }

  // Seed open fiscal periods for current year
  const yr = new Date().getFullYear();
  for (let m = 1; m <= 12; m++) {
    try { await query(`INSERT INTO fi_periods (period_year, period_month) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [yr, m]); } catch {}
  }

  // Seed archive policies
  const policies = [
    ['fi_journal_entries', 'fi_journal_entries', 'status', 'eq', 'posted', 730],
    ['sd_sales_orders', 'sd_sales_orders', 'status', 'eq', 'completed', 365],
    ['pur_purchase_orders', 'pur_purchase_orders', 'status', 'eq', 'completed', 365],
    ['sys_audit_log', 'sys_audit_log', null, null, null, 180],
  ];
  for (const [entity, tbl, f, op, v, days] of policies) {
    try {
      const exists = await query(`SELECT id FROM sys_archive_policies WHERE entity_type = $1`, [entity]);
      if (!exists.rows.length) {
        await query(`INSERT INTO sys_archive_policies (entity_type, table_name, condition_field, condition_operator, condition_value, retention_days) VALUES ($1,$2,$3,$4,$5,$6)`,
          [entity, tbl, f, op, v, days]);
      }
    } catch {}
  }

  console.log(`✅ Phase 12 migrations complete (25 enterprise features)`);
}

export default runPhase12Migrations;
