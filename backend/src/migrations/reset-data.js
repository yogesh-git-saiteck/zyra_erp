import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import bcrypt from 'bcryptjs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });
import pool from '../config/database.js';

async function resetData() {
  const client = await pool.connect();
  try {
    console.log('⚠️  Zyra Full Database Reset');
    console.log('=================================\n');

    // ==========================================
    // STEP 1: TRUNCATE every data table
    // ==========================================
    console.log('🗑️  Truncating all tables...');
    const tables = [
      'wf_approvals','wf_instances',
      'sys_page_views','sys_user_sessions','sys_api_usage_log','sys_versions','sys_notifications',
      'sys_email_log','sys_email_queue','sys_import_log','sys_job_log','sys_audit_log',
      'sys_comments','sys_favorites','sys_status_history','sys_attachments',
      'sys_document_amendments','sys_document_cancellations','sys_sessions',
      'fi_journal_lines','fi_journal_headers','fi_payment_allocations','fi_payments',
      'fi_ap_invoice_items','fi_ap_invoices','fi_ar_invoice_items','fi_ar_invoices',
      'fi_credit_notes','fi_credit_holds','fi_tax_transactions',
      'fi_bank_statement_lines','fi_bank_statements','fi_bank_accounts',
      'fi_budget_lines','fi_budgets','fi_gst_returns',
      'fi_gl_accounts','fi_chart_of_accounts',
      'sd_return_items','sd_returns','sd_delivery_items','sd_deliveries','sd_billing',
      'sd_so_items','sd_sales_orders','sd_quotation_items','sd_quotations',
      'sd_price_list_items','sd_price_lists',
      'pur_gr_items','pur_goods_receipts','pur_po_items','pur_purchase_orders',
      'pur_rfq_items','pur_rfq','pur_requisition_items','pur_requisitions',
      'inv_stock_movements','inv_stock','inv_serial_numbers','inv_batches',
      'pp_mrp_results','pp_mrp_runs','pp_routing_operations','pp_routings',
      'pp_production_orders','pp_bom_items','pp_bom_headers','pp_work_centers',
      'wm_cycle_count_items','wm_cycle_counts','wm_bins',
      'qm_inspection_criteria','qm_inspection_lots','qm_ncr',
      'hr_payslips','hr_payroll_items','hr_payroll_runs',
      'hr_expense_items','hr_expense_claims','hr_attendance','hr_leave_requests','hr_employees',
      'ps_project_milestones','ps_project_tasks','ps_wbs_elements','ps_projects',
      'crm_activities','crm_opportunities',
      'am_depreciation_runs','am_assets',
      'pm_maintenance_orders',
      'tm_shipment_items','tm_shipments','tm_vehicles','tm_carriers',
      'int_execution_log','int_flows','int_webhooks','int_api_keys','int_connections',
      'ic_transactions','ai_anomalies','ai_predictions','sys_portal_users',
      'bp_contacts','bp_bank_details','bp_business_partners',
      'mm_material_plant_data','mm_material_pricing','mm_materials',
      'org_storage_locations','org_sales_organizations','org_cost_centers',
      'org_profit_centers','org_distribution_channels','org_divisions',
      'org_business_areas','org_plants','org_companies',
      'sys_users',
    ];
    let ok = 0;
    for (const t of tables) {
      try { await client.query(`TRUNCATE TABLE ${t} CASCADE`); ok++; }
      catch (e) { if (!e.message.includes('does not exist')) console.log(`   ⚠ ${t}: ${e.message}`); }
    }
    console.log(`   ✓ ${ok} tables truncated\n`);

    // ==========================================
    // STEP 2: Re-create ADMIN role with full access
    // ==========================================
    console.log('🔑 Creating ADMIN role...');
    // Clear roles first then re-create just ADMIN
    try { await client.query(`DELETE FROM sys_roles WHERE role_code != 'ADMIN'`); } catch {}
    const roleCheck = await client.query(`SELECT id FROM sys_roles WHERE role_code = 'ADMIN'`);
    let roleId;
    if (roleCheck.rows.length) {
      roleId = roleCheck.rows[0].id;
      await client.query(`UPDATE sys_roles SET permissions = '{"all": true}', role_name = 'System Administrator' WHERE id = $1`, [roleId]);
    } else {
      const r = await client.query(
        `INSERT INTO sys_roles (role_code, role_name, description, permissions, is_system)
         VALUES ('ADMIN', 'System Administrator', 'Full access to all modules', '{"all": true}', true)
         RETURNING id`);
      roleId = r.rows[0].id;
    }
    console.log(`   ✅ ADMIN role ready (full access)\n`);

    // ==========================================
    // STEP 3: Create admin user
    // ==========================================
    console.log('👤 Creating admin user...');
    const hash = await bcrypt.hash('admin123', 12);
    await client.query(
      `INSERT INTO sys_users (username, email, password_hash, first_name, last_name, role_id, status)
       VALUES ('admin', 'admin@zyra.com', $1, 'System', 'Administrator', $2, 'active')`,
      [hash, roleId]);
    console.log(`   ✅ admin / admin123 created\n`);

    // ==========================================
    // STEP 4: Re-seed module config (sidebar needs this to show pages)
    // ==========================================
    console.log('📋 Seeding module config (required for sidebar)...');
    const modules = [
      ['dashboard', 'Dashboard', '📊', 'core', true, true, 1],
      ['finance', 'Finance', '💰', 'core', true, true, 2],
      ['sales', 'Sales & Distribution', '📈', 'core', true, true, 3],
      ['master-data', 'Master Data', '📋', 'core', true, true, 4],
      ['inventory', 'Inventory', '📦', 'core', true, true, 5],
      ['settings', 'Settings & Admin', '⚙️', 'core', true, true, 100],
      ['procurement', 'Procurement', '🛒', 'optional', false, true, 6],
      ['production', 'Production Planning', '🏭', 'optional', false, true, 7],
      ['warehouse', 'Warehouse Management', '🏬', 'optional', false, true, 8],
      ['assets', 'Asset Management', '🖥️', 'optional', false, true, 9],
      ['hr', 'Human Resources', '👥', 'optional', false, true, 10],
      ['crm', 'CRM', '🤝', 'optional', false, true, 11],
      ['projects', 'Project System', '📁', 'optional', false, true, 12],
      ['quality', 'Quality Management', '✅', 'optional', false, true, 13],
      ['maintenance', 'Plant Maintenance', '🔧', 'optional', false, true, 14],
      ['transport', 'Transport Management', '🚚', 'optional', false, true, 15],
    ];
    try { await client.query(`TRUNCATE TABLE sys_module_config CASCADE`); } catch {}
    for (const [key, name, icon, cat, mandatory, enabled, sort] of modules) {
      await client.query(
        `INSERT INTO sys_module_config (module_key, module_name, icon, category, is_mandatory, is_enabled, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (module_key) DO UPDATE SET is_enabled = $6`,
        [key, name, icon, cat, mandatory, enabled, sort]);
    }
    console.log(`   ✅ ${modules.length} modules configured (all enabled)\n`);

    // ==========================================
    // STEP 5: Reset number ranges
    // ==========================================
    console.log('🔢 Resetting number ranges...');
    try { const nr = await client.query(`UPDATE sys_number_ranges SET current_number = 10000`); console.log(`   ✓ ${nr.rowCount} ranges reset to 10000\n`); }
    catch { console.log('   ⚠ No number ranges to reset\n'); }

    // ==========================================
    // DONE
    // ==========================================
    console.log('============================================');
    console.log('🎉 Database fully reset — clean slate!');
    console.log('============================================\n');
    console.log('✅ Login: admin / admin123 (full access to all pages)\n');
    console.log('🗑️  Deleted: ALL data — companies, plants, GL accounts, users,');
    console.log('   materials, business partners, employees, transactions, everything.\n');
    console.log('⚠️  No demo data. Create everything from scratch:');
    console.log('   1. Login as admin');
    console.log('   2. Settings → Organization → Create Company');
    console.log('   3. Create Plants under Company');
    console.log('   4. Create Storage Locations under Plants');
    console.log('   5. Finance → GL Accounts → Set up Chart of Accounts');
    console.log('   6. Settings → Users & Roles → Create users');
    console.log('   7. Master Data → Business Partners, Materials');
    console.log('   8. Start transacting\n');

  } catch (e) { console.error('❌ Failed:', e.message); }
  finally { client.release(); await pool.end(); }
}
resetData();
