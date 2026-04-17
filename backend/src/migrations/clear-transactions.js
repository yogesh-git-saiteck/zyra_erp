import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });
import pool from '../config/database.js';

async function clearTransactions() {
  const client = await pool.connect();
  try {
    console.log('⚠️  NexusERP — Clear Transactional Data');
    console.log('=========================================\n');
    console.log('Keeping: users, roles, companies, plants, GL accounts,');
    console.log('         materials, business partners, price lists, work centers\n');

    // Order matters — child tables before parents
    const transactionalTables = [
      // Workflow
      'wf_approvals', 'wf_instances',

      // System logs / activity (not config)
      'sys_audit_log', 'sys_comments', 'sys_favorites',
      'sys_status_history', 'sys_attachments',
      'sys_document_amendments', 'sys_document_cancellations',
      'sys_notifications', 'sys_email_log', 'sys_email_queue',
      'sys_job_log', 'sys_page_views', 'sys_user_sessions', 'sys_api_usage_log',

      // Finance transactions
      'fi_journal_lines', 'fi_journal_headers',
      'fi_payment_allocations', 'fi_payments',
      'fi_ap_invoice_items', 'fi_ap_invoices',
      'fi_ar_invoice_items', 'fi_ar_invoices',
      'fi_credit_notes', 'fi_credit_holds',
      'fi_tax_transactions',
      'fi_bank_statement_lines', 'fi_bank_statements',
      'fi_budget_lines', 'fi_budgets',
      'fi_gst_returns',

      // Sales transactions
      'sd_return_items', 'sd_returns',
      'sd_delivery_items', 'sd_deliveries',
      'sd_billing',
      'sd_so_items', 'sd_sales_orders',
      'sd_quotation_items', 'sd_quotations',

      // Procurement transactions
      'pur_gr_items', 'pur_goods_receipts',
      'pur_po_items', 'pur_purchase_orders',
      'pur_rfq_items', 'pur_rfq',
      'pur_requisition_items', 'pur_requisitions',

      // Inventory & stock
      'inv_stock_movements', 'inv_stock',
      'inv_serial_numbers', 'inv_batches',

      // Production orders (keep BOMs and work centers as master data)
      'pp_mrp_results', 'pp_mrp_runs',
      'pp_production_orders',

      // Warehouse movements (keep bin setup)
      'wm_cycle_count_items', 'wm_cycle_counts',

      // Quality
      'qm_inspection_criteria', 'qm_inspection_lots', 'qm_ncr',

      // HR transactions (keep employee records as master data)
      'hr_payslips', 'hr_payroll_items', 'hr_payroll_runs',
      'hr_expense_items', 'hr_expense_claims',
      'hr_attendance', 'hr_leave_requests',

      // Projects
      'ps_project_milestones', 'ps_project_tasks',
      'ps_wbs_elements', 'ps_projects',

      // CRM transactions
      'crm_activities', 'crm_opportunities',

      // Assets & depreciation
      'am_depreciation_runs', 'am_assets',

      // Maintenance orders
      'pm_maintenance_orders',

      // Transport
      'tm_shipment_items', 'tm_shipments',

      // Integration execution logs (keep connections/config)
      'int_execution_log',

      // AI / analytics
      'ai_anomalies', 'ai_predictions',
      'ic_transactions',

      // Portal users
      'sys_portal_users',
    ];

    console.log(`🗑️  Truncating ${transactionalTables.length} transactional tables...\n`);

    let cleared = 0;
    let skipped = 0;
    for (const table of transactionalTables) {
      try {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`   ✓ ${table}`);
        cleared++;
      } catch (e) {
        if (e.message.includes('does not exist')) {
          console.log(`   - ${table} (not found, skipping)`);
          skipped++;
        } else {
          console.log(`   ⚠ ${table}: ${e.message}`);
        }
      }
    }

    // Reset number ranges back to start so document numbers restart cleanly
    console.log('\n🔢 Resetting number ranges...');
    try {
      const nr = await client.query(`UPDATE sys_number_ranges SET current_number = prefix_start WHERE prefix_start IS NOT NULL`);
      if (nr.rowCount === 0) {
        await client.query(`UPDATE sys_number_ranges SET current_number = 10000`);
      }
      console.log(`   ✓ Number ranges reset`);
    } catch {
      try {
        await client.query(`UPDATE sys_number_ranges SET current_number = 10000`);
        console.log(`   ✓ Number ranges reset to 10000`);
      } catch (e2) {
        console.log(`   ⚠ Could not reset number ranges: ${e2.message}`);
      }
    }

    console.log('\n=========================================');
    console.log('✅ Transactional data cleared!');
    console.log('=========================================\n');
    console.log(`   Cleared : ${cleared} tables`);
    console.log(`   Skipped : ${skipped} tables (not found)\n`);
    console.log('Preserved master data:');
    console.log('   • sys_users, sys_roles');
    console.log('   • org_companies, org_plants, org_storage_locations');
    console.log('   • bp_business_partners, bp_contacts');
    console.log('   • mm_materials, mm_material_plant_data');
    console.log('   • fi_gl_accounts, fi_chart_of_accounts, fi_bank_accounts');
    console.log('   • sd_price_lists, sd_price_list_items');
    console.log('   • pp_bom_headers, pp_bom_items, pp_work_centers');
    console.log('   • hr_employees (attendance/leave cleared)');
    console.log('   • wm_bins, int_connections\n');

  } catch (e) {
    console.error('❌ Failed:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

clearTransactions();
