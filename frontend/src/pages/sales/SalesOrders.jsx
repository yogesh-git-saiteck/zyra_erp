import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Eye, Pencil, Truck, Trash2, FileText, Search, Printer, Send } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, StatusBadge ,DeleteConfirm,BulkActionBar, DownloadButton, SearchableSelect } from '../../components/common/index';
import ApprovalPanel from '../../components/common/ApprovalPanel';
import PrintFormatModal from '../../components/common/PrintFormatModal';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatCurrency, formatDate, INDIAN_STATES, getGSTType, INCOTERMS } from '../../utils/formatters';

export default function SalesOrders() {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [sourceType, setSourceType] = useState('manual');
  const [quotations, setQuotations] = useState([]);
  const [lookups, setLookups] = useState({ customers: [], materials: [], plants: [], slocs: [], uoms: [], profitCenters: [], projects: [], paymentTerms: [], taxCodes: [], incoterms: [] });
  const [companyState, setCompanyState] = useState('');

  const location = useLocation();
  useEffect(() => { loadData(); loadLookups(); }, [tab, search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) viewDetail(openId);
  }, [location.search]);
  const loadData = async () => { setLoading(true); try { const r = await api.get('/sales/orders', { status: tab, search }).catch(()=>null); setData(r?.data || []); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => {
    try {
      const [cu,ma,pl,uom,cc,pj,pt,tc,inc] = await Promise.all([api.get('/master/business-partners',{type:'customer',all:true}).catch(()=>null),api.get('/master/materials',{all:true}).catch(()=>null),api.get('/org/plants').catch(()=>null),api.get('/master/uom').catch(()=>null),api.get('/org/profit-centers').catch(()=>null),api.get('/projects/projects').catch(()=>null),api.get('/master/payment-terms').catch(()=>null),api.get('/master/tax-codes').catch(()=>null),api.get('/master/incoterms').catch(()=>null)]);
      const svs = await api.get('/master/services').catch(()=>null);
      setLookups({ customers:cu?.data?.rows||cu?.data||[], materials:ma?.data?.rows||ma?.data||[], services:svs?.data||[], plants:pl?.data||[], slocs:[], uoms:uom?.data||[], profitCenters:cc?.data||[], projects:pj?.data?.rows||pj?.data||[], paymentTerms:pt?.data||[], taxCodes:tc?.data||[], incoterms:inc?.data||[] });
      try {
        const comp = await api.get('/org/companies').catch(()=>null);
        const co = (comp?.data||[])[0];
        let cSt = co?.state || '';
        if (!cSt && co?.tax_id?.length >= 2) { const _gm = {'01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','27':'Maharashtra','29':'Karnataka','30':'Goa','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','36':'Telangana','37':'Andhra Pradesh'}; cSt = _gm[co.tax_id.substring(0,2)] || ''; }
        if (cSt) setCompanyState(cSt);
      } catch {}
      try { const q = await api.get('/sales/quotations', { status: 'approved' }).catch(()=>null); setQuotations(q?.data || []); } catch {}
    } catch {}
  };
  const loadSlocs = async (pid) => { if(!pid) return; try { const r = await api.get('/org/storage-locations',{plant_id:pid}).catch(()=>null); setLookups(prev=>({...prev,slocs:r?.data||[]})); } catch {} };

  const isGoods = (form.doc_type||'goods') === 'goods';
  const gstType = getGSTType(companyState, form.place_of_supply);
  const calcLT = (it) => parseFloat(it.quantity||0)*parseFloat(it.unit_price||0)*(1-parseFloat(it.discount_percent||0)/100);
  const calcTax = (it) => calcLT(it)*(parseFloat(it.cgst_rate||0)+parseFloat(it.sgst_rate||0)+parseFloat(it.igst_rate||0))/100;
  const subtotal = (form.items||[]).reduce((s,i)=>s+calcLT(i),0);
  const totalTax = (form.items||[]).reduce((s,i)=>s+calcTax(i),0);

  const openCreate = async () => {
    setForm({doc_type:'goods',items:[{}],place_of_supply:companyState});
    setSourceType('manual'); setModalError(null);
    // Always refresh quotations list so converted ones don't appear
    try { const q = await api.get('/sales/quotations', { status: 'approved' }).catch(()=>null); setQuotations(q?.data || []); } catch {}
    setShowCreate(true);
  };
  const copyFromQuotation = async (qId) => {
    try {
      const r = await api.get(`/sales/quotations/${qId}`).catch(()=>null);
      const d = r?.data;
      setForm({ ...d, customer_id:d.customer_id, doc_type:d.doc_type||'goods', quotation_id:qId,
        items: (d.items||[]).map(i=>({...i, material_id:i.material_id||'', plant_id:i.plant_id||'', storage_location_id:i.storage_location_id||''})) });
      if(d.items?.[0]?.plant_id) loadSlocs(d.items[0].plant_id);
    } catch(e) { setModalError(e.message); }
  };

  const GSTIN_STATE_MAP = {'01':'01-Jammu & Kashmir','02':'02-Himachal Pradesh','03':'03-Punjab','04':'04-Chandigarh','05':'05-Uttarakhand','06':'06-Haryana','07':'07-Delhi','08':'08-Rajasthan','09':'09-Uttar Pradesh','10':'10-Bihar','11':'11-Sikkim','12':'12-Arunachal Pradesh','13':'13-Nagaland','14':'14-Manipur','15':'15-Mizoram','16':'16-Tripura','17':'17-Meghalaya','18':'18-Assam','19':'19-West Bengal','20':'20-Jharkhand','21':'21-Odisha','22':'22-Chhattisgarh','23':'23-Madhya Pradesh','24':'24-Gujarat','27':'27-Maharashtra','29':'29-Karnataka','30':'30-Goa','32':'32-Kerala','33':'33-Tamil Nadu','34':'34-Puducherry','36':'36-Telangana','37':'37-Andhra Pradesh'};
  const selectCustomer = (custId) => {
    const c = lookups.customers.find(x=>x.id===custId);
    let pos = '';
    if (c?.state) pos = INDIAN_STATES.find(s => s.toLowerCase().includes(c.state.toLowerCase().trim())) || c.state;
    if (!pos && c?.gstin?.length >= 2) pos = GSTIN_STATE_MAP[c.gstin.substring(0,2)] || '';
    // Re-calculate tax rates on existing items based on new GST type
    const newGstType = getGSTType(companyState, pos);
    const items = (form.items||[]).map(it => {
      const rate = parseFloat(it.gst_rate || it.cgst_rate*2 || it.igst_rate || 0);
      if (newGstType === 'igst') return {...it, igst_rate: rate, cgst_rate: 0, sgst_rate: 0};
      return {...it, cgst_rate: rate/2, sgst_rate: rate/2, igst_rate: 0};
    });
    setForm(prev=>({...prev, customer_id:custId, customer_gstin:c?.gstin||'', place_of_supply:pos, items}));
  };
  const [itemStockLocs, setItemStockLocs] = useState({});

  const updateItem = (idx, f, v, extra={}) => {
    setForm(prev => { const items=[...(prev.items||[])]; items[idx]={...items[idx],[f]:v,...extra};
      if(f==='material_id'&&v){const m=lookups.materials.find(x=>x.id===v);if(m){items[idx].description=m.material_name;items[idx].unit_price=m.selling_price||m.standard_price||0;items[idx].hsn_code=m.hsn_code||'';items[idx].gst_rate=m.gst_rate||0;items[idx].uom_id=m.base_uom_id||'';items[idx].plant_id='';items[idx].storage_location_id='';
        const rate=parseFloat(m.gst_rate||0);if(gstType==='igst'){items[idx].igst_rate=rate;items[idx].cgst_rate=0;items[idx].sgst_rate=0;}else{items[idx].cgst_rate=rate/2;items[idx].sgst_rate=rate/2;items[idx].igst_rate=0;}}
        api.get(`/master/materials/${v}/stock-locations`).catch(()=>null).then(r=>{setItemStockLocs(prev=>({...prev,[idx]:r?.data||[]}));}).catch(()=>{});
      }
      if(f==='service_id'&&v){const sv=(lookups.services||[]).find(x=>x.id===v);if(sv){items[idx].description=sv.service_name;items[idx].unit_price=parseFloat(sv.standard_rate)||0;items[idx].hsn_code=sv.sac_code||'';items[idx].uom_id=sv.uom_id||'';const rate=parseFloat(sv.gst_rate||0);if(gstType==='igst'){items[idx].igst_rate=rate;items[idx].cgst_rate=0;items[idx].sgst_rate=0;}else{items[idx].cgst_rate=rate/2;items[idx].sgst_rate=rate/2;items[idx].igst_rate=0;}}}
      if(f==='tax_code_id'&&v){const tc=lookups.taxCodes.find(x=>String(x.id)===String(v));if(tc){const rate=parseFloat(tc.tax_rate||0);if(gstType==='igst'){items[idx].igst_rate=rate;items[idx].cgst_rate=0;items[idx].sgst_rate=0;}else{items[idx].cgst_rate=rate/2;items[idx].sgst_rate=rate/2;items[idx].igst_rate=0;}}}
      if(f==='plant_id') items[idx].storage_location_id='';
      return{...prev,items};});
  };
  const addItem = () => setForm(prev=>({...prev,items:[...(prev.items||[]),{}]}));
  const removeItem = (idx) => setForm(prev=>({...prev,items:(prev.items||[]).filter((_,i)=>i!==idx)}));

  const handleSave = async () => {
    setModalError(null);
    if(!form.customer_id) return setModalError('Customer is required');
    if(!form.customer_po_number) return setModalError('Customer PO # is required');
    if(!form.customer_po_date) return setModalError('Customer PO Date is required');
    if(!form.payment_term_id) return setModalError('Payment Terms is required');
    if(!form.place_of_supply) return setModalError('Place of Supply is required');
    if(!form.delivery_terms) return setModalError('Delivery Terms is required');
    if(!form.delivery_date) return setModalError('Delivery Date is required');
    if(!(form.items||[]).length) return setModalError('At least one item required');
    for(let i=0;i<form.items.length;i++){const it=form.items[i];
      if(isGoods&&!it.material_id) return setModalError(`Item ${i+1}: Material required`);
      if(!isGoods&&!it.description) return setModalError(`Item ${i+1}: Service description required`);
      if(!it.plant_id) return setModalError(`Item ${i+1}: Plant required`);
      if(isGoods&&!it.storage_location_id) return setModalError(`Item ${i+1}: Storage location required`);
      if(!it.hsn_code) return setModalError(`Item ${i+1}: ${isGoods?'HSN':'SAC'} required`);
      if(!parseFloat(it.quantity)) return setModalError(`Item ${i+1}: Quantity required`);
      if(!it.uom_id) return setModalError(`Item ${i+1}: UoM required`);
      if(!parseFloat(it.unit_price)) return setModalError(`Item ${i+1}: Unit price required`);
    }
    try {
      const r = await api.post('/sales/orders', form);
      setAlert({type:'success',message:`SO ${r?.data?.doc_number} created`});
      setShowCreate(false); loadData();
      // Refresh quotations so converted ones disappear from dropdown
      try { const q = await api.get('/sales/quotations', { status: 'approved' }).catch(()=>null); setQuotations(q?.data || []); } catch {}
    }
    catch(e){ setModalError(e.message); }
  };

  const handleSubmitApproval = async (id) => {
    try {
      await api.post('/workflow/submit', { entity_type: 'sales_order', entity_id: id });
      setAlert({ type: 'success', message: 'Submitted for approval' });
      setShowDetail(null); loadData();
    } catch (e) { setModalError(e.message); }
  };
  const viewDetail = async (id) => { try { const r = await api.get(`/sales/orders/${id}`).catch(()=>null); setShowDetail(r?.data); } catch {} };
  const [showEditSO, setShowEditSO] = useState(false);
  const [editSOForm, setEditSOForm] = useState({});
  const openEditSO = (so) => {
    setEditSOForm({
      delivery_date: so.delivery_date?.split('T')[0]||'',
      customer_po_number: so.customer_po_number||'',
      priority: so.priority||'medium',
      shipping_method: so.shipping_method||'',
      internal_notes: so.internal_notes||'',
      description: so.description||'',
      place_of_supply: so.place_of_supply||'',
      delivery_terms: so.delivery_terms||''
    });
    setShowDetail(null);
    setShowEditSO(true);
    setEditSOId(so.id);
  };
  const [editSOId, setEditSOId] = useState(null);
  const handleEditSO = async () => {
    try {
      await api.put(`/sales/orders/${editSOId}`, editSOForm);
      setAlert({ type: 'success', message: 'Sales order updated' });
      setShowEditSO(false); setEditSOId(null); loadData();
    } catch (e) { setModalError(e.message); }
  };
  const inp='w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition-all';
  const handleDelete = async (id) => {
    try { await api.delete(`/sales/orders/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/sales/bulk-delete', { entity: 'orders', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };



  return (<div className="space-y-4">
    {alert && <Alert type={alert.type} message={alert.message} onClose={()=>setAlert(null)} />}
    <div className="flex items-center justify-between">
      <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sales Orders</h1><p className="text-xs text-gray-400 mt-0.5">Manage customer orders → delivery → billing</p></div>
      <><DownloadButton data={data} filename="SalesOrders" /><button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> New SO</button></>
    </div>
    <div className="flex items-center gap-3">
      <div className="flex gap-1">{['','draft','pending_approval','rejected','confirmed','delivered','completed'].map(s=>(<button key={s} onClick={()=>setTab(s)} className={`px-3 py-1 text-xs rounded-full transition-all ${tab===s?'bg-blue-600 text-white':'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}>{s==='pending_approval'?'Pending Approval':s||'All'}</button>))}</div>
      <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg w-full bg-white dark:bg-gray-900 focus:border-blue-400 outline-none" /></div>
    </div>
    <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={[
        {key:'doc_number',label:'SO #',render:v=><span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span>},
        {key:'doc_type',label:'Type',render:v=><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v==='service'?'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400':'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>{(v||'goods').charAt(0).toUpperCase()+(v||'goods').slice(1)}</span>},
        {key:'customer_name',label:'Customer',render:v=><span className="font-medium text-sm">{v||'—'}</span>},
        {key:'customer_po_number',label:'Cust PO#',render:v=>v?<span className="font-mono text-xs">{v}</span>:'—'},
        {key:'order_date',label:'Date',render:v=><span className="text-xs text-gray-500">{formatDate(v)}</span>},
        {key:'item_count',label:'Items',className:'text-right',render:v=><span className="text-xs">{v}</span>},
        {key:'total_amount',label:'Total',className:'text-right',render:v=><span className="font-semibold text-sm">{formatCurrency(v)}</span>},
        {key:'status',label:'Status',render:v=><StatusBadge status={v} />},
        {key:'id',label:'',render:(v,row)=>(<div className="flex gap-1">
          <button onClick={()=>viewDetail(v)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><Eye className="w-3.5 h-3.5 text-gray-400" /></button>
              {row.status === 'draft' && <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>}
        </div>)},
      ]} data={data} loading={loading} emptyMessage="No sales orders" />
    </div>

    {/* CREATE MODAL */}
    <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={()=>setShowCreate(false)} title="New Sales Order" size="xl" 
      footer={<><button onClick={()=>setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} className="btn-primary">Create SO</button></>}>
      <div className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <div className="flex gap-3 items-end">
            <FormField label="Source"><select value={sourceType} onChange={e=>{setSourceType(e.target.value);if(e.target.value==='manual')setForm({doc_type:'goods',items:[{}],place_of_supply:companyState});}} className="select-field w-40"><option value="manual">Manual</option><option value="quotation">From Quotation</option></select></FormField>
            {sourceType==='quotation' && <FormField label="Select Quotation"><select onChange={e=>{if(e.target.value)copyFromQuotation(e.target.value);}} className="select-field w-72"><option value="">Select...</option>{quotations.map(q=><option key={q.id} value={q.id}>{q.doc_number} — {q.customer_name} — {formatCurrency(q.total_amount)}</option>)}</select></FormField>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <FormField label="Document Type *"><select value={form.doc_type||'goods'} onChange={e=>setForm({...form,doc_type:e.target.value})} className="select-field"><option value="goods">Goods</option><option value="service">Service</option></select></FormField>
          <FormField label="Customer *"><SearchableSelect value={form.customer_id||''} onChange={val=>selectCustomer(val)} options={lookups.customers.map(c=>({value:c.id,label:`${c.bp_number} — ${c.display_name}`}))} placeholder="Select customer..." className="select-field" /></FormField>
          <FormField label="Customer PO # *"><input value={form.customer_po_number||''} onChange={e=>setForm({...form,customer_po_number:e.target.value})} className="input-field" /></FormField>
          <FormField label="Customer PO Date *"><input type="date" value={form.customer_po_date||''} onChange={e=>setForm({...form,customer_po_date:e.target.value})} className="input-field" /></FormField>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <FormField label="Payment Terms *"><select value={form.payment_term_id||''} onChange={e=>setForm({...form,payment_term_id:e.target.value})} className="select-field"><option value="">Select...</option>{lookups.paymentTerms.map(p=><option key={p.id} value={p.id}>{p.term_code} — {p.term_name}</option>)}</select></FormField>
          <FormField label="Place of Supply *"><select value={form.place_of_supply||''} onChange={e=>setForm({...form,place_of_supply:e.target.value})} className="select-field"><option value="">Select state...</option>{INDIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select></FormField>
          <FormField label="Delivery Terms *"><select value={form.delivery_terms||''} onChange={e=>setForm({...form,delivery_terms:e.target.value})} className="select-field"><option value="">Select...</option>{(lookups.incoterms.length?lookups.incoterms:INCOTERMS).map(t=><option key={t.code||t.id} value={t.code}>{t.code} — {t.name}</option>)}</select></FormField>
          <FormField label="Delivery Date *"><input type="date" value={form.delivery_date||''} onChange={e=>setForm({...form,delivery_date:e.target.value})} className="input-field" /></FormField>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <FormField label="Profit Center"><select value={form.profit_center_id||''} onChange={e=>setForm({...form,profit_center_id:e.target.value,project_id:''})} className="select-field" disabled={!!form.project_id}><option value="">Select...</option>{lookups.profitCenters.map(c=><option key={c.id} value={c.id}>{c.pc_code} — {c.pc_name}</option>)}</select></FormField>
          <FormField label="Project"><select value={form.project_id||''} onChange={e=>setForm({...form,project_id:e.target.value,profit_center_id:''})} className="select-field" disabled={!!form.profit_center_id}><option value="">Select...</option>{lookups.projects.map(p=><option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}</select></FormField>
          <FormField label="Description" className="col-span-2"><input value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} className="input-field" /></FormField>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50"><span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Line Items</span><button onClick={addItem} className="text-xs text-blue-600 hover:underline">+ Add</button></div>
          <div className="overflow-x-auto"><table className="w-full text-xs" style={{minWidth:'1600px'}}><thead><tr className="bg-gray-50 dark:bg-gray-800/30 text-gray-500 text-[10px] uppercase">
            <th className="px-2 py-1.5 text-left w-8">#</th><th className="px-2 py-1.5 text-left min-w-[180px]">{isGoods?'Material *':'Service *'}</th><th className="px-2 py-1.5 text-left">{isGoods?'HSN *':'SAC *'}</th>
            <th className="px-2 py-1.5 text-left min-w-[120px]">Plant *</th>{isGoods&&<th className="px-2 py-1.5 text-left min-w-[120px]">Store *</th>}<th className="px-2 py-1.5 text-right w-16">Qty *</th><th className="px-2 py-1.5 text-left w-16">UoM *</th>
            <th className="px-2 py-1.5 text-right w-20">Price *</th><th className="px-2 py-1.5 text-right w-14">Disc%</th><th className="px-2 py-1.5 text-left w-28">Tax Code</th>
            {gstType==='igst'?<th className="px-2 py-1.5 text-right w-14">IGST%</th>:<><th className="px-2 py-1.5 text-right w-14">CGST%</th><th className="px-2 py-1.5 text-right w-14">SGST%</th></>}
            <th className="px-2 py-1.5 text-right w-20">Total</th><th className="px-2 py-1.5 w-6"></th>
          </tr></thead><tbody>{(form.items||[]).map((it,idx)=>(
            <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-2 py-1 text-gray-400">{idx+1}</td>
              <td className="px-2 py-1">{isGoods?<SearchableSelect value={it.material_id||''} onChange={val=>updateItem(idx,'material_id',val)} options={lookups.materials.map(m=>({value:m.id,label:`${m.material_code} — ${m.material_name}`}))} placeholder="Select..." className={inp} />:<div><select value={it.service_id||''} onChange={e=>updateItem(idx,'service_id',e.target.value)} className={`${inp} mb-0.5`}><option value="">— Select service —</option>{(lookups.services||[]).map(sv=><option key={sv.id} value={sv.id}>{sv.service_code} — {sv.service_name} ({sv.sac_code})</option>)}</select><input value={it.description||''} onChange={e=>updateItem(idx,'description',e.target.value)} className={inp} placeholder="Service description" /></div>}</td>
              <td className="px-2 py-1"><input value={it.hsn_code||''} onChange={e=>updateItem(idx,'hsn_code',e.target.value)} className={`${inp} w-20`} /></td>
              <td className="px-2 py-1"><select value={it.plant_id||''} onChange={e=>updateItem(idx,'plant_id',e.target.value,{storage_location_id:''})} className={inp}><option value="">-</option>{(itemStockLocs[idx] ? [...new Map(itemStockLocs[idx].map(s=>[s.plant_id,s])).values()].map(s=><option key={s.plant_id} value={s.plant_id}>{s.plant_code} — {s.plant_name} ({s.quantity})</option>) : lookups.plants.map(p=><option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>))}</select></td>
              {isGoods&&<td className="px-2 py-1"><select value={it.storage_location_id||''} onChange={e=>updateItem(idx,'storage_location_id',e.target.value)} className={inp}><option value="">-</option>{(itemStockLocs[idx] ? itemStockLocs[idx].filter(s=>s.sloc_id&&(!it.plant_id||s.plant_id===it.plant_id)).map(s=><option key={s.sloc_id} value={s.sloc_id}>{s.sloc_code} — {s.sloc_name} ({s.quantity})</option>) : lookups.slocs?.filter(s=>!it.plant_id||s.plant_id===it.plant_id).map(s=><option key={s.id} value={s.id}>{s.sloc_code} — {s.sloc_name}</option>))}</select></td>}
              <td className="px-2 py-1"><input type="number" min="0" value={it.quantity||''} onChange={e=>updateItem(idx,'quantity',e.target.value)} className={`${inp} text-right`} /></td>
              <td className="px-2 py-1"><select value={it.uom_id||''} onChange={e=>updateItem(idx,'uom_id',e.target.value)} className={inp}><option value="">-</option>{lookups.uoms.map(u=><option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}</select></td>
              <td className="px-2 py-1"><input type="number" min="0" step="0.01" value={it.unit_price??''} onChange={e=>updateItem(idx,'unit_price',e.target.value)} className={`${inp} text-right`} /></td>
              <td className="px-2 py-1"><input type="number" min="0" max="100" value={it.discount_percent||''} onChange={e=>updateItem(idx,'discount_percent',e.target.value)} className={`${inp} text-right`} /></td>
              <td className="px-2 py-1"><select value={it.tax_code_id||''} onChange={e=>updateItem(idx,'tax_code_id',e.target.value)} className={inp}><option value="">-</option>{lookups.taxCodes.map(tc=><option key={tc.id} value={tc.id}>{tc.tax_code} — {tc.tax_name} ({tc.tax_rate}%)</option>)}</select></td>
              {gstType==='igst'?<td className="px-2 py-1"><input type="number" min="0" value={it.igst_rate||''} onChange={e=>updateItem(idx,'igst_rate',e.target.value)} className={`${inp} text-right`} /></td>:
                <><td className="px-2 py-1"><input type="number" min="0" value={it.cgst_rate||''} onChange={e=>updateItem(idx,'cgst_rate',e.target.value)} className={`${inp} text-right`} /></td><td className="px-2 py-1"><input type="number" min="0" value={it.sgst_rate||''} onChange={e=>updateItem(idx,'sgst_rate',e.target.value)} className={`${inp} text-right`} /></td></>}
              <td className="px-2 py-1 text-right font-medium">{formatCurrency(calcLT(it)+calcTax(it))}</td>
              <td className="px-2 py-1"><button onClick={()=>removeItem(idx)} className="text-rose-400 hover:text-rose-600 text-xs">✕</button></td>
            </tr>))}</tbody></table></div>
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-6 text-xs">
            <span className="text-gray-500">Subtotal: <strong>{formatCurrency(subtotal)}</strong></span>
            <span className="text-gray-500">Tax: <strong className="text-orange-600">{formatCurrency(totalTax)}</strong></span>
            <span className="font-bold">Total: {formatCurrency(subtotal+totalTax)}</span>
          </div>
        </div>
      </div>
    </Modal>

    {/* DETAIL */}
    <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={()=>setShowDetail(null)} title={`Sales Order ${showDetail?.doc_number}`} size="xl"
      footer={<>
        {(showDetail?.status==='draft'||showDetail?.status==='rejected')&&<button onClick={()=>openEditSO(showDetail)} className="btn-secondary flex items-center gap-1"><Pencil className="w-4 h-4" /> Edit</button>}
        {showDetail?.status==='draft'&&<button onClick={()=>handleSubmitApproval(showDetail.id)} className="btn-primary flex items-center gap-1"><Send className="w-4 h-4" /> Submit for Approval</button>}
        {showDetail?.status==='rejected'&&<span className="px-3 py-1.5 text-xs bg-red-100 text-red-800 rounded-lg font-medium mr-2">✗ Rejected</span>}
        {showDetail?.status==='rejected'&&<button onClick={()=>handleSubmitApproval(showDetail.id)} className="btn-primary flex items-center gap-1"><Send className="w-4 h-4" /> Resubmit for Approval</button>}
        {showDetail?.status==='pending_approval'&&<span className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg font-medium">⏳ Awaiting Approval</span>}
        <button onClick={()=>setPrintTarget({entityType:'sales_order',entityId:showDetail.id,docNumber:showDetail.doc_number})} className="btn-secondary flex items-center gap-1.5"><Printer className="w-4 h-4"/>Print</button>
        <button onClick={()=>setShowDetail(null)} className="btn-secondary">Close</button>
      </>}>
      {showDetail&&<div className="space-y-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-400 text-xs">Customer</span><p className="font-medium">{showDetail.customer_name}</p></div>
          <div><span className="text-gray-400 text-xs">Type</span><p className="capitalize">{showDetail.doc_type||'goods'}</p></div>
          <div><span className="text-gray-400 text-xs">Customer PO #</span><p className="font-mono text-xs">{showDetail.customer_po_number||'—'}</p></div>
          <div><span className="text-gray-400 text-xs">Customer PO Date</span><p className="text-xs">{formatDate(showDetail.customer_po_date)||'—'}</p></div>
          <div><span className="text-gray-400 text-xs">Status</span><p><StatusBadge status={showDetail.status} /></p></div>
          <div><span className="text-gray-400 text-xs">Place of Supply</span><p>{showDetail.place_of_supply||'—'}</p></div>
          <div><span className="text-gray-400 text-xs">Date</span><p>{formatDate(showDetail.order_date)}</p></div>
          <div><span className="text-gray-400 text-xs">Delivery Date</span><p>{formatDate(showDetail.delivery_date)}</p></div>
          <div><span className="text-gray-400 text-xs">Total</span><p className="font-bold text-lg">{formatCurrency(showDetail.total_amount)}</p></div>
        </div>
        <table className="w-full text-xs"><thead><tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-[10px] uppercase">
          <th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">{(showDetail.doc_type||'goods')==='goods'?'Material':'Service'}</th>
          <th className="px-2 py-1.5 text-left">{(showDetail.doc_type||'goods')==='goods'?'HSN':'SAC'}</th><th className="px-2 py-1.5 text-left min-w-[120px]">Plant</th>
          <th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Delivered</th><th className="px-2 py-1.5 text-right">Price</th><th className="px-2 py-1.5 text-right">Total</th>
        </tr></thead><tbody>{(showDetail.items||[]).map((it,i)=>(
          <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
            <td className="px-2 py-1.5 text-gray-400">{it.line_number}</td>
            <td className="px-2 py-1.5 font-medium">{it.material_code?`${it.material_code} — ${it.material_name}`:it.description}</td>
            <td className="px-2 py-1.5 font-mono">{it.hsn_code||'—'}</td>
            <td className="px-2 py-1.5">{it.plant_code||'—'}</td>
            <td className="px-2 py-1.5 text-right">{it.quantity}</td>
            <td className="px-2 py-1.5 text-right">{parseFloat(it.delivered_qty||0) > 0 ? <span className={parseFloat(it.delivered_qty)>=parseFloat(it.quantity)?'text-emerald-600':'text-amber-600'}>{it.delivered_qty}</span> : '0'}</td>
            <td className="px-2 py-1.5 text-right">{formatCurrency(it.unit_price)}</td>
            <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(it.total_amount)}</td>
          </tr>))}</tbody></table>
        <div className="flex justify-end gap-4 text-xs border-t pt-2">
          <span>Subtotal: <strong>{formatCurrency(showDetail.subtotal)}</strong></span>
          {parseFloat(showDetail.cgst_amount)>0&&<span>CGST: <strong className="text-orange-600">{formatCurrency(showDetail.cgst_amount)}</strong></span>}
          {parseFloat(showDetail.sgst_amount)>0&&<span>SGST: <strong className="text-orange-600">{formatCurrency(showDetail.sgst_amount)}</strong></span>}
          {parseFloat(showDetail.igst_amount)>0&&<span>IGST: <strong className="text-orange-600">{formatCurrency(showDetail.igst_amount)}</strong></span>}
          <span className="font-bold text-sm">Total: {formatCurrency(showDetail.total_amount)}</span>
        </div>
        {['pending_approval','rejected'].includes(showDetail?.status) && (
          <ApprovalPanel entityType="sales_order" entityId={showDetail.id}
            currentUserId={user?.id} onDecision={() => { viewDetail(showDetail.id); loadData(); }} />
        )}
      </div>}
    </Modal>
  
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />

    {showEditSO && <Modal error={modalError} onClearError={()=>setModalError(null)} isOpen={showEditSO} onClose={()=>{setShowEditSO(false);setEditSOId(null);}} title="Edit Sales Order" size="lg"
      footer={<><button onClick={()=>{setShowEditSO(false);setEditSOId(null);}} className="btn-secondary">Cancel</button><button onClick={handleEditSO} className="btn-primary">Update</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Description"><input value={editSOForm.description||''} onChange={e=>setEditSOForm({...editSOForm,description:e.target.value})} className={inp}/></FormField>
          <FormField label="Customer PO #"><input value={editSOForm.customer_po_number||''} onChange={e=>setEditSOForm({...editSOForm,customer_po_number:e.target.value})} className={inp}/></FormField>
          <FormField label="Delivery Date"><input type="date" value={editSOForm.delivery_date||''} onChange={e=>setEditSOForm({...editSOForm,delivery_date:e.target.value})} className={inp}/></FormField>
          <FormField label="Place of Supply"><select value={editSOForm.place_of_supply||''} onChange={e=>setEditSOForm({...editSOForm,place_of_supply:e.target.value})} className={inp}>
            <option value="">Select state...</option>{INDIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}
          </select></FormField>
          <FormField label="Priority"><select value={editSOForm.priority||'medium'} onChange={e=>setEditSOForm({...editSOForm,priority:e.target.value})} className={inp}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select></FormField>
          <FormField label="Shipping Method"><input value={editSOForm.shipping_method||''} onChange={e=>setEditSOForm({...editSOForm,shipping_method:e.target.value})} className={inp} placeholder="e.g. Road, Air, Sea"/></FormField>
          <FormField label="Delivery Terms"><input value={editSOForm.delivery_terms||''} onChange={e=>setEditSOForm({...editSOForm,delivery_terms:e.target.value})} className={inp} placeholder="e.g. FOB, CIF"/></FormField>
          <FormField label="Internal Notes"><textarea value={editSOForm.internal_notes||''} onChange={e=>setEditSOForm({...editSOForm,internal_notes:e.target.value})} className={inp} rows={3}/></FormField>
        </div>
      </div>
    </Modal>}
      {printTarget && <PrintFormatModal {...printTarget} onClose={() => setPrintTarget(null)} />}
    </div>);
}
