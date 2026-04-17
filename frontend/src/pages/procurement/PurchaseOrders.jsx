import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Eye, PackageCheck, Edit2, Printer, Trash2, Send } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert ,BulkActionBar, DownloadButton, SearchableSelect } from '../../components/common/index';
import DocumentTrace from '../../components/common/DocumentTrace';
import ApprovalPanel from '../../components/common/ApprovalPanel';
import PrintFormatModal from '../../components/common/PrintFormatModal';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function PurchaseOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showDetail, setShowDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [services, setServices] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [plants, setPlants] = useState([]);
  const [storeLocs, setStoreLocs] = useState([]);
  const [payTerms, setPayTerms] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [projects, setProjects] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);
  const [sourceQuotations, setSourceQuotations] = useState([]);
  const [sourcePRs, setSourcePRs] = useState([]);
  const [sourceType, setSourceType] = useState('manual');
  const [docType, setDocType] = useState('goods');

  const today = new Date().toISOString().split('T')[0];
  const emptyItem = { material_id:'', description:'', hsn_code:'', quantity:1, uom_id:'', unit_price:0, tax_rate:18, discount_percent:0, delivery_date:'', plant_id:'', storage_location_id:'' };
  const emptyForm = { vendor_id:'', plant_id:'', payment_term_id:'', description:'', notes:'', rfq_id:'', requisition_id:'', cost_center_id:'', project_id:'', doc_type:'goods', items:[{...emptyItem}] };
  const [form, setForm] = useState(emptyForm);

  const location = useLocation();
  useEffect(() => { loadOrders(); loadLookups(); }, [statusFilter, search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) loadDetail(openId);
  }, [location.search]);
  const loadOrders = async () => { try { setOrders((await api.get('/procurement/orders', { status: statusFilter, search }).catch(()=>null))?.data||[]); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => {
    try {
      const [v,m,u,p,sl,pt,cc,pj,gl,tc] = await Promise.all([
        api.get('/master/business-partners', { type:'vendor', all: true }).catch(()=>null), api.get('/master/materials', { all: true }).catch(()=>null),
        api.get('/master/uom').catch(()=>null), api.get('/org/plants').catch(()=>null), api.get('/org/storage-locations').catch(()=>null),
        api.get('/master/payment-terms').catch(()=>null), api.get('/org/cost-centers').catch(()=>null), api.get('/projects/projects').catch(()=>null),
        api.get('/master/gl-accounts').catch(()=>null), api.get('/master/tax-codes').catch(()=>null)
      ]);
      setVendors(v?.data?.rows||v?.data||[]); setMaterials(m?.data||[]); setUoms(u?.data||[]);
      api.get('/master/services').then(r => setServices(r?.data || [])).catch(() => {});
      setPlants(p?.data||[]); setStoreLocs(sl?.data||[]); setPayTerms(pt?.data||[]);
      setCostCenters(cc?.data||[]); setProjects(pj?.data||[]); setGlAccounts((gl?.data||[]).filter(g=>g.account_type==='expense'));
      setTaxCodes(tc?.data||[]);
    } catch (e) { console.error(e); }
    try { setSourceQuotations((await api.get('/procurement/quotations/eligible-for-po').catch(()=>null))?.data||[]); } catch {}
    try { setSourcePRs((await api.get('/procurement/orders/source-prs').catch(()=>null))?.data||[]); } catch {}
  };
  const loadDetail = async (id) => { try { setShowDetail((await api.get(`/procurement/orders/${id}`).catch(()=>null))?.data); } catch (err) { setModalError(err.message); } };

  const s = (k,v) => setForm(p => ({...p, [k]:v}));
  const isGoods = docType === 'goods';
  const hsnLabel = isGoods ? 'HSN' : 'SAC';
  const getStores = (pid) => storeLocs.filter(sl => !pid || sl.plant_id === pid);

  const updateItem = (idx, field, value, extra) => {
    setForm(prev => {
      const items = [...prev.items]; items[idx] = {...items[idx], [field]: value};
      if (extra) Object.assign(items[idx], extra);
      if (field === 'material_id' && value && docType === 'goods') {
        const mat = materials.find(m => m.id === value);
        if (mat) { items[idx].description = mat.material_name; items[idx].uom_id = mat.base_uom_id||''; items[idx].unit_price = parseFloat(mat.standard_price)||0; items[idx].hsn_code = mat.hsn_code||''; }
      }
      if (field === 'service_id' && value) {
        const svc = services.find(s => s.id === value);
        if (svc) { items[idx].description = svc.service_name; items[idx].uom_id = svc.uom_id||''; items[idx].unit_price = parseFloat(svc.standard_rate)||0; items[idx].hsn_code = svc.sac_code||''; items[idx].tax_rate = parseFloat(svc.gst_rate)||18; }
      }
      if (field === 'tax_code_id' && value) { const tc = taxCodes.find(x => String(x.id) === String(value)); if (tc) { items[idx].tax_rate = parseFloat(tc.tax_rate || 0); } }
      return {...prev, items};
    });
  };
  const addItem = () => setForm(prev => ({...prev, items:[...prev.items, {...emptyItem}]}));
  const removeItem = (idx) => setForm(prev => prev.items.length > 1 ? {...prev, items: prev.items.filter((_,i)=>i!==idx)} : prev);

  const copyFromQuotation = async (qId) => {
    if (!qId) return;
    try {
      const res = await api.get(`/procurement/quotations/${qId}/for-po`).catch(()=>null);
      const { quotation, items } = res.data;
      const dt = quotation.doc_type || 'goods'; setDocType(dt);
      setForm({ ...emptyForm, vendor_id: quotation.vendor_id, plant_id: quotation.plant_id||'',
        rfq_id: quotation.id, requisition_id: quotation.requisition_id||'', doc_type: dt,
        description: `PO from Quotation ${quotation.doc_number}`, payment_term_id: quotation.payment_term_id||'',
        cost_center_id: quotation.cost_center_id||'', project_id: quotation.project_id||'',
        items: items.map(it => ({
          material_id: it.material_id||'', description: it.description||it.material_name||'',
          hsn_code: it.hsn_code||it.mat_hsn||'', quantity: parseFloat(it.quantity)||1, uom_id: it.uom_id||'',
          unit_price: parseFloat(it.unit_price)||0, tax_rate: parseFloat(it.tax_rate)||18,
          discount_percent: parseFloat(it.discount_percent)||0, delivery_date: it.delivery_date?.split('T')[0]||'',
          plant_id: it.plant_id||'', storage_location_id: it.storage_location_id||''
        }))
      });
    } catch (err) { setModalError(err.message); }
  };

  const copyFromPR = async (prId) => {
    if (!prId) return;
    try {
      const res = await api.get(`/procurement/orders/source-pr/${prId}`).catch(()=>null);
      const { pr, items } = res.data;
      if (!items.length) { setModalError('No unconverted items remaining in this PR'); return; }
      const dt = pr.doc_type || 'goods'; setDocType(dt);
      setForm({ ...emptyForm, plant_id: pr.plant_id||'', requisition_id: pr.id, doc_type: dt,
        description: `PO from PR ${pr.doc_number}`,
        cost_center_id: pr.cost_center_id||'', project_id: pr.project_id||'',
        items: items.map(it => ({
          material_id: it.material_id||'', description: it.material_name||it.description||'',
          hsn_code: it.hsn_code||'', quantity: parseFloat(it.remaining_qty)||parseFloat(it.quantity)||1, uom_id: it.uom_id||'',
          unit_price: parseFloat(it.standard_price||it.unit_price)||0, tax_rate: parseFloat(it.gst_rate)||18,
          discount_percent: 0, delivery_date: pr.required_date?.split('T')[0]||'',
          plant_id: it.plant_id||'', storage_location_id: it.storage_location_id||'',
          gl_account_id: it.gl_account_id||''
        }))
      });
    } catch (err) { setModalError(err.message); }
  };

  const calcLine = (it) => (parseFloat(it.quantity)||0) * (parseFloat(it.unit_price)||0) * (1 - (parseFloat(it.discount_percent)||0)/100);
  const calcTotals = () => { let sub=0,tax=0; form.items.forEach(it => { const l=calcLine(it); sub+=l; tax+=l*(parseFloat(it.tax_rate)||0)/100; }); return {sub,tax,total:sub+tax}; };
  const totals = calcTotals();

  const handleCreate = async (e) => {
    e?.preventDefault(); setSaving(true); setModalError(null);
    try {
      if (!form.vendor_id) throw new Error('Vendor is mandatory');
      if (!form.payment_term_id) throw new Error('Payment terms is mandatory');
      if (!form.description) throw new Error('Description is mandatory');
      if (!form.cost_center_id && !form.project_id) throw new Error('Either Cost Center or Project is mandatory');
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i];
        if (!it.description && docType === 'service') throw new Error(`Item ${i+1}: Service description is mandatory`);
        if (!it.material_id && docType === 'goods') throw new Error(`Item ${i+1}: Material is mandatory`);
        if (!it.hsn_code) throw new Error(`Item ${i+1}: ${hsnLabel} code is mandatory`);
        if (!it.quantity || parseFloat(it.quantity) <= 0) throw new Error(`Item ${i+1}: Quantity must be > 0`);
        if (parseFloat(it.unit_price) < 0) throw new Error(`Item ${i+1}: Price cannot be negative`);
        if (!it.delivery_date) throw new Error(`Item ${i+1}: Delivery date is mandatory`);
        if (it.delivery_date < today) throw new Error(`Item ${i+1}: Delivery date cannot be in past`);
        if (!it.plant_id) throw new Error(`Item ${i+1}: Plant is mandatory`);
        if (!it.storage_location_id && docType === 'goods') throw new Error(`Item ${i+1}: Store is mandatory for goods`);
        if (docType === 'goods' && !it.uom_id) throw new Error(`Item ${i+1}: UoM is mandatory`);
      }
      if (editId) {
        await api.put(`/procurement/orders/${editId}`, { ...form, items: form.items });
        setAlert({type:'success',message:'Purchase order updated'});
      } else {
        await api.post('/procurement/orders', form);
        setAlert({type:'success',message:'Purchase order created'});
      }
      setShowCreate(false); setForm(emptyForm); setDocType('goods'); setEditId(null); loadOrders(); loadLookups();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleSubmitApproval = async (id) => {
    try {
      await api.post('/workflow/submit', { entity_type: 'purchase_order', entity_id: id });
      setAlert({ type: 'success', message: 'Submitted for approval' });
      setShowDetail(null); loadOrders();
    } catch (err) { setModalError(err.message); }
  };
  const openEdit = (po) => {
    const dt = po.doc_type || 'goods';
    setDocType(dt);
    setEditId(po.id);
    setForm({
      vendor_id: po.vendor_id||'', plant_id: po.plant_id||'', payment_term_id: po.payment_term_id||'',
      description: po.description||'', notes: po.notes||'', rfq_id: po.rfq_id||'',
      requisition_id: po.requisition_id||'', cost_center_id: po.cost_center_id||'', project_id: po.project_id||'',
      doc_type: dt,
      items: (po.items||[]).map(it => ({
        material_id: it.material_id||'', description: it.material_name||it.description||'',
        hsn_code: it.hsn_code||'', quantity: parseFloat(it.quantity)||1, uom_id: it.uom_id||'',
        unit_price: parseFloat(it.unit_price)||0, tax_rate: parseFloat(it.gst_rate||it.tax_rate)||0,
        discount_percent: parseFloat(it.discount_percent)||0, delivery_date: it.delivery_date?.split('T')[0]||'',
        plant_id: it.plant_id||'', storage_location_id: it.storage_location_id||'',
        gl_account_id: it.gl_account_id||''
      }))
    });
    setShowDetail(null);
    setModalError(null);
    setSourceType('manual');
    setShowCreate(true);
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/procurement/bulk-delete', { entity: 'purchase-orders', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadOrders(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={()=>setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Purchase Orders</h1><p className="text-sm text-gray-400 mt-1">Create from quotations or PRs, confirm and track</p></div>
        <button onClick={() => { setForm(emptyForm); setSourceType('manual'); setDocType('goods'); setEditId(null); setModalError(null); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New PO</button>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={[{key:'',label:'All'},{key:'draft',label:'Draft'},{key:'pending_approval',label:'Pending Approval'},{key:'rejected',label:'Rejected'},{key:'confirmed',label:'Confirmed'},{key:'partially_received',label:'Partial'},{key:'completed',label:'Completed'}]} active={statusFilter} onChange={setStatusFilter}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search PO, vendor, PR, quotation..." className="w-72"/>
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={[
        { key:'doc_number', label:'PO #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
        { key:'doc_type', label:'Type', render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium ${v==='service'?'bg-violet-100 text-violet-700':'bg-blue-100 text-blue-700'}`}>{(v||'goods').charAt(0).toUpperCase()+(v||'goods').slice(1)}</span> },
        { key:'vendor_name', label:'Vendor', render: v => <span className="font-medium">{v}</span> },
        { key:'_ref', label:'PR / Quotation', render:(_,r) => <div className="text-xs">
          {r.pr_number && <span className="font-mono text-blue-600">{r.pr_number}</span>}
          {r.pr_number && r.quotation_number && <span className="text-gray-400 mx-1">→</span>}
          {r.quotation_number && <span className="font-mono text-violet-600">{r.quotation_number}</span>}
          {!r.pr_number && !r.quotation_number && <span className="text-gray-400">Manual</span>}
        </div> },
        { key:'order_date', label:'Date', render: v => formatDate(v) },
        { key:'total_amount', label:'Amount', className:'text-right', render: v => <span className="font-semibold">{formatCurrency(v)}</span> },
        { key:'status', label:'Status', render: v => <StatusBadge status={v}/> },
        { key:'_a', label:'', render:(_,r) => <button onClick={()=>loadDetail(r.id)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-3.5 h-3.5 text-gray-500"/></button> },
      ]} data={orders} loading={loading} onRowClick={r => loadDetail(r.id)}/></div>

      {/* CREATE */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={()=>{setShowCreate(false);setEditId(null);setModalError(null);}} title={editId ? 'Edit Purchase Order' : 'Create Purchase Order'} size="xl"
        footer={<><button onClick={()=>{setShowCreate(false);setEditId(null);}} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving?(editId?'Updating...':'Creating...'):(editId?'Update PO':'Create PO')}</button></>}>
        <div className="space-y-4">
          {!editId && <div className="p-3 bg-gray-50 rounded-lg border">
            <p className="text-xs font-semibold text-gray-500 mb-2">CREATE FROM SOURCE</p>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="posrc" checked={sourceType==='manual'} onChange={()=>{setSourceType('manual');setForm(emptyForm);setDocType('goods');}}/> Manual</label>
              <div><label className="flex items-center gap-2 text-sm"><input type="radio" name="posrc" checked={sourceType==='quotation'} onChange={()=>setSourceType('quotation')}/> From Quotation</label>
                {sourceType==='quotation' && <select onChange={e=>copyFromQuotation(e.target.value)} className="select-field text-xs mt-1"><option value="">Select...</option>{sourceQuotations.map(q=><option key={q.id} value={q.id}>{q.doc_number} — {q.vendor_name} ({formatCurrency(q.total_amount)})</option>)}</select>}</div>
              <div><label className="flex items-center gap-2 text-sm"><input type="radio" name="posrc" checked={sourceType==='pr'} onChange={()=>setSourceType('pr')}/> From PR</label>
                {sourceType==='pr' && <select onChange={e=>copyFromPR(e.target.value)} className="select-field text-xs mt-1"><option value="">Select...</option>{sourcePRs.map(pr=><option key={pr.id} value={pr.id}>{pr.doc_number} — [{pr.doc_type||'goods'}] {pr.description||''} ({pr.open_item_count} items remaining)</option>)}</select>}</div>
            </div>
          </div>}

          <div className="grid grid-cols-4 gap-4">
            <FormField label="Document Type *"><select value={docType} onChange={e=>{setDocType(e.target.value); setForm(prev=>({...prev, doc_type:e.target.value, items:[{...emptyItem}]}));}} className="select-field"><option value="goods">Goods</option><option value="service">Service</option></select></FormField>
            <FormField label="Vendor *"><SearchableSelect value={form.vendor_id} onChange={val=>s('vendor_id',val)} options={vendors.map(v=>({value:v.id,label:`${v.bp_number} — ${v.display_name}`}))} placeholder="Select vendor..." className="select-field" /></FormField>
            <FormField label="Payment Terms *"><select value={form.payment_term_id||''} onChange={e=>s('payment_term_id',e.target.value)} className="select-field" ><option value="">Select...</option>{payTerms.map(pt=><option key={pt.id} value={pt.id}>{pt.term_code} — {pt.term_name}</option>)}</select></FormField>
            <FormField label="Description *"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field"/></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={form.project_id ? 'Cost Center (disabled)' : 'Cost Center'}>
              <select value={form.cost_center_id} onChange={e=>setForm(p=>({...p,cost_center_id:e.target.value,project_id:''}))} className="select-field" disabled={!!form.project_id}><option value="">Select...</option>{costCenters.map(cc=><option key={cc.id} value={cc.id}>{cc.cc_code} — {cc.cc_name}</option>)}</select></FormField>
            <FormField label={form.cost_center_id ? 'Project (disabled)' : 'Project'}>
              <select value={form.project_id||''} onChange={e=>setForm(p=>({...p,project_id:e.target.value,cost_center_id:''}))} className="select-field" disabled={!!form.cost_center_id}><option value="">Select...</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}</select></FormField>
          </div>
          {!form.cost_center_id && !form.project_id && <p className="text-xs text-amber-600">* Select either Cost Center or Project</p>}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">{isGoods ? 'Material Items' : 'Service Items'}</h3>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add</button>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs" style={{minWidth:"1200px"}}>
                <thead><tr className="bg-gray-50 border-b text-gray-500">
                  <th className="px-1 py-2 w-5">#</th>
                  <th className="px-1 py-2 text-left">{isGoods ? 'Material *' : 'Service Desc *'}</th>
                  <th className="px-1 py-2 text-left w-16">{hsnLabel} *</th>
                  <th className="px-1 py-2 text-left w-24">Plant *</th>
                  {isGoods && <th className="px-1 py-2 text-left w-24">Store *</th>}
                  <th className="px-1 py-2 w-14">UoM</th>
                  <th className="px-1 py-2 text-right w-12">Qty *</th>
                  <th className="px-1 py-2 text-right w-16">Price *</th>
                  <th className="px-1 py-2 text-right w-12">Disc%</th>
                  <th className="px-1 py-2 text-left w-28">Tax Code</th>
                  <th className="px-1 py-2 text-left w-24">Del.Date *</th>
                  <th className="px-1 py-2 text-left w-32">GL Account</th>
                  <th className="px-1 py-2 text-right w-16">Total</th>
                  <th className="w-5"></th>
                </tr></thead>
                <tbody>{form.items.map((item,idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="px-1 py-1 text-gray-400 text-center">{idx+1}</td>
                    <td className="px-1 py-1">{isGoods ? (<><SearchableSelect value={item.material_id} onChange={val=>updateItem(idx,'material_id',val)} options={materials.map(m=>({value:m.id,label:`${m.material_code} — ${m.material_name}`}))} placeholder="Select..." className="w-full px-1 py-1 border border-gray-200 rounded text-xs" /><span className="text-gray-400 text-xs block">{item.description}</span></>) : (<><select value={item.service_id||''} onChange={e=>updateItem(idx,'service_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs mb-0.5"><option value="">— Select service or type below —</option>{services.map(sv=><option key={sv.id} value={sv.id}>{sv.service_code} — {sv.service_name} ({sv.sac_code})</option>)}</select><input value={item.description||''} onChange={e=>updateItem(idx,'description',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs" placeholder="Service description *"/></>)}</td>
                    <td className="px-1 py-1"><input value={item.hsn_code||''} onChange={e=>updateItem(idx,'hsn_code',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs" maxLength={8}/></td>
                    <td className="px-1 py-1"><select value={item.plant_id||''} onChange={e=>updateItem(idx,'plant_id',e.target.value,{storage_location_id:''})} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">-</option>{plants.map(p=><option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}</select></td>
                    {isGoods && <td className="px-1 py-1"><select value={item.storage_location_id||''} onChange={e=>updateItem(idx,'storage_location_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">-</option>{getStores(item.plant_id).map(sl=><option key={sl.id} value={sl.id}>{sl.sloc_code} — {sl.sloc_name}</option>)}</select></td>}
                    <td className="px-1 py-1"><select value={item.uom_id||''} onChange={e=>updateItem(idx,'uom_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">-</option>{uoms.map(u=><option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}</select></td>
                    <td className="px-1 py-1"><input type="number" value={item.quantity} onChange={e=>updateItem(idx,'quantity',parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" min="1"/></td>
                    <td className="px-1 py-1"><input type="number" value={item.unit_price} onChange={e=>updateItem(idx,'unit_price',parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" step="0.01" min="0"/></td>
                    <td className="px-1 py-1"><input type="number" value={item.discount_percent||0} onChange={e=>updateItem(idx,'discount_percent',parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" min="0" max="100"/></td>
                    <td className="px-1 py-1"><select value={item.tax_code_id||''} onChange={e=>updateItem(idx,'tax_code_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">-</option>{taxCodes.map(tc=><option key={tc.id} value={tc.id}>{tc.tax_code} — {tc.tax_name} ({tc.tax_rate}%)</option>)}</select></td>
                    <td className="px-1 py-1"><input type="date" value={item.delivery_date||''} onChange={e=>updateItem(idx,'delivery_date',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs" min={today}/></td>
                    <td className="px-1 py-1"><SearchableSelect value={item.gl_account_id||''} onChange={val=>updateItem(idx,'gl_account_id',val)} options={glAccounts.map(g=>({value:g.id,label:`${g.account_code} — ${g.account_name}`}))} placeholder="Select GL..." className="w-full px-1 py-1 border border-gray-200 rounded text-xs" /></td>
                    <td className="px-1 py-1 text-right font-medium">{formatCurrency(calcLine(item))}</td>
                    <td className="px-1 py-1">{form.items.length>1 && <button type="button" onClick={()=>removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr className="bg-blue-50 font-semibold">
                  <td colSpan={isGoods ? 11 : 10} className="px-2 py-2 text-right text-sm">Sub: {formatCurrency(totals.sub)} + Tax: {formatCurrency(totals.tax)} =</td>
                  <td className="px-1 py-2 text-right text-base">{formatCurrency(totals.total)}</td><td></td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={()=>setShowDetail(null)} title={`PO — ${showDetail?.doc_number}`} size="xl"
        footer={<>
          <button onClick={()=>setPrintTarget({entityType:'purchase_order',entityId:showDetail.id,docNumber:showDetail.doc_number})} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4"/> Print</button>
          {(showDetail?.status==='draft' || showDetail?.status==='rejected') && <button onClick={()=>openEdit(showDetail)} className="btn-secondary flex items-center gap-2"><Edit2 className="w-4 h-4"/> Edit</button>}
          {showDetail?.status==='draft' && <button onClick={()=>handleSubmitApproval(showDetail.id)} className="btn-primary flex items-center gap-2"><Send className="w-4 h-4"/> Submit for Approval</button>}
          {showDetail?.status==='rejected' && <span className="px-3 py-1.5 text-xs bg-red-100 text-red-800 rounded-lg font-medium mr-2">✗ Rejected</span>}
          {showDetail?.status==='rejected' && <button onClick={()=>handleSubmitApproval(showDetail.id)} className="btn-primary flex items-center gap-2"><Send className="w-4 h-4"/> Resubmit for Approval</button>}
          {showDetail?.status==='pending_approval' && <span className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg font-medium">⏳ Awaiting Approval</span>}
          {['confirmed','partially_received'].includes(showDetail?.status) && <button onClick={()=>{setShowDetail(null);window.location.href='/procurement/goods-receipts';}} className="btn-primary flex items-center gap-2"><PackageCheck className="w-4 h-4"/> GR</button>}
          <button onClick={()=>setShowDetail(null)} className="btn-secondary">Close</button>
        </>}>
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Type</p><p className="capitalize font-medium">{showDetail.doc_type||'goods'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Vendor</p><p className="font-medium">{showDetail.vendor_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Date</p><p>{formatDate(showDetail.order_date)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-lg">{formatCurrency(showDetail.total_amount)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status}/></div>
          </div>
          {(() => { const dtl = (showDetail.doc_type||'goods')==='goods'; return (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b"><th className="px-2 py-2 text-left text-xs text-gray-500">#</th><th className="px-2 py-2 text-left text-xs text-gray-500">{dtl?'Material':'Service'}</th><th className="px-2 py-2 text-xs">{dtl?'HSN':'SAC'}</th><th className="px-2 py-2 text-right text-xs text-gray-500">Qty</th><th className="px-2 py-2 text-right text-xs text-gray-500">Price</th><th className="px-2 py-2 text-right text-xs text-gray-500">Disc%</th><th className="px-2 py-2 text-xs">Del.Date</th><th className="px-2 py-2 text-right text-xs text-gray-500">Total</th></tr></thead>
            <tbody>{(showDetail.items||[]).map((it,i) => <tr key={i} className="border-b border-gray-100"><td className="px-2 py-2 text-gray-400">{it.line_number}</td><td className="px-2 py-2">{it.material_code ? <span className="font-mono text-xs text-blue-600">{it.material_code}</span> : ''} {it.material_name||it.description}</td><td className="px-2 py-2 text-xs text-center">{it.hsn_code||'—'}</td><td className="px-2 py-2 text-right">{it.quantity} {it.uom_code||''}</td><td className="px-2 py-2 text-right">{formatCurrency(it.unit_price)}</td><td className="px-2 py-2 text-right">{it.discount_percent||0}%</td><td className="px-2 py-2 text-xs">{formatDate(it.delivery_date)||'—'}</td><td className="px-2 py-2 text-right font-medium">{formatCurrency(it.total_amount)}</td></tr>)}</tbody>
            <tfoot><tr className="bg-gray-50 font-semibold"><td colSpan={7} className="px-2 py-2 text-right">Total:</td><td className="px-2 py-2 text-right">{formatCurrency(showDetail.total_amount)}</td></tr></tfoot></table>
          </div>); })()}
          {['pending_approval','rejected'].includes(showDetail?.status) && (
            <ApprovalPanel entityType="purchase_order" entityId={showDetail.id}
              currentUserId={user?.id} onDecision={() => { loadDetail(showDetail.id); loadOrders(); }} />
          )}
          <DocumentTrace entityType="purchase_order" entityId={showDetail?.id}/>
        </div>}
      </Modal>

      {printTarget && <PrintFormatModal {...printTarget} onClose={() => setPrintTarget(null)} />}
    </div>
  );
}
