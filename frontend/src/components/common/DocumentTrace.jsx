import { useState, useEffect } from 'react';
import { FileText, ArrowRight, CheckCircle, Clock, XCircle, Truck, Receipt, CreditCard, ShoppingCart, ClipboardList } from 'lucide-react';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const DOC_CONFIG = {
  quotation: { label: 'Quotation', icon: FileText, color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  requisition: { label: 'Requisition', icon: ClipboardList, color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  sales_order: { label: 'Sales Order', icon: FileText, color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
  purchase_order: { label: 'Purchase Order', icon: ShoppingCart, color: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400' },
  delivery: { label: 'Delivery', icon: Truck, color: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' },
  goods_receipt: { label: 'Goods Receipt', icon: Truck, color: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' },
  billing: { label: 'Billing', icon: Receipt, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
  ar_invoice: { label: 'AR Invoice', icon: Receipt, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
  ap_invoice: { label: 'AP Invoice', icon: Receipt, color: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400' },
  payment: { label: 'Payment', icon: CreditCard, color: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
};

const STATUS_ICON = {
  draft: <Clock className="w-3 h-3 text-gray-400" />,
  confirmed: <CheckCircle className="w-3 h-3 text-blue-500" />,
  completed: <CheckCircle className="w-3 h-3 text-emerald-500" />,
  posted: <CheckCircle className="w-3 h-3 text-emerald-500" />,
  cancelled: <XCircle className="w-3 h-3 text-rose-500" />,
};

export default function DocumentTrace({ entityType, entityId }) {
  const [chain, setChain] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityType || !entityId) return;
    (async () => {
      try {
        const r = await api.get(`/shared/document-trace/${entityType}/${entityId}`);
        setChain(r?.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [entityType, entityId]);

  if (loading || !chain.length) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Document Flow</p>
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {chain.map((doc, i) => {
          const cfg = DOC_CONFIG[doc.type] || { label: doc.type, icon: FileText, color: 'bg-gray-100 text-gray-600' };
          const Icon = cfg.icon;
          const isCurrent = doc.type === entityType;
          return (
            <div key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />}
              <div className={`rounded-lg p-2.5 border transition-all ${isCurrent
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 ring-2 ring-blue-200 dark:ring-blue-800'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-6 h-6 rounded flex items-center justify-center ${cfg.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 uppercase">{cfg.label}</span>
                </div>
                <p className="text-xs font-mono font-medium text-gray-900 dark:text-gray-100">{doc.doc_number}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {STATUS_ICON[doc.status] || <Clock className="w-3 h-3 text-gray-400" />}
                  <span className="text-[10px] capitalize text-gray-500">{doc.status}</span>
                </div>
                {doc.amount && <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 mt-0.5">{formatCurrency(doc.amount)}</p>}
                {doc.date && <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(doc.date)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
