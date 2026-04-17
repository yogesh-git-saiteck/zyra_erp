import { useState, useEffect } from 'react';
import { Package, AlertTriangle, TrendingUp, Archive } from 'lucide-react';
import { PieChart as RPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { DataTable, Tabs, PageLoader , DownloadButton } from '../../components/common/index';
import { ExportButton } from '../../components/common/SharedFeatures';
import api from '../../utils/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';

const CAT_CONFIG = {
  dead: { label: 'Dead Stock', color: '#ef4444', badge: 'badge-danger' },
  slow: { label: 'Slow Moving', color: '#f59e0b', badge: 'badge-warning' },
  normal: { label: 'Normal', color: '#1a6af5', badge: 'badge-info' },
  fast: { label: 'Fast Moving', color: '#10b981', badge: 'badge-success' },
};

export default function InventoryTurnover() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [catFilter, setCatFilter] = useState('');

  useEffect(() => { loadData(); }, [months]);

  const loadData = async () => {
    setLoading(true);
    try { const r = await api.get('/inventory/turnover', { months }); setData(r?.data); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  if (loading) return <PageLoader />;

  const filtered = catFilter ? (data?.rows || []).filter(r => r.category === catFilter) : (data?.rows || []);
  const summary = data?.summary || {};

  const pieData = [
    { name: 'Dead Stock', value: summary.deadStock || 0, color: '#ef4444' },
    { name: 'Slow Moving', value: summary.slowMoving || 0, color: '#f59e0b' },
    { name: 'Normal', value: summary.normalMoving || 0, color: '#1a6af5' },
    { name: 'Fast Moving', value: summary.fastMoving || 0, color: '#10b981' },
  ].filter(d => d.value > 0);

  const columns = [
    { key: 'material_code', label: 'Material', render: (v, row) => <div><span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span><br/><span className="text-xs text-gray-500">{row.material_name}</span></div> },
    { key: 'current_stock', label: 'Stock', className: 'text-right', render: v => formatNumber(v, 1) },
    { key: 'stock_value', label: 'Value', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'total_issued', label: `Issued (${months}m)`, className: 'text-right', render: v => <span className={parseFloat(v) > 0 ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300'}>{formatNumber(v, 1)}</span> },
    { key: 'total_received', label: `Received (${months}m)`, className: 'text-right', render: v => formatNumber(v, 1) },
    { key: 'turnover_ratio', label: 'Turnover', className: 'text-right', render: v => <span className="font-semibold">{v}×</span> },
    { key: 'days_of_supply', label: 'Days Supply', className: 'text-right', render: v => <span className={parseInt(v) > 180 ? 'text-rose-600 font-semibold' : ''}>{parseInt(v) >= 999 ? '∞' : v}</span> },
    { key: 'last_movement', label: 'Last Movement', render: v => v ? formatDate(v) : <span className="text-rose-500">None</span> },
    { key: 'category', label: 'Category', render: v => { const c = CAT_CONFIG[v]; return <span className={`badge ${c?.badge || 'badge-neutral'}`}>{c?.label || v}</span>; }},
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory Turnover</h1><p className="text-sm text-gray-400 mt-1">Stock movement analysis and dead stock identification</p></div><DownloadButton data={data} filename="InventoryTurnover" />
        <div className="flex gap-2 items-center">
          <select value={months} onChange={e => setMonths(e.target.value)} className="select-field w-32 py-1.5 text-sm">
            <option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months</option>
          </select>
          <ExportButton entity="stock" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.totalItems || 0}</p><p className="text-xs text-gray-400">Total Items</p></div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center cursor-pointer hover:border-rose-300" onClick={() => setCatFilter(catFilter === 'dead' ? '' : 'dead')}>
          <p className="text-2xl font-bold text-rose-600">{summary.deadStock || 0}</p><p className="text-xs text-gray-400">Dead Stock</p></div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center cursor-pointer hover:border-amber-300" onClick={() => setCatFilter(catFilter === 'slow' ? '' : 'slow')}>
          <p className="text-2xl font-bold text-amber-600">{summary.slowMoving || 0}</p><p className="text-xs text-gray-400">Slow Moving</p></div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center cursor-pointer hover:border-blue-300" onClick={() => setCatFilter(catFilter === 'normal' ? '' : 'normal')}>
          <p className="text-2xl font-bold text-blue-600">{summary.normalMoving || 0}</p><p className="text-xs text-gray-400">Normal</p></div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center cursor-pointer hover:border-emerald-300" onClick={() => setCatFilter(catFilter === 'fast' ? '' : 'fast')}>
          <p className="text-2xl font-bold text-emerald-600">{summary.fastMoving || 0}</p><p className="text-xs text-gray-400">Fast Moving</p></div>
      </div>

      {/* Dead stock warning */}
      {summary.deadStockValue > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-400">
            {formatCurrency(summary.deadStockValue)} tied up in dead stock ({summary.deadStock} items with zero movement in {months} months). Consider write-offs or clearance sales.
          </p>
        </div>
      )}

      {/* Chart + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="section-title">Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RPieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie><Tooltip /></RPieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">{pieData.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /><span className="text-gray-500 dark:text-gray-400">{d.name}</span></div>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{d.value}</span>
            </div>
          ))}</div>
        </div>
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
          <h3 className="section-title">Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Total Stock Value</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(summary.totalStockValue || 0)}</p>
            </div>
            <div className="bg-rose-50 dark:bg-rose-950 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Dead Stock Value</p>
              <p className="text-xl font-bold text-rose-600">{formatCurrency(summary.deadStockValue || 0)}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.totalStockValue > 0 ? ((summary.deadStockValue / summary.totalStockValue) * 100).toFixed(1) : 0}% of total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={columns} data={filtered} loading={false} emptyMessage="No stock data. Post stock movements to see turnover analysis." />
      </div>
    </div>
  );
}
