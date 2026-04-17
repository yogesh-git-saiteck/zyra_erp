import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, ShoppingCart, Factory,
  Warehouse, HardDrive, Users, FolderKanban, HeartHandshake, ClipboardList,
  Boxes, ShieldCheck, Wrench, Settings, ChevronRight,
  Search, LogOut, TrendingUp, Truck, ClipboardCheck, SlidersHorizontal,
  Folder, FolderOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ZyraLogo } from '../ZyraLogo';
import { getInitials } from '../../utils/formatters';
import { hasModuleAccess, canViewPage } from '../../utils/permissions';
import api from '../../utils/api';

// ─────────────────────────────────────────────────────────────────────────────
// NAV STRUCTURE
//   • path only          → single nav link (level 1)
//   • children[]         → 2-level collapsible (Finance, HR, etc.)
//   • children[].type === 'group' with children[]
//                        → 3-level tree (Master Data, Configuration)
//
// RULE: every path appears exactly ONCE across the whole tree.
// ─────────────────────────────────────────────────────────────────────────────
const NAV_MODULES = [

  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },

  // ── 2-level transaction modules ──────────────────────────────────────────
  {
    key: 'finance', label: 'Finance', icon: Wallet,
    children: [
      { key: 'fi-overview',  label: 'Overview',            path: '/finance' },
      { key: 'fi-gl',        label: 'GL Accounts',         path: '/finance/gl-accounts' },
      { key: 'fi-petty',     label: 'Petty Cash',          path: '/finance/petty-cash' },
      { key: 'fi-journal',   label: 'Journal Entries',     path: '/finance/journals' },
      { key: 'fi-ap',        label: 'Accounts Payable',    path: '/finance/ap' },
      { key: 'fi-ar',        label: 'Accounts Receivable', path: '/finance/ar' },
      { key: 'fi-payments',  label: 'Payments',            path: '/finance/payments' },
      { key: 'fi-reports',   label: 'Financial Reports',   path: '/finance/reports/trial-balance' },
      { key: 'fi-aging',     label: 'Aging Reports',       path: '/finance/aging' },
      { key: 'fi-cashflow',  label: 'Cash Flow Forecast',  path: '/finance/cash-flow' },
      { key: 'fi-bank',      label: 'Bank Reconciliation', path: '/finance/bank-reconciliation' },
      { key: 'fi-budget',    label: 'Budget Management',   path: '/finance/budget' },
      { key: 'fi-glmap',     label: 'GL Mapping',          path: '/finance/gl-mapping' },
      { key: 'fi-advanced',  label: 'Tax & Currency',      path: '/finance/advanced' },
    ],
  },

  {
    key: 'sales', label: 'Sales & Distribution', icon: TrendingUp,
    children: [
      { key: 'sd-overview',   label: 'Overview',          path: '/sales' },
      { key: 'sd-quotations', label: 'Quotations',        path: '/sales/quotations' },
      { key: 'sd-orders',     label: 'Sales Orders',      path: '/sales/orders' },
      { key: 'sd-deliveries', label: 'Deliveries',        path: '/sales/deliveries' },
      { key: 'sd-billing',    label: 'Billing',           path: '/sales/billing' },
      { key: 'sd-returns',    label: 'Returns & Pricing', path: '/sales/returns-pricing' },
    ],
  },

  {
    key: 'procurement', label: 'Procurement', icon: ShoppingCart,
    children: [
      { key: 'mm-overview',     label: 'Overview',            path: '/procurement' },
      { key: 'mm-requisitions', label: 'Requisitions',        path: '/procurement/requisitions' },
      { key: 'mm-quotations',   label: 'Supplier Quotations', path: '/procurement/quotations' },
      { key: 'mm-po',           label: 'Purchase Orders',     path: '/procurement/orders' },
      { key: 'mm-gr',           label: 'Goods Receipts',      path: '/procurement/goods-receipts' },
    ],
  },

  {
    key: 'inventory', label: 'Inventory', icon: Boxes,
    children: [
      { key: 'inv-overview',  label: 'Stock Overview',     path: '/inventory' },
      { key: 'inv-movements', label: 'Stock Movements',    path: '/inventory/movements' },
      { key: 'inv-turnover',  label: 'Inventory Turnover', path: '/inventory/turnover' },
    ],
  },

  {
    key: 'production', label: 'Production', icon: Factory,
    children: [
      { key: 'pp-overview',     label: 'Overview',          path: '/production' },
      { key: 'pp-bom',          label: 'Bill of Materials', path: '/production/bom' },
      { key: 'pp-work-centers', label: 'Work Centers',      path: '/production/work-centers' },
      { key: 'pp-routing',      label: 'Routing',           path: '/production/routing' },
      { key: 'pp-orders',       label: 'Production Orders', path: '/production/orders' },
      { key: 'pp-mrp',          label: 'MRP',               path: '/production/mrp' },
    ],
  },

  { key: 'warehouse',    label: 'Warehouse',         icon: Warehouse,      path: '/warehouse' },

  {
    key: 'assets', label: 'Assets', icon: HardDrive,
    children: [
      { key: 'am-overview',  label: 'Overview',       path: '/assets' },
      { key: 'am-register',  label: 'Asset Register', path: '/assets/register' },
    ],
  },

  {
    key: 'hr', label: 'Human Resources', icon: Users,
    children: [
      { key: 'hr-overview',   label: 'Overview',        path: '/hr' },
      { key: 'hr-employees',  label: 'Employees',       path: '/hr/employees' },
      { key: 'hr-leave',      label: 'Leave Management',path: '/hr/leave' },
      { key: 'hr-attendance', label: 'Attendance',      path: '/hr/attendance' },
      { key: 'hr-payroll',    label: 'Payroll',         path: '/hr/payroll' },
      { key: 'hr-expenses',   label: 'Expense Claims',  path: '/hr/expenses' },
    ],
  },

  { key: 'crm',         label: 'CRM',         icon: HeartHandshake, path: '/crm' },
  { key: 'projects',    label: 'Projects',    icon: FolderKanban,   path: '/projects' },
  { key: 'quality',     label: 'Quality',     icon: ShieldCheck,    path: '/quality' },
  { key: 'transport',   label: 'Transport',   icon: Truck,          path: '/transport' },

  {
    key: 'logistics', label: 'Logistics', icon: ClipboardCheck,
    children: [
      { key: 'lo-gate-passes', label: 'Gate Passes (RGP/NRGP)', path: '/logistics/gate-passes' },
    ],
  },

  { key: 'maintenance', label: 'Maintenance', icon: Wrench, path: '/maintenance' },

  // ── MASTER DATA — 3-level tree (only screens that actually exist) ──────────
  {
    key: 'master-data', label: 'Master Data', icon: ClipboardList,
    children: [
      {
        key: 'md-g-general', label: 'General', type: 'group',
        children: [
          { key: 'md-bp',  label: 'Business Partners', path: '/master/business-partners' },
          { key: 'md-org', label: 'Organization',      path: '/master/organization' },
        ],
      },
      {
        key: 'md-g-materials', label: 'Materials', type: 'group',
        children: [
          { key: 'md-materials', label: 'Materials',               path: '/master/materials' },
          { key: 'md-matconfig', label: 'Material Types & Groups', path: '/master/material-config' },
          { key: 'md-services',  label: 'Services',                path: '/master/services' },
        ],
      },
    ],
  },

  // ── CONFIGURATION — 3-level tree (replaces Settings & Admin, no duplicates) ──
  {
    key: 'configuration', label: 'Configuration', icon: SlidersHorizontal,
    children: [
      {
        key: 'cfg-g-setup', label: 'Business Setup', type: 'group',
        children: [
          { key: 'cfg-hub',     label: 'Configuration Hub', path: '/configuration' },
          { key: 'cfg-config',  label: 'Admin Settings',    path: '/settings/config' },
          { key: 'cfg-wf',      label: 'Workflows',         path: '/settings/workflows' },
          { key: 'cfg-golive',  label: 'Go-Live Settings',  path: '/settings/go-live' },
          { key: 'cfg-modsett', label: 'Module Settings',   path: '/settings/module-settings' },
          { key: 'cfg-print',   label: 'Print Templates',   path: '/settings/print-builder' },
        ],
      },
      {
        key: 'cfg-g-admin', label: 'System Administration', type: 'group',
        children: [
          { key: 'cfg-profile',  label: 'My Profile',       path: '/settings' },
          { key: 'cfg-modules',  label: 'Module Config',    path: '/settings/modules' },
          { key: 'cfg-users',    label: 'Users & Roles',    path: '/settings/users' },
          { key: 'cfg-integr',   label: 'Integrations',     path: '/settings/integrations' },
          { key: 'cfg-platform', label: 'Admin Platform',   path: '/settings/platform' },
          { key: 'cfg-enhanced', label: 'Enhanced Admin',   path: '/settings/enhanced' },
          { key: 'cfg-barcode',  label: 'Barcode & QR',     path: '/settings/barcode' },
          { key: 'cfg-reports',  label: 'Report Builder',   path: '/settings/reports' },
          { key: 'cfg-audit',    label: 'Audit Log',        path: '/settings/audit-log' },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────
function allLeaves(node) {
  if (node.path) return [node];
  if (node.children) return node.children.flatMap(allLeaves);
  return [];
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [enabledModules, setEnabledModules] = useState(null);

  const userRole = user?.role_code || user?.role || '';

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/admin/modules/enabled');
        setEnabledModules(r?.data || []);
      } catch {
        setEnabledModules(null);
      }
    })();
  }, []);

  const toggle = (key) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const isActive = (path) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const hasActiveLeaf = (node) =>
    allLeaves(node).some(l => isActive(l.path));

  // ── Permission filtering ──────────────────────────────────────────────────
  const visibleModules = NAV_MODULES.filter(m => {
    if (m.key === 'dashboard')     return canViewPage(user, 'dashboard');
    if (m.key === 'configuration') return canViewPage(user, 'settings');
    if (enabledModules !== null && !enabledModules.includes(m.key)) return false;
    return hasModuleAccess(user, m.key);
  }).map(m => {
    if (!m.children) return m;
    const filtered = m.children.map(child => {
      if (child.type === 'group') {
        const items = child.children.filter(c => canViewPage(user, c.key));
        return items.length ? { ...child, children: items } : null;
      }
      return canViewPage(user, child.key) ? child : null;
    }).filter(Boolean);
    return filtered.length ? { ...m, children: filtered } : null;
  }).filter(Boolean);

  // ── Search ────────────────────────────────────────────────────────────────
  const filteredModules = search
    ? visibleModules.filter(m => {
        const q = search.toLowerCase();
        return m.label.toLowerCase().includes(q) ||
               allLeaves(m).some(l => l.label.toLowerCase().includes(q));
      })
    : visibleModules;

  // ── Renderers ─────────────────────────────────────────────────────────────

  /** Level 3 — leaf link */
  const renderLeaf = (item) => {
    const active = isActive(item.path);
    return (
      <button key={item.key} onClick={() => navigate(item.path)}
        className={`w-full text-left flex items-center gap-2 pl-2 pr-2 py-[5px] rounded-md text-[11px] transition-colors
          ${active
            ? 'text-blue-600 bg-blue-50 font-semibold dark:text-blue-400 dark:bg-blue-950'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-800/60'}`}>
        <span className={`w-[5px] h-[5px] rounded-full shrink-0
          ${active ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
        <span className="truncate leading-tight">{item.label}</span>
      </button>
    );
  };

  /** Level 2 group — collapsible folder (3-level modules only) */
  const renderGroup = (group) => {
    const isExp = expanded[group.key] ?? false;
    const forceOpen = !!search;
    const show = isExp || forceOpen;
    const hasActive = hasActiveLeaf(group);

    return (
      <div key={group.key}>
        <button onClick={() => toggle(group.key)}
          className={`w-full flex items-center gap-1.5 px-1.5 py-[6px] rounded-md text-[11px] font-semibold transition-colors
            ${hasActive
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
          <ChevronRight className={`w-3 h-3 shrink-0 transition-transform duration-200 ${show ? 'rotate-90' : ''}`} />
          {show
            ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            : <Folder     className="w-3.5 h-3.5 shrink-0 text-amber-400 dark:text-amber-500" />}
          <span className="truncate uppercase tracking-wider text-[10px]">{group.label}</span>
        </button>

        {show && (
          <div className="mt-0.5 ml-4 pl-2.5 border-l-2 border-dashed border-gray-200 dark:border-gray-700 space-y-0.5 pb-0.5">
            {group.children.map(renderLeaf)}
          </div>
        )}
      </div>
    );
  };

  /** Level 2 flat item — regular 2-level modules */
  const renderFlatChild = (child) => {
    const active = isActive(child.path);
    return (
      <button key={child.key} onClick={() => navigate(child.path)}
        className={`w-full text-left flex items-center gap-2 px-2 py-[5px] rounded-md text-[11.5px] transition-colors
          ${active
            ? 'text-blue-600 bg-blue-50 font-semibold dark:text-blue-400 dark:bg-blue-950'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-800/60'}`}>
        <span className={`w-[5px] h-[5px] rounded-full shrink-0
          ${active ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
        <span className="truncate leading-tight">{child.label}</span>
      </button>
    );
  };

  return (
    <aside className={`fixed top-0 left-0 h-screen z-30 flex flex-col
      bg-white border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800 transition-all duration-300
      ${collapsed ? 'w-[68px]' : 'w-[268px]'}`}>

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <ZyraLogo size={32} />
        {!collapsed && (
          <div>
            <h1 className="font-bold text-sm tracking-tight text-gray-900 dark:text-gray-100 leading-none">Zyra</h1>
            <p className="text-[9px] text-gray-400 tracking-widest uppercase leading-none mt-0.5">ERP</p>
          </div>
        )}
      </div>

      {/* ── Search ── */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg
                text-gray-900 dark:text-gray-100 placeholder:text-gray-400
                focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20" />
          </div>
        </div>
      )}

      {/* ── Role badge ── */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-100 dark:border-blue-800">
            <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide truncate">
              {user?.role_name || user?.roleName || userRole}
            </p>
          </div>
        </div>
      )}

      {/* ── Navigation tree ── */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {filteredModules.map(mod => {
          const Icon = mod.icon;
          const hasChildren = !!mod.children?.length;
          const isExp = expanded[mod.key] || !!search;
          const active = mod.path ? isActive(mod.path) : hasActiveLeaf(mod);
          const is3Level = hasChildren && mod.children.some(c => c.type === 'group');

          return (
            <div key={mod.key}>
              {/* Level 1 */}
              <button
                onClick={() => {
                  if (hasChildren) toggle(mod.key);
                  else if (mod.path) navigate(mod.path);
                }}
                title={collapsed ? mod.label : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[12.5px] font-medium transition-all duration-150
                  ${active
                    ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'}
                  ${collapsed ? 'justify-center' : ''}`}>
                <Icon className={`w-[17px] h-[17px] shrink-0
                  ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{mod.label}</span>
                    {hasChildren && (
                      <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isExp ? 'rotate-90' : ''}`} />
                    )}
                  </>
                )}
              </button>

              {/* Level 2 / Level 2+3 */}
              {!collapsed && hasChildren && isExp && (
                <div className="mt-0.5 ml-[22px] pl-2.5 border-l-2 border-gray-100 dark:border-gray-800 space-y-0.5 pb-1">
                  {is3Level
                    ? mod.children.map(renderGroup)
                    : mod.children.map(renderFlatChild)}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── User footer ── */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-3">
        {collapsed ? (
          <button onClick={logout}
            className="w-full flex justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Logout">
            <LogOut className="w-4 h-4 text-gray-400" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {getInitials(user?.first_name || user?.firstName, user?.last_name || user?.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                {user?.first_name || user?.firstName} {user?.last_name || user?.lastName}
              </p>
              <p className="text-[10px] text-gray-400 truncate">{user?.role_name || user?.roleName}</p>
            </div>
            <button onClick={logout}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Logout">
              <LogOut className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
