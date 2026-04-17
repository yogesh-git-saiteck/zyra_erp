import { useState, useEffect } from 'react';
import { Truck, Eye, Trash2, Search, Package, FileText , Printer } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, StatusBadge ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { printDocument, buildPrintHTML } from '../../utils/printDoc';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function Deliveries() {
  const [data, setData] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [eligibleSOs, setEligibleSOs] = useState([]);
  const [selectedSO, setSelectedSO] = useState(null);
  const [deliveryCheck, setDeliveryCheck] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { loadData(); }, [search]);
  const loadData = async () => { setLoading(true); try { const r = await api.get('/sales/deliveries', { search }); setData(r?.data || []); } catch {} finally { setLoading(false); } };

  const openCreate = async () => {
    try {
      const sos = await api.get('/sales/orders', { status: 'confirmed' }).catch(()=>null);
      let all = sos?.data || [];
      try { const pd = await api.get('/sales/orders', { status: 'partially_delivered' }).catch(()=>null); all = [...all, ...(pd?.data || [])]; } catch {}
      // Only goods SOs need delivery — service SOs go directly to billing
      all = all.filter(so => (so.doc_type || 'goods') !== 'service');
      setEligibleSOs(all);
      setSelectedSO(null); setDeliveryCheck(null); setForm({}); setModalError(null); setShowCreate(true);
    } catch (e) { setModalError(e.message); }
  };

  const selectSO = async (soId) => {
    if (!soId) { setSelectedSO(null); setDeliveryCheck(null); return; }
    try {
      const r = await api.get(`/sales/orders/${soId}/delivery-check`);
      setSelectedSO(soId);
      setDeliveryCheck(r?.data);
      setForm({ so_id: soId });
    } catch (e) { setModalError(e.message); }
  };

  const handleCreate = async () => {
    setModalError(null);
    if (!selectedSO) return setModalError('Select a sales order');
    if (deliveryCheck && !deliveryCheck.can_deliver) return setModalError('Insufficient stock for some items. Cannot create delivery.');
    try {
      const r = await api.post('/sales/deliveries', { so_id: selectedSO, ...form });
      setAlert({ type: 'success', message: `Delivery ${r?.data?.doc_number} created. Stock updated.` });
      setShowCreate(false); loadData();
    } catch (e) { setModalError(e.message); }
  };
  const handleDelete = async (id) => {
    try { await api.delete(`/sales/deliveries/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/sales/bulk-delete', { entity: 'deliveries', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };



  return (<div className="space-y-4">
    {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
    <div className="flex items-center justify-between">
      <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Deliveries</h1><p className="text-xs text-gray-400 mt-0.5">Ship goods / complete services from confirmed orders</p></div>
      <><DownloadButton data={data} filename="Deliveries" /><button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm"><Truck className="w-4 h-4" /> New Delivery</button></>
    </div>
    <div className="relative max-w-xs"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search delivery#, SO#, customer..." className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg w-full bg-white dark:bg-gray-900 focus:border-blue-400 outline-none" /></div>

    <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={[
        { key: 'doc_number', label: 'Delivery #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
        { key: 'doc_type', label: 'Type', render: v => <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v === 'service' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>{(v || 'goods').charAt(0).toUpperCase() + (v || 'goods').slice(1)}</span> },
        { key: 'so_number', label: 'SO Ref', render: v => v ? <span className="font-mono text-xs text-gray-600">{v}</span> : '—' },
        { key: 'customer_name', label: 'Customer', render: v => <span className="font-medium text-sm">{v || '—'}</span> },
        { key: 'delivery_date', label: 'Date', render: v => <span className="text-xs text-gray-500">{formatDate(v)}</span> },
        { key: 'plant_code', label: 'Plant', render: v => v || '—' },
        { key: 'eway_bill_number', label: 'E-Way Bill', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
        { key: 'item_count', label: 'Items', className: 'text-right' },
        { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
      { key: "del", label: "", render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
        ]} data={data} loading={loading} emptyMessage="No deliveries" />
    </div>

    {/* CREATE */}
    <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Delivery" size="xl" 
      footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} className="btn-primary" disabled={!selectedSO || (deliveryCheck && !deliveryCheck.can_deliver)}>Create Delivery</button></>}>
      <div className="space-y-4">
        <FormField label="Select Sales Order *">
          <select value={selectedSO || ''} onChange={e => selectSO(e.target.value)} className="select-field">
            <option value="">Select confirmed SO...</option>
            {eligibleSOs.map(so => <option key={so.id} value={so.id}>{so.doc_number} — {so.customer_name} — {formatCurrency(so.total_amount)} ({so.item_count} items)</option>)}
          </select>
        </FormField>

        {deliveryCheck && (<>
          {deliveryCheck.stock_issues?.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400 mb-1">Stock Issues:</p>
              {deliveryCheck.stock_issues.map((issue, i) => (
                <p key={i} className="text-xs text-rose-600">{issue.material}: need {issue.needed}, available {issue.available}</p>
              ))}
            </div>
          )}
          {deliveryCheck.can_deliver && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                {deliveryCheck.doc_type === 'service' ? 'Service delivery — no stock impact' : `Stock available for all ${deliveryCheck.items?.length} items`}
              </p>
            </div>
          )}
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-[10px] uppercase">
              <th className="px-2 py-1.5 text-left">{deliveryCheck.doc_type === 'service' ? 'Service' : 'Material'}</th>
              <th className="px-2 py-1.5 text-right">Ordered</th>
              <th className="px-2 py-1.5 text-right">Delivered</th>
              <th className="px-2 py-1.5 text-right">Pending</th>
              {deliveryCheck.doc_type !== 'service' && <th className="px-2 py-1.5 text-right">Stock</th>}
            </tr></thead>
            <tbody>{(deliveryCheck.items || []).map((it, i) => {
              const pending = parseFloat(it.quantity) - parseFloat(it.delivered_qty || 0);
              return pending > 0 ? (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-2 py-1.5 font-medium">{it.material_code ? `${it.material_code} — ${it.material_name}` : it.description}</td>
                  <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                  <td className="px-2 py-1.5 text-right text-gray-400">{it.delivered_qty || 0}</td>
                  <td className="px-2 py-1.5 text-right font-bold">{pending}</td>
                  {deliveryCheck.doc_type !== 'service' && <td className={`px-2 py-1.5 text-right ${parseFloat(it.available_stock) < pending ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>{it.available_stock || 0}</td>}
                </tr>
              ) : null;
            })}</tbody>
          </table>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="E-Way Bill #"><input value={form.eway_bill_number || ''} onChange={e => setForm({ ...form, eway_bill_number: e.target.value })} className="input-field font-mono" /></FormField>
            <FormField label="Carrier"><input value={form.carrier || ''} onChange={e => setForm({ ...form, carrier: e.target.value })} className="input-field" /></FormField>
            <FormField label="Vehicle #"><input value={form.vehicle_number || ''} onChange={e => setForm({ ...form, vehicle_number: e.target.value })} className="input-field font-mono" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="LR Number"><input value={form.lr_number || ''} onChange={e => setForm({ ...form, lr_number: e.target.value })} className="input-field font-mono" /></FormField>
            <FormField label="Driver Name"><input value={form.driver_name || ''} onChange={e => setForm({ ...form, driver_name: e.target.value })} className="input-field" /></FormField>
          </div>
        </>)}
      </div>
    </Modal>
  
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />
    </div>);
}
