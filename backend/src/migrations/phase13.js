import { query } from '../config/database.js';

const migrations = [
  // Add plant_id to sd_deliveries
  `ALTER TABLE sd_deliveries ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,

  // Create sd_delivery_items for tracking what was delivered per SO item
  `CREATE TABLE IF NOT EXISTS sd_delivery_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID REFERENCES sd_deliveries(id) ON DELETE CASCADE,
    so_item_id UUID REFERENCES sd_so_items(id),
    material_id UUID REFERENCES mm_materials(id),
    quantity DECIMAL(12,3) NOT NULL,
    uom_id UUID REFERENCES mm_units_of_measure(id),
    batch_number VARCHAR(30),
    serial_number VARCHAR(50),
    sloc_id UUID REFERENCES org_storage_locations(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Add plant_id to pp_production_orders if missing
  `ALTER TABLE pp_production_orders ADD COLUMN IF NOT EXISTS plant_id UUID REFERENCES org_plants(id)`,

  // Add partially_received to doc_status enum if not exists
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'partially_received' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'doc_status')) THEN
      ALTER TYPE doc_status ADD VALUE 'partially_received';
    END IF;
  END $$`,

  // Add delivered status to doc_status if not exists
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'delivered' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'doc_status')) THEN
      ALTER TYPE doc_status ADD VALUE 'delivered';
    END IF;
  END $$`,
];

export async function runPhase13() {
  console.log('🚀 Running Phase 13 migrations (cross-module data flow)...');
  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
    } catch (err) {
      // Silently skip if already exists
      if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
        console.log(`Phase 13 migration ${i + 1} note:`, err.message);
      }
    }
  }
  console.log('✅ Phase 13 migrations complete');
}
