import { query } from '../config/database.js';

const migrations = [
  // ===================================================
  // FIX: ALL missing columns across entire system
  // ===================================================
  // org_storage_locations — missing sloc_type
  `ALTER TABLE org_storage_locations ADD COLUMN IF NOT EXISTS sloc_type VARCHAR(30) DEFAULT 'general'`,

  // hr_employees — bulk import needs these directly (schema only has them via BP join)
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS email VARCHAR(100)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS position_title VARCHAR(100)`,

  // org_plants — missing phone/email
  `ALTER TABLE org_plants ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`,
  `ALTER TABLE org_plants ADD COLUMN IF NOT EXISTS email VARCHAR(100)`,

  // ===================================================
  // Org hierarchy: add plant_id to sales org, cost center, profit center
  // ===================================================
  `ALTER TABLE org_sales_organizations ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
  `ALTER TABLE org_sales_organizations ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE org_cost_centers ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
  `ALTER TABLE org_cost_centers ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE org_profit_centers ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,
  `ALTER TABLE org_profit_centers ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE org_storage_locations ADD COLUMN IF NOT EXISTS description TEXT`,

  `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS default_company_id UUID REFERENCES org_companies(id)`,
  `ALTER TABLE sys_users ADD COLUMN IF NOT EXISTS allowed_companies UUID[] DEFAULT '{}'`,

  // ===================================================
  // 2. FISCAL PERIOD LOCKING — alter existing table
  // ===================================================
  `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES org_companies(id)`,
  `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS period_year INT`,
  `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS period_month INT`,
  `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open'`,
  `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES sys_users(id)`,
  `ALTER TABLE fi_fiscal_periods ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,
  // Sync is_open → status for existing rows
  `UPDATE fi_fiscal_periods SET status = CASE WHEN is_open = true THEN 'open' ELSE 'closed' END WHERE status IS NULL`,
  // Make period_no nullable (it was NOT NULL in original schema)
  `ALTER TABLE fi_fiscal_periods ALTER COLUMN period_no DROP NOT NULL`,
  `ALTER TABLE fi_fiscal_periods ALTER COLUMN fiscal_year_id DROP NOT NULL`,

  // ===================================================
  // 3. DOCUMENT AMENDMENT / CANCELLATION
  // ===================================================
  `CREATE TABLE IF NOT EXISTS sys_document_amendments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    amendment_number INT DEFAULT 1,
    reason TEXT NOT NULL,
    changed_fields JSONB DEFAULT '{}',
    previous_values JSONB DEFAULT '{}',
    amended_by UUID REFERENCES sys_users(id),
    amended_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_doc_amendments ON sys_document_amendments(entity_type, entity_id)`,

  `CREATE TABLE IF NOT EXISTS sys_document_cancellations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    doc_number VARCHAR(30),
    reason TEXT NOT NULL,
    reverse_je_id UUID REFERENCES fi_journal_headers(id),
    cancelled_by UUID REFERENCES sys_users(id),
    cancelled_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ===================================================
  // 4 & 5. SMTP / EMAIL CONFIG
  // ===================================================
  `CREATE TABLE IF NOT EXISTS sys_email_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    smtp_host VARCHAR(200),
    smtp_port INT DEFAULT 587,
    smtp_user VARCHAR(200),
    smtp_password VARCHAR(500),
    smtp_secure BOOLEAN DEFAULT true,
    from_name VARCHAR(100),
    from_email VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS sys_email_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID,
    to_email VARCHAR(200) NOT NULL,
    cc_email VARCHAR(500),
    subject VARCHAR(500) NOT NULL,
    body TEXT,
    entity_type VARCHAR(50),
    entity_id UUID,
    attachment_name VARCHAR(200),
    status VARCHAR(20) DEFAULT 'queued',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ===================================================
  // 6. GST RETURN PREPARATION
  // ===================================================
  `CREATE TABLE IF NOT EXISTS fi_gst_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    return_type VARCHAR(10) NOT NULL,
    period_month INT NOT NULL,
    period_year INT NOT NULL,
    filing_status VARCHAR(20) DEFAULT 'draft',
    data JSONB DEFAULT '{}',
    filed_date DATE,
    filed_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, return_type, period_year, period_month)
  )`,

  // ===================================================
  // 7. VALIDATION RULES
  // ===================================================
  `CREATE TABLE IF NOT EXISTS sys_validation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    rule_type VARCHAR(30) NOT NULL,
    rule_value TEXT,
    error_message VARCHAR(200),
    is_active BOOLEAN DEFAULT true
  )`,

  // ===================================================
  // 8. CONFIGURABLE DOC NUMBERING
  // ===================================================
  `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS pattern VARCHAR(100)`,
  `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS include_fy BOOLEAN DEFAULT false`,
  `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS include_company BOOLEAN DEFAULT false`,
  `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS reset_yearly BOOLEAN DEFAULT false`,
  `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS fiscal_year_start INT DEFAULT 4`,
  `ALTER TABLE sys_number_ranges ADD COLUMN IF NOT EXISTS pad_length INT DEFAULT 5`,

  // Add company letterhead fields
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS letterhead_line1 TEXT`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS letterhead_line2 TEXT`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS bank_details TEXT`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT`,
  `ALTER TABLE org_companies ADD COLUMN IF NOT EXISTS digital_signature_url TEXT`,
];

// Seed validation rules
const validationRules = [
  ['business_partner', 'gstin', 'regex', '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', 'Invalid GSTIN format (e.g. 33AABCU9603R1ZM)'],
  ['business_partner', 'pan', 'regex', '^[A-Z]{5}[0-9]{4}[A-Z]{1}$', 'Invalid PAN format (e.g. ABCDE1234F)'],
  ['business_partner', 'email', 'regex', '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', 'Invalid email format'],
  ['business_partner', 'gstin', 'unique', 'bp_business_partners.gstin', 'GSTIN already exists for another partner'],
  ['employee', 'pan_number', 'regex', '^[A-Z]{5}[0-9]{4}[A-Z]{1}$', 'Invalid PAN format'],
  ['employee', 'aadhaar_number', 'regex', '^[0-9]{12}$', 'Aadhaar must be 12 digits'],
  ['employee', 'email', 'unique', 'hr_employees.email', 'Email already exists'],
  ['material', 'hsn_code', 'regex', '^[0-9]{4,8}$', 'HSN code must be 4-8 digits'],
  ['gl_account', 'account_code', 'unique', 'fi_gl_accounts.account_code', 'Account code already exists'],
];

export async function runPhase17() {
  console.log('🚀 Running Phase 17 (Go-live blockers)...');

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate'))
        console.log(`Phase 17 #${i+1}:`, err.message.substring(0, 100));
    }
  }

  // Seed validation rules (skip if already exists)
  for (const [entity, field, ruleType, ruleVal, msg] of validationRules) {
    try {
      await query(
        `INSERT INTO sys_validation_rules (entity_type, field_name, rule_type, rule_value, error_message)
         VALUES ($1::text, $2::text, $3::text, $4::text, $5::text)
         ON CONFLICT (entity_type, field_name, rule_type) DO NOTHING`,
        [entity, field, ruleType, ruleVal, msg]);
    } catch {}
  }

  // Generate fiscal periods for FY 2025-26 and 2026-27
  try {
    const companies = (await query(`SELECT id FROM org_companies`)).rows;
    for (const comp of companies) {
      for (const fy of [[2025, 4, 2026, 3], [2026, 4, 2027, 3]]) {
        let y = fy[0], m = fy[1];
        for (let i = 0; i < 12; i++) {
          const start = `${y}-${String(m).padStart(2,'0')}-01`;
          const endDate = new Date(y, m, 0);
          const end = `${y}-${String(m).padStart(2,'0')}-${endDate.getDate()}`;
          const name = `${new Date(y, m-1).toLocaleString('en',{month:'short'})} ${y}`;
          try {
            // Check if exists first
            const exists = await query(
              `SELECT id FROM fi_fiscal_periods WHERE company_id = $1 AND period_year = $2 AND period_month = $3`,
              [comp.id, y, m]);
            if (!exists.rows.length) {
              await query(
                `INSERT INTO fi_fiscal_periods (company_id, period_name, period_year, period_month, period_no, start_date, end_date, status, is_open)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', true)`,
                [comp.id, name, y, m, i+1, start, end]);
            }
          } catch {}
          m++; if (m > 12) { m = 1; y++; }
        }
      }
    }
  } catch {}

  // Set default company for admin user
  try {
    const comp = await query(`SELECT id FROM org_companies WHERE company_code = '1000'`);
    if (comp.rows.length) {
      await query(`UPDATE sys_users SET default_company_id = $1 WHERE default_company_id IS NULL`, [comp.rows[0].id]);
    }
  } catch {}

  console.log('✅ Phase 17 complete — Multi-company, fiscal periods, amendments, email, GST, validation, numbering');
}
