// Page-level + CRUD-level permission system
// Format in sys_roles.permissions:
// { all: true } — superadmin
// { all: false, pages: { 'fi-journal': { view:true, create:true, edit:true, delete:false, approve:true }, ... } }

export const PAGE_REGISTRY = [
  { module: 'dashboard', label: 'Dashboard', pages: [
    { key: 'dashboard', label: 'Dashboard', path: '/' },
  ]},
  { module: 'finance', label: 'Finance', pages: [
    { key: 'fi-overview', label: 'Finance Overview', path: '/finance' },
    { key: 'fi-gl', label: 'GL Accounts', path: '/finance/gl-accounts' },
    { key: 'fi-glmap', label: 'GL Mapping', path: '/finance/gl-mapping' },
    { key: 'fi-petty', label: 'Petty Cash', path: '/finance/petty-cash' },
    { key: 'fi-journal', label: 'Journal Entries', path: '/finance/journals' },
    { key: 'fi-ap', label: 'Accounts Payable', path: '/finance/ap' },
    { key: 'fi-ar', label: 'Accounts Receivable', path: '/finance/ar' },
    { key: 'fi-payments', label: 'Payments', path: '/finance/payments' },
    { key: 'fi-reports', label: 'Financial Reports', path: '/finance/reports' },
    { key: 'fi-aging', label: 'Aging Reports', path: '/finance/aging' },
    { key: 'fi-cashflow', label: 'Cash Flow', path: '/finance/cash-flow' },
    { key: 'fi-bank', label: 'Bank Reconciliation', path: '/finance/bank-reconciliation' },
    { key: 'fi-budget', label: 'Budget', path: '/finance/budget' },
    { key: 'fi-advanced', label: 'Tax & Currency', path: '/finance/advanced' },
  ]},
  { module: 'sales', label: 'Sales', pages: [
    { key: 'sd-overview', label: 'Sales Overview', path: '/sales' },
    { key: 'sd-quotations', label: 'Quotations', path: '/sales/quotations' },
    { key: 'sd-orders', label: 'Sales Orders', path: '/sales/orders' },
    { key: 'sd-deliveries', label: 'Deliveries', path: '/sales/deliveries' },
    { key: 'sd-billing', label: 'Billing', path: '/sales/billing' },
    { key: 'sd-returns', label: 'Returns & Pricing', path: '/sales/returns-pricing' },
  ]},
  { module: 'procurement', label: 'Procurement', pages: [
    { key: 'mm-overview', label: 'Procurement Overview', path: '/procurement' },
    { key: 'mm-requisitions', label: 'Requisitions', path: '/procurement/requisitions' },
    { key: 'mm-quotations', label: 'Supplier Quotations', path: '/procurement/quotations' },
    { key: 'mm-po', label: 'Purchase Orders', path: '/procurement/orders' },
    { key: 'mm-gr', label: 'Goods Receipts', path: '/procurement/goods-receipts' },
  ]},
  { module: 'inventory', label: 'Inventory', pages: [
    { key: 'inv-overview', label: 'Stock Overview', path: '/inventory' },
    { key: 'inv-movements', label: 'Stock Movements', path: '/inventory/movements' },
    { key: 'inv-turnover', label: 'Inventory Turnover', path: '/inventory/turnover' },
  ]},
  { module: 'production', label: 'Production', pages: [
    { key: 'pp-overview', label: 'Production Overview', path: '/production' },
    { key: 'pp-bom', label: 'Bill of Materials', path: '/production/bom' },
    { key: 'pp-work-centers', label: 'Work Centers', path: '/production/work-centers' },
    { key: 'pp-routing', label: 'Routing', path: '/production/routing' },
    { key: 'pp-orders', label: 'Production Orders', path: '/production/orders' },
    { key: 'pp-mrp', label: 'MRP', path: '/production/mrp' },
  ]},
  { module: 'warehouse', label: 'Warehouse', pages: [
    { key: 'warehouse', label: 'Warehouse', path: '/warehouse' },
  ]},
  { module: 'assets', label: 'Assets', pages: [
    { key: 'am-overview', label: 'Asset Overview', path: '/assets' },
    { key: 'am-register', label: 'Asset Register', path: '/assets/register' },
  ]},
  { module: 'hr', label: 'Human Resources', pages: [
    { key: 'hr-overview', label: 'HR Overview', path: '/hr' },
    { key: 'hr-employees', label: 'Employees', path: '/hr/employees' },
    { key: 'hr-leave', label: 'Leave Management', path: '/hr/leave' },
    { key: 'hr-attendance', label: 'Attendance', path: '/hr/attendance' },
    { key: 'hr-payroll', label: 'Payroll', path: '/hr/payroll' },
    { key: 'hr-expenses', label: 'Expense Claims', path: '/hr/expenses' },
  ]},
  { module: 'crm', label: 'CRM', pages: [{ key: 'crm', label: 'CRM', path: '/crm' }] },
  { module: 'projects', label: 'Projects', pages: [{ key: 'projects', label: 'Projects', path: '/projects' }] },
  { module: 'quality', label: 'Quality', pages: [{ key: 'quality', label: 'Quality', path: '/quality' }] },
  { module: 'transport', label: 'Transport', pages: [{ key: 'transport', label: 'Transport', path: '/transport' }] },
  { module: 'maintenance', label: 'Maintenance', pages: [{ key: 'maintenance', label: 'Maintenance', path: '/maintenance' }] },
  { module: 'logistics', label: 'Logistics', pages: [{ key: 'lo-gate-passes', label: 'Gate Passes (RGP/NRGP)', path: '/logistics/gate-passes' }] },
  { module: 'master-data', label: 'Master Data', pages: [
    { key: 'md-bp', label: 'Business Partners', path: '/master/business-partners' },
    { key: 'md-materials', label: 'Materials', path: '/master/materials' },
    { key: 'md-matconfig', label: 'Material Types & Groups', path: '/master/material-config' },
    { key: 'md-org', label: 'Organization', path: '/master/organization' },
  ]},
  { module: 'settings', label: 'Settings', pages: [
    { key: 'settings', label: 'Settings & Admin', path: '/settings' },
    { key: 'set-module-settings', label: 'Module Settings', path: '/settings/module-settings' },
  ]},
];

export const ALL_PAGES = PAGE_REGISTRY.flatMap(g => g.pages);
export const CRUD_OPS = ['view', 'create', 'edit', 'delete', 'approve'];

// ---- Parse permissions (handles old + new format) ----
function getPerms(userOrPerms) {
  if (!userOrPerms) return { all: false, pages: {} };
  const raw = userOrPerms.permissions || userOrPerms;
  const perms = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : raw;

  if (perms.pages) return perms; // New format
  if (perms.all) return { all: true, pages: {} }; // Superadmin

  // Legacy: { modules: ['finance','sales'] } → convert to page-level
  if (perms.modules) {
    const pages = {};
    PAGE_REGISTRY.forEach(g => {
      if (perms.modules.includes(g.module)) {
        g.pages.forEach(p => { pages[p.key] = { view: true, create: true, edit: true, delete: true, approve: true }; });
      }
    });
    // Always allow dashboard
    pages['dashboard'] = { view: true, create: false, edit: false, delete: false, approve: false };
    return { all: false, pages };
  }
  return { all: false, pages: {} };
}

// ---- Check functions ----
export function canViewPage(user, pageKey) {
  const p = getPerms(user);
  if (p.all) return true;
  return p.pages?.[pageKey]?.view === true;
}

export function canDo(user, pageKey, op) {
  const p = getPerms(user);
  if (p.all) return true;
  return p.pages?.[pageKey]?.[op] === true;
}

export function hasRouteAccess(user, pathname) {
  const p = getPerms(user);
  if (p.all) return true;
  if (pathname === '/' || pathname === '') return canViewPage(user, 'dashboard');
  // Match longest path first
  const sorted = [...ALL_PAGES].sort((a, b) => b.path.length - a.path.length);
  const pg = sorted.find(pg => pathname === pg.path || pathname.startsWith(pg.path + '/'));
  return pg ? canViewPage(user, pg.key) : true;
}

export function hasModuleAccess(user, moduleKey) {
  const p = getPerms(user);
  if (p.all) return true;
  const group = PAGE_REGISTRY.find(g => g.module === moduleKey);
  return group ? group.pages.some(pg => canViewPage(user, pg.key)) : false;
}

export function getViewablePageKeys(user) {
  const p = getPerms(user);
  if (p.all) return ALL_PAGES.map(pg => pg.key);
  return Object.keys(p.pages || {}).filter(k => p.pages[k]?.view);
}

export function getAccessibleModuleKeys(user) {
  return PAGE_REGISTRY.filter(g => hasModuleAccess(user, g.module)).map(g => g.module);
}

// Helpers for role editor
export function buildEmptyPermissions() {
  const pages = {};
  ALL_PAGES.forEach(p => { pages[p.key] = { view: false, create: false, edit: false, delete: false, approve: false }; });
  return { all: false, pages };
}
export function buildFullPermissions() { return { all: true, pages: {} }; }

// Legacy compatibility
export const ALL_MODULES = PAGE_REGISTRY.map(g => ({ key: g.module, label: g.label, description: g.pages.map(p => p.label).join(', ') }));
export const ROUTE_MODULE_MAP = {};
PAGE_REGISTRY.forEach(g => { g.pages.forEach(p => { ROUTE_MODULE_MAP[p.path] = g.module; }); });
