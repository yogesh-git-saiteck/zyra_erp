import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, Search, Bell, Maximize2, Minimize2, X, ChevronRight, Moon, Sun, Clock, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../utils/api';

const typeIcons = { customer: '👤', vendor: '🏢', material: '📦', sales_order: '📋', purchase_order: '🛒' };

const ALL_PAGES = [
  { label: 'Dashboard', path: '/', keywords: 'home overview' },
  // Finance
  { label: 'Finance Overview', path: '/finance', keywords: 'finance accounts' },
  { label: 'GL Accounts', path: '/finance/gl-accounts', keywords: 'general ledger accounts finance' },
  { label: 'GL Mapping', path: '/finance/gl-mapping', keywords: 'gl mapping finance' },
  { label: 'Journal Entries', path: '/finance/journals', keywords: 'journal entries finance accounting' },
  { label: 'Accounts Payable', path: '/finance/ap', keywords: 'accounts payable invoice vendor finance' },
  { label: 'Accounts Receivable', path: '/finance/ar', keywords: 'accounts receivable invoice customer finance' },
  { label: 'Payments', path: '/finance/payments', keywords: 'payments finance' },
  { label: 'Financial Reports', path: '/finance/reports/trial-balance', keywords: 'reports financial trial balance' },
  { label: 'Aging Reports', path: '/finance/aging', keywords: 'aging reports finance' },
  { label: 'Cash Flow Forecast', path: '/finance/cash-flow', keywords: 'cash flow forecast finance' },
  { label: 'Bank Reconciliation', path: '/finance/bank-reconciliation', keywords: 'bank reconciliation finance' },
  { label: 'Budget Management', path: '/finance/budget', keywords: 'budget finance' },
  { label: 'Tax & Currency', path: '/finance/advanced', keywords: 'tax currency finance' },
  { label: 'Petty Cash', path: '/finance/petty-cash', keywords: 'petty cash finance' },
  // Sales
  { label: 'Sales Overview', path: '/sales', keywords: 'sales overview' },
  { label: 'Quotations', path: '/sales/quotations', keywords: 'quotations sales rfq' },
  { label: 'Sales Orders', path: '/sales/orders', keywords: 'sales orders so' },
  { label: 'Deliveries', path: '/sales/deliveries', keywords: 'deliveries shipment sales' },
  { label: 'Billing', path: '/sales/billing', keywords: 'billing invoice sales' },
  { label: 'Returns & Pricing', path: '/sales/returns-pricing', keywords: 'returns pricing sales' },
  // Procurement
  { label: 'Procurement Overview', path: '/procurement', keywords: 'procurement overview' },
  { label: 'Purchase Requisitions', path: '/procurement/requisitions', keywords: 'purchase requisitions pr procurement' },
  { label: 'Supplier Quotations', path: '/procurement/quotations', keywords: 'supplier quotations rfq procurement' },
  { label: 'Purchase Orders', path: '/procurement/orders', keywords: 'purchase orders po procurement' },
  { label: 'Goods Receipts', path: '/procurement/goods-receipts', keywords: 'goods receipts grn procurement' },
  // Inventory
  { label: 'Stock Overview', path: '/inventory', keywords: 'stock inventory overview' },
  { label: 'Stock Movements', path: '/inventory/movements', keywords: 'stock movements inventory' },
  { label: 'Inventory Turnover', path: '/inventory/turnover', keywords: 'inventory turnover' },
  // Production
  { label: 'Production Overview', path: '/production', keywords: 'production overview manufacturing' },
  { label: 'Bill of Materials', path: '/production/bom', keywords: 'bom bill of materials production' },
  { label: 'Production Orders', path: '/production/orders', keywords: 'production orders manufacturing' },
  { label: 'MRP', path: '/production/mrp', keywords: 'mrp material requirements planning' },
  // Logistics
  { label: 'Gate Passes (RGP/NRGP)', path: '/logistics/gate-passes', keywords: 'gate pass rgp nrgp returnable logistics' },
  // Warehouse
  { label: 'Warehouse', path: '/warehouse', keywords: 'warehouse storage' },
  // Assets
  { label: 'Assets', path: '/assets', keywords: 'assets fixed assets register' },
  // HR
  { label: 'HR Overview', path: '/hr', keywords: 'hr human resources overview' },
  { label: 'Employees', path: '/hr/employees', keywords: 'employees hr staff' },
  { label: 'Leave Management', path: '/hr/leave', keywords: 'leave management hr' },
  { label: 'Attendance', path: '/hr/attendance', keywords: 'attendance hr' },
  { label: 'Payroll', path: '/hr/payroll', keywords: 'payroll salary hr' },
  { label: 'Expense Claims', path: '/hr/expenses', keywords: 'expense claims hr' },
  // CRM / Projects / Quality / Maintenance / Transport
  { label: 'CRM', path: '/crm', keywords: 'crm customers leads' },
  { label: 'Projects', path: '/projects', keywords: 'projects tasks' },
  { label: 'Quality', path: '/quality', keywords: 'quality control inspection' },
  { label: 'Maintenance', path: '/maintenance', keywords: 'maintenance repair' },
  { label: 'Transport', path: '/transport', keywords: 'transport vehicles carriers' },
  // Master Data
  { label: 'Business Partners', path: '/master/business-partners', keywords: 'business partners customers vendors bp' },
  { label: 'Materials', path: '/master/materials', keywords: 'materials items products master' },
  { label: 'Material Types & Groups', path: '/master/material-config', keywords: 'material types groups config' },
  { label: 'Services', path: '/master/services', keywords: 'services master' },
  { label: 'Organization', path: '/master/organization', keywords: 'organization company plant' },
  // Settings
  { label: 'Users & Roles', path: '/settings/users', keywords: 'users roles permissions settings' },
  { label: 'Workflows', path: '/settings/workflows', keywords: 'workflows approval settings' },
  { label: 'Report Builder', path: '/settings/reports', keywords: 'reports builder settings' },
  { label: 'Audit Log', path: '/settings/audit-log', keywords: 'audit log history settings' },
  { label: 'Go-Live Settings', path: '/settings/go-live', keywords: 'go live settings smtp email' },
  { label: 'Admin Platform', path: '/settings/platform', keywords: 'admin platform business rules approval settings' },
  { label: 'Configuration', path: '/settings/config', keywords: 'configuration settings' },
  { label: 'Barcode & QR', path: '/settings/barcode', keywords: 'barcode qr settings' },
];

function searchPages(q) {
  const lower = q.toLowerCase();
  return ALL_PAGES.filter(p =>
    p.label.toLowerCase().includes(lower) || p.keywords.includes(lower)
  ).slice(0, 5);
}

const BREADCRUMB_MAP = {
  'finance': 'Finance', 'finance/gl-accounts': 'GL Accounts', 'finance/journals': 'Journal Entries',
  'finance/ap': 'AP Invoices', 'finance/ar': 'AR Invoices', 'finance/payments': 'Payments',
  'finance/reports': 'Financial Reports', 'finance/aging': 'Aging Reports',
  'sales': 'Sales', 'sales/quotations': 'Quotations', 'sales/orders': 'Sales Orders',
  'sales/deliveries': 'Deliveries', 'sales/billing': 'Billing',
  'procurement': 'Procurement', 'procurement/requisitions': 'Requisitions',
  'procurement/orders': 'Purchase Orders', 'procurement/goods-receipts': 'Goods Receipts',
  'inventory': 'Inventory', 'inventory/movements': 'Stock Movements',
  'production': 'Production', 'production/bom': 'Bill of Materials', 'production/orders': 'Production Orders',
  'warehouse': 'Warehouse', 'assets': 'Assets', 'hr': 'Human Resources',
  'hr/employees': 'Employees', 'hr/leave': 'Leave Management', 'hr/attendance': 'Attendance',
  'crm': 'CRM', 'projects': 'Projects', 'quality': 'Quality', 'maintenance': 'Maintenance',
  'master/business-partners': 'Business Partners', 'master/materials': 'Materials',
  'master/organization': 'Organization', 'settings': 'Settings', 'settings/users': 'Users & Roles',
  'settings/workflows': 'Workflows', 'settings/reports': 'Report Builder',
  'settings/audit-log': 'Audit Log', 'settings/config': 'Configuration',
};

export default function Header({ collapsed, onToggleSidebar }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pageResults, setPageResults] = useState([]);
  const [recentItems, setRecentItems] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [currentCompany, setCurrentCompany] = useState(null);
  const searchRef = useRef(null);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      const r = await api.get('/finance/notifications').catch(() => null);
      const notifs = r?.data?.notifications || [];
      setNotifications(notifs);
      setUnreadCount(r?.data?.unread_count ?? notifs.filter(n => !n.is_read).length);
    } catch {}
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const handleNotifClick = async (notif) => {
    if (!notif.is_read) {
      await api.put(`/finance/notifications/${notif.id}/read`).catch(() => {});
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (notif.link) {
      setShowNotif(false);
      navigate(notif.link);
    }
  };

  const markAllRead = async () => {
    await api.put('/finance/notifications/read-all').catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  // Load companies for switcher
  useEffect(() => {
    (async () => {
      try {
        const [c, cc] = await Promise.all([api.get('/system/companies'), api.get('/system/current-company')]);
        setCompanies(c?.data || []);
        setCurrentCompany(cc?.data || null);
      } catch {}
    })();
  }, []);

  const switchCompany = async (compId) => {
    try {
      const res = await api.post('/system/switch-company', { company_id: compId });
      setCurrentCompany(res?.data);
      window.location.reload();
    } catch {}
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 100); }
      if (e.key === 'Escape') { setSearchOpen(false); setShowNotif(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Track recent pages
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/login') return;
    const path = location.pathname;
    const label = BREADCRUMB_MAP[path.slice(1)] || path.split('/').pop();
    const recent = JSON.parse(localStorage.getItem('nexus_recent') || '[]');
    const filtered = recent.filter(r => r.path !== path);
    filtered.unshift({ path, label, time: Date.now() });
    const trimmed = filtered.slice(0, 8);
    localStorage.setItem('nexus_recent', JSON.stringify(trimmed));
    setRecentItems(trimmed);
  }, [location.pathname]);

  // Load recent on mount
  useEffect(() => { setRecentItems(JSON.parse(localStorage.getItem('nexus_recent') || '[]')); }, []);

  // Search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); setPageResults([]); return; }
    setPageResults(searchPages(searchQuery));
    const t = setTimeout(async () => {
      try { const r = await api.get('/dashboard/search', { q: searchQuery }); setSearchResults(r?.data || []); } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setFullscreen(true); }
    else { document.exitFullscreen(); setFullscreen(false); }
  };

  // Build breadcrumbs
  const buildBreadcrumbs = () => {
    const path = location.pathname.slice(1);
    if (!path) return [{ label: 'Dashboard', path: '/' }];
    const parts = path.split('/');
    const crumbs = [{ label: 'Home', path: '/' }];
    let accumulated = '';
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      const label = BREADCRUMB_MAP[accumulated] || part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ');
      crumbs.push({ label, path: `/${accumulated}` });
    }
    return crumbs;
  };
  const breadcrumbs = buildBreadcrumbs();

  return (
    <>
      <header className={`fixed top-0 right-0 z-20 h-14 flex items-center justify-between px-4
        bg-white/90 backdrop-blur-md border-b border-gray-200 dark:bg-gray-950/90 dark:border-gray-800 transition-all duration-300
        left-0 md:${collapsed ? 'left-[68px]' : 'left-[268px]'}`}>

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={onToggleSidebar} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors shrink-0">
            <Menu className="w-4 h-4 text-gray-500" />
          </button>

          {/* Breadcrumbs */}
          <nav className="hidden md:flex items-center gap-1 text-xs min-w-0 overflow-hidden">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />}
                {i === 0 ? (
                  <button onClick={() => navigate(crumb.path)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><Home className="w-3.5 h-3.5" /></button>
                ) : i === breadcrumbs.length - 1 ? (
                  <span className="text-gray-700 dark:text-gray-200 font-medium truncate max-w-[150px]">{crumb.label}</span>
                ) : (
                  <button onClick={() => navigate(crumb.path)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 truncate max-w-[120px]">{crumb.label}</button>
                )}
              </span>
            ))}
          </nav>

          {/* Company Switcher */}
          {companies.length > 0 && (
            <select value={currentCompany?.id || ''} onChange={e => switchCompany(e.target.value)}
              className="hidden md:block text-xs px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-300 max-w-[180px] truncate"
              title="Switch company">
              {companies.map(c => <option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}
            </select>
          )}

          <div className="flex-1" />

          {/* Search trigger */}
          <button onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 100); }}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg
              text-gray-400 text-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-text min-w-[180px]">
            <Search className="w-3.5 h-3.5" />
            <span>Search...</span>
            <kbd className="ml-auto text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-gray-400">⌘K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
          <button onClick={toggleFullscreen} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors hidden md:block">
            {fullscreen ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowNotif(!showNotif)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors relative">
              <Bell className="w-4 h-4 text-gray-500" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl z-50 max-h-[480px] flex flex-col">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Notifications</span>
                    {unreadCount > 0 && <span className="text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-medium">{unreadCount} new</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-blue-500 hover:text-blue-700">Mark all read</button>}
                    <button onClick={() => setShowNotif(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                </div>
                <div className="overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No notifications</div>
                  ) : (
                    notifications.slice(0, 20).map(notif => (
                      <button key={notif.id} onClick={() => handleNotifClick(notif)}
                        className={`w-full text-left p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${!notif.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                        <div className="flex items-start gap-2">
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!notif.is_read ? 'bg-blue-500' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium truncate ${!notif.is_read ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>{notif.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{new Date(notif.created_at).toLocaleString()}</p>
                          </div>
                          {notif.link && <span className="text-[10px] text-blue-500 shrink-0 mt-1">→</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search modal with recent items */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/20 backdrop-blur-sm"
          onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
              <Search className="w-5 h-5 text-gray-400 shrink-0" />
              <input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search customers, vendors, materials, orders..."
                className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none text-sm" />
              <button onClick={() => setSearchOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Page results */}
            {pageResults.length > 0 && (
              <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                <p className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Pages</p>
                {pageResults.map((p, i) => (
                  <button key={i} onClick={() => { navigate(p.path); setSearchOpen(false); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-left">
                    <span className="text-base">🗂️</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-100">{p.label}</p>
                      <p className="text-[11px] text-gray-400">{p.path}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                ))}
              </div>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto p-2">
                <p className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Records</p>
                {searchResults.map((r, i) => {
                  const pathMap = {
                    customer: `/master/business-partners?open=${r.id}`,
                    vendor: `/master/business-partners?open=${r.id}`,
                    material: `/master/materials?open=${r.id}`,
                    sales_order: `/sales/orders?open=${r.id}`,
                    purchase_order: `/procurement/orders?open=${r.id}`,
                  };
                  const dest = pathMap[r.type] || '/';
                  return (
                    <button key={i} onClick={() => { navigate(dest); setSearchOpen(false); setSearchQuery(''); }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-left">
                      <span className="text-lg">{typeIcons[r.type] || '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{r.name}</p>
                        <p className="text-xs text-gray-400">{r.code} · {r.type.replace(/_/g, ' ')}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                    </button>
                  );
                })}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && pageResults.length === 0 && (
              <div className="p-6 text-center text-gray-400 text-sm">No results found</div>
            )}

            {/* Recent items when no search query */}
            {searchQuery.length < 2 && recentItems.length > 0 && (
              <div className="p-2">
                <p className="px-3 py-1 text-xs text-gray-400 font-medium uppercase">Recent Pages</p>
                {recentItems.map((r, i) => (
                  <button key={i} onClick={() => { navigate(r.path); setSearchOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-left">
                    <Clock className="w-4 h-4 text-gray-300" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{r.label}</span>
                    <span className="ml-auto text-xs text-gray-300">{r.path}</span>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length < 2 && recentItems.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-xs">Start typing to search across all modules (⌘K)</div>
            )}

            {/* Keyboard shortcut hints */}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-[10px] text-gray-400">
              <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↵</kbd> to select</span>
              <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">esc</kbd> to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
