import { query } from '../config/database.js';

export async function runPhase9Migrations() {
  console.log('🚀 Running Phase 9 migrations (Integration Platform)...');

  const migrations = [
    // ==========================================
    // INTEGRATION CONNECTORS (3rd party app definitions)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS int_connectors (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connector_name VARCHAR(100) NOT NULL,
      connector_type VARCHAR(30) NOT NULL DEFAULT 'rest_api',
      description TEXT,
      icon VARCHAR(50),
      category VARCHAR(50),
      base_url VARCHAR(500),
      auth_type VARCHAR(30) DEFAULT 'api_key',
      auth_config JSONB DEFAULT '{}',
      default_headers JSONB DEFAULT '{}',
      rate_limit_per_min INT DEFAULT 60,
      is_active BOOLEAN DEFAULT true,
      is_template BOOLEAN DEFAULT false,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ==========================================
    // INTEGRATION CONNECTIONS (user instances of connectors)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS int_connections (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connector_id UUID REFERENCES int_connectors(id) ON DELETE CASCADE,
      connection_name VARCHAR(100) NOT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      credentials JSONB DEFAULT '{}',
      config JSONB DEFAULT '{}',
      last_tested_at TIMESTAMPTZ,
      last_sync_at TIMESTAMPTZ,
      error_message TEXT,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ==========================================
    // INTEGRATION FLOWS (data pipelines)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS int_flows (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connection_id UUID REFERENCES int_connections(id) ON DELETE CASCADE,
      flow_name VARCHAR(100) NOT NULL,
      direction VARCHAR(10) NOT NULL DEFAULT 'inbound',
      trigger_type VARCHAR(30) DEFAULT 'manual',
      trigger_config JSONB DEFAULT '{}',
      source_entity VARCHAR(50) NOT NULL,
      target_entity VARCHAR(50) NOT NULL,
      field_mapping JSONB NOT NULL DEFAULT '[]',
      transform_rules JSONB DEFAULT '[]',
      filters JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      last_run_status VARCHAR(20),
      run_count INT DEFAULT 0,
      success_count INT DEFAULT 0,
      error_count INT DEFAULT 0,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ==========================================
    // INTEGRATION EXECUTION LOG
    // ==========================================
    `CREATE TABLE IF NOT EXISTS int_execution_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      flow_id UUID REFERENCES int_flows(id) ON DELETE CASCADE,
      connection_id UUID REFERENCES int_connections(id),
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      direction VARCHAR(10),
      records_processed INT DEFAULT 0,
      records_success INT DEFAULT 0,
      records_failed INT DEFAULT 0,
      error_details JSONB DEFAULT '[]',
      request_payload JSONB,
      response_payload JSONB,
      duration_ms INT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );`,

    // ==========================================
    // WEBHOOKS (inbound endpoints)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS int_webhooks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connection_id UUID REFERENCES int_connections(id) ON DELETE CASCADE,
      webhook_key VARCHAR(64) NOT NULL UNIQUE,
      webhook_secret VARCHAR(128),
      target_entity VARCHAR(50) NOT NULL,
      field_mapping JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      last_received_at TIMESTAMPTZ,
      receive_count INT DEFAULT 0,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ==========================================
    // API KEYS (for external systems to call Zyra)
    // ==========================================
    `CREATE TABLE IF NOT EXISTS int_api_keys (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      key_name VARCHAR(100) NOT NULL,
      api_key VARCHAR(128) NOT NULL UNIQUE,
      api_secret_hash VARCHAR(256) NOT NULL,
      permissions JSONB DEFAULT '{"read": true, "write": false}',
      allowed_entities JSONB DEFAULT '[]',
      allowed_ips JSONB DEFAULT '[]',
      rate_limit_per_min INT DEFAULT 100,
      is_active BOOLEAN DEFAULT true,
      last_used_at TIMESTAMPTZ,
      usage_count INT DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_int_exec_flow ON int_execution_log(flow_id, started_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_int_webhook_key ON int_webhooks(webhook_key);`,
    `CREATE INDEX IF NOT EXISTS idx_int_apikey ON int_api_keys(api_key);`,
  ];

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) { if (!err.message.includes('already exists')) console.error(`Phase 9 migration ${i} failed:`, err.message); }
  }

  // Seed pre-built connector templates — clean + re-insert to prevent duplicates
  try { await query(`DELETE FROM int_connectors WHERE is_template = true`); } catch {}

  const templates = [
    ['Salesforce', 'rest_api', 'CRM sync — contacts, leads, opportunities', '🏢', 'crm', 'https://login.salesforce.com', 'oauth2'],
    ['QuickBooks', 'rest_api', 'Accounting sync — invoices, payments, chart of accounts', '📗', 'accounting', 'https://quickbooks.api.intuit.com', 'oauth2'],
    ['Shopify', 'rest_api', 'E-commerce — orders, products, inventory', '🛍️', 'ecommerce', 'https://{store}.myshopify.com/admin/api', 'api_key'],
    ['Stripe', 'rest_api', 'Payment processing — charges, customers, invoices', '💳', 'payments', 'https://api.stripe.com/v1', 'api_key'],
    ['HubSpot', 'rest_api', 'Marketing & CRM — contacts, deals, companies', '🟠', 'crm', 'https://api.hubapi.com', 'api_key'],
    ['Xero', 'rest_api', 'Accounting — invoices, bank transactions, contacts', '📘', 'accounting', 'https://api.xero.com/api.xro/2.0', 'oauth2'],
    ['WooCommerce', 'rest_api', 'E-commerce — orders, products, customers', '🟣', 'ecommerce', 'https://{site}/wp-json/wc/v3', 'api_key'],
    ['Slack', 'rest_api', 'Notifications — send alerts to channels', '💬', 'communication', 'https://slack.com/api', 'oauth2'],
    ['Zapier', 'webhook', 'Automation — trigger/receive from 5000+ apps', '⚡', 'automation', 'https://hooks.zapier.com', 'webhook'],
    ['Custom REST API', 'rest_api', 'Connect to any REST API endpoint', '🔌', 'custom', '', 'api_key'],
    ['Custom Webhook', 'webhook', 'Receive data from any system via webhook', '🪝', 'custom', '', 'webhook'],
  ];

  for (const [name, type, desc, icon, cat, url, auth] of templates) {
    try {
      await query(
        `INSERT INTO int_connectors (connector_name, connector_type, description, icon, category, base_url, auth_type, is_template)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [name, type, desc, icon, cat, url, auth]);
    } catch {}
  }

  console.log(`✅ Phase 9 migrations complete (${migrations.length} statements + ${templates.length} templates)`);
}

export default runPhase9Migrations;
