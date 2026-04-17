import { useState, useEffect } from 'react';
import { Plus, RotateCcw, CreditCard, Tag, CheckCircle } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, StatusBadge , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ReturnsPricingPage() {
  const [tab, setTab] = useState('returns');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({});
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);

  useEffect(() => { loadData(); }, [tab]);
  const loadData = async () => {
    setLoading(true);
    try {
      const [cu, ma] = await Promise.all([api.get('/master/business-partners', { type: 'customer', all: true }).catch(()=>null), api.get('/master/materials', { all: true }).catch(()=>null)]);
      setCustomers(cu?.data?.rows || cu?.data || []); setMaterials(ma?.data?.rows || ma?.data || []);
      if (tab === 'returns') setData((await api.get('/sales/returns').catch(()=>null))?.data || []);
      else if (tab === 'credit-notes') setData((await api.get('/sales/credit-notes').catch(()=>null))?.data || []);
      else if (tab === 'price-lists') setData((await api.get('/sales/price-lists').catch(()=>null))?.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleCreateReturn = async () => {
    try {
      const items = (form.items || []).filter(i => i.material_id && i.quantity);
      await api.post('/sales/returns', { customer_id: form.customer_id, reason: form.reason, items });
      setShowCreate(false); setForm({}); setAlert({ type: 'success', message: 'Return created' }); loadData();
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const handleProcessReturn = async (id) => {
    try { const r = await api.post(`/sales/returns/${id}/process`); setAlert({ type: 'success', message: `Return processed. Credit note: ${r?.data?.credit_note?.doc_number}` }); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const handleCreatePriceList = async () => {
    try {
      const items = (form.items || []).filter(i => i.material_id && i.unit_price);
      await api.post('/sales/price-lists', { ...form, items });
      setShowCreate(false); setForm({}); setAlert({ type: 'success', message: 'Price list created' }); loadData();
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const addItem = () => setForm({ ...form, items: [...(form.items || []), { material_id: '', quantity: 1, unit_price: '', reason: '' }] });
  const updateItem = (idx, f, v) => { const items = [...(form.items || [])]; items[idx] = { ...items[idx], [f]: v }; setForm({ ...form, items }); };
  const removeItem = (idx) => setForm({ ...form, items: (form.items || []).filter((_, i) => i !== idx) });

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Returns & Pricing</h1><p className="text-sm text-gray-400 mt-1">Customer returns, credit notes, price lists</p></div>
        <button onClick={() => { setForm({ items: [{}] }); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> {tab === 'price-lists' ? 'New Price List' : 'New Return'}</button>
      </div>

      <Tabs tabs={[{ key: 'returns', label: 'Returns', count: tab === 'returns' ? data.length : undefined }, { key: 'credit-notes', label: 'Credit Notes' }, { key: 'price-lists', label: 'Price Lists' }]} active={tab} onChange={setTab} />

      {tab === 'returns' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'doc_number', label: 'Return #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
        { key: 'customer_name', label: 'Customer' }, { key: 'return_date', label: 'Date', render: v => formatDate(v) },
        { key: 'reason', label: 'Reason', render: v => <span className="text-sm text-gray-500">{v || '—'}</span> },
        { key: 'total_amount', label: 'Amount', className: 'text-right', render: v => formatCurrency(v) },
        { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
        { key: 'id', label: '', render: (v, row) => row.status === 'draft' ? <button onClick={() => handleProcessReturn(v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Process</button> : null },
      ]} data={data} loading={loading} /></div>}

      {tab === 'credit-notes' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'doc_number', label: 'CN #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
        { key: 'note_type', label: 'Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{v}</span> },
        { key: 'partner_name', label: 'Partner' },
        { key: 'note_date', label: 'Date', render: v => formatDate(v) },
        { key: 'total_amount', label: 'Amount', className: 'text-right', render: v => formatCurrency(v) },
        { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
      ]} data={data} loading={loading} /></div>}

      {tab === 'price-lists' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'list_name', label: 'List Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
        { key: 'list_type', label: 'Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{v}</span> },
        { key: 'customer_group', label: 'Customer Group', render: v => v || 'All' },
        { key: 'currency', label: 'Currency' }, { key: 'priority', label: 'Priority', className: 'text-right' },
        { key: 'valid_from', label: 'Valid From', render: v => v ? formatDate(v) : 'Always' },
        { key: 'valid_to', label: 'Valid To', render: v => v ? formatDate(v) : 'No End' },
        { key: 'item_count', label: 'Items', className: 'text-right' },
        { key: 'is_active', label: 'Active', render: v => v ? <span className="text-emerald-600">Yes</span> : <span className="text-gray-400">No</span> },
      ]} data={data} loading={loading} /></div>}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={tab === 'price-lists' ? 'New Price List' : 'New Return'} size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><DownloadButton data={data} filename="ReturnsPricing" /><button onClick={tab === 'price-lists' ? handleCreatePriceList : handleCreateReturn} className="btn-primary">Create</button></>}>
        <div className="space-y-4">
          {tab !== 'price-lists' ? <>
            <FormField label="Customer"><select value={form.customer_id || ''} onChange={e => setForm({...form, customer_id: e.target.value})} className="select-field"><option value="">Select...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></FormField>
            <FormField label="Reason"><textarea value={form.reason || ''} onChange={e => setForm({...form, reason: e.target.value})} className="input-field" rows={2} /></FormField>
          </> : <>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="List Name" required><input value={form.list_name || ''} onChange={e => setForm({...form, list_name: e.target.value})} className="input-field" /></FormField>
              <FormField label="Customer Group"><input value={form.customer_group || ''} onChange={e => setForm({...form, customer_group: e.target.value})} className="input-field" /></FormField>
              <FormField label="Priority"><input type="number" value={form.priority || 0} onChange={e => setForm({...form, priority: parseInt(e.target.value)})} className="input-field" /></FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Valid From"><input type="date" value={form.valid_from || ''} onChange={e => setForm({...form, valid_from: e.target.value})} className="input-field" /></FormField>
              <FormField label="Valid To"><input type="date" value={form.valid_to || ''} onChange={e => setForm({...form, valid_to: e.target.value})} className="input-field" /></FormField>
              <FormField label="Currency"><select value={form.currency || 'USD'} onChange={e => setForm({...form, currency: e.target.value})} className="select-field"><option>USD</option><option>INR</option><option>EUR</option></select></FormField>
            </div>
          </>}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2"><span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Items</span><button onClick={addItem} className="text-xs text-blue-600 hover:underline">+ Add Item</button></div>
            {(form.items || []).map((item, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-end">
                <select value={item.material_id} onChange={e => updateItem(i, 'material_id', e.target.value)} className="select-field text-sm"><option value="">Material...</option>{materials.map(m => <option key={m.id} value={m.id}>{m.material_code} - {m.material_name}</option>)}</select>
                <input type="number" placeholder="Qty" value={item.quantity || ''} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input-field text-sm" />
                <input type="number" placeholder="Price" value={item.unit_price || ''} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input-field text-sm" />
                {tab !== 'price-lists' ? <input placeholder="Reason" value={item.reason || ''} onChange={e => updateItem(i, 'reason', e.target.value)} className="input-field text-sm" /> : <input type="number" placeholder="Discount %" value={item.discount_percent || ''} onChange={e => updateItem(i, 'discount_percent', e.target.value)} className="input-field text-sm" />}
                <button onClick={() => removeItem(i)} className="text-xs text-rose-500 hover:underline mb-2">Remove</button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
