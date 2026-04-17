import { query } from '../config/database.js';

const migrations = [
  // ===================================================
  // ENHANCED PAYROLL - Indian Statutory Components
  // ===================================================
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS special_allowance DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS conveyance_allowance DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS medical_allowance DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS pf_employer DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS esi_employee DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS esi_employer DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS professional_tax DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS tds DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS loan_deduction DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS other_deductions DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS other_earnings DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payslips ADD COLUMN IF NOT EXISTS ctc DECIMAL(15,2) DEFAULT 0`,

  // Employee salary structure
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS basic_salary DECIMAL(15,2)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS hra_percent DECIMAL(5,2) DEFAULT 40`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS da_percent DECIMAL(5,2) DEFAULT 0`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS special_allowance DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS conveyance_allowance DECIMAL(15,2) DEFAULT 1600`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS medical_allowance DECIMAL(15,2) DEFAULT 1250`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS pf_applicable BOOLEAN DEFAULT true`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS esi_applicable BOOLEAN DEFAULT false`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS pt_applicable BOOLEAN DEFAULT true`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS annual_ctc DECIMAL(15,2)`,
  `ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS tax_regime VARCHAR(10) DEFAULT 'new'`,

  // Payroll journal posting
  `ALTER TABLE hr_payroll_runs ADD COLUMN IF NOT EXISTS journal_id UUID REFERENCES fi_journal_headers(id)`,
  `ALTER TABLE hr_payroll_runs ADD COLUMN IF NOT EXISTS total_employer_pf DECIMAL(15,2) DEFAULT 0`,
  `ALTER TABLE hr_payroll_runs ADD COLUMN IF NOT EXISTS total_employer_esi DECIMAL(15,2) DEFAULT 0`,
];

// Default workflow templates
const workflowTemplates = [
  {
    template_name: 'Purchase Requisition Approval',
    entity_type: 'purchase_requisition',
    description: 'Single-level approval for purchase requisitions',
    steps: [{ step: 1, role: 'PROC_MGR', label: 'Procurement Manager Approval', action: 'approve' }]
  },
  {
    template_name: 'Purchase Order Approval',
    entity_type: 'purchase_order',
    description: 'Two-level approval for purchase orders',
    steps: [
      { step: 1, role: 'PROC_MGR', label: 'Procurement Manager', action: 'approve' },
      { step: 2, role: 'FIN_MGR', label: 'Finance Manager', action: 'approve' }
    ]
  },
  {
    template_name: 'AP Invoice Approval',
    entity_type: 'ap_invoice',
    description: 'Finance manager approval for vendor invoices',
    steps: [{ step: 1, role: 'FIN_MGR', label: 'Finance Manager Approval', action: 'approve' }]
  },
  {
    template_name: 'Payment Approval',
    entity_type: 'payment',
    description: 'Two-level approval for payments above threshold',
    steps: [
      { step: 1, role: 'FIN_MGR', label: 'Finance Manager', action: 'approve' },
      { step: 2, role: 'ADMIN', label: 'Management Approval', action: 'approve' }
    ]
  },
  {
    template_name: 'Sales Order Approval',
    entity_type: 'sales_order',
    description: 'Sales manager approval for orders',
    steps: [{ step: 1, role: 'SALES_MGR', label: 'Sales Manager Approval', action: 'approve' }]
  },
];

export async function runPhase16() {
  console.log('🚀 Running Phase 16 (Approval Workflows + Indian Payroll)...');

  for (let i = 0; i < migrations.length; i++) {
    try { await query(migrations[i]); }
    catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('duplicate'))
        console.log(`Phase 16 #${i+1}:`, err.message.substring(0, 100));
    }
  }

  // Seed workflow templates — clean + re-insert to prevent duplicates
  try { await query(`DELETE FROM wf_templates WHERE template_name IN ('Purchase Requisition Approval','Purchase Order Approval','AP Invoice Approval','Payment Approval','Sales Order Approval')`); } catch {}

  for (const tpl of workflowTemplates) {
    try {
      await query(
        `INSERT INTO wf_templates (template_name, entity_type, description, steps) VALUES ($1,$2,$3,$4)`,
        [tpl.template_name, tpl.entity_type, tpl.description, JSON.stringify(tpl.steps)]);
    } catch {}
  }

  console.log('✅ Phase 16 complete — Payroll components + 5 workflow templates seeded');
}
