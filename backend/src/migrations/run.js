import dotenv from 'dotenv';
dotenv.config();

import { runMigrations } from './schema.js';
import { seedDatabase } from './seed.js';
import { runPhase8Migrations } from './phase8.js';
import { runPhase9Migrations } from './phase9.js';
import { runPhase10Migrations } from './phase10.js';
import { runPhase11Migrations } from './phase11.js';
import { runPhase12Migrations } from './phase12.js';
import { runPhase13 } from './phase13.js';
import { runPhase14 } from './phase14.js';
import { runPhase15 } from './phase15.js';
import { runPhase16 } from './phase16.js';
import { runPhase17 } from './phase17.js';
import { runPhase18 } from './phase18.js';
import { fixMissingColumns, ensureGLMapping, ensureStockMovementCols, ensureBudgetMrpCols, ensurePettyCash, ensurePCNumberRange, ensureSalesProfitCenter, fixDefaultCurrency, ensurePOItemGstRate, ensureServiceMaster } from './columnFixer.js';
import pool from '../config/database.js';

async function run() {
  try {
    await runMigrations();
    await runPhase8Migrations();
    await runPhase9Migrations();
    await runPhase10Migrations();
    await runPhase11Migrations();
    await runPhase12Migrations();
    await runPhase13();
    await runPhase14();
    await runPhase15();
    await runPhase16();
    await runPhase17();
    await runPhase18();
    await fixMissingColumns(); // Ensures ALL columns exist — safety net
    await ensureGLMapping(pool);
    await ensureStockMovementCols(pool);
    await ensureBudgetMrpCols(pool);
    await ensurePettyCash(pool);
    await ensurePCNumberRange(pool);
    await ensureSalesProfitCenter(pool);
    await fixDefaultCurrency(pool);
    await ensurePOItemGstRate(pool);
    await ensureServiceMaster(pool);
    try { const { ensureBudgetColumns } = await import('./columnFixer.js'); await ensureBudgetColumns(pool); } catch {} // GL mapping table for auto-JE
    await seedDatabase();
    console.log('🎉 Database setup complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
