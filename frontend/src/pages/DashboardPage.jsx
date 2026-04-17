import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, ShoppingCart, DollarSign, Users, ArrowUpRight, ArrowDownRight,
  Activity, Zap, Target, Layers, CreditCard, Package, RefreshCw, Clock,
  AlertTriangle, CheckCircle, Info, AlertCircle, Factory, Calendar, FileText
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RPieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/common/index';
import api from '../utils/api';
import { formatCurrency, formatNumber, timeAgo } from '../utils/formatters';

const REFRESH_INTERVAL = 30000; // 30 seconds

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-elevated">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-sm font-semibold" style={{ color: p.color }}>
            {p.name === 'revenue' ? formatCurrency(p.value) : formatNumber(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const INSIGHT_ICONS = {
  positive: { icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
  warning: { icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
  danger: { icon: AlertCircle, color: 'text-rose-600 bg-rose-50' },
  info: { icon: Info, color: 'text-blue-600 bg-blue-50' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [insights, setInsights] = useState([]);
  const [salesTrend, setSalesTrend] = useState([]);
  const [moduleActivity, setModuleActivity] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [kpiRes, insightRes, trendRes, modRes, custRes] = await Promise.all([
        api.get('/dashboard/kpis').catch(()=>null),
        api.get('/dashboard/ai-insights').catch(()=>null),
        api.get('/dashboard/sales-trend').catch(()=>null),
        api.get('/dashboard/module-activity').catch(()=>null),
        api.get('/dashboard/top-customers').catch(()=>null),
      ]);
      setKpis(kpiRes?.data);
      setInsights(insightRes?.data?.insights || []);
      setSalesTrend(trendRes?.data || []);
      setModuleActivity(modRes?.data || []);
      setTopCustomers(custRes?.data || []);
      setLastRefresh(new Date());
    } catch (err) { console.error('Dashboard load error:', err); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Initial load
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Auto-refresh polling
  useEffect(() => {
    const interval = setInterval(() => loadDashboard(false), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  if (loading) return <PageLoader />;

  const statCards = [
    { title: 'Sales Orders', value: formatCurrency(kpis?.salesOrders?.amount || 0),
      sub: `${kpis?.salesOrders?.total || 0} orders this month`,
      icon: TrendingUp, color: 'from-blue-500 to-blue-600',
      trend: `${kpis?.salesOrders?.trend >= 0 ? '+' : ''}${kpis?.salesOrders?.trend || 0}%`,
      trendUp: kpis?.salesOrders?.trendUp, link: '/sales/orders' },
    { title: 'Purchase Orders', value: formatCurrency(kpis?.purchaseOrders?.amount || 0),
      sub: `${kpis?.purchaseOrders?.total || 0} orders · ${kpis?.purchaseOrders?.pending || 0} pending`,
      icon: ShoppingCart, color: 'from-violet-500 to-violet-600',
      trend: `${kpis?.purchaseOrders?.trend >= 0 ? '+' : ''}${kpis?.purchaseOrders?.trend || 0}%`,
      trendUp: kpis?.purchaseOrders?.trendUp, link: '/procurement/orders' },
    { title: 'Accounts Receivable', value: formatCurrency(kpis?.accountsReceivable?.balance || 0),
      sub: `${kpis?.accountsReceivable?.count || 0} open · ${kpis?.accountsReceivable?.overdue_count || 0} overdue`,
      icon: CreditCard, color: 'from-emerald-500 to-emerald-600',
      trend: kpis?.accountsReceivable?.overdue_count > 0 ? `${kpis.accountsReceivable.overdue_count} overdue` : 'On track',
      trendUp: (kpis?.accountsReceivable?.overdue_count || 0) === 0, link: '/finance/ar' },
    { title: 'Accounts Payable', value: formatCurrency(kpis?.accountsPayable?.balance || 0),
      sub: `${kpis?.accountsPayable?.count || 0} open · ${kpis?.accountsPayable?.overdue_count || 0} overdue`,
      icon: DollarSign, color: 'from-amber-500 to-amber-600',
      trend: kpis?.accountsPayable?.overdue_count > 0 ? `${kpis.accountsPayable.overdue_count} overdue` : 'On track',
      trendUp: (kpis?.accountsPayable?.overdue_count || 0) === 0, link: '/finance/ap' },
  ];

  const quickStats = [
    { label: 'Inventory Items', value: formatNumber(kpis?.inventory?.materials || 0), sub: formatCurrency(kpis?.inventory?.stock_value || 0), icon: Package, color: 'text-blue-600 bg-blue-50' },
    { label: 'CRM Pipeline', value: formatCurrency(kpis?.opportunities?.pipeline || 0), sub: `${kpis?.opportunities?.total || 0} opps · ${kpis?.opportunities?.hot_leads || 0} hot`, icon: Target, color: 'text-violet-600 bg-violet-50' },
    { label: 'Employees', value: formatNumber(kpis?.employees?.active || 0), sub: `${kpis?.leavesPending || 0} leave pending`, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Production', value: `${kpis?.productionActive || 0} active`, sub: `${kpis?.journalsToday || 0} JEs today`, icon: Factory, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Welcome back, {user?.first_name || user?.firstName || 'User'}</h1>
          <p className="text-sm text-gray-400 mt-1">Real-time enterprise overview · Auto-refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-3">
          {kpis?.pendingApprovals > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs text-amber-700 font-medium">{kpis.pendingApprovals} pending approval(s)</span>
            </div>
          )}
          <button onClick={() => loadDashboard(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors ${refreshing ? 'opacity-60' : ''}`}>
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="text-xs text-gray-600 font-medium">{lastRefresh ? `Updated ${timeAgo(lastRefresh)}` : 'Refresh'}</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-emerald-700 font-medium">Live</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <div key={i} className="stat-card group cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            onClick={() => navigate(card.link)}>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${card.trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {card.trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {card.trend}
                </div>
              </div>
              <p className="text-2xl font-display font-bold tracking-tight text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{card.title}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quickStats.map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${stat.color}`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-400 truncate">{stat.sub || stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend — live */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
          <h3 className="section-title mb-0">Revenue Trend</h3>
          <p className="text-xs text-gray-400 mb-4">Monthly sales revenue — live data</p>
          <div className="h-64">
            {salesTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend}>
                  <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1a6af5" stopOpacity={0.15} /><stop offset="100%" stopColor="#1a6af5" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#1a6af5" strokeWidth={2} fill="url(#revGrad)" name="revenue" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                <div className="text-center"><FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" /><p>Create sales orders to see revenue trend</p></div>
              </div>
            )}
          </div>
        </div>

        {/* Module Activity — live from audit log */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="section-title">Module Activity</h3>
          <p className="text-xs text-gray-400 mb-4">Last 30 days — live</p>
          {moduleActivity.length > 0 ? (() => {
            const PALETTE = ['#1a6af5','#059669','#e11d48','#d97706','#7c3aed','#0891b2','#ea580c','#6366f1','#10b981','#f59e0b'];
            const colored = moduleActivity.map((m, i) => ({ ...m, color: PALETTE[i % PALETTE.length] }));
            return (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <RPieChart>
                      <Pie data={colored} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                        {colored.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                    </RPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {colored.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} /><span className="text-gray-600 font-medium capitalize">{m.name}</span></div>
                      <span className="text-gray-700 font-semibold">{m.value}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })() : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No activity yet</div>
          )}
        </div>
      </div>

      {/* Top Customers */}
      {topCustomers.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="section-title mb-0">Top Customers</h3>
          <p className="text-xs text-gray-400 mb-4">By revenue — live</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustomers} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="display_name" tick={{ fontSize: 11, fill: '#64748b' }} width={120} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#1a6af5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom: Activity + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity — live */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title mb-0">Recent Activity</h3>
            <span className="text-xs text-gray-400">Live feed</span>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto">
            {(kpis?.recentActivity || []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet. Start creating data to see the feed.</p>
            ) : (
              kpis.recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2 hover:bg-gray-50 rounded-lg px-2 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{a.user_name}</span>{' '}
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium
                        ${a.action === 'CREATE' ? 'bg-emerald-50 text-emerald-700' :
                          a.action === 'DELETE' ? 'bg-rose-50 text-rose-700' :
                          a.action === 'POST' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {a.action}
                      </span>{' '}
                      {a.entity_type?.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-400">{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI Insights — live from real data */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-violet-100 flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-display font-semibold text-gray-900">AI Insights</h3>
                <p className="text-xs text-gray-400">Analyzed from live data</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded-full">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-blue-600 font-medium">Real-time</span>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
            {insights.map((insight, i) => {
              const cfg = INSIGHT_ICONS[insight.type] || INSIGHT_ICONS.info;
              const Icon = cfg.icon;
              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div className={`w-7 h-7 rounded-lg ${cfg.color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{insight.category}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{insight.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
