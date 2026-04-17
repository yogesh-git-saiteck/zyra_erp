import { useState, useEffect} from 'react';
import { Plus, Printer, Trash2, Eye} from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ExportButton } from '../../components/common/SharedFeatures';
import PrintFormatModal from '../../components/common/PrintFormatModal';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [mainTab, setMainTab] = useState('payments'); // 'payments' | 'pending'
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingType, setPendingType] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [partners, setPartners] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [printTarget, setPrintTarget] = useState(null);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [selectedInvIds, setSelectedInvIds] = useState([]);
  const emptyForm = { payment_type:'outgoing', bp_id:'', payment_date: new Date().toISOString().split('T')[0], amount:'', payment_method:'bank_transfer', check_number:'', reference:'', description:'', invoice_ids:[] };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadPayments(); loadLookups(); }, [typeFilter, search]);
  useEffect(() => { if (mainTab === 'pending') loadPendingInvoices(); }, [mainTab, pendingType, search]);

  const loadPayments = async () => {
    try { setPayments((await api.get('/finance/payments', { type: typeFilter, search }))?.data || []); }
    catch {} finally { setLoading(false); }
  };
  const loadPendingInvoices = async () => {
    setPendingLoading(true);
    try { setPendingInvoices((await api.get('/finance/payments/pending-invoices', { type: pendingType, search }))?.data || []); }
    catch {} finally { setPendingLoading(false); }
  };
  const loadLookups = async () => {
    try { setPartners((await api.get('/master/business-partners', { all: true }))?.data?.rows || []); } catch {}
  };

  // Load open invoices when partner changes
  const selectPartner = async (bpId) => {
    setForm(f => ({ ...f, bp_id: bpId, amount: '' }));
    setSelectedInvIds([]);
    setOpenInvoices([]);
    if (!bpId) return;
    try {
      const endpoint = form.payment_type === 'outgoing' ? '/finance/payments/open-ap-invoices' : '/finance/payments/open-ar-invoices';
      const param = form.payment_type === 'outgoing' ? { vendor_id: bpId } : { customer_id: bpId };
      const res = await api.get(endpoint, { params: param });
      setOpenInvoices(res?.data || []);
    } catch {}
  };

  // Re-load invoices when payment type changes
  const changeType = async (type) => {
    setForm(f => ({ ...f, payment_type: type, bp_id: '', amount: '' }));
    setOpenInvoices([]); setSelectedInvIds([]);
  };

  // Toggle invoice selection
  const toggleInvoice = (invId) => {
    setSelectedInvIds(prev => {
      const next = prev.includes(invId) ? prev.filter(id => id !== invId) : [...prev, invId];
      // Auto-calculate amount from selected invoices
      const total = openInvoices.filter(inv => next.includes(inv.id)).reduce((s, inv) => s + parseFloat(inv.balance || 0), 0);
      setForm(f => ({ ...f, amount: total.toFixed(2), invoice_ids: next }));
      return next;
    });
  };

  const selectAll = () => {
    if (selectedInvIds.length === openInvoices.length) {
      setSelectedInvIds([]); setForm(f => ({ ...f, amount: '', invoice_ids: [] }));
    } else {
      const all = openInvoices.map(i => i.id);
      const total = openInvoices.reduce((s, inv) => s + parseFloat(inv.balance || 0), 0);
      setSelectedInvIds(all); setForm(f => ({ ...f, amount: total.toFixed(2), invoice_ids: all }));
    }
  };

  const handleCreate = async () => {
    setSaving(true); setModalError(null);
    try {
      if (!form.bp_id) throw new Error('Business partner required');
      if (!form.amount || parseFloat(form.amount) <= 0) throw new Error('Amount must be greater than 0');
      const res = await api.post('/finance/payments', { ...form, invoice_ids: selectedInvIds });
      setShowCreate(false); setForm(emptyForm); setOpenInvoices([]); setSelectedInvIds([]);
      const cleared = res?.data?.cleared_invoices?.length || 0;
      setAlert({ type: 'success', message: `Payment created — ${cleared} invoice(s) cleared, JEs posted` });
      loadPayments();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  // Filter partners by type
  const filteredPartners = form.payment_type === 'outgoing'
    ? partners.filter(p => p.bp_type === 'vendor' || p.bp_type === 'both')
    : partners.filter(p => p.bp_type === 'customer' || p.bp_type === 'both');

  const [showDetail, setShowDetail] = useState(null);

  const loadDetail = async (id) => {
    try { const r = await api.get(`/finance/payments/${id}/detail`); setShowDetail(r?.data); }
    catch (err) { setModalError(err.message); }
  };

  const columns = [
    { key:'doc_number', label:'Payment #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key:'payment_type', label:'Type', render: v => <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v==='incoming'?'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400':'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>{v === 'incoming' ? 'Receipt' : 'Payment'}</span> },
    { key:'bp_name', label:'Partner', render: (v, row) => <div><span className="font-medium text-gray-900 dark:text-gray-100 text-[13px]">{v||'—'}</span>{row.bp_number && <span className="text-[10px] text-gray-400 ml-1">{row.bp_number}</span>}</div> },
    { key:'payment_date', label:'Date', render: v => formatDate(v) },
    { key:'amount', label:'Amount', className:'text-right', render: v => <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(v)}</span> },
    { key:'payment_method', label:'Method', render: v => <span className="text-[11px] text-gray-500 capitalize">{(v||'').replace(/_/g,' ')}</span> },
    { key:'status', label:'Status', render: v => <StatusBadge status={v}/> },
    { key:'id', label:'', render: (v,row) => <div className="flex gap-1">
      <button onClick={e => { e.stopPropagation(); loadDetail(v); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="View"><Eye className="w-3.5 h-3.5 text-gray-400"/></button>
      <button onClick={e => { e.stopPropagation(); setPrintTarget({entityType:'payment',entityId:row.id,docNumber:row.doc_number}); }} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Print"><Printer className="w-3.5 h-3.5 text-gray-400"/></button>
      {row.status === 'draft' && <button onClick={e => { e.stopPropagation(); setConfirmDelete(row); }} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>}
    </div> },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/finance/payments/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadPayments(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/finance/bulk-delete', { entity: 'payments', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadPayments(); }
    catch (e) { setModalError(e.message); }
  };



  // Pay from pending: pre-fill payment form with partner + invoice
  const payFromPending = (inv) => {
    const payType = inv.payment_direction;
    setForm({ ...emptyForm, payment_type: payType, bp_id: inv.partner_id, invoice_ids: [inv.id] });
    setSelectedInvIds([inv.id]);
    // Load all open invoices for that partner, then pre-select this one
    const endpoint = payType === 'outgoing' ? '/finance/payments/open-ap-invoices' : '/finance/payments/open-ar-invoices';
    const param = payType === 'outgoing' ? { vendor_id: inv.partner_id } : { customer_id: inv.partner_id };
    api.get(endpoint, { params: param }).then(r => {
      const invs = r?.data || [];
      setOpenInvoices(invs);
      const selIds = [inv.id];
      const total = invs.filter(i => selIds.includes(i.id)).reduce((s, i) => s + parseFloat(i.balance || 0), 0);
      setForm(f => ({ ...f, amount: total.toFixed(2), invoice_ids: selIds }));
    }).catch(() => {});
    setModalError(null);
    setShowCreate(true);
  };

  const pendingColumns = [
    { key: 'invoice_type', label: 'Type', render: v => <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v==='AP'?'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400':'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>{v === 'AP' ? 'AP (Payable)' : 'AR (Receivable)'}</span> },
    { key: 'doc_number', label: 'Invoice #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'partner_name', label: 'Vendor / Customer', render: (v, row) => <div><span className="font-medium text-gray-900 dark:text-gray-100">{v || '—'}</span>{row.bp_number && <span className="text-[10px] text-gray-400 ml-1">{row.bp_number}</span>}</div> },
    { key: 'invoice_date', label: 'Invoice Date', render: v => formatDate(v) },
    { key: 'due_date', label: 'Due Date', render: v => { const overdue = new Date(v) < new Date(); return <span className={overdue ? 'text-red-600 font-semibold' : ''}>{formatDate(v)}{overdue ? ' ⚠' : ''}</span>; } },
    { key: 'total_amount', label: 'Total', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'paid_amount', label: 'Paid', className: 'text-right', render: v => <span className="text-gray-500">{formatCurrency(v)}</span> },
    { key: 'balance', label: 'Balance Due', className: 'text-right', render: v => <span className="font-bold text-rose-600">{formatCurrency(v)}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v}/> },
    { key: 'id', label: '', render: (v, row) => <button onClick={() => payFromPending(row)} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"><Plus className="w-3 h-3 inline mr-0.5"/>Pay</button> },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Payments</h1><p className="text-sm text-gray-400 mt-1">Vendor & customer payments linked to invoices</p></div>
        <div className="flex gap-2"><ExportButton entity="payments"/><button onClick={() => { setForm(emptyForm); setOpenInvoices([]); setSelectedInvIds([]); setModalError(null); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Payment</button></div>
      </div>

      {/* Main tabs: Payments | Pending Invoices */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {[{key:'payments',label:'Payments'},{key:'pending',label:'Pending Invoices'}].map(t => (
          <button key={t.key} onClick={() => setMainTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${mainTab===t.key?'border-blue-600 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.label}{t.key==='pending' && pendingInvoices.length>0 && <span className="ml-1.5 text-[10px] bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 px-1.5 py-0.5 rounded-full font-semibold">{pendingInvoices.length}</span>}
          </button>
        ))}
      </div>

      {mainTab === 'payments' && <>
        <div className="flex items-center gap-4 flex-wrap">
          <Tabs tabs={[{key:'',label:'All'},{key:'outgoing',label:'Outgoing (Vendor)'},{key:'incoming',label:'Incoming (Customer)'}]} active={typeFilter} onChange={setTypeFilter}/>
          <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
        </div>
        <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={payments} loading={loading}/></div>
      </>}

      {mainTab === 'pending' && <>
        <div className="flex items-center gap-4 flex-wrap">
          <Tabs tabs={[{key:'',label:'All Pending'},{key:'outgoing',label:'Payable (AP)'},{key:'incoming',label:'Receivable (AR)'}]} active={pendingType} onChange={v => { setPendingType(v); }}/>
          <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
        </div>
        {pendingInvoices.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">{pendingInvoices.length} pending invoice(s)</span>
            <span className="text-amber-600 dark:text-amber-400">—</span>
            <span>Total outstanding: <strong>{formatCurrency(pendingInvoices.reduce((s, i) => s + parseFloat(i.balance || 0), 0))}</strong></span>
          </div>
        )}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={pendingColumns} data={pendingInvoices} loading={pendingLoading}/>
        </div>
      </>}

      {/* CREATE PAYMENT */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} title="Create Payment" size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><DownloadButton data={payments} filename="Payments" /><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving?'Creating...':'Create Payment'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Payment Type *"><select value={form.payment_type} onChange={e => changeType(e.target.value)} className="select-field"><option value="outgoing">Outgoing (to Vendor)</option><option value="incoming">Incoming (from Customer)</option></select></FormField>
            <FormField label={`${form.payment_type==='outgoing'?'Vendor':'Customer'} *`}><select value={form.bp_id} onChange={e => selectPartner(e.target.value)} className="select-field"><option value="">Select...</option>{filteredPartners.map(p => <option key={p.id} value={p.id}>{p.bp_number} — {p.display_name}</option>)}</select></FormField>
          </div>

          {/* INVOICE SELECTION */}
          {form.bp_id && openInvoices.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-600">Select Invoices to Pay ({openInvoices.length} open)</h4>
                <button type="button" onClick={selectAll} className="text-xs text-blue-600 font-medium">
                  {selectedInvIds.length === openInvoices.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b text-gray-500"><th className="px-3 py-1.5 w-8"></th><th className="text-left py-1.5">Invoice #</th><th className="text-left">Reference</th><th className="text-left">Date</th><th className="text-left">Due</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right font-semibold">Balance</th></tr></thead>
                <tbody>{openInvoices.map(inv => {
                  const isOverdue = new Date(inv.due_date) < new Date();
                  return (
                    <tr key={inv.id} className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 ${selectedInvIds.includes(inv.id)?'bg-blue-50':''}`} onClick={() => toggleInvoice(inv.id)}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={selectedInvIds.includes(inv.id)} onChange={() => {}} className="w-3.5 h-3.5 rounded"/></td>
                      <td className="font-mono text-blue-600 font-medium">{inv.doc_number}</td>
                      <td className="text-gray-500">{inv.vendor_invoice_number || inv.reference || '—'}</td>
                      <td>{formatDate(inv.invoice_date)}</td>
                      <td className={isOverdue?'text-red-600 font-medium':''}>{formatDate(inv.due_date)}</td>
                      <td className="text-right">{formatCurrency(inv.total_amount)}</td>
                      <td className="text-right">{formatCurrency(inv.paid_amount)}</td>
                      <td className="text-right font-semibold">{formatCurrency(inv.balance)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {selectedInvIds.length > 0 && (
                <div className="px-3 py-2 bg-blue-50 text-right text-sm">
                  <span className="text-gray-500">{selectedInvIds.length} invoice(s) selected — Total:</span>
                  <span className="font-bold text-lg ml-2">{formatCurrency(form.amount)}</span>
                </div>
              )}
            </div>
          )}
          {form.bp_id && openInvoices.length === 0 && <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg">No open invoices for this {form.payment_type==='outgoing'?'vendor':'customer'}.</div>}

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Payment Date"><input type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} className="input-field"/></FormField>
            <FormField label="Amount *"><input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="input-field font-semibold"/></FormField>
            <FormField label="Method"><select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className="select-field"><option value="bank_transfer">Bank Transfer</option><option value="check">Check</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="neft">NEFT/RTGS</option></select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Check/UTR Number"><input value={form.check_number||''} onChange={e => setForm({...form, check_number: e.target.value})} className="input-field" placeholder="UTR or check number"/></FormField>
            <FormField label="Description"><input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field"/></FormField>
          </div>
        </div>
      </Modal>
    
      {/* PAYMENT DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={`Payment — ${showDetail?.doc_number}`} size="xl"
        footer={<button onClick={() => setShowDetail(null)} className="btn-secondary">Close</button>}>
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Type', value: showDetail.payment_type === 'incoming' ? 'Customer Receipt' : 'Vendor Payment' },
              { label: 'Date', value: formatDate(showDetail.payment_date) },
              { label: 'Amount', value: formatCurrency(showDetail.amount) },
              { label: 'Status', value: <StatusBadge status={showDetail.status} /> },
            ].map((f,i) => <div key={i} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"><p className="text-[10px] text-gray-400">{f.label}</p><p className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.value}</p></div>)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Partner', value: `${showDetail.bp_number || ''} — ${showDetail.bp_name || ''}` },
              { label: 'Method', value: (showDetail.payment_method || '').replace(/_/g, ' ') },
              { label: 'Reference', value: showDetail.reference || '—' },
            ].map((f,i) => <div key={i} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"><p className="text-[10px] text-gray-400">{f.label}</p><p className="text-sm font-medium capitalize">{f.value}</p></div>)}
          </div>
          {showDetail.description && <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"><p className="text-[10px] text-gray-400">Description</p><p className="text-sm">{showDetail.description}</p></div>}
          {showDetail.je_number && <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"><p className="text-[10px] text-gray-400">Journal Entry</p><p className="text-sm font-mono text-emerald-600 dark:text-emerald-400">{showDetail.je_number} — {showDetail.je_status}</p></div>}
          {showDetail.cleared_invoices?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Cleared Invoices</p>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800 border-b"><th className="px-3 py-2 text-left text-[10px] text-gray-400">Invoice #</th><th className="px-3 py-2 text-left text-[10px] text-gray-400">Date</th><th className="px-3 py-2 text-right text-[10px] text-gray-400">Total</th><th className="px-3 py-2 text-right text-[10px] text-gray-400">Paid</th><th className="px-3 py-2 text-[10px] text-gray-400">Status</th></tr></thead>
                <tbody>{showDetail.cleared_invoices.map((inv,i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800"><td className="px-3 py-2 font-mono text-xs text-blue-600">{inv.doc_number}</td><td className="px-3 py-2 text-xs">{formatDate(inv.invoice_date)}</td><td className="px-3 py-2 text-right text-xs">{formatCurrency(inv.total_amount)}</td><td className="px-3 py-2 text-right text-xs font-medium">{formatCurrency(inv.paid_amount)}</td><td className="px-3 py-2"><StatusBadge status={inv.status}/></td></tr>
                ))}</tbody></table>
              </div>
            </div>
          )}
          <div className="text-xs text-gray-400">Created by: {showDetail.created_by_name} · {formatDate(showDetail.created_at)}</div>
        </div>}
      </Modal>

      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />
      {printTarget && <PrintFormatModal {...printTarget} onClose={() => setPrintTarget(null)} />}
    </div>
  );
}
