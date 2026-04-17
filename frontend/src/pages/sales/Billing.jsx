import { useState, useEffect } from 'react';
import { FileText, Eye, Trash2, Search, Plus, ArrowRight, Printer, Pencil } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, StatusBadge, DeleteConfirm, BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { printDocument, buildPrintHTML } from '../../utils/printDoc';
import { formatCurrency, formatDate, INDIAN_STATES } from '../../utils/formatters';

export default function Billing() {
  const [data, setData] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [eligibleSOs, setEligibleSOs] = useState([]);
  const [selectedSO, setSelectedSO] = useState(null);
  const [soDetail, setSoDetail] = useState(null);
  const [billingQtys, setBillingQtys] = useState({});
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => { loadData(); }, [search]);
  const loadData = async () => { setLoading(true); try { const r = await api.get('/sales/billing'); setData(r?.data || []); } catch {} finally { setLoading(false); } };

  const openCreate = async () => {
    try {
      const r = await api.get('/sales/orders/eligible-for-billing');
      setEligibleSOs(r?.data || []);
      setSelectedSO(null); setSoDetail(null); setBillingQtys({}); setModalError(null); setShowCreate(true);
    } catch (e) { setModalError(e.message); }
  };

  const selectSO = async (soId) => {
    if (!soId) { setSelectedSO(null); setSoDetail(null); setBillingQtys({}); return; }
    try {
      const r = await api.get(`/sales/orders/${soId}`);
      const d = r?.data;
      setSelectedSO(soId);
      setSoDetail(d);
      const qtys = {};
      (d?.items || []).forEach(it => {
        const remaining = parseFloat(it.quantity || 0) - parseFloat(it.billed_qty || 0);
        qtys[it.id] = remaining > 0 ? remaining : 0;
      });
      setBillingQtys(qtys);
    } catch (e) { setModalError(e.message); }
  };

  const handleCreate = async () => {
    setModalError(null);
    if (!selectedSO) return setModalError('Select a sales order');
    const billing_items = (soDetail?.items || [])
      .filter(it => parseFloat(billingQtys[it.id] || 0) > 0)
      .map(it => ({ so_item_id: it.id, billing_qty: parseFloat(billingQtys[it.id]) }));
    if (!billing_items.length) return setModalError('Enter a quantity for at least one item');
    try {
      const r = await api.post('/sales/billing', { so_id: selectedSO, billing_items });
      const result = r?.data;
      setAlert({ type: 'success', message: `Billing ${result?.billing?.doc_number} created → AR Invoice ${result?.ar_invoice?.doc_number} auto-generated → JE ${result?.journal?.doc_number}` });
      setShowCreate(false); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const openEdit = (row) => {
    setEditForm({ id: row.id, billing_date: row.billing_date?.substring(0, 10) || '', place_of_supply: row.place_of_supply || '' });
    setModalError(null);
    setShowEdit(row);
  };

  const handleEdit = async () => {
    setEditSaving(true); setModalError(null);
    try {
      await api.put(`/sales/billing/${editForm.id}`, { billing_date: editForm.billing_date, place_of_supply: editForm.place_of_supply });
      setAlert({ type: 'success', message: 'Billing updated' });
      setShowEdit(null); loadData();
    } catch (e) { setModalError(e.message); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/sales/billing/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/sales/bulk-delete', { entity: 'billing', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };

  const isGoods = (soDetail?.doc_type || 'goods') === 'goods';

  // Billing subtotals from current billingQtys
  const billingSubtotal = (soDetail?.items || []).reduce((s, it) => {
    const qty = parseFloat(billingQtys[it.id] || 0);
    return s + qty * parseFloat(it.unit_price || 0) * (1 - parseFloat(it.discount_percent || 0) / 100);
  }, 0);
  const billingTax = (soDetail?.items || []).reduce((s, it) => {
    const qty = parseFloat(billingQtys[it.id] || 0);
    const line = qty * parseFloat(it.unit_price || 0) * (1 - parseFloat(it.discount_percent || 0) / 100);
    return s + line * (parseFloat(it.cgst_rate || 0) + parseFloat(it.sgst_rate || 0) + parseFloat(it.igst_rate || 0)) / 100;
  }, 0);

  const inp = 'w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:border-blue-400 outline-none';
  const ro = 'text-xs text-gray-900 dark:text-gray-100 font-medium';

  return (<div className="space-y-4">
    {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
    <div className="flex items-center justify-between">
      <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Billing</h1><p className="text-xs text-gray-400 mt-0.5">Generate invoices from delivered orders → AR Invoice + Journal Entry</p></div>
      <><DownloadButton data={data} filename="Billing" /><button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> Create Billing</button></>
    </div>

    <div className="bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-blue-900/10 dark:to-emerald-900/10 rounded-xl p-3 border border-blue-100 dark:border-blue-800/30">
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <span className="font-medium text-blue-600">Billing</span><ArrowRight className="w-3 h-3" />
        <span className="font-medium text-violet-600">AR Invoice (auto)</span><ArrowRight className="w-3 h-3" />
        <span className="font-medium text-amber-600">Journal Entry (draft)</span><ArrowRight className="w-3 h-3" />
        <span className="font-medium text-emerald-600">Payment posts JE</span>
        <span className="ml-2 text-gray-400">· Partial billing supported — SO stays open until fully billed</span>
      </div>
    </div>

    <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
        columns={[
          { key: 'doc_number', label: 'Billing #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
          { key: 'so_number', label: 'SO Ref', render: v => v ? <span className="font-mono text-xs text-gray-600">{v}</span> : '—' },
          { key: 'customer_name', label: 'Customer', render: v => <span className="font-medium text-sm">{v || '—'}</span> },
          { key: 'billing_date', label: 'Date', render: v => <span className="text-xs text-gray-500">{formatDate(v)}</span> },
          { key: 'subtotal', label: 'Subtotal', className: 'text-right', render: v => <span className="text-xs">{formatCurrency(v)}</span> },
          { key: 'id', label: 'Tax', className: 'text-right', render: (v, row) => { const c = parseFloat(row.cgst_amount || 0), sg = parseFloat(row.sgst_amount || 0), ig = parseFloat(row.igst_amount || 0); return <span className="text-xs text-orange-600">{ig > 0 ? `IGST ${formatCurrency(ig)}` : `C${formatCurrency(c)} S${formatCurrency(sg)}`}</span>; } },
          { key: 'total_amount', label: 'Total', className: 'text-right', render: v => <span className="font-semibold text-sm">{formatCurrency(v)}</span> },
          { key: 'doc_type', label: 'Type', render: v => <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v === 'service' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>{(v || 'goods').charAt(0).toUpperCase() + (v || 'goods').slice(1)}</span> },
          { key: 'ar_invoice_number', label: 'AR Invoice', render: v => v ? <span className="font-mono text-xs text-emerald-600">{v}</span> : '—' },
          { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
          { key: 'del', label: '', render: (v, row) => <div className="flex gap-1">
            <button onClick={async () => { try { setShowDetail((await api.get(`/sales/billing/${row.id}`).catch(() => null))?.data); } catch {} }} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="View"><Eye className="w-3.5 h-3.5" /></button>
            <button onClick={() => openEdit(row)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="Edit"><Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" /></button>
            <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
          </div> },
        ]} data={data} loading={loading} emptyMessage="No billing documents. Create from delivered sales orders." />
    </div>

    {/* CREATE */}
    <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Billing" size="xl"
      footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} className="btn-primary" disabled={!selectedSO}>Create Billing</button></>}>
      <div className="space-y-4">

        {/* SO Selector */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <FormField label="Select Sales Order *">
            <select value={selectedSO || ''} onChange={e => selectSO(e.target.value)} className="select-field">
              <option value="">Select confirmed/delivered SO...</option>
              {eligibleSOs.map(so => <option key={so.id} value={so.id}>{so.doc_number} — {so.customer_name} — {formatCurrency(so.total_amount)} [{so.status}]</option>)}
            </select>
          </FormField>
        </div>

        {soDetail && (<>
          {/* SO Header — read-only, mirrors SO form layout */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Sales Order Details</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold">{soDetail.doc_number}</span>
                <StatusBadge status={soDetail.status} />
              </div>
            </div>
            <div className="p-3 space-y-3">
              {/* Row 1: Doc Type, Customer, Cust PO#, Cust PO Date */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Document Type</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${soDetail.doc_type === 'service' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {(soDetail.doc_type || 'goods').charAt(0).toUpperCase() + (soDetail.doc_type || 'goods').slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Customer</p>
                  <p className={ro}>{soDetail.customer_name || '—'}</p>
                  {soDetail.cust_gstin && <p className="text-[10px] text-gray-400 font-mono">{soDetail.cust_gstin}</p>}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Customer PO #</p>
                  <p className={`${ro} font-mono`}>{soDetail.customer_po_number || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Customer PO Date</p>
                  <p className={ro}>{formatDate(soDetail.customer_po_date) || '—'}</p>
                </div>
              </div>

              {/* Row 2: Payment Terms, Place of Supply, Delivery Terms, Delivery Date */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Payment Terms</p>
                  <p className={ro}>{soDetail.payment_term_name || soDetail.payment_terms || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Place of Supply</p>
                  <p className={ro}>{soDetail.place_of_supply || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Delivery Terms</p>
                  <p className={ro}>{soDetail.delivery_terms || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Delivery Date</p>
                  <p className={ro}>{formatDate(soDetail.delivery_date) || '—'}</p>
                </div>
              </div>

              {/* Row 3: Order Date, Profit Center / Project, Description */}
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Order Date</p>
                  <p className={ro}>{formatDate(soDetail.order_date) || '—'}</p>
                </div>
                {(soDetail.profit_center_name || soDetail.profit_center_code) && <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Profit Center</p>
                  <p className={ro}>{soDetail.profit_center_code ? `${soDetail.profit_center_code} — ${soDetail.profit_center_name}` : soDetail.profit_center_name}</p>
                </div>}
                {(soDetail.project_name || soDetail.project_code) && <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Project</p>
                  <p className={ro}>{soDetail.project_code ? `${soDetail.project_code} — ${soDetail.project_name}` : soDetail.project_name}</p>
                </div>}
                {soDetail.description && <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Description</p>
                  <p className={ro}>{soDetail.description}</p>
                </div>}
              </div>
            </div>
          </div>

          {/* Line Items — same structure as SO, with billing columns appended */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Line Items</span>
              <span className="text-xs text-gray-400">{(soDetail.items || []).length} items — enter "Bill Now" qty for each line</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: '1200px' }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/30 text-gray-500 text-[10px] uppercase">
                    <th className="px-2 py-2 text-left w-8">#</th>
                    <th className="px-2 py-2 text-left min-w-[160px]">{isGoods ? 'Material' : 'Service'}</th>
                    <th className="px-2 py-2 text-left w-16">{isGoods ? 'HSN' : 'SAC'}</th>
                    <th className="px-2 py-2 text-left w-24">Plant</th>
                    {isGoods && <th className="px-2 py-2 text-left w-20">Store</th>}
                    <th className="px-2 py-2 text-right w-14">UoM</th>
                    <th className="px-2 py-2 text-right w-16">Ordered</th>
                    <th className="px-2 py-2 text-right w-16">Billed</th>
                    <th className="px-2 py-2 text-right w-16">Remaining</th>
                    <th className="px-2 py-2 text-right w-20">Price</th>
                    <th className="px-2 py-2 text-right w-12">Disc%</th>
                    <th className="px-2 py-2 text-right w-12">CGST%</th>
                    <th className="px-2 py-2 text-right w-12">SGST%</th>
                    <th className="px-2 py-2 text-right w-12">IGST%</th>
                    <th className="px-2 py-2 text-center w-24 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold">Bill Now ✎</th>
                    <th className="px-2 py-2 text-right w-24">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(soDetail.items || []).map((it, i) => {
                    const remaining = parseFloat(it.quantity || 0) - parseFloat(it.billed_qty || 0);
                    const billQty = parseFloat(billingQtys[it.id] || 0);
                    const lineAmt = billQty * parseFloat(it.unit_price || 0) * (1 - parseFloat(it.discount_percent || 0) / 100);
                    const fullyBilled = remaining <= 0;
                    return (
                      <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${fullyBilled ? 'opacity-40 bg-gray-50 dark:bg-gray-800/20' : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/20'}`}>
                        <td className="px-2 py-1.5 text-gray-400">{it.line_number}</td>
                        <td className="px-2 py-1.5">
                          {it.material_code ? <><span className="font-mono text-blue-600 dark:text-blue-400">{it.material_code}</span> <span className="text-gray-700 dark:text-gray-300">{it.material_name}</span></> : <span className="text-gray-700 dark:text-gray-300">{it.description}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">{it.hsn_code || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-600">{it.plant_code ? `${it.plant_code}` : '—'}</td>
                        {isGoods && <td className="px-2 py-1.5 text-gray-600">{it.sloc_code || '—'}</td>}
                        <td className="px-2 py-1.5 text-right text-gray-500">{it.uom_code || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{it.quantity}</td>
                        <td className="px-2 py-1.5 text-right text-orange-600">{parseFloat(it.billed_qty || 0)}</td>
                        <td className="px-2 py-1.5 text-right font-medium text-emerald-600">{remaining > 0 ? remaining : 0}</td>
                        <td className="px-2 py-1.5 text-right">{formatCurrency(it.unit_price)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{parseFloat(it.discount_percent || 0)}%</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{parseFloat(it.cgst_rate || 0)}%</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{parseFloat(it.sgst_rate || 0)}%</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{parseFloat(it.igst_rate || 0)}%</td>
                        <td className="px-2 py-1.5 bg-blue-50/50 dark:bg-blue-900/10">
                          <input
                            type="number" min="0" max={remaining > 0 ? remaining : 0} step="any"
                            value={billingQtys[it.id] ?? ''}
                            onChange={e => setBillingQtys(prev => ({ ...prev, [it.id]: e.target.value }))}
                            disabled={fullyBilled}
                            className={`w-full px-2 py-1 text-xs border rounded text-right outline-none transition-all
                              ${fullyBilled
                                ? 'cursor-not-allowed bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                                : 'border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 font-semibold'}`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-blue-700 dark:text-blue-400">
                          {billQty > 0 ? formatCurrency(lineAmt) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
                    <td colSpan={isGoods ? 14 : 13} className="px-3 py-2 text-right text-xs text-gray-500">
                      Billing Subtotal: <strong className="text-gray-800 dark:text-gray-200 ml-1">{formatCurrency(billingSubtotal)}</strong>
                      <span className="mx-3 text-gray-400">+</span>
                      Tax: <strong className="text-orange-600 ml-1">{formatCurrency(billingTax)}</strong>
                      <span className="mx-3 text-gray-400">=</span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-blue-700 dark:text-blue-400">
                      {formatCurrency(billingSubtotal + billingTax)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
            <p className="font-medium mb-1">What happens on submit:</p>
            <p>1. Billing document created for specified quantities &nbsp;&nbsp; 2. AR Invoice auto-generated (for billed amount only)</p>
            <p>3. Journal Entry created (Dr Accounts Receivable, Cr Revenue) &nbsp;&nbsp; 4. SO stays open until all items are fully billed</p>
          </div>
        </>)}
      </div>
    </Modal>

    {/* EDIT */}
    <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showEdit} onClose={() => setShowEdit(null)} title={`Edit Billing — ${showEdit?.doc_number}`} size="sm"
      footer={<><button onClick={() => setShowEdit(null)} className="btn-secondary">Cancel</button><button onClick={handleEdit} disabled={editSaving} className="btn-primary">{editSaving ? 'Saving...' : 'Save'}</button></>}>
      <div className="space-y-4">
        <FormField label="Billing Date">
          <input type="date" value={editForm.billing_date || ''} onChange={e => setEditForm(p => ({ ...p, billing_date: e.target.value }))} className="input-field" />
        </FormField>
        <FormField label="Place of Supply">
          <input value={editForm.place_of_supply || ''} onChange={e => setEditForm(p => ({ ...p, place_of_supply: e.target.value }))} className="input-field" />
        </FormField>
      </div>
    </Modal>

    <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />

    {/* DETAIL */}
    <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail ? `Billing — ${showDetail.doc_number}` : ''} size="xl"
      footer={showDetail && <button onClick={() => printDocument(`Billing ${showDetail?.doc_number}`, buildPrintHTML(showDetail, showDetail?.items || [], "Billing Invoice"))} className="btn-secondary flex items-center gap-1.5 text-sm"><Printer className="w-4 h-4" />Print</button>}>
      {showDetail && <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">Customer</p><p className="font-medium">{showDetail.customer_name}</p></div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">SO</p><p className="font-mono text-blue-600">{showDetail.so_number}</p></div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">AR Invoice</p><p className="font-mono text-emerald-600">{showDetail.ar_invoice_number || '—'}</p></div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">JE</p><p className="font-mono text-violet-600">{showDetail.je_number || '—'}</p></div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">Billing Date</p><p>{formatDate(showDetail.billing_date)}</p></div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">Place of Supply</p><p>{showDetail.place_of_supply || '—'}</p></div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-lg">{formatCurrency(showDetail.total_amount)}</p></div>
          <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status} /></div>
        </div>
        {showDetail.items?.length > 0 && <>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3">Line Items</h3>
          <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b dark:border-gray-700">
            <th className="text-left py-1">Material / Service</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Price</th>
            <th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Amount</th>
          </tr></thead>
          <tbody>{showDetail.items.map((it, i) => {
            const qty = parseFloat(it.quantity || it.billing_qty || 0);
            const lineAmt = qty * parseFloat(it.unit_price || 0) * (1 - parseFloat(it.discount_percent || 0) / 100);
            const cgst = lineAmt * parseFloat(it.cgst_rate || 0) / 100;
            const sgst = lineAmt * parseFloat(it.sgst_rate || 0) / 100;
            const igst = lineAmt * parseFloat(it.igst_rate || 0) / 100;
            return <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1.5">{it.material_code ? <span className="font-mono text-blue-600">{it.material_code}</span> : ''} {it.material_name || it.description}</td>
              <td className="text-center">{it.hsn_code || '—'}</td>
              <td className="text-right">{qty}</td><td className="text-right">{formatCurrency(it.unit_price)}</td>
              <td className="text-right">{formatCurrency(cgst)}</td><td className="text-right">{formatCurrency(sgst)}</td>
              <td className="text-right">{formatCurrency(igst)}</td><td className="text-right font-medium">{formatCurrency(lineAmt)}</td>
            </tr>;
          })}</tbody></table>
          <div className="grid grid-cols-5 gap-3 text-sm text-right mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
            <div>Subtotal: <strong>{formatCurrency(showDetail.subtotal)}</strong></div>
            <div>CGST: <strong className="text-blue-700">{formatCurrency(showDetail.cgst_amount)}</strong></div>
            <div>SGST: <strong className="text-blue-700">{formatCurrency(showDetail.sgst_amount)}</strong></div>
            <div>IGST: <strong className="text-violet-700">{formatCurrency(showDetail.igst_amount)}</strong></div>
            <div>Total: <strong className="text-lg">{formatCurrency(showDetail.total_amount)}</strong></div>
          </div>
        </>}
      </div>}
    </Modal>
  </div>);
}
