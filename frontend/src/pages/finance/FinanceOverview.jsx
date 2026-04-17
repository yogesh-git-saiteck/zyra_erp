import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, CreditCard, ArrowDownLeft, ArrowUpRight, AlertTriangle, DollarSign } from 'lucide-react';
import { PageLoader } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export default function FinanceOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try { const res = await api.get('/finance/overview'); setData(res?.data); }
      catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <PageLoader />;

  const cards = [
    { title: 'Journal Entries', icon: BookOpen, color: 'from-blue-500 to-blue-600',
      stats: [
        { label: 'Total', value: formatNumber(data?.journals?.total || 0) },
        { label: 'Drafts', value: formatNumber(data?.journals?.drafts || 0) },
        { label: 'Posted', value: formatNumber(data?.journals?.posted || 0) },
      ], link: '/finance/journals' },
    { title: 'Accounts Payable', icon: ArrowDownLeft, color: 'from-rose-500 to-rose-600',
      stats: [
        { label: 'Open Balance', value: formatCurrency(data?.accountsPayable?.open_amount || 0) },
        { label: 'Total Invoices', value: formatNumber(data?.accountsPayable?.total || 0) },
        { label: 'Overdue', value: formatNumber(data?.accountsPayable?.overdue || 0), warn: true },
      ], link: '/finance/ap' },
    { title: 'Accounts Receivable', icon: ArrowUpRight, color: 'from-emerald-500 to-emerald-600',
      stats: [
        { label: 'Open Balance', value: formatCurrency(data?.accountsReceivable?.open_amount || 0) },
        { label: 'Total Invoices', value: formatNumber(data?.accountsReceivable?.total || 0) },
        { label: 'Overdue', value: formatNumber(data?.accountsReceivable?.overdue || 0), warn: true },
      ], link: '/finance/ar' },
    { title: 'Payments This Month', icon: CreditCard, color: 'from-violet-500 to-violet-600',
      stats: [
        { label: 'Total Amount', value: formatCurrency(data?.payments?.total_amount || 0) },
        { label: 'Transactions', value: formatNumber(data?.payments?.total || 0) },
      ], link: '/finance/payments' },
  ];

  const quickLinks = [
    { label: 'New Journal Entry', path: '/finance/journals', icon: BookOpen },
    { label: 'New AP Invoice', path: '/finance/ap', icon: FileText },
    { label: 'New AR Invoice', path: '/finance/ar', icon: FileText },
    { label: 'New Payment', path: '/finance/payments', icon: DollarSign },
    { label: 'Trial Balance', path: '/finance/reports/trial-balance', icon: FileText },
    { label: 'Profit & Loss', path: '/finance/reports/profit-loss', icon: FileText },
    { label: 'Balance Sheet', path: '/finance/reports/balance-sheet', icon: FileText },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Finance</h1>
          <p className="text-sm text-gray-400 mt-1">Financial accounting overview</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} onClick={() => navigate(card.link)}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 cursor-pointer hover:shadow-card transition-all group">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
            </div>
            <div className="space-y-2">
              {card.stats.map((s, j) => (
                <div key={j} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{s.label}</span>
                  <span className={`text-sm font-semibold ${s.warn && parseInt(s.value) > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                    {s.warn && parseInt(s.value) > 0 && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="section-title">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
          {quickLinks.map((ql, i) => (
            <button key={i} onClick={() => navigate(ql.path)}
              className="flex flex-col items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-center">
              <ql.icon className="w-5 h-5 text-blue-600" />
              <span className="text-xs text-gray-600 font-medium">{ql.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
