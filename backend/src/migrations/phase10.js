import { query } from '../config/database.js';

export async function runPhase10Migrations() {
  console.log('🚀 Running Phase 10 migrations (Module Config + Transport)...');

  const migrations = [
    // ==========================================
    // MODULE CONFIGURATION
    // ==========================================
    `CREATE TABLE IF NOT EXISTS sys_module_config (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      module_key VARCHAR(50) NOT NULL UNIQUE,
      module_name VARCHAR(100) NOT NULL,
      description TEXT,
      icon VARCHAR(50),
      category VARCHAR(30) DEFAULT 'optional',
      is_mandatory BOOLEAN DEFAULT false,
      is_enabled BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      config JSONB DEFAULT '{}',
      enabled_by UUID REFERENCES sys_users(id),
      enabled_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    // ==========================================
    // TRANSPORT MANAGEMENT
    // ==========================================
    `CREATE TABLE IF NOT EXISTS tm_carriers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      carrier_code VARCHAR(20) NOT NULL UNIQUE,
      carrier_name VARCHAR(100) NOT NULL,
      carrier_type VARCHAR(30) DEFAULT 'road',
      contact_name VARCHAR(100),
      phone VARCHAR(30),
      email VARCHAR(100),
      address TEXT,
      license_number VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS tm_vehicles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      carrier_id UUID REFERENCES tm_carriers(id),
      vehicle_number VARCHAR(30) NOT NULL,
      vehicle_type VARCHAR(30) DEFAULT 'truck',
      capacity_kg DECIMAL(10,2),
      capacity_volume DECIMAL(10,2),
      fuel_type VARCHAR(20),
      is_active BOOLEAN DEFAULT true,
      current_status VARCHAR(20) DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS tm_shipments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      doc_number VARCHAR(20) NOT NULL UNIQUE,
      shipment_type VARCHAR(20) DEFAULT 'outbound',
      carrier_id UUID REFERENCES tm_carriers(id),
      vehicle_id UUID REFERENCES tm_vehicles(id),
      origin_plant_id UUID REFERENCES org_plants(id),
      destination_address TEXT,
      destination_city VARCHAR(100),
      customer_id UUID REFERENCES bp_business_partners(id),
      reference_type VARCHAR(30),
      reference_id UUID,
      planned_date DATE,
      actual_departure TIMESTAMPTZ,
      actual_arrival TIMESTAMPTZ,
      weight_kg DECIMAL(10,2),
      freight_cost DECIMAL(12,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'planned',
      tracking_number VARCHAR(50),
      notes TEXT,
      created_by UUID REFERENCES sys_users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`,

    `CREATE TABLE IF NOT EXISTS tm_shipment_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      shipment_id UUID REFERENCES tm_shipments(id) ON DELETE CASCADE,
      material_id UUID REFERENCES mm_materials(id),
      quantity DECIMAL(12,3),
      weight_kg DECIMAL(10,2),
      delivery_id UUID,
      so_id UUID,
      line_number INT
    );`,

    `CREATE INDEX IF NOT EXISTS idx_tm_ship_status ON tm_shipments(status);`,
    `CREATE INDEX IF NOT EXISTS idx_tm_ship_carrier ON tm_shipments(carrier_id);`,
  ];

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) { if (!err.message.includes('already exists')) console.error(`Phase 10 migration ${i} failed:`, err.message); }
  }

  // Seed module configuration
  const modules = [
    // Mandatory modules
    ['dashboard', 'Dashboard', 'Main dashboard and KPIs', '📊', 'core', true, true, 1],
    ['finance', 'Finance', 'GL, Journals, AP, AR, Payments, Reports', '💰', 'core', true, true, 2],
    ['sales', 'Sales & Distribution', 'Quotations, Sales Orders, Deliveries, Billing', '📈', 'core', true, true, 3],
    ['master-data', 'Master Data', 'Business Partners, Materials, Organization', '📋', 'core', true, true, 4],
    ['inventory', 'Inventory', 'Stock Overview, Stock Movements, Turnover', '📦', 'core', true, true, 5],
    ['settings', 'Settings & Admin', 'Users, Roles, Config, Integrations', '⚙️', 'core', true, true, 100],
    // Optional modules
    ['procurement', 'Procurement', 'Requisitions, Purchase Orders, Goods Receipts', '🛒', 'optional', false, true, 6],
    ['production', 'Production Planning', 'BOM, Production Orders, Work Centers', '🏭', 'optional', false, true, 7],
    ['warehouse', 'Warehouse Management', 'Storage Locations, Warehouse Stock', '🏬', 'optional', false, true, 8],
    ['assets', 'Asset Management', 'Fixed Assets, Depreciation, Disposal', '🖥️', 'optional', false, true, 9],
    ['hr', 'Human Resources', 'Employees, Leave, Attendance, Payroll', '👥', 'optional', false, true, 10],
    ['crm', 'CRM', 'Opportunities, Activities, Pipeline', '🤝', 'optional', false, true, 11],
    ['projects', 'Project System', 'Project Management and Tracking', '📁', 'optional', false, true, 12],
    ['quality', 'Quality Management', 'Inspection Lots, Quality Control', '✅', 'optional', false, true, 13],
    ['maintenance', 'Plant Maintenance', 'Corrective and Preventive Maintenance', '🔧', 'optional', false, true, 14],
    ['transport', 'Transport Management', 'Carriers, Vehicles, Shipment Tracking', '🚚', 'optional', false, false, 15],
  ];

  for (const [key, name, desc, icon, cat, mandatory, enabled, sort] of modules) {
    try {
      await query(
        `INSERT INTO sys_module_config (module_key, module_name, description, icon, category, is_mandatory, is_enabled, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (module_key) DO UPDATE SET
         module_name=EXCLUDED.module_name, description=EXCLUDED.description, icon=EXCLUDED.icon,
         category=EXCLUDED.category, is_mandatory=EXCLUDED.is_mandatory, sort_order=EXCLUDED.sort_order`,
        [key, name, desc, icon, cat, mandatory, enabled, sort]);
    } catch {}
  }

  console.log(`✅ Phase 10 migrations complete`);
}

export default runPhase10Migrations;
