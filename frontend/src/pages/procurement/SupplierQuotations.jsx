import { useState, useEffect} from 'react';
import { Plus, Eye, CheckCircle2, XCircle, ShoppingCart, Trash2, Trophy, TrendingDown } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge, Tabs ,BulkActionBar, DownloadButton, SearchableSelect } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate, INCOTERMS } from '../../utils/formatters';

export default function SupplierQuotations() {
  const [quotations, setQuotations] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [plants, setPlants] = useState([]);
  const [storeLocs, setStoreLocs] = useState([]);
  const [payTerms, setPayTerms] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sourcePRs, setSourcePRs] = useState([]);
  const [sourceType, setSourceType] = useState('manual');
  const [docType, setDocType] = useState('goods');
  const [taxCodes, setTaxCodes] = useState([]);
  const [incoterms, setIncoterms] = useState([]);

  const today = new Date().toISOString().split('T')[0];
  const emptyItem = { material_id:'', description:'', hsn_code:'', quantity:1, uom_id:'', unit_price:0, discount_percent:0, tax_rate:18, delivery_date:'', plant_id:'', storage_location_id:'', remarks:'' };
  const emptyForm = { vendor_id:'', plant_id:'', requisition_id:'', cost_center_id:'', project_id:'', rfq_date:today, response_date:'', validity_date:'', description:'', currency:'INR', payment_term_id:'', delivery_terms:'', notes:'', tax_rate:18, doc_type:'goods', items:[{...emptyItem}] };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadQuotations(); loadLookups(); }, [search, statusFilter]);

  const loadQuotations = async () => { setLoading(true); try { setQuotations((await api.get('/procurement/quotations', { search, status: statusFilter }).catch(()=>null))?.data||[]); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => {
    try {
      const [v,m,u,p,sl,pt,cc,pj,tc,inc] = await Promise.all([
        api.get('/master/business-partners', { type: 'vendor', all: true }).catch(()=>null), api.get('/master/materials', { all: true }).catch(()=>null),
        api.get('/master/uom').catch(()=>null), api.get('/org/plants').catch(()=>null), api.get('/org/storage-locations').catch(()=>null), api.get('/master/payment-terms').catch(()=>null),
        api.get('/org/cost-centers').catch(()=>null), api.get('/projects/projects').catch(()=>null),
        api.get('/master/tax-codes').catch(()=>null), api.get('/master/incoterms').catch(()=>null)
      ]);
      setVendors(v?.data?.rows||v?.data||[]); setMaterials(m?.data||[]);
      setUoms(u?.data||[]); setPlants(p?.data||[]); setStoreLocs(sl?.data||[]); setPayTerms(pt?.data||[]);
      setCostCenters(cc?.data||[]); setProjects(pj?.data||[]);
      setTaxCodes(tc?.data||[]); setIncoterms(inc?.data||[]);
    } catch (e) { console.error('Lookups:', e); }
    try { setSourcePRs((await api.get('/procurement/quotations/source-prs').catch(()=>null))?.data||[]); } catch {}
  };

  const loadDetail = async (id) => { try { setShowDetail((await api.get(`/procurement/quotations/${id}`).catch(()=>null))?.data); } catch (e) { setModalError(e.message); } };
  const s = (k,v) => setForm(p => ({...p, [k]:v}));
  const isGoods = docType === 'goods';
  const getStoresForPlant = (plantId) => storeLocs.filter(sl => !plantId || sl.plant_id === plantId);

  const updateItem = (idx, field, value, extra) => {
    setForm(prev => {
      const items = [...prev.items]; items[idx] = {...items[idx], [field]: value};
      if (extra) Object.assign(items[idx], extra);
      if (field === 'material_id' && value && prev.doc_type === 'goods') {
        const mat = materials.find(m => m.id === value);
        if (mat) { items[idx].description = mat.material_name; items[idx].hsn_code = mat.hsn_code||''; items[idx].uom_id = mat.base_uom_id||''; items[idx].unit_price = parseFloat(mat.standard_price)||0; }
      }
      if (field === 'tax_code_id' && value) { const tc = taxCodes.find(x => String(x.id) === String(value)); if (tc) { items[idx].tax_rate = parseFloat(tc.tax_rate || 0); } }
      return {...prev, items};
    });
  };
  const addItem = () => setForm(prev => ({...prev, items:[...prev.items, {...emptyItem}]}));
  const removeItem = (idx) => setForm(prev => prev.items.length > 1 ? {...prev, items: prev.items.filter((_,i)=>i!==idx)} : prev);

  const copyFromPR = async (prId) => {
    if (!prId) return;
    try {
      const res = await api.get(`/procurement/quotations/source-pr/${prId}`).catch(()=>null);
      const { pr, items } = res.data;
      const dt = pr.doc_type || 'goods';
      setDocType(dt);
      setForm({ ...emptyForm, requisition_id: pr.id, plant_id: pr.plant_id||'', doc_type: dt,
        description: `Quotation for PR ${pr.doc_number}`, rfq_date: today,
        cost_center_id: pr.cost_center_id||'', project_id: pr.project_id||'',
        items: items.map(it => ({
          pr_item_id: it.id, material_id: it.material_id||'', description: it.material_name||it.description||'',
          hsn_code: it.hsn_code||'', quantity: parseFloat(it.quantity)||1, uom_id: it.uom_id||'',
          unit_price: parseFloat(it.standard_price||it.unit_price)||0, discount_percent:0,
          tax_rate: parseFloat(it.gst_rate)||18, delivery_date:'', remarks:'',
          plant_id: it.plant_id||'', storage_location_id: it.storage_location_id||''
        }))
      });
    } catch (e) { setModalError(e.message); }
  };

  const calcLine = (it) => (parseFloat(it.quantity)||0) * (parseFloat(it.unit_price)||0) * (1 - (parseFloat(it.discount_percent)||0)/100);
  const calcTotals = () => {
    let sub = 0, tax = 0;
    form.items.forEach(it => { const l = calcLine(it); sub += l; tax += l * (parseFloat(it.tax_rate)||0) / 100; });
    return { sub, tax, total: sub+tax };
  };
  const totals = calcTotals();

  const handleSave = async (e) => {
    e?.preventDefault(); setSaving(true); setModalError(null);
    try {
      if (!form.vendor_id) throw new Error('Vendor is mandatory');
      if (!form.rfq_date) throw new Error('Quotation date is mandatory');
      if (!form.validity_date) throw new Error('Validity date is mandatory');
      if (!form.description) throw new Error('Description is mandatory');
      if (!form.payment_term_id) throw new Error('Payment terms is mandatory');
      if (!form.delivery_terms) throw new Error('Delivery terms is mandatory');
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i];
        if (!it.description && docType === 'service') throw new Error(`Item ${i+1}: Service description is mandatory`);
        if (!it.material_id && docType === 'goods') throw new Error(`Item ${i+1}: Material is mandatory`);
        if (!it.quantity || parseFloat(it.quantity) <= 0) throw new Error(`Item ${i+1}: Quantity must be > 0`);
        if (!it.unit_price && parseFloat(it.unit_price) !== 0) throw new Error(`Item ${i+1}: Unit price is mandatory`);
        if (parseFloat(it.unit_price) < 0) throw new Error(`Item ${i+1}: Unit price cannot be negative`);
        if (!it.plant_id) throw new Error(`Item ${i+1}: Plant is mandatory`);
        if (!it.hsn_code) throw new Error(`Item ${i+1}: ${docType === 'goods' ? 'HSN' : 'SAC'} code is mandatory`);
        if (!it.storage_location_id && docType === 'goods') throw new Error(`Item ${i+1}: Store is mandatory for goods`);
        if (!it.delivery_date) throw new Error(`Item ${i+1}: Delivery date is mandatory`);
        if (it.delivery_date < today) throw new Error(`Item ${i+1}: Delivery date cannot be in past`);
      }
      await api.post('/procurement/quotations', form);
      setShowForm(false); setForm(emptyForm); setDocType('goods');
      setAlert({type:'success',message:'Supplier quotation created'}); loadQuotations();
    } catch (e) { setModalError(e.message); } finally { setSaving(false); }
  };

  const confirm = async (id) => { try { await api.post(`/procurement/quotations/${id}/confirm`); setAlert({type:'success',message:'Quotation confirmed'}); loadQuotations(); setShowDetail(null); } catch (e) { setModalError(e.message); } };
  const reject = async (id) => { try { await api.post(`/procurement/quotations/${id}/reject`); setAlert({type:'success',message:'Quotation rejected'}); loadQuotations(); setShowDetail(null); } catch (e) { setModalError(e.message); } };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/procurement/bulk-delete', { entity: 'quotations', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadQuotations(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={()=>setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Supplier Quotations</h1><p className="text-sm text-gray-400 mt-1">Request vendor quotes from PRs — auto-compares by PR for best price</p></div>
        <button onClick={() => { setForm({...emptyForm, rfq_date: today}); setDocType('goods'); setSourceType('manual'); setModalError(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Quotation</button>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={[{key:'',label:'All'},{key:'draft',label:'Draft'},{key:'confirmed',label:'Confirmed'},{key:'rejected',label:'Rejected'},{key:'completed',label:'Completed'}]} active={statusFilter} onChange={setStatusFilter}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by quotation #, vendor, PR ref, status..." className="w-80"/>
      </div>

      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={[
          { key:'doc_number', label:'Quotation #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
          { key:'doc_type', label:'Type', render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium ${v==='service'?'bg-violet-100 text-violet-700':'bg-blue-100 text-blue-700'}`}>{(v||'goods').charAt(0).toUpperCase()+(v||'goods').slice(1)}</span> },
          { key:'vendor_name', label:'Vendor', render: v => <span className="font-medium">{v}</span> },
          { key:'pr_number', label:'PR Ref', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
          { key:'rfq_date', label:'Date', render: v => formatDate(v) },
          { key:'total_amount', label:'Total', className:'text-right', render: v => <span className="font-semibold">{formatCurrency(v)}</span> },
          { key:'validity_date', label:'Valid Until', render: v => v ? formatDate(v) : '—' },
          { key:'item_count', label:'Items' },
          { key:'is_best_quote', label:'Comparison', render:(_,r) => {
            if (!r.comparison_count) return <span className="text-xs text-gray-400">Single quote</span>;
            if (r.is_best_quote) return <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded"><Trophy className="w-3 h-3"/> Best ({r.comparison_count} quotes)</span>;
            return <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded"><TrendingDown className="w-3 h-3"/> +{r.savings_pct}% vs best</span>;
          }},
          { key:'status', label:'Status', render: v => <StatusBadge status={v}/> },
          { key:'_actions', label:'', render:(_,r) => <div className="flex gap-1">
            <button onClick={() => loadDetail(r.id)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-3.5 h-3.5 text-gray-500"/></button>
            {r.status === 'draft' && <button onClick={() => confirm(r.id)} className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Confirm</button>}
            {r.status === 'draft' && <button onClick={() => reject(r.id)} className="px-2 py-0.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">Reject</button>}
            {r.status === 'confirmed' && <button onClick={() => { window.location.href = `/procurement/orders?from_quotation=${r.id}`; }} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1"><ShoppingCart className="w-3 h-3"/> PO</button>}
          </div> },
        ]} data={quotations} loading={loading}/>
      </div>

      {/* CREATE MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title="Create Supplier Quotation" size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?'Saving...':'Create Quotation'}</button></>}>
        <div className="space-y-4">
          {/* SOURCE */}
          <div className="p-3 bg-gray-50 rounded-lg border">
            <p className="text-xs font-semibold text-gray-500 mb-2">CREATE FROM SOURCE</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="qsrc" checked={sourceType==='manual'} onChange={() => { setSourceType('manual'); setForm({...emptyForm, rfq_date: today}); setDocType('goods'); }}/> Manual entry</label>
              <div>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="qsrc" checked={sourceType==='pr'} onChange={() => setSourceType('pr')}/> Copy from PR</label>
                {sourceType === 'pr' && <select onChange={e => copyFromPR(e.target.value)} className="select-field text-xs mt-1"><option value="">Select PR...</option>
                  {sourcePRs.map(pr => <option key={pr.id} value={pr.id}>{pr.doc_number} — [{pr.doc_type||'goods'}] {pr.description||'No desc'} ({pr.item_count} items)</option>)}</select>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <FormField label="Document Type *"><select value={docType} onChange={e=>{setDocType(e.target.value); setForm(prev=>({...prev, doc_type:e.target.value, items:[{...emptyItem}]}));}} className="select-field"><option value="goods">Goods</option><option value="service">Service</option></select></FormField>
            <FormField label="Vendor *"><SearchableSelect value={form.vendor_id} onChange={val=>s('vendor_id',val)} options={vendors.map(v=>({value:v.id,label:`${v.bp_number} — ${v.display_name}`}))} placeholder="Select vendor..." className="select-field" /></FormField>
            <FormField label="Payment Terms *"><select value={form.payment_term_id||''} onChange={e=>s('payment_term_id',e.target.value)} className="select-field" ><option value="">Select...</option>{payTerms.map(pt=><option key={pt.id} value={pt.id}>{pt.term_code} — {pt.term_name}</option>)}</select></FormField>
            <FormField label="Currency"><input value={form.currency} onChange={e=>s('currency',e.target.value)} className="input-field"/></FormField>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Quotation Date *"><input type="date" value={form.rfq_date} onChange={e=>s('rfq_date',e.target.value)} className="input-field"/></FormField>
            <FormField label="Response By"><input type="date" value={form.response_date||''} onChange={e=>s('response_date',e.target.value)} className="input-field" min={today}/></FormField>
            <FormField label="Valid Until *"><input type="date" value={form.validity_date||''} onChange={e=>s('validity_date',e.target.value)} className="input-field" min={today}/></FormField>
            <FormField label="Notes"><input value={form.notes||''} onChange={e=>s('notes',e.target.value)} className="input-field" placeholder="Internal remarks"/></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Delivery Terms *"><select value={form.delivery_terms||''} onChange={e=>s('delivery_terms',e.target.value)} className="select-field"><option value="">Select Incoterm...</option>{(incoterms.length?incoterms:INCOTERMS).map(t=><option key={t.code||t.id} value={t.code}>{t.code} — {t.name}</option>)}</select></FormField>
            <FormField label="Description *"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field"/></FormField>
          </div>
          {/* Cost Center / Project — mutual exclusion */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label={form.project_id ? 'Cost Center (disabled)' : 'Cost Center'}>
              <select value={form.cost_center_id||''} onChange={e=>setForm(p=>({...p,cost_center_id:e.target.value,project_id:''}))} className="select-field" disabled={!!form.project_id}>
                <option value="">Select...</option>{(costCenters||[]).map(cc=><option key={cc.id} value={cc.id}>{cc.cc_code} — {cc.cc_name}</option>)}</select>
            </FormField>
            <FormField label={form.cost_center_id ? 'Project (disabled)' : 'Project'}>
              <select value={form.project_id||''} onChange={e=>setForm(p=>({...p,project_id:e.target.value,cost_center_id:''}))} className="select-field" disabled={!!form.cost_center_id}>
                <option value="">Select...</option>{(projects||[]).map(p=><option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}</select>
            </FormField>
          </div>

          {/* LINE ITEMS */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">{isGoods ? 'Material Items' : 'Service Items'}</h3>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add Item</button>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs" style={{minWidth:"1100px"}}>
                <thead><tr className="bg-gray-50 border-b text-gray-500">
                  <th className="px-2 py-2 text-left w-6">#</th>
                  <th className="px-2 py-2 text-left">{isGoods ? 'Material' : 'Service'}</th>
                  <th className="px-2 py-2 text-left w-16">{isGoods ? 'HSN *' : 'SAC *'}</th>
                  <th className="px-2 py-2 text-left w-28">Plant *</th>
                  {isGoods && <th className="px-2 py-2 text-left w-28">Store *</th>}
                  <th className="px-2 py-2 text-right w-14">Qty *</th>
                  {isGoods && <th className="px-2 py-2 text-left w-16">UoM</th>}
                  <th className="px-2 py-2 text-right w-20">Price *</th>
                  <th className="px-2 py-2 text-right w-14">Disc%</th>
                  <th className="px-2 py-2 text-left w-28">Tax Code *</th>
                  <th className="px-2 py-2 text-left w-24">Del.Date *</th>
                  <th className="px-2 py-2 text-right w-20">Total</th>
                  <th className="w-6"></th>
                </tr></thead>
                <tbody>{form.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-400">{idx+1}</td>
                    <td className="px-2 py-1.5">{isGoods ? (<div><SearchableSelect value={item.material_id} onChange={val=>updateItem(idx,'material_id',val)} options={materials.map(m=>({value:m.id,label:`${m.material_code} — ${m.material_name}`}))} placeholder="Select..." className="w-full px-1 py-1 border border-gray-200 rounded text-xs" /><span className="text-gray-400 text-xs block">{item.description}</span></div>) : (<input value={item.description} onChange={e=>updateItem(idx,'description',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs" placeholder="Service description *"/>)}</td>
                    <td className="px-2 py-1.5"><input value={item.hsn_code||''} onChange={e=>updateItem(idx,'hsn_code',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs" maxLength={8}/></td>
                    <td className="px-2 py-1.5"><select value={item.plant_id||''} onChange={e=>updateItem(idx,'plant_id',e.target.value,{storage_location_id:''})} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">Select...</option>{plants.map(p=><option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}</select></td>
                    {isGoods && <td className="px-2 py-1.5"><select value={item.storage_location_id||''} onChange={e=>updateItem(idx,'storage_location_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">Select...</option>{getStoresForPlant(item.plant_id).map(sl=><option key={sl.id} value={sl.id}>{sl.sloc_code} — {sl.sloc_name}</option>)}</select></td>}
                    <td className="px-2 py-1.5"><input type="number" value={item.quantity} onChange={e=>updateItem(idx,'quantity',parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" min="1"/></td>
                    {isGoods && <td className="px-2 py-1.5"><select value={item.uom_id||''} onChange={e=>updateItem(idx,'uom_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">-</option>{uoms.map(u=><option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}</select></td>}
                    <td className="px-2 py-1.5"><input type="number" value={item.unit_price} onChange={e=>updateItem(idx,'unit_price',parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" step="0.01" min="0"/></td>
                    <td className="px-2 py-1.5"><input type="number" value={item.discount_percent||0} onChange={e=>updateItem(idx,'discount_percent',parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right" min="0" max="100"/></td>
                    <td className="px-2 py-1.5"><select value={item.tax_code_id||''} onChange={e=>updateItem(idx,'tax_code_id',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs"><option value="">-</option>{taxCodes.map(tc=><option key={tc.id} value={tc.id}>{tc.tax_code} — {tc.tax_name} ({tc.tax_rate}%)</option>)}</select></td>
                    <td className="px-2 py-1.5"><input type="date" value={item.delivery_date||''} onChange={e=>updateItem(idx,'delivery_date',e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs" min={today}/></td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(calcLine(item))}</td>
                    <td className="px-2 py-1.5">{form.items.length > 1 && <button type="button" onClick={()=>removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr className="bg-blue-50 font-semibold">
                  <td colSpan={isGoods ? 11 : 8} className="px-3 py-2 text-right text-sm">Subtotal: {formatCurrency(totals.sub)} + Tax: {formatCurrency(totals.tax)} =</td>
                  <td className="px-2 py-2 text-right text-base">{formatCurrency(totals.total)}</td>
                  <td></td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={()=>setShowDetail(null)} title={showDetail ? `Quotation — ${showDetail.doc_number}` : ''} size="xl"
        footer={showDetail?.status === 'draft' ? <><button onClick={()=>reject(showDetail.id)} className="btn-secondary text-red-600">Reject</button><DownloadButton data={quotations} filename="SupplierQuotations" /><button onClick={()=>confirm(showDetail.id)} className="btn-primary">Confirm</button></> : null}>
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Vendor</p><p className="font-medium">{showDetail.vendor_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">PR</p><p className="font-mono text-xs">{showDetail.pr_number||'—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-lg">{formatCurrency(showDetail.total_amount)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status}/></div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Date</p><p>{formatDate(showDetail.rfq_date)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Valid Until</p><p>{formatDate(showDetail.validity_date)||'—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Payment Terms</p><p>{showDetail.payment_term_name||showDetail.payment_terms||'—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Delivery Terms</p><p>{showDetail.delivery_terms||'—'}</p></div>
          </div>
          {showDetail.items?.length > 0 && <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b"><th className="text-left py-1">{(showDetail.doc_type||'goods')==='goods'?'Material':'Service'}</th><th>{(showDetail.doc_type||'goods')==='goods'?'HSN':'SAC'}</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Disc%</th><th className="text-right">GST%</th><th className="text-right">Amount</th><th>Delivery</th></tr></thead>
            <tbody>{showDetail.items.map((it,i) => <tr key={i} className="border-b border-gray-100">
              <td className="py-1.5">{it.material_code ? <span className="font-mono text-blue-600">{it.material_code}</span> : ''} {it.description||it.material_name}</td>
              <td className="text-center">{it.hsn_code||it.mat_hsn||'—'}</td>
              <td className="text-right">{it.quantity}</td><td className="text-right">{formatCurrency(it.unit_price)}</td>
              <td className="text-right">{it.discount_percent||0}%</td><td className="text-right">{it.tax_rate}%</td>
              <td className="text-right font-medium">{formatCurrency(it.total_amount)}</td>
              <td>{it.delivery_date ? formatDate(it.delivery_date) : '—'}</td>
            </tr>)}</tbody></table>}
        </div>}
      </Modal>
    </div>
  );
}
