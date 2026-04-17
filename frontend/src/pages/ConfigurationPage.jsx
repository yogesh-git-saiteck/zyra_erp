import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Hash, Layout, Mail, GitBranch, Zap, Rocket, Sliders,
  Settings, Shield, Plug, ScrollText, BarChart3, Printer, QrCode,
  Layers, User, ChevronRight,
} from 'lucide-react';

const CONFIG_GROUPS = [
  {
    key: 'setup',
    label: 'Business Setup',
    color: 'blue',
    desc: 'Core system rules and business configuration',
    items: [
      { icon: Hash,       label: 'Number Series',      desc: 'Document numbering for all transaction types',    path: '/settings/config' },
      { icon: Layout,     label: 'Custom Fields',      desc: 'Add custom fields to any module or form',         path: '/settings/config' },
      { icon: Mail,       label: 'Email Templates',    desc: 'Notification and alert email templates',          path: '/settings/config' },
      { icon: GitBranch,  label: 'Approval Rules',     desc: 'Multi-level approval and authorization workflows', path: '/settings/config' },
      { icon: Zap,        label: 'Workflows',          desc: 'Automate business process flows and triggers',    path: '/settings/workflows' },
      { icon: Sliders,    label: 'Module Settings',    desc: 'Per-module operational settings',                 path: '/settings/module-settings' },
      { icon: Rocket,     label: 'Go-Live Settings',   desc: 'Pre-launch checklist and go-live controls',      path: '/settings/go-live' },
    ],
  },
  {
    key: 'admin',
    label: 'System Administration',
    color: 'gray',
    desc: 'Users, integrations and technical system management',
    items: [
      { icon: User,       label: 'My Profile',         desc: 'Personal profile, password and preferences',     path: '/settings' },
      { icon: Layers,     label: 'Module Config',       desc: 'Enable or disable system modules',              path: '/settings/modules' },
      { icon: Shield,     label: 'Users & Roles',       desc: 'User accounts and role-based permissions',      path: '/settings/users' },
      { icon: Plug,       label: 'Integrations',        desc: 'Third-party API connections and webhooks',      path: '/settings/integrations' },
      { icon: Settings,   label: 'Admin Platform',      desc: 'Low-level platform and database tools',         path: '/settings/platform' },
      { icon: Settings,   label: 'Enhanced Admin',      desc: 'Advanced system administration tools',          path: '/settings/enhanced' },
      { icon: QrCode,     label: 'Barcode & QR',        desc: 'Barcode generation and label printing setup',   path: '/settings/barcode' },
      { icon: BarChart3,  label: 'Report Builder',      desc: 'Build and manage custom report templates',      path: '/settings/reports' },
      { icon: Printer,    label: 'Print Templates',     desc: 'Document print layout and template builder',    path: '/settings/print-builder' },
      { icon: ScrollText, label: 'Audit Log',           desc: 'Full system-wide activity audit trail',         path: '/settings/audit-log' },
    ],
  },
];

const COLORS = {
  blue: {
    tab:      'bg-blue-600 text-white shadow-sm',
    inactive: 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50',
    card:     'bg-blue-50/60 dark:bg-blue-950/30 border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md',
    icon:     'bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400',
    chevron:  'text-blue-300 dark:text-blue-700',
  },
  gray: {
    tab:      'bg-gray-700 text-white shadow-sm',
    inactive: 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
    card:     'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-md',
    icon:     'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    chevron:  'text-gray-300 dark:text-gray-600',
  },
};

export default function ConfigurationPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState('setup');

  const group = CONFIG_GROUPS.find(g => g.key === active);
  const c = COLORS[group.color];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Configuration</h1>
        <p className="text-xs text-gray-400 mt-0.5">System configuration and administration settings</p>
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-2">
        {CONFIG_GROUPS.map(g => {
          const gc = COLORS[g.color];
          return (
            <button key={g.key} onClick={() => setActive(g.key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150
                ${active === g.key ? gc.tab : `bg-transparent ${gc.inactive}`}`}>
              {g.label}
              <span className="ml-1.5 opacity-60 font-normal">({g.items.length})</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">{group.desc}</p>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {group.items.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.label} onClick={() => navigate(item.path)}
              className={`text-left p-4 rounded-xl border transition-all duration-150 group ${c.card}`}>
              <div className="flex items-start justify-between">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.icon}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <ChevronRight className={`w-4 h-4 ${c.chevron} opacity-0 group-hover:opacity-100 transition-opacity mt-0.5`} />
              </div>
              <div className="mt-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{item.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
