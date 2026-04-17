import { useState, useEffect } from 'react';
import { Tabs, PageLoader , DownloadButton } from '../../components/common/index';
import { ExportButton } from '../../components/common/SharedFeatures';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';

const COLORS = ['#059669', '#1a6af5', '#d97706', '#ea580c', '#e11d48'];

export default function AgingReports() {
  const [tab, setTab] = useState('ar');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try { const r = await api.get(`/shared/aging/${tab}`); setData(r?.data); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const buckets = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_over_90'];
  const bucketLabels = { current: 'Current', days_1_30: '1-30', days_31_60: '31-60', days_61_90: '61-90', days_over_90: '90+' };

  const chartData = data?.totals ? buckets.map((b, i) => ({
    name: bucketLabels[b], value: parseFloat(data.totals[b] || 0), fill: COLORS[i]
  })) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Aging Reports</h1><p className="text-sm text-gray-400 mt-1">Receivable and payable aging analysis</p></div><DownloadButton data={Array.isArray(data) ? data : []} filename="AgingReports" />
        <ExportButton entity={tab === 'ar' ? 'ar_invoices' : 'ap_invoices'} />
      </div>

      <Tabs tabs={[{ key: 'ar', label: 'Accounts Receivable' }, { key: 'ap', label: 'Accounts Payable' }]} active={tab} onChange={setTab} />

      {loading ? <PageLoader /> : (
        <>
          {/* Chart */}
          {data?.totals && parseFloat(data.totals.total) > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
              <h3 className="section-title mb-0">{tab === 'ar' ? 'Receivable' : 'Payable'} Aging Summary</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Outstanding by days overdue</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{tab === 'ar' ? 'Customer' : 'Vendor'}</th>
                    {buckets.map(b => <th key={b} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{bucketLabels[b]} days</th>)}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows || []).map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{row.bp_number || row.vendor_number}</span>{' '}
                        <span className="font-medium text-gray-900 dark:text-gray-100">{row.customer_name || row.vendor_name}</span>
                      </td>
                      {buckets.map((b, bi) => {
                        const val = parseFloat(row[b] || 0);
                        return <td key={b} className={`px-4 py-3 text-right font-mono ${val > 0 && bi >= 3 ? 'text-rose-600 font-semibold' : val > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>{val > 0 ? formatCurrency(val) : '—'}</td>;
                      })}
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                  {(data?.rows || []).length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No outstanding {tab === 'ar' ? 'receivables' : 'payables'}</td></tr>
                  )}
                </tbody>
                {data?.totals && parseFloat(data.totals.total) > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 font-semibold border-t-2 border-gray-300 dark:border-gray-700">
                      <td className="px-4 py-3">Total</td>
                      {buckets.map(b => <td key={b} className="px-4 py-3 text-right">{formatCurrency(data.totals[b])}</td>)}
                      <td className="px-4 py-3 text-right text-lg">{formatCurrency(data.totals.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
