import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Edit2, Eye, Trash2 } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge ,BulkActionBar, DownloadButton, SearchableSelect } from '../../components/common/index';
import ApprovalPanel from '../../components/common/ApprovalPanel';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatCurrency, formatDate, INDIAN_STATES, getGSTType } from '../../utils/formatters';
import { ExportButton } from '../../components/common/SharedFeatures';
import PrintFormatModal from '../../components/common/PrintFormatModal';

export default function APInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [companyState, setCompanyState] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [printTarget, setPrintTarget] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [payTerms, setPayTerms] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [sourcePOs, setSourcePOs] = useState([]);
  const [sourceGRs, setSourceGRs] = useState([]);
  const [sourceType, setSourceType] = useState('manual'); // manual | po | gr
  const emptyItem = { material_id:'', description:'', hsn_code:'', quantity:1, uom_id:'', unit_price:0, discount_percent:0, cgst_rate:9, sgst_rate:9, igst_rate:0 };
  const emptyForm = { vendor_id:'', vendor_invoice_number:'', vendor_gstin:'', place_of_supply:'', invoice_date:'', due_date:'', posting_date:'', reference:'', description:'', payment_term_id:'', po_reference:'', items:[{...emptyItem}] };
  const [form, setForm] = useState(emptyForm);

  const location = useLocation();
  useEffect(() => { loadInvoices(); loadLookups(); }, [search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) loadDetail(openId);
  }, [location.search]);
  const loadInvoices = async () => { try { setInvoices((await api.get('/finance/ap-invoices', { search }).catch(()=>null))?.data || []); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => {
    try {
      const [v,m,u,pt,tc] = await Promise.all([
        api.get('/master/business-partners', { type: 'vendor', all: true }).catch(()=>null), api.get('/master/materials', { all: true }).catch(()=>null),
        api.get('/master/uom').catch(()=>null), api.get('/master/payment-terms').catch(()=>null), api.get('/finance/tax-master').catch(()=>null)
      ]);
      setVendors(v?.data?.rows || v?.data || []); setMaterials(m?.data || []);
      setUoms(u?.data || []); setPayTerms(pt?.data || []); setTaxCodes(tc?.data || []);
    } catch (e) { console.error('Lookups:', e); }
    try { setSourcePOs((await api.get('/finance/ap-invoices/source-pos').catch(()=>null))?.data || []); } catch {}
    try { setSourceGRs((await api.get('/finance/ap-invoices/source-grs').catch(()=>null))?.data || []); } catch {}
    // Load company state for GST type determination
    try {
      const me = await api.get('/auth/me').catch(()=>null);
      const companies = await api.get('/org/companies').catch(()=>null);
      const comp = companies?.data?.find(c => c.id === me?.data?.default_company_id) || companies?.data?.[0];
      if (comp?.state) setCompanyState(comp.state);
      else if (comp?.city) setCompanyState(comp.city); // fallback
    } catch {}
  };

  // When place of supply changes, auto-update GST type on all items
  const selectPlaceOfSupply = (pos) => {
    const gstType = getGSTType(companyState, pos);
    const items = form.items.map(it => {
      const rate = parseFloat(it.cgst_rate||0) + parseFloat(it.sgst_rate||0) + parseFloat(it.igst_rate||0) || 18;
      if (gstType === 'igst') return { ...it, cgst_rate: 0, sgst_rate: 0, igst_rate: rate };
      else return { ...it, cgst_rate: rate/2, sgst_rate: rate/2, igst_rate: 0 };
    });
    setForm({ ...form, place_of_supply: pos, items });
  };
  const loadDetail = async (id) => { try { setShowDetail((await api.get(`/finance/ap-invoices/${id}`).catch(()=>null))?.data); } catch (err) { setModalError(err.message); } };

  const addItem = () => setForm({...form, items: [...form.items, {...emptyItem}]});
  const removeItem = (idx) => setForm({...form, items: form.items.filter((_,i) => i !== idx)});
  const updateItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = {...items[idx], [field]: val};
    // Auto-fill HSN from material
    if (field === 'material_id' && val) {
      const mat = materials.find(m => m.id === val);
      if (mat) { items[idx].hsn_code = mat.hsn_code || ''; items[idx].description = mat.material_name; items[idx].unit_price = mat.standard_price || 0; items[idx].uom_id = mat.base_uom_id || ''; }
    }
    // Auto-fill GST rates from tax code
    if (field === 'tax_code') {
      const tc = taxCodes.find(t => t.tax_code === val);
      if (tc) { items[idx].cgst_rate = tc.cgst_rate; items[idx].sgst_rate = tc.sgst_rate; items[idx].igst_rate = tc.igst_rate; }
    }
    setForm({...form, items});
  };
  // Auto-fill vendor GSTIN
  const GSTIN_STATE_MAP = {'01':'01-Jammu & Kashmir','02':'02-Himachal Pradesh','03':'03-Punjab','04':'04-Chandigarh','05':'05-Uttarakhand','06':'06-Haryana','07':'07-Delhi','08':'08-Rajasthan','09':'09-Uttar Pradesh','10':'10-Bihar','11':'11-Sikkim','12':'12-Arunachal Pradesh','13':'13-Nagaland','14':'14-Manipur','15':'15-Mizoram','16':'16-Tripura','17':'17-Meghalaya','18':'18-Assam','19':'19-West Bengal','20':'20-Jharkhand','21':'21-Odisha','22':'22-Chhattisgarh','23':'23-Madhya Pradesh','24':'24-Gujarat','27':'27-Maharashtra','29':'29-Karnataka','30':'30-Goa','32':'32-Kerala','33':'33-Tamil Nadu','34':'34-Puducherry','36':'36-Telangana','37':'37-Andhra Pradesh'};
  const selectVendor = (vendorId) => {
    const v = vendors.find(vn => vn.id === vendorId);
    let pos = '';
    // BP master state field is the primary source
    if (v?.state) {
      pos = INDIAN_STATES.find(s => s.toLowerCase().includes(v.state.toLowerCase().trim())) || v.state;
    }
    // Fallback: GSTIN first 2 digits only if state is empty
    if (!pos && v?.gstin?.length >= 2) {
      pos = GSTIN_STATE_MAP[v.gstin.substring(0, 2)] || '';
    }
    setForm({...form, vendor_id: vendorId, vendor_gstin: v?.gstin || '', place_of_supply: pos });
  };

  // Copy from Purchase Order — auto-fills vendor, items, prices
  const copyFromPO = async (poId) => {
    if (!poId) return;
    try {
      const res = await api.get(`/finance/ap-invoices/source-po/${poId}`).catch(()=>null);
      const { po, items } = res.data;
      const gstRate = items[0]?.gst_rate || 18;
      const halfRate = gstRate / 2;
      setForm({
        ...emptyForm,
        vendor_id: po.vendor_id,
        vendor_gstin: po.vendor_gstin || '',
        reference: `PO:${po.doc_number}`,
        description: `AP Invoice from PO ${po.doc_number}`,
        po_reference: po.id,
        items: items.map(it => ({
          material_id: it.material_id || '',
          description: it.material_name || it.description || '',
          hsn_code: it.hsn_code || '',
          quantity: parseFloat(it.quantity) || 1,
          uom_id: it.uom_id || '',
          unit_price: parseFloat(it.unit_price) || 0,
          discount_percent: 0,
          cgst_rate: halfRate,
          sgst_rate: halfRate,
          igst_rate: 0,
        }))
      });
    } catch (err) { setModalError(err.message); }
  };

  // Copy from Goods Receipt — auto-fills vendor, received items with PO prices
  const copyFromGR = async (grId) => {
    if (!grId) return;
    try {
      const res = await api.get(`/finance/ap-invoices/source-gr/${grId}`).catch(()=>null);
      const { gr, items } = res.data;
      const gstRate = items[0]?.gst_rate || 18;
      const halfRate = gstRate / 2;
      setForm({
        ...emptyForm,
        vendor_id: gr.vendor_id,
        vendor_gstin: gr.vendor_gstin || '',
        reference: `GR:${gr.doc_number}`,
        description: `AP Invoice from GR ${gr.doc_number} (PO ${gr.po_number})`,
        po_reference: gr.po_id,
        items: items.map(it => ({
          material_id: it.material_id || '',
          description: it.material_name || '',
          hsn_code: it.hsn_code || '',
          quantity: parseFloat(it.quantity) || 1,
          uom_id: it.uom_id || '',
          unit_price: parseFloat(it.unit_price) || 0,
          discount_percent: 0,
          cgst_rate: halfRate,
          sgst_rate: halfRate,
          igst_rate: 0,
        }))
      });
    } catch (err) { setModalError(err.message); }
  };

  const calcLine = (item) => { const amt = (item.quantity||0) * (item.unit_price||0) * (1 - (item.discount_percent||0)/100); return amt; };
  const calcTotals = () => {
    let sub=0, cgst=0, sgst=0, igst=0;
    form.items.forEach(it => { const a = calcLine(it); sub += a; cgst += a*(it.cgst_rate||0)/100; sgst += a*(it.sgst_rate||0)/100; igst += a*(it.igst_rate||0)/100; });
    return { sub, cgst, sgst, igst, tax: cgst+sgst+igst, total: sub+cgst+sgst+igst };
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (!form.vendor_id) throw new Error('Vendor required');
      if (!form.items.length || !form.items[0].description) throw new Error('At least one line item required');
      await api.post('/finance/ap-invoices', form);
      setShowForm(false); setForm(emptyForm); setAlert({ type:'success', message: 'AP Invoice created with line items' }); loadInvoices();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const totals = calcTotals();
  const gstType = getGSTType(companyState, form.place_of_supply);
  const columns = [
    { key: 'doc_number', label: 'Invoice #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'vendor_name', label: 'Vendor', render: v => <span className="font-medium">{v}</span> },
    { key: 'vendor_invoice_number', label: 'Vendor Inv#', render: v => v || '—' },
    { key: 'invoice_date', label: 'Date', render: v => formatDate(v) },
    { key: 'total_amount', label: 'Total', className: 'text-right', render: v => <span className="font-semibold">{formatCurrency(v)}</span> },
    { key: 'paid_amount', label: 'Paid', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'due_date', label: 'Due', render: v => { const d = new Date(v); const overdue = d < new Date() && v; return <span className={overdue ? 'text-red-600 font-medium' : ''}>{formatDate(v)}</span>; }},
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v}/> },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      {row.status === 'draft' && <button onClick={async () => { try { await api.post(`/finance/ap-invoices/${v}/approve`); setAlert({ type:'success', message:'AP Invoice approved — JE posted' }); loadInvoices(); } catch (e) { setModalError(e.message); }}} className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>}
      {row.status === 'submitted' && <span className="px-2 py-0.5 text-xs bg-amber-50 text-amber-700 rounded font-medium">⏳ Pending Approval</span>}
      <button onClick={() => loadDetail(v)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Eye className="w-4 h-4"/></button>
      <button onClick={e => { e.stopPropagation(); setPrintTarget({entityType:'ap_invoice',entityId:row.id,docNumber:row.doc_number}); }} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Print">🖨️</button>
    </div> },
  ];
  const handleBulkDelete = async () => {
    try { const r = await api.post('/finance/bulk-delete', { entity: 'ap-invoices', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadInvoices(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Accounts Payable</h1><p className="text-sm text-gray-400 mt-1">Vendor invoices with GST line items</p></div>
        <div className="flex gap-2"><ExportButton entity="ap_invoices"/><button onClick={() => { setForm(emptyForm); setSourceType('manual'); setModalError(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New AP Invoice</button></div>
      </div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={invoices} loading={loading}/></div>

      {/* CREATE MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title="Create AP Invoice (Vendor Invoice)" size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><DownloadButton data={invoices} filename="APInvoices" /><button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Create Invoice'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          {/* SOURCE SELECTOR — Copy from PO or GR */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 mb-2">CREATE FROM SOURCE (auto-fills vendor, items & prices)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm mb-1">
                  <input type="radio" name="src" checked={sourceType==='manual'} onChange={() => { setSourceType('manual'); setForm(emptyForm); }}/> Manual entry
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm mb-1">
                  <input type="radio" name="src" checked={sourceType==='po'} onChange={() => setSourceType('po')}/> Copy from PO
                </label>
                {sourceType === 'po' && (
                  <select onChange={e => copyFromPO(e.target.value)} className="select-field text-xs mt-1">
                    <option value="">Select Purchase Order...</option>
                    {sourcePOs.map(po => <option key={po.id} value={po.id}>{po.doc_number} — {po.vendor_name} ({formatCurrency(po.total_amount)})</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm mb-1">
                  <input type="radio" name="src" checked={sourceType==='gr'} onChange={() => setSourceType('gr')}/> Copy from GR
                </label>
                {sourceType === 'gr' && (
                  <select onChange={e => copyFromGR(e.target.value)} className="select-field text-xs mt-1">
                    <option value="">Select Goods Receipt...</option>
                    {sourceGRs.map(gr => <option key={gr.id} value={gr.id}>{gr.doc_number} — {gr.vendor_name} (PO: {gr.po_number}, Qty: {gr.total_qty})</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Vendor" required><SearchableSelect value={form.vendor_id} onChange={val=>selectVendor(val)} options={vendors.map(v=>({value:v.id,label:`${v.bp_number} — ${v.display_name}`}))} placeholder="Select vendor..." className="select-field" /></FormField>
            <FormField label="Vendor Invoice #" required><input value={form.vendor_invoice_number} onChange={e => setForm({...form, vendor_invoice_number: e.target.value})} className="input-field" placeholder="Vendor's own invoice number" required/></FormField>
            <FormField label="Vendor GSTIN"><input value={form.vendor_gstin} onChange={e => setForm({...form, vendor_gstin: e.target.value})} className="input-field" placeholder="22AAAAA0000A1Z5"/></FormField>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Invoice Date"><input type="date" value={form.invoice_date} onChange={e => setForm({...form, invoice_date: e.target.value})} className="input-field"/></FormField>
            <FormField label="Due Date"><input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="input-field" min={new Date().toISOString().split('T')[0]}/></FormField>
            <FormField label="Place of Supply"><select value={form.place_of_supply} onChange={e => selectPlaceOfSupply(e.target.value)} className="select-field"><option value="">Select state...</option>{INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select></FormField>
            <FormField label="Payment Terms"><select value={form.payment_term_id} onChange={e => setForm({...form, payment_term_id: e.target.value})} className="select-field"><option value="">Select...</option>{payTerms.map(pt => <option key={pt.id} value={pt.id}>{pt.term_code} — {pt.term_name}</option>)}</select></FormField>
          </div>
          <FormField label="Description"><input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field"/></FormField>

          {/* LINE ITEMS */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Line Items</h3>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add Item</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-gray-500 px-2">
                <div className="col-span-2">Material/Description</div><div>HSN</div><div>Qty</div><div>Price</div><div>Disc%</div>
                <div>Tax Code</div>{gstType==='cgst_sgst' ? <><div>CGST%</div><div>SGST%</div></> : <><div className="col-span-2">IGST%</div></>}<div className="text-right">Amount</div><div></div>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-center p-2 bg-gray-50 rounded border">
                  <div className="col-span-2"><SearchableSelect value={item.material_id} onChange={val=>updateItem(idx,'material_id',val)} options={materials.map(m=>({value:m.id,label:`${m.material_code} — ${m.material_name}`}))} placeholder="Select material..." className="select-field text-xs" />
                    <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="input-field text-xs mt-1" placeholder="Description *"/></div>
                  <div><input value={item.hsn_code} onChange={e => updateItem(idx, 'hsn_code', e.target.value)} className="input-field text-xs" placeholder="HSN"/></div>
                  <div><input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value)||0)} className="input-field text-xs" min="0"/></div>
                  <div><input type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value)||0)} className="input-field text-xs" step="0.01"/></div>
                  <div><input type="number" value={item.discount_percent} onChange={e => updateItem(idx, 'discount_percent', parseFloat(e.target.value)||0)} className="input-field text-xs" min="0" max="100"/></div>
                  <div><select onChange={e => updateItem(idx, 'tax_code', e.target.value)} className="select-field text-xs"><option value="">Tax</option>{taxCodes.filter(t=>t.tax_type==='GST').map(t => <option key={t.tax_code} value={t.tax_code}>{t.tax_code}</option>)}</select></div>
                  {gstType==='cgst_sgst' ? <>
                    <div><input type="number" value={item.cgst_rate} onChange={e => updateItem(idx, 'cgst_rate', parseFloat(e.target.value)||0)} className="input-field text-xs" step="0.5"/></div>
                    <div><input type="number" value={item.sgst_rate} onChange={e => updateItem(idx, 'sgst_rate', parseFloat(e.target.value)||0)} className="input-field text-xs" step="0.5"/></div>
                  </> : <div className="col-span-2"><input type="number" value={item.igst_rate} onChange={e => updateItem(idx, 'igst_rate', parseFloat(e.target.value)||0)} className="input-field text-xs" step="0.5"/></div>}
                  <div className="text-right text-sm font-medium">{formatCurrency(calcLine(item))}</div>
                  <div>{form.items.length > 1 && <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>}</div>
                </div>
              ))}
            </div>
            {/* TOTALS */}
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm grid grid-cols-4 gap-4 text-right">
              <div><span className="text-gray-500">Subtotal:</span> <span className="font-semibold">{formatCurrency(totals.sub)}</span></div>
              {gstType==='cgst_sgst' ? <>
                <div><span className="text-gray-500">CGST:</span> <span className="font-medium text-blue-700">{formatCurrency(totals.cgst)}</span></div>
                <div><span className="text-gray-500">SGST:</span> <span className="font-medium text-blue-700">{formatCurrency(totals.sgst)}</span></div>
              </> : <div className="col-span-2"><span className="text-gray-500">IGST:</span> <span className="font-medium text-violet-700">{formatCurrency(totals.igst)}</span></div>}
              <div><span className="text-gray-500">Total:</span> <span className="font-bold text-lg">{formatCurrency(totals.total)}</span></div>
            </div>
          </div>
        </form>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail ? `AP Invoice — ${showDetail.doc_number}` : ''} size="xl">
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Vendor</p><p className="font-medium">{showDetail.vendor_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Vendor Invoice #</p><p className="font-medium">{showDetail.vendor_invoice_number || '—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Vendor GSTIN</p><p className="font-mono text-xs">{showDetail.vendor_gstin || '—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Place of Supply</p><p>{showDetail.place_of_supply || '—'}</p></div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Invoice Date</p><p>{formatDate(showDetail.invoice_date)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Due Date</p><p>{formatDate(showDetail.due_date)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-lg">{formatCurrency(showDetail.total_amount)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status}/></div>
          </div>
          {showDetail.items?.length > 0 && <>
            <h3 className="text-sm font-semibold text-gray-700 mt-3">Line Items</h3>
            <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b"><th className="text-left py-1" style={{maxWidth:'200px'}}>Material</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{showDetail.items.map((it,i) => {
              const lineAmt = parseFloat(it.quantity||0) * parseFloat(it.unit_price||0);
              const cgst = parseFloat(it.cgst_amount) || (lineAmt * parseFloat(it.cgst_rate||0) / 100);
              const sgst = parseFloat(it.sgst_amount) || (lineAmt * parseFloat(it.sgst_rate||0) / 100);
              const igst = parseFloat(it.igst_amount) || (lineAmt * parseFloat(it.igst_rate||0) / 100);
              return <tr key={i} className="border-b border-gray-100">
              <td className="py-1.5">{it.material_code ? <span className="font-mono text-blue-600">{it.material_code}</span> : ''} {it.description || it.material_name}</td>
              <td className="text-center">{it.hsn_code || '—'}</td>
              <td className="text-right">{it.quantity}</td><td className="text-right">{formatCurrency(it.unit_price)}</td>
              <td className="text-right">{formatCurrency(cgst)}</td><td className="text-right">{formatCurrency(sgst)}</td>
              <td className="text-right">{formatCurrency(igst)}</td><td className="text-right font-medium">{formatCurrency(lineAmt)}</td>
            </tr>; })}</tbody></table>
            <div className="grid grid-cols-5 gap-3 text-sm text-right mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
              {(() => {
                const sub = parseFloat(showDetail.subtotal) || showDetail.items?.reduce((s,it) => s + parseFloat(it.quantity||0)*parseFloat(it.unit_price||0), 0) || 0;
                const totalTax = parseFloat(showDetail.tax_amount) || (parseFloat(showDetail.total_amount||0) - sub);
                let cgst = parseFloat(showDetail.cgst_amount) || showDetail.items?.reduce((s,it) => { const l=parseFloat(it.quantity||0)*parseFloat(it.unit_price||0); return s + (parseFloat(it.cgst_amount)||l*parseFloat(it.cgst_rate||0)/100); }, 0) || 0;
                let sgst = parseFloat(showDetail.sgst_amount) || showDetail.items?.reduce((s,it) => { const l=parseFloat(it.quantity||0)*parseFloat(it.unit_price||0); return s + (parseFloat(it.sgst_amount)||l*parseFloat(it.sgst_rate||0)/100); }, 0) || 0;
                let igst = parseFloat(showDetail.igst_amount) || showDetail.items?.reduce((s,it) => { const l=parseFloat(it.quantity||0)*parseFloat(it.unit_price||0); return s + (parseFloat(it.igst_amount)||l*parseFloat(it.igst_rate||0)/100); }, 0) || 0;
                // If all splits are 0 but there is tax, show as GST (assume intra-state split)
                if (cgst === 0 && sgst === 0 && igst === 0 && totalTax > 0) { cgst = totalTax / 2; sgst = totalTax / 2; }
                return <>
                  <div>Subtotal: <strong>{formatCurrency(sub)}</strong></div>
                  <div>CGST: <strong className="text-blue-700">{formatCurrency(cgst)}</strong></div>
                  <div>SGST: <strong className="text-blue-700">{formatCurrency(sgst)}</strong></div>
                  <div>IGST: <strong className="text-violet-700">{formatCurrency(igst)}</strong></div>
                  <div>Total: <strong className="text-lg">{formatCurrency(showDetail.total_amount)}</strong></div>
                </>;
              })()}
            </div>
          </>}
          {showDetail?.status === 'submitted' && (
            <ApprovalPanel entityType="ap_invoice" entityId={showDetail.id}
              currentUserId={user?.id} onDecision={() => { loadDetail(showDetail.id); loadInvoices(); }} />
          )}
        </div>}
      </Modal>
      {printTarget && <PrintFormatModal {...printTarget} onClose={() => setPrintTarget(null)} />}
    </div>
  );
}
