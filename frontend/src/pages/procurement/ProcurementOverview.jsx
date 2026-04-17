import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ShoppingCart, PackageCheck, ArrowRight } from 'lucide-react';
import { PageLoader } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export default function ProcurementOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try { const res = await api.get('/procurement/overview'); setData(res?.data); }
      catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <PageLoader />;

  const cards = [
    { title: 'Requisitions', icon: ClipboardList, color: 'from-blue-500 to-blue-600',
      value: formatNumber(data?.requisitions?.total || 0), sub: `${data?.requisitions?.drafts || 0} drafts · ${formatCurrency(data?.requisitions?.amount || 0)}`,
      link: '/procurement/requisitions' },
    { title: 'Purchase Orders', icon: ShoppingCart, color: 'from-violet-500 to-violet-600',
      value: formatCurrency(data?.purchaseOrders?.amount || 0), sub: `${data?.purchaseOrders?.total || 0} total · ${data?.purchaseOrders?.confirmed || 0} confirmed`,
      link: '/procurement/orders' },
    { title: 'Goods Receipts', icon: PackageCheck, color: 'from-emerald-500 to-emerald-600',
      value: formatNumber(data?.goodsReceipts?.total || 0), sub: `${data?.goodsReceipts?.pending || 0} pending`,
      link: '/procurement/goods-receipts' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Procurement</h1><p className="text-sm text-gray-400 mt-1">Procure-to-pay process overview</p></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} onClick={() => navigate(c.link)} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 cursor-pointer hover:shadow-card transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}><c.icon className="w-5 h-5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-900">{c.title}</h3>
            </div>
            <p className="text-2xl font-display font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
        <h3 className="section-title">Procure-to-Pay Flow</h3>
        <div className="flex items-center justify-between mt-4 px-8">
          {['Requisition', 'Purchase Order', 'Goods Receipt', 'Invoice Verification', 'Payment'].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                  ${i < 3 ? 'bg-blue-50 text-blue-600 border-2 border-blue-200' : 'bg-gray-100 text-gray-500 border-2 border-gray-200'}`}>{i + 1}</div>
                <span className="text-xs text-gray-500 mt-1.5 text-center max-w-[80px]">{step}</span>
              </div>
              {i < 4 && <ArrowRight className="w-5 h-5 text-gray-300 mt-[-16px]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
