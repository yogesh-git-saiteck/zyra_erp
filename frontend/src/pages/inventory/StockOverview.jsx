import { useState, useEffect } from 'react';
import { Package, Warehouse, AlertTriangle, DollarSign } from 'lucide-react';
import { DataTable, SearchInput, PageLoader , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { ExportButton } from '../../components/common/SharedFeatures';

export default function StockOverview() {
  const [stock, setStock] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadData(); }, [search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, sum] = await Promise.all([
        api.get('/inventory/stock', { search }).catch(()=>null),
        api.get('/inventory/stock-summary').catch(()=>null),
      ]);
      setStock(s?.data || []); setSummary(sum?.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const cards = summary ? [
    { title: 'Materials in Stock', value: formatNumber(summary.totalMaterials), icon: Package, color: 'from-blue-500 to-blue-600' },
    { title: 'Total Stock Value', value: formatCurrency(summary.totalValue), icon: DollarSign, color: 'from-emerald-500 to-emerald-600' },
    { title: 'Total Quantity', value: formatNumber(summary.totalQuantity), icon: Warehouse, color: 'from-violet-500 to-violet-600' },
    { title: 'Low Stock Alerts', value: formatNumber(summary.lowStockCount), icon: AlertTriangle, color: 'from-amber-500 to-amber-600' },
  ] : [];

  const columns = [
    { key: 'material_code', label: 'Material', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'material_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'type_name', label: 'Type', render: v => <span className="text-gray-500">{v || '—'}</span> },
    { key: 'plant_code', label: 'Plant', render: v => <span className="font-mono text-gray-600">{v}</span> },
    { key: 'sloc_code', label: 'SLoc', render: v => <span className="font-mono text-gray-600">{v || '—'}</span> },
    { key: 'quantity', label: 'Quantity', className: 'text-right', render: (v, row) => (
      <span className="font-semibold">{formatNumber(v, 1)} <span className="text-gray-400 text-xs">{row.uom_code}</span></span>
    )},
    { key: 'stock_value', label: 'Value', className: 'text-right', render: v => <span className="text-gray-700">{formatCurrency(v)}</span> },
    { key: 'batch_number', label: 'Batch', render: v => v || '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Inventory</h1><p className="text-sm text-gray-400 mt-1">Stock levels and valuation</p></div><DownloadButton data={stock} filename="StockOverview" />
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {cards.map((c, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-lg font-display font-bold text-gray-900">{c.value}</p>
                <p className="text-xs text-gray-400">{c.title}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary?.byPlant?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h3 className="section-title">Stock by Plant</h3>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {summary.byPlant.map((p, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="font-mono text-sm text-blue-600 font-medium">{p.plant_code}</p>
                <p className="text-xs text-gray-500">{p.plant_name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">{p.materials} materials</span>
                  <span className="text-sm font-semibold">{formatNumber(p.qty)} units</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Search materials..." className="w-72" />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={columns} data={stock} loading={loading} emptyMessage="No stock found. Post stock movements to add inventory." />
      </div>
    </div>
  );
}
