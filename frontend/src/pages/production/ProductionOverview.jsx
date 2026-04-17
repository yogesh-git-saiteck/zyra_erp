import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, Factory, Settings2, AlertTriangle, TrendingDown, Clock,
  ChevronRight, CheckCircle2, Circle, GitBranch, Cpu, BarChart3, ArrowRight,
} from 'lucide-react';
import { PageLoader } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber } from '../../utils/formatters';

// SAP PP process steps in configuration order
const PROCESS_STEPS = [
  {
    key: 'work_centers',
    label: 'Work Centers',
    tcode: 'CR01',
    icon: Settings2,
    color: 'blue',
    path: '/production/work-centers',
    desc: 'Define manufacturing resources, capacity, and cost rates',
    detail: 'Machine centers, labor pools, assembly cells',
  },
  {
    key: 'bom',
    label: 'Bill of Materials',
    tcode: 'CS01',
    icon: Layers,
    color: 'violet',
    path: '/production/bom',
    desc: 'Define product structure with components and quantities',
    detail: 'Components, scrap %, phantom items, validity',
  },
  {
    key: 'routing',
    label: 'Routing',
    tcode: 'CA01',
    icon: GitBranch,
    color: 'amber',
    path: '/production/routing',
    desc: 'Define operation sequence assigned to work centers',
    detail: 'Operations, setup/run times, control keys',
  },
  {
    key: 'prod_order',
    label: 'Production Order',
    tcode: 'CO01',
    icon: Factory,
    color: 'emerald',
    path: '/production/orders',
    desc: 'Create and release orders referencing BOM + Routing',
    detail: 'Plan → Release → Start → Complete',
  },
  {
    key: 'mrp',
    label: 'MRP Run',
    tcode: 'MD01',
    icon: Cpu,
    color: 'rose',
    path: '/production/mrp',
    desc: 'Explode demand, identify shortages, generate orders',
    detail: 'BOM explosion, shortage analysis, planned orders',
  },
];

const COLOR_MAP = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-200 dark:border-blue-800',   icon: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-300',   badge: 'bg-blue-100 text-blue-700' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', icon: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 text-violet-700' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800',  icon: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-300',  badge: 'bg-amber-100 text-amber-700' },
  emerald:{ bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-700' },
  rose:   { bg: 'bg-rose-50 dark:bg-rose-900/20',   border: 'border-rose-200 dark:border-rose-800',   icon: 'bg-rose-500',   text: 'text-rose-700 dark:text-rose-300',   badge: 'bg-rose-100 text-rose-700' },
};

export default function ProductionOverview() {
  const [data, setData] = useState(null);
  const [wcLoad, setWcLoad] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [overview, wc, routings] = await Promise.all([
          api.get('/production/overview'),
          api.get('/production/work-center-loading').catch(() => null),
          api.get('/production/routings').catch(() => null),
        ]);
        setData(overview?.data);
        setWcLoad(wc?.data || []);
        const d = overview?.data || {};
        setCounts({
          work_centers: parseInt(d.workCenters?.total || 0),
          bom: parseInt(d.boms?.total || 0),
          routing: (routings?.data || []).length,
          prod_order: parseInt(d.orders?.total || 0),
          mrp: null, // not a count, just an action
        });
      } catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <PageLoader />;

  const orders = data?.orders || {};
  const boms   = data?.boms   || {};
  const scrap  = data?.scrap  || {};
  const overdue= data?.overdue|| {};
  const totalProduced = parseFloat(scrap.total_produced || 0);
  const totalScrap    = parseFloat(scrap.total_scrap    || 0);
  const scrapRate     = totalProduced > 0
    ? ((totalScrap / (totalProduced + totalScrap)) * 100).toFixed(1) : 0;
  const activeOrders  = parseInt(orders.released || 0) + parseInt(orders.in_process || 0);

  const kpiCards = [
    {
      title: 'Bills of Material', icon: Layers, color: 'from-blue-500 to-blue-600',
      value: formatNumber(boms.total || 0),
      sub: `${boms.released || 0} released · ${boms.draft || 0} draft · ${boms.obsolete || 0} obsolete`,
      link: '/production/bom',
    },
    {
      title: 'Production Orders', icon: Factory, color: 'from-violet-500 to-violet-600',
      value: formatNumber(orders.total || 0),
      sub: `${orders.planned || 0} planned · ${activeOrders} active · ${orders.completed || 0} completed`,
      link: '/production/orders',
    },
    {
      title: 'Work Centers', icon: Settings2, color: 'from-emerald-500 to-emerald-600',
      value: formatNumber(data?.workCenters?.total || 0),
      sub: `${wcLoad.length} centers loaded`,
      link: '/production/work-centers',
    },
    {
      title: 'In Process', icon: Clock, color: 'from-amber-500 to-amber-600',
      value: formatNumber(orders.in_process || 0),
      sub: `${orders.released || 0} released, awaiting start`,
      link: '/production/orders',
    },
    {
      title: 'Overdue Orders', icon: AlertTriangle,
      color: overdue.count > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500',
      value: formatNumber(overdue.count || 0),
      sub: 'Past planned end date',
      link: '/production/orders',
    },
    {
      title: 'Scrap Rate', icon: TrendingDown,
      color: parseFloat(scrapRate) > 5 ? 'from-red-500 to-red-600' : 'from-emerald-500 to-emerald-600',
      value: `${scrapRate}%`,
      sub: `${formatNumber(totalScrap, 1)} scrapped of ${formatNumber(totalProduced + totalScrap, 1)} produced`,
      link: '/production/orders',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Production Planning (PP)</h1>
          <p className="text-sm text-gray-400 mt-1">SAP-style production configuration — Work Centers → BOM → Routing → Orders → MRP</p>
        </div>
        <button onClick={() => navigate('/production/mrp')} className="btn-secondary text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> Run MRP
        </button>
      </div>

      {/* ── SAP PP PROCESS FLOW ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">SAP PP Configuration Flow</h2>
          <span className="text-xs text-gray-400">Configure in this sequence for a complete setup</span>
        </div>

        {/* Flow Steps */}
        <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
          {PROCESS_STEPS.map((step, i) => {
            const c = COLOR_MAP[step.color];
            const count = counts[step.key];
            const configured = count === null ? true : count > 0;
            const Icon = step.icon;
            return (
              <div key={step.key} className="flex items-center flex-shrink-0">
                <button
                  onClick={() => navigate(step.path)}
                  className={`flex flex-col rounded-xl border-2 p-4 text-left transition-all hover:shadow-md w-44
                    ${configured ? c.border + ' ' + c.bg : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'}
                  `}
                >
                  {/* Step number + icon */}
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${configured ? c.icon : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <Icon className="w-4.5 h-4.5 text-white" style={{ width: '1.1rem', height: '1.1rem' }} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded font-semibold ${c.badge}`}>{step.tcode}</span>
                      {configured
                        ? <CheckCircle2 className={`w-4 h-4 ${c.text}`} />
                        : <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
                    </div>
                  </div>

                  {/* Step info */}
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-0.5">{step.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mb-2">{step.desc}</p>

                  {/* Count or action */}
                  {count !== null ? (
                    <div className="mt-auto">
                      <span className={`text-lg font-bold ${configured ? c.text : 'text-gray-400'}`}>
                        {formatNumber(count)}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">records</span>
                    </div>
                  ) : (
                    <span className={`text-xs font-medium ${c.text} mt-auto`}>Click to run →</span>
                  )}
                </button>

                {/* Arrow connector */}
                {i < PROCESS_STEPS.length - 1 && (
                  <div className="flex items-center px-1">
                    <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Setup guidance */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">
            <span className="font-semibold text-gray-500 dark:text-gray-400">Setup sequence: </span>
            Start with <strong>Work Centers</strong> (CR01) → create <strong>BOM</strong> for each finished product (CS01) → define <strong>Routing</strong> with operations per work center (CA01) → create <strong>Production Orders</strong> referencing both (CO01) → run <strong>MRP</strong> to identify shortages (MD01).
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {kpiCards.map((c, i) => (
          <div key={i} onClick={() => navigate(c.link)}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 cursor-pointer hover:shadow-md transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.title}</h3>
            </div>
            <p className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Work Center Loading */}
      {wcLoad.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Work Center Loading</h3>
            <button onClick={() => navigate('/production/work-centers')} className="text-xs text-blue-600 hover:underline">
              Manage work centers →
            </button>
          </div>
          <div className="space-y-3">
            {wcLoad.map((wc, i) => {
              const capacity  = parseFloat(wc.weekly_capacity_hours || 40);
              const scheduled = parseFloat(wc.scheduled_hours || 0);
              const pct   = capacity > 0 ? Math.min(100, (scheduled / capacity) * 100) : 0;
              const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{wc.wc_code} — {wc.wc_name}</span>
                    <span className="text-gray-500">{scheduled.toFixed(1)}h / {capacity.toFixed(0)}h ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  {pct > 90 && (
                    <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Overloaded — {wc.active_orders} active orders
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Production Order status pipeline */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Order Pipeline</h3>
          <button onClick={() => navigate('/production/orders')} className="text-xs text-blue-600 hover:underline">
            View all orders →
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Planned', value: orders.planned || 0, color: 'bg-gray-400' },
            { label: 'Released', value: orders.released || 0, color: 'bg-blue-500' },
            { label: 'In Process', value: orders.in_process || 0, color: 'bg-violet-500' },
            { label: 'Completed', value: orders.completed || 0, color: 'bg-emerald-500' },
          ].map((s, i, arr) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center min-w-[80px] bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <span className={`w-3 h-3 rounded-full ${s.color} mb-1`} />
                <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{formatNumber(s.value)}</span>
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
              {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
