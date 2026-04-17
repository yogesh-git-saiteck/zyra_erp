import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from 'recharts';
import { PageLoader , DownloadButton } from '../../components/common/index';
import { ExportButton } from '../../components/common/SharedFeatures';
import api from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-elevated">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-xs font-semibold" style={{ color: p.color }}>{p.name}: {formatCurrency(p.value)}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function CashFlowForecast() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => { loadData(); }, [months]);

  const loadData = async () => {
    setLoading(true);
    try { const r = await api.get('/finance/reports/cash-flow', { months }); setData(r?.data); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  if (loading) return <PageLoader />;

  const isNegative = data?.projections?.some(p => p.balance < 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Cash Flow Forecast</h1><p className="text-sm text-gray-400 mt-1">Projected cash position based on AR/AP and recurring expenses</p></div><DownloadButton data={data} filename="CashFlowForecast" />
        <div className="flex gap-2 items-center">
          <select value={months} onChange={e => setMonths(e.target.value)} className="select-field w-32 py-1.5 text-sm">
            <option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center"><DollarSign className="w-5 h-5 text-white" /></div>
          <div><p className="text-lg font-display font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data?.currentCash || 0)}</p><p className="text-xs text-gray-400">Current Cash</p></div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-white" /></div>
          <div><p className="text-lg font-display font-bold text-emerald-600">{formatCurrency(data?.totalInflow || 0)}</p><p className="text-xs text-gray-400">Expected Inflow</p></div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-white" /></div>
          <div><p className="text-lg font-display font-bold text-rose-600">{formatCurrency(data?.totalOutflow || 0)}</p><p className="text-xs text-gray-400">Expected Outflow</p></div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${isNegative ? 'from-rose-500 to-rose-600' : 'from-amber-500 to-amber-600'} flex items-center justify-center`}>
            {isNegative ? <AlertTriangle className="w-5 h-5 text-white" /> : <DollarSign className="w-5 h-5 text-white" />}
          </div>
          <div>
            <p className="text-lg font-display font-bold text-gray-900 dark:text-gray-100">{formatCurrency(data?.avgMonthlyExpense || 0)}</p>
            <p className="text-xs text-gray-400">Avg Monthly Expense</p>
          </div>
        </div>
      </div>

      {isNegative && (
        <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">Cash flow is projected to go negative within {months} months. Consider accelerating collections or deferring payables.</p>
        </div>
      )}

      {/* Balance projection chart */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="section-title mb-0">Projected Cash Balance</h3>
        <p className="text-xs text-gray-400 mb-4">Month-by-month cash position</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.projections || []}>
              <defs>
                <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1a6af5" stopOpacity={0.15} /><stop offset="100%" stopColor="#1a6af5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="balance" stroke="#1a6af5" strokeWidth={2} fill="url(#cfGrad)" name="Balance" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Inflow vs Outflow chart */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="section-title mb-0">Inflow vs Outflow</h3>
        <p className="text-xs text-gray-400 mb-4">Monthly cash movement breakdown</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.projections || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="inflow" fill="#10b981" radius={[4, 4, 0, 0]} name="Inflow (AR)" />
              <Bar dataKey="outflow" fill="#ef4444" radius={[4, 4, 0, 0]} name="Outflow (AP)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projection table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Month</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Inflow</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Outflow</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Net</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Balance</th>
            </tr></thead>
            <tbody>{(data?.projections || []).map((p, i) => (
              <tr key={i} className="table-row">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{p.month}</td>
                <td className="px-4 py-3 text-right text-emerald-600 font-mono">{formatCurrency(p.inflow)}</td>
                <td className="px-4 py-3 text-right text-rose-600 font-mono">{formatCurrency(p.outflow)}</td>
                <td className={`px-4 py-3 text-right font-semibold font-mono ${p.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(p.net)}</td>
                <td className={`px-4 py-3 text-right font-bold font-mono ${p.balance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-rose-600'}`}>{formatCurrency(p.balance)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
