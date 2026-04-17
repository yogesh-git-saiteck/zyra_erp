import { useState, useEffect, useCallback } from 'react';
import {
  Settings2, Factory, ShoppingCart, Package, DollarSign, TrendingUp,
  Users, Star, Shield, Warehouse, CheckCircle2, AlertCircle, Loader2, Info,
  Cpu, FolderKanban, Wrench, Truck, GitMerge,
} from 'lucide-react';
import { Alert } from '../../components/common/index';
import api from '../../utils/api';

// ─── Module definitions ────────────────────────────────────────────────────────
const MODULES = [
  { key: 'production',  label: 'Production',  icon: Factory,     color: 'text-violet-600',  border: 'border-violet-500' },
  { key: 'sales',       label: 'Sales',        icon: TrendingUp,  color: 'text-blue-600',    border: 'border-blue-500' },
  { key: 'procurement', label: 'Procurement',  icon: ShoppingCart,color: 'text-amber-600',   border: 'border-amber-500' },
  { key: 'inventory',   label: 'Inventory',    icon: Package,     color: 'text-emerald-600', border: 'border-emerald-500' },
  { key: 'finance',     label: 'Finance',      icon: DollarSign,  color: 'text-rose-600',    border: 'border-rose-500' },
  { key: 'hr',          label: 'HR',           icon: Users,       color: 'text-indigo-600',  border: 'border-indigo-500' },
  { key: 'crm',         label: 'CRM',          icon: Star,        color: 'text-pink-600',    border: 'border-pink-500' },
  { key: 'quality',     label: 'Quality',      icon: Shield,      color: 'text-teal-600',    border: 'border-teal-500' },
  { key: 'warehouse',   label: 'Warehouse',    icon: Warehouse,   color: 'text-orange-600',  border: 'border-orange-500' },
  { key: 'assets',      label: 'Assets',       icon: Cpu,         color: 'text-cyan-600',    border: 'border-cyan-500' },
  { key: 'projects',    label: 'Projects',     icon: FolderKanban,color: 'text-lime-600',    border: 'border-lime-500' },
  { key: 'maintenance', label: 'Maintenance',  icon: Wrench,      color: 'text-yellow-600',  border: 'border-yellow-500' },
  { key: 'transport',   label: 'Transport',    icon: Truck,       color: 'text-sky-600',     border: 'border-sky-500' },
  { key: 'logistics',   label: 'Logistics',    icon: GitMerge,    color: 'text-fuchsia-600', border: 'border-fuchsia-500' },
];

// ─── Config metadata ───────────────────────────────────────────────────────────
const META = {
  // PRODUCTION
  'production.planning_strategy': {
    label: 'Planning Strategy', type: 'select',
    options: [
      { value: 'MTS',   label: 'MTS — Make-to-Stock (build for inventory)' },
      { value: 'MTO',   label: 'MTO — Make-to-Order (build only on customer orders)' },
      { value: 'MIXED', label: 'MIXED — Per-material strategy (set on material master)' },
    ],
  },
  'production.auto_create_order_on_so':     { label: 'Auto-create production order on SO confirm (MTO)', type: 'bool' },
  'production.mrp_consider_safety_stock':   { label: 'MRP: include safety stock in net requirements', type: 'bool' },
  'production.mrp_consider_open_po':        { label: 'MRP: count open POs as available supply', type: 'bool' },
  'production.mrp_consider_reorder_points': { label: 'MRP: generate reorder alerts for MTS materials', type: 'bool' },
  'production.default_lead_time_days':      { label: 'Default lead time (days)', type: 'number', min: 1, max: 365 },
  'production.allow_partial_completion':    { label: 'Allow partial quantity completion on production orders', type: 'bool' },
  'production.require_routing_on_order':    { label: 'Require routing before confirming production order', type: 'bool' },
  'production.scrap_auto_write_off':        { label: 'Auto-post stock write-off journal on scrap recording', type: 'bool' },
  // SALES
  'sales.require_availability_check':       { label: 'Block SO confirmation if stock is insufficient', type: 'bool' },
  'sales.credit_limit_check':               { label: 'Block SO confirmation if customer credit limit is exceeded', type: 'bool' },
  'sales.require_customer_po_number':       { label: 'Require customer PO number before SO confirmation', type: 'bool' },
  'sales.allow_partial_delivery':           { label: 'Allow partial deliveries (deliver less than ordered)', type: 'bool' },
  'sales.auto_invoice_on_delivery':         { label: 'Auto-create invoice when delivery is completed', type: 'bool' },
  'sales.auto_create_delivery_on_confirm':  { label: 'Auto-create delivery document on SO confirmation', type: 'bool' },
  'sales.allow_so_edit_after_confirm':      { label: 'Allow editing SO header after confirmation', type: 'bool' },
  'sales.default_payment_terms_days':       { label: 'Default invoice payment terms (days)', type: 'number', min: 0, max: 365 },
  'sales.default_delivery_days':            { label: 'Default delivery lead time (days)', type: 'number', min: 0, max: 365 },
  'sales.mto_auto_trigger_production':      { label: 'Auto-trigger MRP run on SO confirmation', type: 'bool' },
  // PROCUREMENT
  'procurement.auto_create_pr_from_mrp':    { label: 'Auto-create purchase requisitions from MRP shortages', type: 'bool' },
  'procurement.default_payment_terms_days': { label: 'Default PO payment terms (days)', type: 'number', min: 0, max: 365 },
  'procurement.require_approval_above':     { label: 'Require approval for PR/PO above this value (0 = always)', type: 'number', min: 0 },
  'procurement.auto_approve_below':         { label: 'Auto-approve PRs below this value (0 = disabled)', type: 'number', min: 0 },
  'procurement.allow_partial_gr':           { label: 'Allow partial goods receipt against a PO line', type: 'bool' },
  'procurement.three_way_matching':         { label: 'Enforce 3-way match (PO → GR → Invoice) before payment', type: 'bool' },
  'procurement.gr_qty_tolerance_percent':   { label: 'GR quantity tolerance over PO (%)', type: 'number', min: 0, max: 100 },
  'procurement.auto_create_po_from_pr':     { label: 'Auto-convert approved PRs to draft purchase orders', type: 'bool' },
  // INVENTORY
  'inventory.negative_stock_allowed':       { label: 'Allow negative stock (backflushing / real-time posting)', type: 'bool' },
  'inventory.valuation_method': {
    label: 'Stock valuation method', type: 'select',
    options: [
      { value: 'FIFO', label: 'FIFO — First In, First Out' },
      { value: 'LIFO', label: 'LIFO — Last In, First Out' },
      { value: 'AVCO', label: 'AVCO — Average Cost' },
    ],
  },
  'inventory.auto_reserve_on_so':           { label: 'Auto-reserve (soft-allocate) stock on SO confirmation', type: 'bool' },
  'inventory.low_stock_alert_enabled':      { label: 'Show low-stock alerts when below reorder point', type: 'bool' },
  'inventory.batch_tracking_enabled':       { label: 'Enable batch/lot tracking on stock movements', type: 'bool' },
  'inventory.serial_tracking_enabled':      { label: 'Enable serial number tracking for individual units', type: 'bool' },
  // FINANCE
  'finance.auto_post_goods_receipt':             { label: 'Auto-post GL journal on goods receipt (Dr Inventory / Cr Payables)', type: 'bool' },
  'finance.auto_post_invoice':                   { label: 'Auto-post GL journal when AR/AP invoice is created', type: 'bool' },
  'finance.auto_post_delivery':                  { label: 'Auto-post COGS journal on goods delivery (Dr COGS / Cr Inventory)', type: 'bool' },
  'finance.auto_post_production_completion':     { label: 'Auto-post production cost journal on order completion', type: 'bool' },
  'finance.require_cost_center_on_journal':      { label: 'Require cost center on all manual journal entry lines', type: 'bool' },
  'finance.multi_currency_enabled':              { label: 'Enable multi-currency transactions', type: 'bool' },
  'finance.tax_inclusive_pricing':               { label: 'Prices entered are tax-inclusive (back-calculate tax)', type: 'bool' },
  'finance.bank_reconciliation_tolerance':       { label: 'Bank reconciliation auto-match tolerance (0 = exact)', type: 'number', min: 0 },
  'finance.auto_allocate_payment':               { label: 'Auto-allocate payments to oldest outstanding invoices', type: 'bool' },
  'finance.fiscal_year_start_month':             { label: 'Fiscal year start month (1=Jan, 4=Apr)', type: 'number', min: 1, max: 12 },
  // HR
  'hr.overtime_enabled':              { label: 'Allow overtime hours recording for payroll', type: 'bool' },
  'hr.overtime_rate_multiplier':      { label: 'Overtime pay rate multiplier (e.g. 1.5 = time-and-a-half)', type: 'number', min: 1, max: 5, step: '0.1' },
  'hr.leave_approval_required':       { label: 'Require manager approval before leave is granted', type: 'bool' },
  'hr.payroll_frequency': {
    label: 'Payroll frequency', type: 'select',
    options: [
      { value: 'monthly',   label: 'Monthly' },
      { value: 'biweekly',  label: 'Bi-weekly' },
      { value: 'weekly',    label: 'Weekly' },
    ],
  },
  'hr.attendance_based_payroll':       { label: 'Deduct pay for absences based on attendance records', type: 'bool' },
  'hr.probation_period_days':          { label: 'Default employee probation period (days)', type: 'number', min: 0, max: 730 },
  'hr.expense_approval_required':      { label: 'Require approval before expense claims are reimbursed', type: 'bool' },
  'hr.expense_limit_per_claim':        { label: 'Maximum per expense claim (0 = no limit)', type: 'number', min: 0 },
  'hr.auto_increment_leave_balance':   { label: 'Auto-accrue leave balance each month', type: 'bool' },
  // CRM
  'crm.lead_auto_assign':             { label: 'Auto-assign new leads round-robin to sales reps', type: 'bool' },
  'crm.follow_up_reminder_days':      { label: 'Follow-up reminder after X days of inactivity', type: 'number', min: 0 },
  'crm.auto_convert_lead_on_win':     { label: 'Auto-convert lead to customer (BP) when marked as won', type: 'bool' },
  'crm.require_close_reason':         { label: 'Require a reason when closing or losing an opportunity', type: 'bool' },
  'crm.opportunity_probability_calc': {
    label: 'Win probability calculation', type: 'select',
    options: [
      { value: 'manual', label: 'Manual — user enters probability' },
      { value: 'stage',  label: 'Stage — derived from pipeline stage' },
    ],
  },
  // QUALITY
  'quality.inspection_on_gr':           { label: 'Trigger quality inspection automatically on goods receipt', type: 'bool' },
  'quality.inspection_on_production':   { label: 'Trigger quality inspection on production order completion', type: 'bool' },
  'quality.allow_delivery_without_qc':  { label: 'Allow delivery before quality inspection is completed', type: 'bool' },
  'quality.defect_threshold_percent':   { label: 'Acceptable defect rate (%) before non-conformance alert', type: 'number', min: 0, max: 100 },
  'quality.auto_reject_on_threshold':   { label: 'Auto-reject batch when defect rate exceeds threshold', type: 'bool' },
  // WAREHOUSE
  'warehouse.bin_management_enabled':   { label: 'Enable bin/shelf location tracking within storage locations', type: 'bool' },
  'warehouse.pick_confirm_required':    { label: 'Require picker to confirm each pick before stock reduction', type: 'bool' },
  'warehouse.put_away_strategy': {
    label: 'Bin put-away strategy', type: 'select',
    options: [
      { value: 'FIFO',    label: 'FIFO — Oldest stock first' },
      { value: 'FEFO',    label: 'FEFO — Earliest expiry first' },
      { value: 'nearest', label: 'Nearest — closest available bin' },
    ],
  },
  'warehouse.packing_slip_required':    { label: 'Require packing slip confirmation before dispatch', type: 'bool' },
  'warehouse.auto_print_labels':        { label: 'Auto-print barcode/QR labels on stock receipt', type: 'bool' },
  // ASSETS
  'assets.depreciation_method': {
    label: 'Depreciation method', type: 'select',
    options: [
      { value: 'straight_line',      label: 'Straight Line (SLM)' },
      { value: 'declining_balance',  label: 'Declining Balance (WDV)' },
      { value: 'sum_of_years',       label: 'Sum of Years Digits' },
    ],
  },
  'assets.auto_post_depreciation':       { label: 'Auto-post monthly depreciation journal entries', type: 'bool' },
  'assets.depreciation_frequency': {
    label: 'Depreciation posting frequency', type: 'select',
    options: [
      { value: 'monthly',   label: 'Monthly' },
      { value: 'quarterly', label: 'Quarterly' },
      { value: 'annually',  label: 'Annually' },
    ],
  },
  'assets.capitalization_threshold':     { label: 'Capitalization threshold — expense items below this value', type: 'number', min: 0 },
  'assets.require_location_on_asset':    { label: 'Require physical location before activating an asset', type: 'bool' },
  'assets.disposal_requires_approval':   { label: 'Require approval before asset disposal or write-off', type: 'bool' },
  'assets.auto_create_from_gr':          { label: 'Auto-create asset record when capital goods are received via GR', type: 'bool' },
  'assets.useful_life_alert_days':       { label: 'Alert X days before asset reaches end of useful life', type: 'number', min: 0 },
  // PROJECTS
  'projects.budget_overrun_action': {
    label: 'On budget overrun', type: 'select',
    options: [
      { value: 'warn',  label: 'Warn — allow with alert' },
      { value: 'block', label: 'Block — prevent posting' },
    ],
  },
  'projects.auto_close_on_completion':   { label: 'Auto-close project when all tasks are complete', type: 'bool' },
  'projects.require_timesheet_approval': { label: 'Require approval for timesheet entries before hours post', type: 'bool' },
  'projects.allow_billing_without_po':   { label: 'Allow project billing without customer PO reference', type: 'bool' },
  'projects.default_billing_type': {
    label: 'Default billing type', type: 'select',
    options: [
      { value: 'fixed',          label: 'Fixed Price' },
      { value: 'time_materials', label: 'Time & Materials' },
      { value: 'milestone',      label: 'Milestone-based' },
    ],
  },
  'projects.timesheet_frequency': {
    label: 'Timesheet submission frequency', type: 'select',
    options: [
      { value: 'daily',    label: 'Daily' },
      { value: 'weekly',   label: 'Weekly' },
      { value: 'biweekly', label: 'Bi-weekly' },
    ],
  },
  'projects.cost_tracking_enabled':      { label: 'Enable project cost tracking (labour, materials, overheads)', type: 'bool' },
  // MAINTENANCE
  'maintenance.preventive_enabled':       { label: 'Enable preventive maintenance schedules', type: 'bool' },
  'maintenance.auto_create_wo_on_alert':  { label: 'Auto-create work order when asset maintenance alert triggers', type: 'bool' },
  'maintenance.require_spare_parts_check':{ label: 'Check spare parts stock before starting a work order', type: 'bool' },
  'maintenance.downtime_tracking':        { label: 'Track machine downtime duration per work order', type: 'bool' },
  'maintenance.wo_approval_required':     { label: 'Require supervisor approval before starting a work order', type: 'bool' },
  'maintenance.default_priority': {
    label: 'Default work order priority', type: 'select',
    options: [
      { value: 'low',      label: 'Low' },
      { value: 'medium',   label: 'Medium' },
      { value: 'high',     label: 'High' },
      { value: 'critical', label: 'Critical' },
    ],
  },
  'maintenance.sla_hours_critical':       { label: 'SLA response time for Critical priority (hours)', type: 'number', min: 1 },
  'maintenance.sla_hours_high':           { label: 'SLA response time for High priority (hours)', type: 'number', min: 1 },
  // TRANSPORT
  'transport.route_optimization_enabled': { label: 'Enable automatic route optimization for trips', type: 'bool' },
  'transport.gps_tracking_enabled':       { label: 'Enable GPS/live tracking for vehicles', type: 'bool' },
  'transport.driver_license_check':       { label: 'Validate driver license validity before assigning to trip', type: 'bool' },
  'transport.vehicle_fitness_check':      { label: 'Check vehicle fitness certificate before assigning to trip', type: 'bool' },
  'transport.auto_assign_vehicle':        { label: 'Auto-assign nearest available vehicle to new trips', type: 'bool' },
  'transport.fuel_log_required':          { label: 'Require fuel log entry before closing a completed trip', type: 'bool' },
  'transport.max_load_enforcement':       { label: 'Block trip if cargo weight exceeds vehicle max load', type: 'bool' },
  // LOGISTICS
  'logistics.gate_pass_required':         { label: 'Require approved gate pass for all material movements', type: 'bool' },
  'logistics.auto_gate_pass_on_delivery': { label: 'Auto-generate outward gate pass on delivery confirmation', type: 'bool' },
  'logistics.auto_gate_pass_on_gr':       { label: 'Auto-generate inward gate pass on goods receipt', type: 'bool' },
  'logistics.gate_pass_expiry_hours':     { label: 'Gate pass validity in hours (0 = no expiry)', type: 'number', min: 0 },
  'logistics.vehicle_log_required':       { label: 'Require vehicle in/out log at gate for every movement', type: 'bool' },
  'logistics.visitor_pass_enabled':       { label: 'Enable visitor pass management at gate', type: 'bool' },
};

// ─── Section grouping per module ──────────────────────────────────────────────
const SECTIONS = {
  production: [
    { heading: 'Planning Strategy',   keys: ['production.planning_strategy', 'production.auto_create_order_on_so'] },
    { heading: 'MRP Settings',        keys: ['production.mrp_consider_safety_stock', 'production.mrp_consider_open_po', 'production.mrp_consider_reorder_points', 'production.default_lead_time_days'] },
    { heading: 'Production Orders',   keys: ['production.allow_partial_completion', 'production.require_routing_on_order', 'production.scrap_auto_write_off'] },
  ],
  sales: [
    { heading: 'Order Confirmation',  keys: ['sales.require_availability_check', 'sales.credit_limit_check', 'sales.require_customer_po_number'] },
    { heading: 'Delivery',            keys: ['sales.allow_partial_delivery', 'sales.auto_create_delivery_on_confirm', 'sales.auto_invoice_on_delivery'] },
    { heading: 'Defaults',            keys: ['sales.default_payment_terms_days', 'sales.default_delivery_days', 'sales.allow_so_edit_after_confirm', 'sales.mto_auto_trigger_production'] },
  ],
  procurement: [
    { heading: 'Requisitions',        keys: ['procurement.require_approval_above', 'procurement.auto_approve_below', 'procurement.auto_create_pr_from_mrp', 'procurement.auto_create_po_from_pr'] },
    { heading: 'Goods Receipt',       keys: ['procurement.allow_partial_gr', 'procurement.gr_qty_tolerance_percent', 'procurement.three_way_matching'] },
    { heading: 'Defaults',            keys: ['procurement.default_payment_terms_days'] },
  ],
  inventory: [
    { heading: 'Stock Control',       keys: ['inventory.negative_stock_allowed', 'inventory.auto_reserve_on_so', 'inventory.low_stock_alert_enabled'] },
    { heading: 'Valuation & Tracking',keys: ['inventory.valuation_method', 'inventory.batch_tracking_enabled', 'inventory.serial_tracking_enabled'] },
  ],
  finance: [
    { heading: 'Auto-Posting',        keys: ['finance.auto_post_goods_receipt', 'finance.auto_post_invoice', 'finance.auto_post_delivery', 'finance.auto_post_production_completion'] },
    { heading: 'Journal Entries',     keys: ['finance.require_cost_center_on_journal'] },
    { heading: 'Payments',            keys: ['finance.auto_allocate_payment', 'finance.bank_reconciliation_tolerance'] },
    { heading: 'Currency & Tax',      keys: ['finance.multi_currency_enabled', 'finance.tax_inclusive_pricing'] },
    { heading: 'Fiscal Year',         keys: ['finance.fiscal_year_start_month'] },
  ],
  hr: [
    { heading: 'Payroll',             keys: ['hr.payroll_frequency', 'hr.overtime_enabled', 'hr.overtime_rate_multiplier', 'hr.attendance_based_payroll'] },
    { heading: 'Leave & Attendance',  keys: ['hr.leave_approval_required', 'hr.auto_increment_leave_balance'] },
    { heading: 'Employees',           keys: ['hr.probation_period_days'] },
    { heading: 'Expenses',            keys: ['hr.expense_approval_required', 'hr.expense_limit_per_claim'] },
  ],
  crm: [
    { heading: 'Leads',               keys: ['crm.lead_auto_assign', 'crm.follow_up_reminder_days'] },
    { heading: 'Opportunities',       keys: ['crm.opportunity_probability_calc', 'crm.require_close_reason', 'crm.auto_convert_lead_on_win'] },
  ],
  quality: [
    { heading: 'Inspection Triggers', keys: ['quality.inspection_on_gr', 'quality.inspection_on_production'] },
    { heading: 'Thresholds',          keys: ['quality.defect_threshold_percent', 'quality.auto_reject_on_threshold'] },
    { heading: 'Delivery',            keys: ['quality.allow_delivery_without_qc'] },
  ],
  warehouse: [
    { heading: 'Location Management', keys: ['warehouse.bin_management_enabled', 'warehouse.put_away_strategy'] },
    { heading: 'Operations',          keys: ['warehouse.pick_confirm_required', 'warehouse.packing_slip_required', 'warehouse.auto_print_labels'] },
  ],
  assets: [
    { heading: 'Depreciation',       keys: ['assets.depreciation_method', 'assets.depreciation_frequency', 'assets.auto_post_depreciation'] },
    { heading: 'Capitalisation',     keys: ['assets.capitalization_threshold', 'assets.auto_create_from_gr'] },
    { heading: 'Lifecycle',          keys: ['assets.require_location_on_asset', 'assets.disposal_requires_approval', 'assets.useful_life_alert_days'] },
  ],
  projects: [
    { heading: 'Budget & Billing',   keys: ['projects.budget_overrun_action', 'projects.allow_billing_without_po', 'projects.default_billing_type'] },
    { heading: 'Time Tracking',      keys: ['projects.timesheet_frequency', 'projects.require_timesheet_approval'] },
    { heading: 'Operations',         keys: ['projects.cost_tracking_enabled', 'projects.auto_close_on_completion'] },
  ],
  maintenance: [
    { heading: 'Work Orders',        keys: ['maintenance.preventive_enabled', 'maintenance.auto_create_wo_on_alert', 'maintenance.wo_approval_required', 'maintenance.default_priority'] },
    { heading: 'Execution',          keys: ['maintenance.require_spare_parts_check', 'maintenance.downtime_tracking'] },
    { heading: 'SLA',                keys: ['maintenance.sla_hours_critical', 'maintenance.sla_hours_high'] },
  ],
  transport: [
    { heading: 'Trip Management',    keys: ['transport.auto_assign_vehicle', 'transport.route_optimization_enabled', 'transport.max_load_enforcement'] },
    { heading: 'Compliance',         keys: ['transport.driver_license_check', 'transport.vehicle_fitness_check'] },
    { heading: 'Tracking & Logs',    keys: ['transport.gps_tracking_enabled', 'transport.fuel_log_required'] },
  ],
  logistics: [
    { heading: 'Gate Pass',          keys: ['logistics.gate_pass_required', 'logistics.gate_pass_expiry_hours', 'logistics.auto_gate_pass_on_delivery', 'logistics.auto_gate_pass_on_gr'] },
    { heading: 'Gate Operations',    keys: ['logistics.vehicle_log_required', 'logistics.visitor_pass_enabled'] },
  ],
};

// ─── Planning strategy info banner ────────────────────────────────────────────
const STRATEGY_INFO = {
  MTS: { cls: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300',
         title: 'Make-to-Stock Active',
         body: 'Goods are produced in advance and stored. MRP plans based on reorder points and stock levels. Best for high-volume, standard products.' },
  MTO: { cls: 'bg-violet-50 border-violet-200 text-violet-800 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-300',
         title: 'Make-to-Order Active',
         body: 'Production is triggered only by confirmed sales orders. No speculative inventory. MRP ignores reorder points. Best for custom or engineer-to-order products.' },
  MIXED: { cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300',
           title: 'Mixed Strategy Active',
           body: 'Each material individually controls its planning strategy (MTS or MTO) via the material master. MRP respects the per-material setting.' },
};

// ─── Config row component ─────────────────────────────────────────────────────
function ConfigRow({ item, onSave }) {
  const meta = META[item.config_key] || { type: 'text', label: item.config_key };
  const [value, setValue] = useState(item.config_value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setValue(item.config_value ?? ''); }, [item.config_value]);

  const isDirty = value !== (item.config_value ?? '');

  const save = async (v) => {
    setSaving(true);
    try {
      await onSave(item.id, v ?? value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const toggleBool = () => {
    const next = value === 'true' ? 'false' : 'true';
    setValue(next);
    save(next);
  };

  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{meta.label}</p>
        {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
        {meta.type === 'bool' ? (
          <button
            onClick={toggleBool}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${value === 'true' ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            title={value === 'true' ? 'Enabled — click to disable' : 'Disabled — click to enable'}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        ) : meta.type === 'select' ? (
          <>
            <select value={value} onChange={e => setValue(e.target.value)} className="select-field text-sm w-72">
              {(meta.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {isDirty && (
              <button onClick={() => save()} disabled={saving} className="btn-primary text-xs px-3 h-8 flex items-center gap-1">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
            )}
          </>
        ) : (
          <>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              min={meta.min}
              max={meta.max}
              step={meta.step || '1'}
              className="input-field text-sm w-28 text-right"
            />
            {isDirty && (
              <button onClick={() => save()} disabled={saving} className="btn-primary text-xs px-3 h-8 flex items-center gap-1">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
            )}
          </>
        )}
        {saved && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ModuleSettings() {
  const [activeModule, setActiveModule] = useState('production');
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState({});
  const [alert, setAlert] = useState(null);

  const loadModule = useCallback(async (mod) => {
    if (configs[mod]) return;
    setLoading(prev => ({ ...prev, [mod]: true }));
    try {
      const res = await api.get(`/admin/config?group=${mod}`);
      setConfigs(prev => ({ ...prev, [mod]: res?.data || [] }));
    } catch (e) {
      setAlert({ type: 'error', message: e.message });
    } finally {
      setLoading(prev => ({ ...prev, [mod]: false }));
    }
  }, [configs]);

  useEffect(() => { loadModule(activeModule); }, [activeModule]);

  const handleSave = async (id, value) => {
    await api.put(`/admin/config/${id}`, { config_value: value });
    setConfigs(prev => {
      const next = { ...prev };
      if (next[activeModule]) {
        next[activeModule] = next[activeModule].map(c => c.id === id ? { ...c, config_value: value } : c);
      }
      return next;
    });
    setAlert({ type: 'success', message: 'Setting saved' });
    setTimeout(() => setAlert(null), 1500);
  };

  const activeRows = configs[activeModule] || [];
  const configMap = Object.fromEntries(activeRows.map(r => [r.config_key, r]));

  const strategy = activeModule === 'production'
    ? configMap['production.planning_strategy']?.config_value
    : null;

  const sections = SECTIONS[activeModule] || [];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-gray-500" /> Module Settings
        </h1>
        <p className="text-sm text-gray-400 mt-1">Configure operational behaviour for each module. Changes take effect immediately — no restart required.</p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-0.5 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {MODULES.map(m => {
          const Icon = m.icon;
          const isActive = activeModule === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setActiveModule(m.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                isActive ? `${m.border} ${m.color}` : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading[activeModule] && (
        <div className="py-12 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      )}

      {/* Empty state */}
      {!loading[activeModule] && activeRows.length === 0 && (
        <div className="py-12 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No configuration found for this module.</p>
          <p className="text-xs text-gray-400 mt-1">Restart the server once to seed default settings.</p>
        </div>
      )}

      {/* Strategy banner */}
      {strategy && STRATEGY_INFO[strategy] && (
        <div className={`rounded-lg border p-3 text-sm ${STRATEGY_INFO[strategy].cls}`}>
          <p className="font-semibold mb-0.5">{STRATEGY_INFO[strategy].title}</p>
          <p className="text-xs opacity-80">{STRATEGY_INFO[strategy].body}</p>
        </div>
      )}

      {/* Config sections */}
      {!loading[activeModule] && activeRows.length > 0 && sections.map(section => {
        const sectionRows = section.keys.map(k => configMap[k]).filter(Boolean);
        if (!sectionRows.length) return null;
        return (
          <div key={section.heading} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="px-5 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{section.heading}</h3>
            </div>
            <div className="px-5">
              {sectionRows.map(item => <ConfigRow key={item.id} item={item} onSave={handleSave} />)}
            </div>
          </div>
        );
      })}

      {/* MIXED strategy note */}
      {activeModule === 'production' && strategy === 'MIXED' && (
        <div className="flex gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-xs text-gray-600 dark:text-gray-400">
          <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <span>In <strong>MIXED</strong> mode, go to <strong>Master Data → Materials</strong> and set each material's <em>Planning Strategy</em> field to <strong>MTS</strong> or <strong>MTO</strong>. MRP uses the per-material value during its run.</span>
        </div>
      )}
    </div>
  );
}
