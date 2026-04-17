import { query } from '../config/database.js';

export async function runPhase11Migrations() {
  console.log('🚀 Running Phase 11 migrations (No-Code Admin Platform)...');

  const migrations = [
    // 1. NOTIFICATION RULES
    `CREATE TABLE IF NOT EXISTS sys_notification_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      rule_name VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      trigger_event VARCHAR(50) NOT NULL,
      conditions JSONB DEFAULT '[]',
      notify_roles JSONB DEFAULT '[]',
      notify_users JSONB DEFAULT '[]',
      channel VARCHAR(20) DEFAULT 'in_app',
      email_template_id UUID,
      message_template TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 2. SCHEDULED JOBS
    `CREATE TABLE IF NOT EXISTS sys_scheduled_jobs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_name VARCHAR(100) NOT NULL,
      job_type VARCHAR(50) NOT NULL,
      schedule_cron VARCHAR(50),
      schedule_description VARCHAR(100),
      config JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      last_run_status VARCHAR(20),
      next_run_at TIMESTAMPTZ,
      run_count INT DEFAULT 0,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS sys_job_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id UUID REFERENCES sys_scheduled_jobs(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL,
      records_affected INT DEFAULT 0,
      error_message TEXT,
      duration_ms INT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );`,

    // 3. EMAIL TEMPLATES
    `CREATE TABLE IF NOT EXISTS sys_email_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      template_name VARCHAR(100) NOT NULL,
      template_key VARCHAR(50) NOT NULL UNIQUE,
      subject VARCHAR(200) NOT NULL,
      body_html TEXT NOT NULL,
      variables JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 4. BUSINESS RULES
    `CREATE TABLE IF NOT EXISTS sys_business_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      rule_name VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      trigger_point VARCHAR(30) DEFAULT 'before_save',
      conditions JSONB NOT NULL DEFAULT '[]',
      action_type VARCHAR(30) NOT NULL DEFAULT 'block',
      action_config JSONB DEFAULT '{}',
      error_message VARCHAR(300),
      priority INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 5. FIELD VALIDATION RULES
    `CREATE TABLE IF NOT EXISTS sys_validation_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      field_name VARCHAR(50) NOT NULL,
      rule_type VARCHAR(30) NOT NULL,
      rule_value VARCHAR(200),
      error_message VARCHAR(200),
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 6. NAVIGATION CONFIG
    `CREATE TABLE IF NOT EXISTS sys_nav_config (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      module_key VARCHAR(50) NOT NULL,
      item_key VARCHAR(50) NOT NULL,
      label VARCHAR(100) NOT NULL,
      path VARCHAR(200),
      sort_order INT DEFAULT 0,
      is_visible BOOLEAN DEFAULT true,
      parent_key VARCHAR(50),
      icon VARCHAR(50),
      is_custom BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 7. DASHBOARD WIDGETS
    `CREATE TABLE IF NOT EXISTS sys_dashboard_widgets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      widget_name VARCHAR(100) NOT NULL,
      widget_type VARCHAR(30) NOT NULL,
      config JSONB DEFAULT '{}',
      data_source VARCHAR(100),
      role_filter JSONB DEFAULT '[]',
      sort_order INT DEFAULT 0,
      grid_cols INT DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 8. DATA IMPORT LOG
    `CREATE TABLE IF NOT EXISTS sys_import_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entity_type VARCHAR(50) NOT NULL,
      file_name VARCHAR(200),
      total_rows INT DEFAULT 0,
      success_rows INT DEFAULT 0,
      failed_rows INT DEFAULT 0,
      error_details JSONB DEFAULT '[]',
      field_mapping JSONB DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'processing',
      imported_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );`,

    // 9. PRINT TEMPLATES
    `CREATE TABLE IF NOT EXISTS sys_print_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      template_name VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      header_html TEXT,
      body_html TEXT,
      footer_html TEXT,
      logo_url VARCHAR(500),
      company_name VARCHAR(200),
      company_address TEXT,
      company_phone VARCHAR(50),
      company_email VARCHAR(100),
      company_tax_id VARCHAR(50),
      is_default BOOLEAN DEFAULT false,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // 10. LOCALIZATION
    `CREATE TABLE IF NOT EXISTS sys_translations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      language_code VARCHAR(5) NOT NULL,
      translation_key VARCHAR(200) NOT NULL,
      translation_value TEXT NOT NULL,
      module VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(language_code, translation_key)
    );`,

    `CREATE TABLE IF NOT EXISTS sys_supported_languages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      language_code VARCHAR(5) NOT NULL UNIQUE,
      language_name VARCHAR(50) NOT NULL,
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true
    );`,

    // 11. APPROVAL RULES (auto-routing)
    `CREATE TABLE IF NOT EXISTS sys_approval_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      rule_name VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      condition_field VARCHAR(50),
      condition_operator VARCHAR(10),
      condition_value VARCHAR(100),
      approver_role VARCHAR(30),
      approver_user_id UUID REFERENCES sys_users(id),
      priority INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,
  ];

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) { if (!err.message.includes('already exists')) console.error(`Phase 11 migration ${i} failed:`, err.message); }
  }

  // Seed default email templates
  const emailTemplates = [
    ['po_approval', 'PO Approval Request', 'Purchase Order {{doc_number}} requires your approval',
     '<h2>Approval Required</h2><p>Purchase Order <strong>{{doc_number}}</strong> for <strong>{{total_amount}}</strong> from {{vendor_name}} needs your approval.</p><p><a href="{{app_url}}/settings/workflows">Review in Zyra</a></p>',
     '["doc_number","total_amount","vendor_name","app_url"]'],
    ['invoice_overdue', 'Invoice Overdue Notice', 'Invoice {{doc_number}} is overdue',
     '<h2>Overdue Invoice</h2><p>Invoice <strong>{{doc_number}}</strong> for <strong>{{amount}}</strong> was due on {{due_date}}. Please follow up.</p>',
     '["doc_number","amount","due_date"]'],
    ['welcome_user', 'Welcome to Zyra', 'Welcome to Zyra, {{first_name}}!',
     '<h2>Welcome!</h2><p>Hi {{first_name}}, your Zyra account has been created.</p><p>Username: <strong>{{username}}</strong></p><p><a href="{{app_url}}/login">Login here</a></p>',
     '["first_name","username","app_url"]'],
    ['leave_approved', 'Leave Request Approved', 'Your leave request has been approved',
     '<p>Hi {{employee_name}}, your {{leave_type}} leave from {{start_date}} to {{end_date}} has been approved.</p>',
     '["employee_name","leave_type","start_date","end_date"]'],
  ];

  for (const [key, name, subject, body, vars] of emailTemplates) {
    try { await query(`INSERT INTO sys_email_templates (template_key, template_name, subject, body_html, variables) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (template_key) DO NOTHING`, [key, name, subject, body, vars]); } catch {}
  }

  // Seed default scheduled job types
  const jobs = [
    ['Monthly Depreciation Run', 'depreciation', '0 0 1 * *', 'Run on 1st of every month', '{}'],
    ['Weekly Trial Balance Email', 'email_report', '0 8 * * 1', 'Every Monday at 8 AM', '{"report":"trial_balance","recipients":"FIN_MGR"}'],
    ['Daily Overdue Invoice Check', 'overdue_check', '0 9 * * *', 'Every day at 9 AM', '{"entity":"ar_invoices","action":"notify"}'],
    ['Auto-close Expired Quotations', 'auto_close', '0 0 * * *', 'Every midnight', '{"entity":"quotations","condition":"valid_until < today"}'],
  ];

  for (const [name, type, cron, desc, config] of jobs) {
    try { await query(`INSERT INTO sys_scheduled_jobs (job_name, job_type, schedule_cron, schedule_description, config, is_active) VALUES ($1,$2,$3,$4,$5,false) ON CONFLICT (job_name) DO NOTHING`, [name, type, cron, desc, config]); } catch {}
  }

  // Seed languages
  const langs = [['en', 'English', true], ['hi', 'Hindi', false], ['ta', 'Tamil', false], ['es', 'Spanish', false], ['fr', 'French', false], ['de', 'German', false], ['zh', 'Chinese', false], ['ja', 'Japanese', false], ['ar', 'Arabic', false]];
  for (const [code, name, isDefault] of langs) {
    try { await query(`INSERT INTO sys_supported_languages (language_code, language_name, is_default, is_active) VALUES ($1,$2,$3,$4) ON CONFLICT (language_code) DO NOTHING`, [code, name, isDefault, isDefault]); } catch {}
  }

  console.log(`✅ Phase 11 migrations complete`);
}

export default runPhase11Migrations;
