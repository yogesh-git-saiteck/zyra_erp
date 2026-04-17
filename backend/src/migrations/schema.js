import { query, transaction } from '../config/database.js';

const migrations = [
  // ==========================================
  // EXTENSIONS
  // ==========================================
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,

  // ==========================================
  // ENUM TYPES
  // ==========================================
  `DO $$ BEGIN
    CREATE TYPE doc_status AS ENUM ('draft','submitted','approved','rejected','cancelled','completed','closed');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active','inactive','locked','pending');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
    CREATE TYPE bp_type AS ENUM ('customer','vendor','employee','partner');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
    CREATE TYPE posting_status AS ENUM ('draft','posted','reversed','parked');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
    CREATE TYPE movement_type AS ENUM ('receipt','issue','transfer','return','adjustment','scrap');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('draft','confirmed','in_process','completed','delivered','invoiced','cancelled','closed');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
    CREATE TYPE wf_status AS ENUM ('pending','approved','rejected','escalated','cancelled');
  EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  // ==========================================
  // 1. SYSTEM & AUTH TABLES
  // ==========================================
  `CREATE TABLE IF NOT EXISTS sys_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT,
    config_group VARCHAR(50),
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sys_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_code VARCHAR(30) UNIQUE NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sys_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    avatar_url VARCHAR(255),
    role_id UUID REFERENCES sys_roles(id),
    status user_status DEFAULT 'active',
    language VARCHAR(5) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    last_login TIMESTAMPTZ,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sys_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES sys_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sys_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES sys_users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    module VARCHAR(30),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_audit_user ON sys_audit_log(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON sys_audit_log(entity_type, entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created ON sys_audit_log(created_at DESC);`,

  `CREATE TABLE IF NOT EXISTS sys_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES sys_users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    type VARCHAR(30) DEFAULT 'info',
    module VARCHAR(30),
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 2. ORGANIZATION STRUCTURE
  // ==========================================
  `CREATE TABLE IF NOT EXISTS org_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_code VARCHAR(10) UNIQUE NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    legal_name VARCHAR(200),
    tax_id VARCHAR(50),
    registration_no VARCHAR(50),
    country VARCHAR(3),
    currency VARCHAR(3) DEFAULT 'INR',
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(100),
    website VARCHAR(200),
    logo_url VARCHAR(255),
    fiscal_year_start INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_plants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    plant_code VARCHAR(10) UNIQUE NOT NULL,
    plant_name VARCHAR(200) NOT NULL,
    address_line1 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(3),
    postal_code VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_storage_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plant_id UUID REFERENCES org_plants(id),
    sloc_code VARCHAR(10) NOT NULL,
    sloc_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plant_id, sloc_code)
  );`,

  `CREATE TABLE IF NOT EXISTS org_sales_organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    sales_org_code VARCHAR(10) UNIQUE NOT NULL,
    sales_org_name VARCHAR(200) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_distribution_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_code VARCHAR(10) UNIQUE NOT NULL,
    channel_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    division_code VARCHAR(10) UNIQUE NOT NULL,
    division_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_business_areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    area_code VARCHAR(10) UNIQUE NOT NULL,
    area_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_profit_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    pc_code VARCHAR(20) UNIQUE NOT NULL,
    pc_name VARCHAR(200) NOT NULL,
    manager_id UUID REFERENCES sys_users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS org_cost_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    cc_code VARCHAR(20) UNIQUE NOT NULL,
    cc_name VARCHAR(200) NOT NULL,
    category VARCHAR(50),
    manager_id UUID REFERENCES sys_users(id),
    profit_center_id UUID REFERENCES org_profit_centers(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 3. FINANCE MASTER DATA
  // ==========================================
  `CREATE TABLE IF NOT EXISTS fi_chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coa_code VARCHAR(10) UNIQUE NOT NULL,
    coa_name VARCHAR(200) NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_gl_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coa_id UUID REFERENCES fi_chart_of_accounts(id),
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
    account_group VARCHAR(50),
    parent_id UUID REFERENCES fi_gl_accounts(id),
    is_reconciliation BOOLEAN DEFAULT false,
    is_posting BOOLEAN DEFAULT true,
    currency VARCHAR(3),
    balance_direction VARCHAR(10) DEFAULT 'debit',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(coa_id, account_code)
  );`,

  `CREATE TABLE IF NOT EXISTS fi_fiscal_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    year INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES sys_users(id),
    UNIQUE(company_id, year)
  );`,

  `CREATE TABLE IF NOT EXISTS fi_fiscal_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fiscal_year_id UUID REFERENCES fi_fiscal_years(id),
    period_no INT NOT NULL,
    period_name VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_open BOOLEAN DEFAULT true,
    is_special BOOLEAN DEFAULT false
  );`,

  `CREATE TABLE IF NOT EXISTS fi_currencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency_code VARCHAR(3) UNIQUE NOT NULL,
    currency_name VARCHAR(100) NOT NULL,
    symbol VARCHAR(5),
    decimal_places INT DEFAULT 2,
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS fi_exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency VARCHAR(3) REFERENCES fi_currencies(currency_code),
    to_currency VARCHAR(3) REFERENCES fi_currencies(currency_code),
    rate_date DATE NOT NULL,
    exchange_rate DECIMAL(18,6) NOT NULL,
    rate_type VARCHAR(20) DEFAULT 'standard',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_tax_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    tax_code VARCHAR(10) NOT NULL,
    tax_name VARCHAR(100) NOT NULL,
    tax_rate DECIMAL(5,2) NOT NULL,
    tax_type VARCHAR(20) DEFAULT 'output',
    gl_account_id UUID REFERENCES fi_gl_accounts(id),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(company_id, tax_code)
  );`,

  `CREATE TABLE IF NOT EXISTS fi_payment_terms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    term_code VARCHAR(10) UNIQUE NOT NULL,
    term_name VARCHAR(100) NOT NULL,
    days_net INT DEFAULT 30,
    days_discount INT,
    discount_percent DECIMAL(5,2),
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS fi_banks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    bank_code VARCHAR(20) NOT NULL,
    bank_name VARCHAR(200) NOT NULL,
    account_number VARCHAR(50),
    routing_number VARCHAR(50),
    swift_code VARCHAR(20),
    iban VARCHAR(50),
    gl_account_id UUID REFERENCES fi_gl_accounts(id),
    currency VARCHAR(3) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT true,
    UNIQUE(company_id, bank_code)
  );`,

  // ==========================================
  // 4. BUSINESS PARTNERS
  // ==========================================
  `CREATE TABLE IF NOT EXISTS bp_business_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bp_number VARCHAR(20) UNIQUE NOT NULL,
    bp_type bp_type NOT NULL,
    title VARCHAR(20),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(200),
    display_name VARCHAR(200) NOT NULL,
    tax_id VARCHAR(50),
    email VARCHAR(100),
    phone VARCHAR(20),
    mobile VARCHAR(20),
    website VARCHAR(200),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(3),
    currency VARCHAR(3) DEFAULT 'INR',
    language VARCHAR(5) DEFAULT 'en',
    payment_term_id UUID REFERENCES fi_payment_terms(id),
    credit_limit DECIMAL(15,2),
    is_active BOOLEAN DEFAULT true,
    tags JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_bp_type ON bp_business_partners(bp_type);`,
  `CREATE INDEX IF NOT EXISTS idx_bp_name ON bp_business_partners(display_name);`,

  `CREATE TABLE IF NOT EXISTS bp_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bp_id UUID REFERENCES bp_business_partners(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    position VARCHAR(100),
    department VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS bp_bank_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bp_id UUID REFERENCES bp_business_partners(id) ON DELETE CASCADE,
    bank_name VARCHAR(200),
    account_number VARCHAR(50),
    routing_number VARCHAR(50),
    swift_code VARCHAR(20),
    iban VARCHAR(50),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 5. MATERIAL MASTER
  // ==========================================
  `CREATE TABLE IF NOT EXISTS mm_material_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_code VARCHAR(10) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    is_stocked BOOLEAN DEFAULT true,
    is_purchased BOOLEAN DEFAULT true,
    is_sold BOOLEAN DEFAULT true,
    is_produced BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS mm_units_of_measure (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uom_code VARCHAR(10) UNIQUE NOT NULL,
    uom_name VARCHAR(50) NOT NULL,
    uom_type VARCHAR(20),
    decimal_places INT DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS mm_material_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_code VARCHAR(20) UNIQUE NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES mm_material_groups(id),
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS mm_materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_code VARCHAR(30) UNIQUE NOT NULL,
    material_name VARCHAR(200) NOT NULL,
    description TEXT,
    material_type_id UUID REFERENCES mm_material_types(id),
    material_group_id UUID REFERENCES mm_material_groups(id),
    base_uom_id UUID REFERENCES mm_units_of_measure(id),
    purchase_uom_id UUID REFERENCES mm_units_of_measure(id),
    sales_uom_id UUID REFERENCES mm_units_of_measure(id),
    weight DECIMAL(12,3),
    weight_unit VARCHAR(5),
    volume DECIMAL(12,3),
    volume_unit VARCHAR(5),
    is_batch_managed BOOLEAN DEFAULT false,
    is_serial_managed BOOLEAN DEFAULT false,
    shelf_life_days INT,
    min_order_qty DECIMAL(12,3),
    standard_price DECIMAL(15,4),
    moving_avg_price DECIMAL(15,4),
    last_purchase_price DECIMAL(15,4),
    sales_price DECIMAL(15,4),
    currency VARCHAR(3) DEFAULT 'INR',
    hs_code VARCHAR(20),
    image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_material_name ON mm_materials(material_name);`,
  `CREATE INDEX IF NOT EXISTS idx_material_type ON mm_materials(material_type_id);`,

  `CREATE TABLE IF NOT EXISTS mm_material_plant_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID REFERENCES mm_materials(id),
    plant_id UUID REFERENCES org_plants(id),
    reorder_point DECIMAL(12,3),
    safety_stock DECIMAL(12,3),
    min_lot_size DECIMAL(12,3),
    max_lot_size DECIMAL(12,3),
    procurement_type VARCHAR(20) DEFAULT 'external',
    mrp_type VARCHAR(20) DEFAULT 'MRP',
    lead_time_days INT DEFAULT 0,
    UNIQUE(material_id, plant_id)
  );`,

  `CREATE TABLE IF NOT EXISTS mm_material_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID REFERENCES mm_materials(id),
    price_list VARCHAR(20),
    price DECIMAL(15,4) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    valid_from DATE,
    valid_to DATE,
    min_qty DECIMAL(12,3) DEFAULT 1,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 6. INVENTORY / STOCK
  // ==========================================
  `CREATE TABLE IF NOT EXISTS inv_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID REFERENCES mm_materials(id),
    plant_id UUID REFERENCES org_plants(id),
    sloc_id UUID REFERENCES org_storage_locations(id),
    batch_number VARCHAR(30),
    serial_number VARCHAR(50),
    quantity DECIMAL(15,3) DEFAULT 0,
    reserved_qty DECIMAL(15,3) DEFAULT 0,
    blocked_qty DECIMAL(15,3) DEFAULT 0,
    stock_type VARCHAR(20) DEFAULT 'unrestricted',
    last_count_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_stock_location UNIQUE (material_id, plant_id, sloc_id)
  );`,

  `CREATE INDEX IF NOT EXISTS idx_stock_material ON inv_stock(material_id);`,
  `CREATE INDEX IF NOT EXISTS idx_stock_plant ON inv_stock(plant_id);`,

  `CREATE TABLE IF NOT EXISTS inv_stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) NOT NULL,
    line_number INT DEFAULT 1,
    movement_type movement_type NOT NULL,
    material_id UUID REFERENCES mm_materials(id),
    plant_id UUID REFERENCES org_plants(id),
    sloc_id UUID REFERENCES org_storage_locations(id),
    batch_number VARCHAR(30),
    quantity DECIMAL(15,3) NOT NULL,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    reference_type VARCHAR(30),
    reference_id UUID,
    posting_date DATE DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 7. FINANCE TRANSACTIONS
  // ==========================================
  `CREATE TABLE IF NOT EXISTS fi_journal_headers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    fiscal_year INT,
    fiscal_period INT,
    posting_date DATE NOT NULL,
    document_date DATE NOT NULL,
    doc_type VARCHAR(10) DEFAULT 'JE',
    reference VARCHAR(50),
    description TEXT,
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    total_debit DECIMAL(15,2) DEFAULT 0,
    total_credit DECIMAL(15,2) DEFAULT 0,
    status posting_status DEFAULT 'draft',
    posted_by UUID REFERENCES sys_users(id),
    posted_at TIMESTAMPTZ,
    reversed_by UUID REFERENCES sys_users(id),
    reversal_doc UUID,
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_journal_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    header_id UUID REFERENCES fi_journal_headers(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    gl_account_id UUID REFERENCES fi_gl_accounts(id),
    cost_center_id UUID REFERENCES org_cost_centers(id),
    profit_center_id UUID REFERENCES org_profit_centers(id),
    bp_id UUID REFERENCES bp_business_partners(id),
    debit_amount DECIMAL(15,2) DEFAULT 0,
    credit_amount DECIMAL(15,2) DEFAULT 0,
    local_debit DECIMAL(15,2) DEFAULT 0,
    local_credit DECIMAL(15,2) DEFAULT 0,
    description VARCHAR(200),
    assignment VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_ap_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    vendor_id UUID REFERENCES bp_business_partners(id),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    posting_date DATE NOT NULL,
    reference VARCHAR(50),
    description TEXT,
    currency VARCHAR(3) DEFAULT 'INR',
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    status doc_status DEFAULT 'draft',
    payment_term_id UUID REFERENCES fi_payment_terms(id),
    po_reference UUID,
    journal_id UUID REFERENCES fi_journal_headers(id),
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_ar_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    customer_id UUID REFERENCES bp_business_partners(id),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    posting_date DATE NOT NULL,
    reference VARCHAR(50),
    description TEXT,
    currency VARCHAR(3) DEFAULT 'INR',
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    status doc_status DEFAULT 'draft',
    payment_term_id UUID REFERENCES fi_payment_terms(id),
    so_reference UUID,
    journal_id UUID REFERENCES fi_journal_headers(id),
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    payment_type VARCHAR(20) NOT NULL,
    bp_id UUID REFERENCES bp_business_partners(id),
    bank_id UUID REFERENCES fi_banks(id),
    payment_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    payment_method VARCHAR(20),
    check_number VARCHAR(20),
    reference VARCHAR(50),
    description TEXT,
    status doc_status DEFAULT 'draft',
    journal_id UUID REFERENCES fi_journal_headers(id),
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS fi_payment_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES fi_payments(id),
    invoice_type VARCHAR(10),
    invoice_id UUID,
    amount DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 8. PROCUREMENT / PURCHASING
  // ==========================================
  `CREATE TABLE IF NOT EXISTS pur_requisitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    plant_id UUID REFERENCES org_plants(id),
    requester_id UUID REFERENCES sys_users(id),
    department VARCHAR(100),
    required_date DATE,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    status doc_status DEFAULT 'draft',
    total_amount DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    approved_by UUID REFERENCES sys_users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS pur_requisition_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requisition_id UUID REFERENCES pur_requisitions(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    material_id UUID REFERENCES mm_materials(id),
    description VARCHAR(200),
    quantity DECIMAL(12,3) NOT NULL,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    estimated_price DECIMAL(15,4),
    currency VARCHAR(3) DEFAULT 'INR',
    required_date DATE,
    cost_center_id UUID REFERENCES org_cost_centers(id),
    status doc_status DEFAULT 'draft'
  );`,

  `CREATE TABLE IF NOT EXISTS pur_rfq (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    requisition_id UUID REFERENCES pur_requisitions(id),
    vendor_id UUID REFERENCES bp_business_partners(id),
    rfq_date DATE DEFAULT CURRENT_DATE,
    response_date DATE,
    description TEXT,
    status doc_status DEFAULT 'draft',
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS pur_purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    vendor_id UUID REFERENCES bp_business_partners(id),
    plant_id UUID REFERENCES org_plants(id),
    order_date DATE DEFAULT CURRENT_DATE,
    delivery_date DATE,
    payment_term_id UUID REFERENCES fi_payment_terms(id),
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    description TEXT,
    notes TEXT,
    status order_status DEFAULT 'draft',
    requisition_id UUID REFERENCES pur_requisitions(id),
    approved_by UUID REFERENCES sys_users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS pur_po_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id UUID REFERENCES pur_purchase_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    material_id UUID REFERENCES mm_materials(id),
    description VARCHAR(200),
    quantity DECIMAL(12,3) NOT NULL,
    received_qty DECIMAL(12,3) DEFAULT 0,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    unit_price DECIMAL(15,4) NOT NULL,
    tax_code_id UUID REFERENCES fi_tax_codes(id),
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    delivery_date DATE,
    sloc_id UUID REFERENCES org_storage_locations(id),
    cost_center_id UUID REFERENCES org_cost_centers(id),
    status order_status DEFAULT 'draft'
  );`,

  `CREATE TABLE IF NOT EXISTS pur_goods_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    po_id UUID REFERENCES pur_purchase_orders(id),
    vendor_id UUID REFERENCES bp_business_partners(id),
    receipt_date DATE DEFAULT CURRENT_DATE,
    plant_id UUID REFERENCES org_plants(id),
    description TEXT,
    status doc_status DEFAULT 'draft',
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS pur_gr_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gr_id UUID REFERENCES pur_goods_receipts(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES pur_po_items(id),
    material_id UUID REFERENCES mm_materials(id),
    quantity DECIMAL(12,3) NOT NULL,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    batch_number VARCHAR(30),
    sloc_id UUID REFERENCES org_storage_locations(id),
    status doc_status DEFAULT 'completed'
  );`,

  // ==========================================
  // 9. SALES & DISTRIBUTION
  // ==========================================
  `CREATE TABLE IF NOT EXISTS sd_quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    customer_id UUID REFERENCES bp_business_partners(id),
    sales_org_id UUID REFERENCES org_sales_organizations(id),
    quotation_date DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    currency VARCHAR(3) DEFAULT 'INR',
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    description TEXT,
    notes TEXT,
    status doc_status DEFAULT 'draft',
    converted_to_so UUID,
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sd_quotation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quotation_id UUID REFERENCES sd_quotations(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    material_id UUID REFERENCES mm_materials(id),
    description VARCHAR(200),
    quantity DECIMAL(12,3) NOT NULL,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    unit_price DECIMAL(15,4) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_code_id UUID REFERENCES fi_tax_codes(id),
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS sd_sales_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    customer_id UUID REFERENCES bp_business_partners(id),
    sales_org_id UUID REFERENCES org_sales_organizations(id),
    order_date DATE DEFAULT CURRENT_DATE,
    delivery_date DATE,
    payment_term_id UUID REFERENCES fi_payment_terms(id),
    currency VARCHAR(3) DEFAULT 'INR',
    exchange_rate DECIMAL(18,6) DEFAULT 1,
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    description TEXT,
    notes TEXT,
    ship_to_address TEXT,
    status order_status DEFAULT 'draft',
    quotation_id UUID REFERENCES sd_quotations(id),
    approved_by UUID REFERENCES sys_users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sd_so_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    so_id UUID REFERENCES sd_sales_orders(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    material_id UUID REFERENCES mm_materials(id),
    description VARCHAR(200),
    quantity DECIMAL(12,3) NOT NULL,
    delivered_qty DECIMAL(12,3) DEFAULT 0,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    unit_price DECIMAL(15,4) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_code_id UUID REFERENCES fi_tax_codes(id),
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    plant_id UUID REFERENCES org_plants(id),
    sloc_id UUID REFERENCES org_storage_locations(id),
    status order_status DEFAULT 'draft'
  );`,

  `CREATE TABLE IF NOT EXISTS sd_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    so_id UUID REFERENCES sd_sales_orders(id),
    customer_id UUID REFERENCES bp_business_partners(id),
    delivery_date DATE DEFAULT CURRENT_DATE,
    ship_to_address TEXT,
    shipping_method VARCHAR(50),
    tracking_number VARCHAR(100),
    status doc_status DEFAULT 'draft',
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS sd_billing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    so_id UUID REFERENCES sd_sales_orders(id),
    delivery_id UUID REFERENCES sd_deliveries(id),
    customer_id UUID REFERENCES bp_business_partners(id),
    billing_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    currency VARCHAR(3) DEFAULT 'INR',
    subtotal DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    paid_amount DECIMAL(15,2) DEFAULT 0,
    status doc_status DEFAULT 'draft',
    ar_invoice_id UUID REFERENCES fi_ar_invoices(id),
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 10. ASSET MANAGEMENT
  // ==========================================
  `CREATE TABLE IF NOT EXISTS am_asset_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_code VARCHAR(10) UNIQUE NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    depreciation_method VARCHAR(20) DEFAULT 'straight_line',
    useful_life_years INT DEFAULT 5,
    salvage_percent DECIMAL(5,2) DEFAULT 0,
    gl_account_asset UUID REFERENCES fi_gl_accounts(id),
    gl_account_depreciation UUID REFERENCES fi_gl_accounts(id),
    gl_account_accumulated UUID REFERENCES fi_gl_accounts(id),
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS am_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_code VARCHAR(20) UNIQUE NOT NULL,
    asset_name VARCHAR(200) NOT NULL,
    description TEXT,
    class_id UUID REFERENCES am_asset_classes(id),
    company_id UUID REFERENCES org_companies(id),
    plant_id UUID REFERENCES org_plants(id),
    cost_center_id UUID REFERENCES org_cost_centers(id),
    acquisition_date DATE,
    acquisition_cost DECIMAL(15,2),
    accumulated_depreciation DECIMAL(15,2) DEFAULT 0,
    net_book_value DECIMAL(15,2),
    salvage_value DECIMAL(15,2) DEFAULT 0,
    useful_life_months INT,
    depreciation_start_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    location VARCHAR(200),
    serial_number VARCHAR(50),
    vendor_id UUID REFERENCES bp_business_partners(id),
    warranty_end DATE,
    disposed_date DATE,
    disposal_amount DECIMAL(15,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS am_depreciation_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    run_date DATE NOT NULL,
    fiscal_year INT,
    fiscal_period INT,
    total_amount DECIMAL(15,2),
    asset_count INT,
    status doc_status DEFAULT 'draft',
    journal_id UUID REFERENCES fi_journal_headers(id),
    run_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 11. HR
  // ==========================================
  `CREATE TABLE IF NOT EXISTS hr_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES org_companies(id),
    dept_code VARCHAR(20) UNIQUE NOT NULL,
    dept_name VARCHAR(100) NOT NULL,
    parent_id UUID REFERENCES hr_departments(id),
    manager_id UUID REFERENCES sys_users(id),
    cost_center_id UUID REFERENCES org_cost_centers(id),
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS hr_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_code VARCHAR(20) UNIQUE NOT NULL,
    position_name VARCHAR(100) NOT NULL,
    department_id UUID REFERENCES hr_departments(id),
    grade VARCHAR(10),
    min_salary DECIMAL(12,2),
    max_salary DECIMAL(12,2),
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS hr_employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_number VARCHAR(20) UNIQUE NOT NULL,
    bp_id UUID REFERENCES bp_business_partners(id),
    user_id UUID REFERENCES sys_users(id),
    company_id UUID REFERENCES org_companies(id),
    department_id UUID REFERENCES hr_departments(id),
    position_id UUID REFERENCES hr_positions(id),
    manager_id UUID REFERENCES hr_employees(id),
    hire_date DATE,
    termination_date DATE,
    employment_type VARCHAR(20) DEFAULT 'full_time',
    salary DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'INR',
    bank_account VARCHAR(50),
    tax_id VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS hr_leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_code VARCHAR(10) UNIQUE NOT NULL,
    type_name VARCHAR(50) NOT NULL,
    days_per_year INT DEFAULT 0,
    is_paid BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS hr_leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES hr_employees(id),
    leave_type_id UUID REFERENCES hr_leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(4,1),
    reason TEXT,
    status wf_status DEFAULT 'pending',
    approved_by UUID REFERENCES sys_users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS hr_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES hr_employees(id),
    attendance_date DATE NOT NULL,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    hours_worked DECIMAL(4,1),
    status VARCHAR(20) DEFAULT 'present',
    notes TEXT,
    UNIQUE(employee_id, attendance_date)
  );`,

  // ==========================================
  // 12. PRODUCTION PLANNING
  // ==========================================
  `CREATE TABLE IF NOT EXISTS pp_work_centers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plant_id UUID REFERENCES org_plants(id),
    wc_code VARCHAR(20) UNIQUE NOT NULL,
    wc_name VARCHAR(100) NOT NULL,
    cost_center_id UUID REFERENCES org_cost_centers(id),
    capacity_qty DECIMAL(12,3),
    capacity_uom VARCHAR(10),
    cost_per_hour DECIMAL(12,2),
    is_active BOOLEAN DEFAULT true
  );`,

  `CREATE TABLE IF NOT EXISTS pp_bom_headers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID REFERENCES mm_materials(id),
    plant_id UUID REFERENCES org_plants(id),
    bom_name VARCHAR(200),
    base_quantity DECIMAL(12,3) DEFAULT 1,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS pp_bom_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bom_id UUID REFERENCES pp_bom_headers(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    component_id UUID REFERENCES mm_materials(id),
    quantity DECIMAL(12,6) NOT NULL,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    scrap_percent DECIMAL(5,2) DEFAULT 0,
    is_phantom BOOLEAN DEFAULT false
  );`,

  `CREATE TABLE IF NOT EXISTS pp_routings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_id UUID REFERENCES mm_materials(id),
    plant_id UUID REFERENCES org_plants(id),
    routing_name VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS pp_routing_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    routing_id UUID REFERENCES pp_routings(id) ON DELETE CASCADE,
    operation_no INT NOT NULL,
    operation_name VARCHAR(100),
    work_center_id UUID REFERENCES pp_work_centers(id),
    setup_time DECIMAL(8,2),
    run_time DECIMAL(8,2),
    time_unit VARCHAR(10) DEFAULT 'MIN',
    description TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS pp_production_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    plant_id UUID REFERENCES org_plants(id),
    material_id UUID REFERENCES mm_materials(id),
    bom_id UUID REFERENCES pp_bom_headers(id),
    routing_id UUID REFERENCES pp_routings(id),
    planned_qty DECIMAL(12,3) NOT NULL,
    completed_qty DECIMAL(12,3) DEFAULT 0,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    priority VARCHAR(20) DEFAULT 'medium',
    status order_status DEFAULT 'draft',
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 13. QUALITY MANAGEMENT
  // ==========================================
  `CREATE TABLE IF NOT EXISTS qm_inspection_lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    material_id UUID REFERENCES mm_materials(id),
    plant_id UUID REFERENCES org_plants(id),
    reference_type VARCHAR(30),
    reference_id UUID,
    inspection_date DATE DEFAULT CURRENT_DATE,
    quantity DECIMAL(12,3),
    sample_size DECIMAL(12,3),
    result VARCHAR(20) DEFAULT 'pending',
    inspector_id UUID REFERENCES sys_users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 14. MAINTENANCE (PM)
  // ==========================================
  `CREATE TABLE IF NOT EXISTS pm_maintenance_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_number VARCHAR(20) UNIQUE NOT NULL,
    asset_id UUID REFERENCES am_assets(id),
    plant_id UUID REFERENCES org_plants(id),
    order_type VARCHAR(20) DEFAULT 'corrective',
    priority VARCHAR(20) DEFAULT 'medium',
    description TEXT,
    planned_start DATE,
    planned_end DATE,
    actual_start DATE,
    actual_end DATE,
    assigned_to UUID REFERENCES sys_users(id),
    estimated_cost DECIMAL(15,2),
    actual_cost DECIMAL(15,2),
    status order_status DEFAULT 'draft',
    created_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 15. PROJECT SYSTEM
  // ==========================================
  `CREATE TABLE IF NOT EXISTS ps_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_code VARCHAR(20) UNIQUE NOT NULL,
    project_name VARCHAR(200) NOT NULL,
    company_id UUID REFERENCES org_companies(id),
    manager_id UUID REFERENCES sys_users(id),
    customer_id UUID REFERENCES bp_business_partners(id),
    start_date DATE,
    end_date DATE,
    budget DECIMAL(15,2),
    actual_cost DECIMAL(15,2) DEFAULT 0,
    profit_center_id UUID REFERENCES org_profit_centers(id),
    status VARCHAR(20) DEFAULT 'planning',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS ps_wbs_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES ps_projects(id) ON DELETE CASCADE,
    wbs_code VARCHAR(30) NOT NULL,
    wbs_name VARCHAR(200) NOT NULL,
    parent_id UUID REFERENCES ps_wbs_elements(id),
    planned_cost DECIMAL(15,2),
    actual_cost DECIMAL(15,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    sort_order INT DEFAULT 0,
    UNIQUE(project_id, wbs_code)
  );`,

  // ==========================================
  // 16. CRM
  // ==========================================
  `CREATE TABLE IF NOT EXISTS crm_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    opportunity_name VARCHAR(200) NOT NULL,
    customer_id UUID REFERENCES bp_business_partners(id),
    contact_id UUID REFERENCES bp_contacts(id),
    sales_org_id UUID REFERENCES org_sales_organizations(id),
    owner_id UUID REFERENCES sys_users(id),
    stage VARCHAR(30) DEFAULT 'prospect',
    probability INT DEFAULT 10,
    expected_value DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'INR',
    expected_close DATE,
    source VARCHAR(50),
    description TEXT,
    status VARCHAR(20) DEFAULT 'open',
    won_date DATE,
    lost_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_type VARCHAR(20) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    description TEXT,
    bp_id UUID REFERENCES bp_business_partners(id),
    opportunity_id UUID REFERENCES crm_opportunities(id),
    owner_id UUID REFERENCES sys_users(id),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 17. WORKFLOW ENGINE
  // ==========================================
  `CREATE TABLE IF NOT EXISTS wf_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    conditions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS wf_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES wf_templates(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    current_step INT DEFAULT 1,
    status wf_status DEFAULT 'pending',
    initiated_by UUID REFERENCES sys_users(id),
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  );`,

  `CREATE TABLE IF NOT EXISTS wf_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID REFERENCES wf_instances(id) ON DELETE CASCADE,
    step_number INT NOT NULL,
    approver_id UUID REFERENCES sys_users(id),
    status wf_status DEFAULT 'pending',
    comments TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // 18. NUMBER RANGES
  // ==========================================
  `CREATE TABLE IF NOT EXISTS sys_number_ranges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    object_type VARCHAR(30) UNIQUE NOT NULL,
    prefix VARCHAR(10) DEFAULT '',
    current_number BIGINT DEFAULT 0,
    step INT DEFAULT 1,
    min_number BIGINT DEFAULT 1,
    max_number BIGINT DEFAULT 9999999999,
    format VARCHAR(50) DEFAULT '{prefix}{number}'
  );`,

  // ==========================================
  // 19. CUSTOM FIELDS FRAMEWORK
  // ==========================================
  `CREATE TABLE IF NOT EXISTS sys_custom_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    field_name VARCHAR(50) NOT NULL,
    field_label VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL,
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    options JSONB,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, field_name)
  );`,

  // ==========================================
  // 20. AI ANALYTICS TABLES
  // ==========================================
  `CREATE TABLE IF NOT EXISTS ai_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prediction_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    prediction_data JSONB NOT NULL,
    confidence DECIMAL(5,4),
    model_version VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS ai_anomalies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anomaly_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    severity VARCHAR(20) DEFAULT 'medium',
    description TEXT,
    details JSONB,
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES sys_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,

  // ==========================================
  // INDEXES FOR PERFORMANCE
  // ==========================================
  `CREATE INDEX IF NOT EXISTS idx_je_posting_date ON fi_journal_headers(posting_date);`,
  `CREATE INDEX IF NOT EXISTS idx_je_status ON fi_journal_headers(status);`,
  `CREATE INDEX IF NOT EXISTS idx_po_vendor ON pur_purchase_orders(vendor_id);`,
  `CREATE INDEX IF NOT EXISTS idx_po_status ON pur_purchase_orders(status);`,
  `CREATE INDEX IF NOT EXISTS idx_so_customer ON sd_sales_orders(customer_id);`,
  `CREATE INDEX IF NOT EXISTS idx_so_status ON sd_sales_orders(status);`,
  `CREATE INDEX IF NOT EXISTS idx_opp_stage ON crm_opportunities(stage);`,
  `CREATE INDEX IF NOT EXISTS idx_wf_entity ON wf_instances(entity_type, entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_notif_user ON sys_notifications(user_id, is_read);`,
  
  // ==========================================
  // ADDITIONAL CRITICAL INDEXES (AUDIT FIX)
  // ==========================================
  `CREATE INDEX IF NOT EXISTS idx_sloc_plant ON org_storage_locations(plant_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sloc_plant_code ON org_storage_locations(plant_id, sloc_code);`,
  `CREATE INDEX IF NOT EXISTS idx_material_code ON mm_materials(material_code);`,
  `CREATE INDEX IF NOT EXISTS idx_material_active ON mm_materials(is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_material_type_active ON mm_materials(material_type_id, is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_bp_territory ON bp_business_partners(territory_id, is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_bp_type_active ON bp_business_partners(bp_type, is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_quote_items_quota ON sd_quotation_items(quotation_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pr_items_pr ON pur_requisition_items(requisition_id);`,
  `CREATE INDEX IF NOT EXISTS idx_pr_items_converted ON pur_requisition_items(requisition_id, converted_qty);`,
  `CREATE INDEX IF NOT EXISTS idx_so_items_so ON sd_sales_order_items(sales_order_id);`,
  `CREATE INDEX IF NOT EXISTS idx_gl_active ON fi_gl_accounts(is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_user ON sys_audit_log(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON sys_audit_log(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON sys_audit_log(entity_type, entity_id);`,
  
  // ==========================================
  // CONSTRAINTS FOR DATA INTEGRITY (AUDIT FIX)
  // ==========================================
  `ALTER TABLE bp_bank_details ADD CONSTRAINT IF NOT EXISTS unique_primary_bank_per_bp UNIQUE(bp_id) WHERE is_primary = true;`,
];

export async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  
  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
    } catch (err) {
      console.error(`Migration ${i + 1} failed:`, err.message);
      console.error('SQL:', migrations[i].substring(0, 100));
    }
  }
  
  console.log(`✅ Completed ${migrations.length} migrations`);
}

export default migrations;
