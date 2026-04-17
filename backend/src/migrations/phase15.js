import { query } from '../config/database.js';

const migrations = [
  // ===================================================
  // P3-25: NCR (Non-Conformance Report) for Quality
  // ===================================================
  `CREATE TABLE IF NOT EXISTS qm_ncr (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ncr_number VARCHAR(20) UNIQUE NOT NULL,
    inspection_id UUID REFERENCES qm_inspection_lots(id),
    ncr_type VARCHAR(30) DEFAULT 'material',
    severity VARCHAR(20) DEFAULT 'minor',
    description TEXT NOT NULL,
    root_cause TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    assigned_to UUID REFERENCES sys_users(id),
    status VARCHAR(20) DEFAULT 'open',
    raised_by UUID REFERENCES sys_users(id),
    closed_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // ===================================================
  // P3-24: Routing/Operations for Production
  // ===================================================
  `CREATE TABLE IF NOT EXISTS pp_routings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bom_id UUID REFERENCES pp_bom_headers(id) ON DELETE CASCADE,
    operation_number INT NOT NULL,
    operation_name VARCHAR(100) NOT NULL,
    work_center_id UUID REFERENCES pp_work_centers(id),
    setup_time_min DECIMAL(8,2) DEFAULT 0,
    run_time_min DECIMAL(8,2) DEFAULT 0,
    description TEXT,
    sort_order INT DEFAULT 0
  )`,

  // ===================================================
  // P4-30: Bin-level warehouse tracking
  // ===================================================
  `CREATE TABLE IF NOT EXISTS wm_bins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bin_code VARCHAR(20) NOT NULL,
    sloc_id UUID REFERENCES org_storage_locations(id),
    bin_type VARCHAR(20) DEFAULT 'storage',
    aisle VARCHAR(10),
    rack VARCHAR(10),
    level VARCHAR(10),
    max_capacity DECIMAL(12,2),
    current_qty DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(bin_code, sloc_id)
  )`,

  // ===================================================
  // P4-30: Cycle Count
  // ===================================================
  `CREATE TABLE IF NOT EXISTS wm_cycle_counts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    count_number VARCHAR(20) UNIQUE NOT NULL,
    plant_id UUID REFERENCES org_plants(id),
    sloc_id UUID REFERENCES org_storage_locations(id),
    count_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'planned',
    counted_by UUID REFERENCES sys_users(id),
    approved_by UUID REFERENCES sys_users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS wm_cycle_count_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_count_id UUID REFERENCES wm_cycle_counts(id) ON DELETE CASCADE,
    material_id UUID REFERENCES mm_materials(id),
    bin_id UUID,
    system_qty DECIMAL(12,3) DEFAULT 0,
    counted_qty DECIMAL(12,3),
    variance DECIMAL(12,3),
    variance_reason TEXT,
    status VARCHAR(20) DEFAULT 'pending'
  )`,

  // ===================================================
  // P4-28: E-Invoice / IRN tracking
  // ===================================================
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS irn_number VARCHAR(64)`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS irn_date TIMESTAMPTZ`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS qr_code TEXT`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS eway_bill_number VARCHAR(20)`,
  `ALTER TABLE fi_ar_invoices ADD COLUMN IF NOT EXISTS einvoice_status VARCHAR(20) DEFAULT 'pending'`,

  // ===================================================
  // P4-27: 3-way matching fields
  // ===================================================
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS match_status VARCHAR(20) DEFAULT 'unmatched'`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS matched_po_id UUID`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS matched_gr_id UUID`,
  `ALTER TABLE fi_ap_invoices ADD COLUMN IF NOT EXISTS match_variance DECIMAL(15,2) DEFAULT 0`,

  // Add NCR number range
  `INSERT INTO sys_number_ranges (object_type, prefix, current_number) VALUES ('NCR', 'NCR-', 10000) ON CONFLICT (object_type) DO NOTHING`,
  `INSERT INTO sys_number_ranges (object_type, prefix, current_number) VALUES ('CC', 'CC-', 10000) ON CONFLICT (object_type) DO NOTHING`,
];

export async function runPhase15() {
  console.log('🚀 Running Phase 15 migrations (P3/P4 features)...');
  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate'))
        console.log(`Phase 15 #${i+1}:`, err.message.substring(0, 100));
    }
  }
  console.log('✅ Phase 15 complete — NCR, Routing, Bins, Cycle Count, E-Invoice, 3-way matching');
}
