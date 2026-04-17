import { query } from '../config/database.js';

export async function runPhase8Migrations() {
  console.log('🚀 Running Phase 8 migrations...');

  const migrations = [
    // ==========================================
    // DOCUMENT ATTACHMENTS
    // ==========================================
    `CREATE TABLE IF NOT EXISTS sys_attachments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(100),
      file_size BIGINT,
      file_data BYTEA,
      file_url VARCHAR(500),
      uploaded_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_attach_entity ON sys_attachments(entity_type, entity_id);`,

    // ==========================================
    // DOCUMENT COMMENTS / NOTES
    // ==========================================
    `CREATE TABLE IF NOT EXISTS sys_comments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      comment_text TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_comments_entity ON sys_comments(entity_type, entity_id);`,

    // ==========================================
    // DOCUMENT STATUS TIMELINE
    // ==========================================
    `CREATE TABLE IF NOT EXISTS sys_status_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      old_status VARCHAR(30),
      new_status VARCHAR(30) NOT NULL,
      changed_by UUID REFERENCES sys_users(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_status_hist ON sys_status_history(entity_type, entity_id);`,

    // ==========================================
    // FAVORITES / BOOKMARKS
    // ==========================================
    `CREATE TABLE IF NOT EXISTS sys_favorites (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES sys_users(id) ON DELETE CASCADE,
      entity_type VARCHAR(50),
      entity_id UUID,
      path VARCHAR(255),
      label VARCHAR(200) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fav_unique ON sys_favorites(user_id, COALESCE(entity_type,''), COALESCE(path,''));`,

    // ==========================================
    // USER PREFERENCES (2FA, dark mode, etc)
    // ==========================================
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;`,
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(100);`,
    `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS theme VARCHAR(10) DEFAULT 'light';`,

    // ==========================================
    // PAYROLL
    // ==========================================
    `CREATE TABLE IF NOT EXISTS hr_payroll_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      company_id UUID REFERENCES org_companies(id),
      pay_period VARCHAR(20) NOT NULL,
      pay_date DATE NOT NULL,
      total_gross DECIMAL(15,2) DEFAULT 0,
      total_deductions DECIMAL(15,2) DEFAULT 0,
      total_net DECIMAL(15,2) DEFAULT 0,
      employee_count INT DEFAULT 0,
      status doc_status DEFAULT 'draft',
      journal_id UUID REFERENCES fi_journal_headers(id),
      run_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS hr_payroll_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payroll_run_id UUID REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES hr_employees(id),
      gross_salary DECIMAL(12,2),
      tax_deduction DECIMAL(12,2) DEFAULT 0,
      insurance_deduction DECIMAL(12,2) DEFAULT 0,
      other_deductions DECIMAL(12,2) DEFAULT 0,
      net_salary DECIMAL(12,2),
      notes TEXT
    );`,

    // ==========================================
    // BANK RECONCILIATION
    // ==========================================
    `CREATE TABLE IF NOT EXISTS fi_bank_statements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      bank_id UUID REFERENCES fi_banks(id),
      statement_date DATE NOT NULL,
      opening_balance DECIMAL(15,2),
      closing_balance DECIMAL(15,2),
      status VARCHAR(20) DEFAULT 'open',
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS fi_bank_statement_lines (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      statement_id UUID REFERENCES fi_bank_statements(id) ON DELETE CASCADE,
      transaction_date DATE NOT NULL,
      description VARCHAR(200),
      reference VARCHAR(50),
      debit_amount DECIMAL(15,2) DEFAULT 0,
      credit_amount DECIMAL(15,2) DEFAULT 0,
      is_reconciled BOOLEAN DEFAULT false,
      matched_payment_id UUID REFERENCES fi_payments(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
  ];

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) { if (!err.message.includes('already exists')) console.error(`Phase 8 migration ${i} failed:`, err.message); }
  }

  console.log(`✅ Phase 8 migrations complete (${migrations.length} statements)`);
}

export default runPhase8Migrations;
