import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ShoppingBag, Truck, Receipt, ArrowRight } from 'lucide-react';
import { PageLoader } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export default function SalesOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try { const res = await api.get('/sales/overview'); setData(res?.data); }
      catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <PageLoader />;

  const cards = [
    { title: 'Quotations', icon: FileText, color: 'from-blue-500 to-blue-600',
      value: formatCurrency(data?.quotations?.amount || 0), sub: `${data?.quotations?.total || 0} total · ${data?.quotations?.drafts || 0} drafts`,
      link: '/sales/quotations' },
    { title: 'Sales Orders', icon: ShoppingBag, color: 'from-emerald-500 to-emerald-600',
      value: formatCurrency(data?.orders?.amount || 0), sub: `${data?.orders?.total || 0} total · ${data?.orders?.confirmed || 0} confirmed`,
      link: '/sales/orders' },
    { title: 'Deliveries', icon: Truck, color: 'from-violet-500 to-violet-600',
      value: formatNumber(data?.deliveries?.total || 0), sub: `${data?.deliveries?.pending || 0} pending`,
      link: '/sales/deliveries' },
    { title: 'Billing', icon: Receipt, color: 'from-amber-500 to-amber-600',
      value: formatCurrency(data?.billing?.amount || 0), sub: `Outstanding: ${formatCurrency(data?.billing?.outstanding || 0)}`,
      link: '/sales/billing' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sales & Distribution</h1><p className="text-sm text-gray-400 mt-1">Order-to-cash process overview</p></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} onClick={() => navigate(c.link)} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 cursor-pointer hover:shadow-card transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}>
                <c.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{c.title}</h3>
            </div>
            <p className="text-2xl font-display font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Process flow */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="section-title">Order-to-Cash Flow</h3>
        <div className="flex items-center justify-between mt-4 px-4">
          {['Quotation', 'Sales Order', 'Delivery', 'Billing', 'Payment'].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                  ${i < 4 ? 'bg-blue-50 text-blue-600 border-2 border-blue-200' : 'bg-gray-100 text-gray-500 border-2 border-gray-200'}`}>
                  {i + 1}
                </div>
                <span className="text-xs text-gray-500 mt-1.5">{step}</span>
              </div>
              {i < 4 && <ArrowRight className="w-5 h-5 text-gray-300 mt-[-16px]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
