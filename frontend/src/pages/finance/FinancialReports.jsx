import { useState, useEffect } from 'react';
import { FileText, Download } from 'lucide-react';
import { Tabs, PageLoader , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function FinancialReports() {
  const [tab, setTab] = useState('trial-balance');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [fromDate, setFromDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { loadReport(); }, [tab, asOfDate, fromDate, toDate]);

  const loadReport = async () => {
    setLoading(true);
    try {
      let res;
      if (tab === 'trial-balance') res = await api.get('/finance/reports/trial-balance', { as_of_date: asOfDate });
      else if (tab === 'profit-loss') res = await api.get('/finance/reports/profit-loss', { from_date: fromDate, to_date: toDate });
      else if (tab === 'balance-sheet') res = await api.get('/finance/reports/balance-sheet', { as_of_date: asOfDate });
      setData(res?.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const tabs = [
    { key: 'trial-balance', label: 'Trial Balance' },
    { key: 'profit-loss', label: 'Profit & Loss' },
    { key: 'balance-sheet', label: 'Balance Sheet' },
  ];

  const renderSection = (title, accounts, totalLabel, totalValue, colorClass = 'text-gray-900') => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 pb-2 border-b border-gray-200">{title}</h4>
      {accounts?.length > 0 ? accounts.map((a, i) => (
        <div key={i} className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded text-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-gray-400 w-12">{a.account_code}</span>
            <span className="text-gray-700">{a.account_name}</span>
            {a.account_group && <span className="text-xs text-gray-400">({a.account_group})</span>}
          </div>
          <span className="font-medium tabular-nums">{formatCurrency(Math.abs(parseFloat(a.balance || a.amount || 0)))}</span>
        </div>
      )) : <p className="text-sm text-gray-400 py-2 px-2">No posted transactions</p>}
      <div className={`flex items-center justify-between py-2 px-2 mt-1 border-t-2 border-gray-300 font-semibold ${colorClass}`}>
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatCurrency(Math.abs(totalValue || 0))}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Financial Reports</h1><p className="text-sm text-gray-400 mt-1">Trial Balance, Profit & Loss, Balance Sheet</p></div><DownloadButton data={Array.isArray(data) ? data : []} filename="FinancialReports" />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="flex items-center gap-3">
          {(tab === 'trial-balance' || tab === 'balance-sheet') && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">As of:</label>
              <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="input-field py-1.5 text-sm w-40" />
            </div>
          )}
          {tab === 'profit-loss' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">From:</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input-field py-1.5 text-sm w-36" />
              <label className="text-xs text-gray-500">To:</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input-field py-1.5 text-sm w-36" />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        {loading ? <PageLoader /> : (
          <>
            {/* TRIAL BALANCE */}
            {tab === 'trial-balance' && data && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-semibold text-gray-900">Trial Balance</h3>
                  <p className="text-sm text-gray-500">As of {formatDate(data.as_of_date)}</p>
                </div>
                {data.accounts?.length > 0 ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Account</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Type</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Debit</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Credit</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Balance</th>
                      </tr></thead>
                      <tbody>
                        {data.accounts.map((a, i) => (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs text-blue-600">{a.account_code}</td>
                            <td className="px-4 py-2 text-gray-700">{a.account_name}</td>
                            <td className="px-4 py-2 capitalize text-gray-500">{a.account_type}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(a.total_debit)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(a.total_credit)}</td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums">{formatCurrency(a.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr className="bg-gray-50 font-semibold">
                        <td colSpan={3} className="px-4 py-2.5">Total</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(data.totals.total_debit)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(data.totals.total_credit)}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(data.totals.total_debit - data.totals.total_credit)}</td>
                      </tr></tfoot>
                    </table>
                  </div>
                ) : <p className="text-center py-12 text-gray-400">No posted journal entries found. Create and post journal entries to see the trial balance.</p>}
              </div>
            )}

            {/* PROFIT & LOSS */}
            {tab === 'profit-loss' && data && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-semibold text-gray-900">Profit & Loss Statement</h3>
                  <p className="text-sm text-gray-500">{formatDate(data.from_date)} — {formatDate(data.to_date)}</p>
                </div>
                {renderSection('Revenue', data.revenue, 'Total Revenue', data.totalRevenue, 'text-emerald-700')}
                {renderSection('Expenses', data.expenses?.map(e => ({ ...e, amount: Math.abs(parseFloat(e.amount)) })), 'Total Expenses', data.totalExpenses, 'text-rose-700')}
                <div className={`flex items-center justify-between py-3 px-2 mt-2 border-t-2 border-gray-900 text-lg font-bold ${data.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  <span>Net {data.netIncome >= 0 ? 'Income' : 'Loss'}</span>
                  <span className="tabular-nums">{formatCurrency(Math.abs(data.netIncome))}</span>
                </div>
              </div>
            )}

            {/* BALANCE SHEET */}
            {tab === 'balance-sheet' && data && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-semibold text-gray-900">Balance Sheet</h3>
                  <p className="text-sm text-gray-500">As of {formatDate(data.as_of_date)}</p>
                </div>
                {renderSection('Assets', data.assets, 'Total Assets', data.totalAssets, 'text-blue-700')}
                {renderSection('Liabilities', data.liabilities, 'Total Liabilities', data.totalLiabilities, 'text-rose-700')}
                {renderSection('Equity', data.equity, 'Total Equity', data.totalEquity, 'text-violet-700')}
                <div className="flex items-center justify-between py-3 px-2 mt-2 border-t-2 border-gray-900 text-lg font-bold text-gray-900">
                  <span>Total Liabilities + Equity</span>
                  <span className="tabular-nums">{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
