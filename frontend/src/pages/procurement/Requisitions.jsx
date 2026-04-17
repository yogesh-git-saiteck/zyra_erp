import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Edit2, CheckCircle, ArrowRightCircle, Eye, Trash2, Printer } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert ,BulkActionBar, DownloadButton, SearchableSelect } from '../../components/common/index';
import DocumentTrace from '../../components/common/DocumentTrace';
import ApprovalPanel from '../../components/common/ApprovalPanel';
import PrintFormatModal from '../../components/common/PrintFormatModal';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';

export default function Requisitions() {
  const { user } = useAuth();
  const [reqs, setReqs] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [showConvert, setShowConvert] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [services, setServices] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [projects, setProjects] = useState([]);
  const [plants, setPlants] = useState([]);
  const [storeLocs, setStoreLocs] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const emptyItem = { material_id:'', description:'', hsn_code:'', quantity:1, uom_id:'', estimated_price:0, plant_id:'', storage_location_id:'' };
  const emptyForm = { doc_type:'goods', required_date:'', description:'', priority:'medium', cost_center_id:'', project_id:'', items:[{...emptyItem}] };
  const [form, setForm] = useState(emptyForm);
  const [convertForm, setConvertForm] = useState({ vendor_id:'', payment_term_id:'' });

  const location = useLocation();
  useEffect(() => { loadReqs(); loadLookups(); }, [statusFilter, search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) loadDetail(openId);
  }, [location.search]);

  const loadReqs = async () => {
    try { setReqs((await api.get('/procurement/requisitions', { status: statusFilter, search }).catch(()=>null))?.data || []); }
    catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [m,u,v,pt,cc,p,sl,proj,gl] = await Promise.all([
        api.get('/master/materials', { all: true }).catch(()=>null), api.get('/master/uom').catch(()=>null),
        api.get('/master/business-partners', { type:'vendor', all: true }).catch(()=>null), api.get('/master/payment-terms').catch(()=>null),
        api.get('/org/cost-centers').catch(()=>null), api.get('/org/plants').catch(()=>null), api.get('/org/storage-locations').catch(()=>null),
        api.get('/projects/projects').catch(()=>null), api.get('/master/gl-accounts').catch(()=>null)
      ]);
      setMaterials(m?.data||[]); setUoms(u?.data||[]); setVendors(v?.data?.rows||v?.data||[]);
      api.get('/master/services').then(r => setServices(r?.data || [])).catch(() => {});
      setPaymentTerms(pt?.data||[]); setCostCenters(cc?.data||[]);
      setPlants(p?.data||[]); setStoreLocs(sl?.data||[]); setProjects(proj?.data||[]);
      setGlAccounts((gl?.data||[]).filter(g=>g.account_type==='expense'));
    } catch (e) { console.error('Lookups:', e); }
  };

  const loadDetail = async (id) => {
    try { setShowDetail((await api.get(`/procurement/requisitions/${id}`).catch(()=>null))?.data); }
    catch (err) { setModalError(err.message); }
  };

  const s = (k,v) => setForm(p => ({...p, [k]:v}));

  const updateItem = (idx, field, value, extraFields) => {
    setForm(prev => {
      const items = [...prev.items]; 
      items[idx] = {...items[idx], [field]: value};
      // Apply extra fields if provided (e.g. clearing storage when plant changes)
      if (extraFields) Object.assign(items[idx], extraFields);
      // Auto-fill from material master (goods only)
      if (field === 'material_id' && value && prev.doc_type === 'goods') {
        const mat = materials.find(m => m.id === value);
        if (mat) {
          items[idx].description = mat.material_name;
          items[idx].estimated_price = parseFloat(mat.standard_price) || 0;
          items[idx].uom_id = mat.base_uom_id || '';
          items[idx].hsn_code = mat.hsn_code || '';
        }
      }
      if (field === 'service_id' && value) {
        const svc = services.find(s => s.id === value);
        if (svc) {
          items[idx].description = svc.service_name;
          items[idx].estimated_price = parseFloat(svc.standard_rate) || 0;
          items[idx].uom_id = svc.uom_id || '';
          items[idx].hsn_code = svc.sac_code || '';
        }
      }
      return {...prev, items};
    });
  };

  const addItem = () => setForm(prev => ({...prev, items:[...prev.items, {...emptyItem}]}));
  const removeItem = (idx) => setForm(prev => { if (prev.items.length > 1) return {...prev, items: prev.items.filter((_,i)=>i!==idx)}; return prev; });

  // Line total = qty * price
  const lineTotal = (it) => (parseFloat(it.quantity)||0) * (parseFloat(it.estimated_price)||0);
  // Grand total
  const grandTotal = form.items.reduce((sum, it) => sum + lineTotal(it), 0);

  // Storage locations filtered by selected plant
  const getStoresForPlant = (plantId) => storeLocs.filter(sl => !plantId || sl.plant_id === plantId);

  const openCreate = () => {
    setEditId(null); setForm(emptyForm); setModalError(null); setShowCreate(true);
  };
  const openEdit = async (row) => {
    setEditId(row.id);
    let items = [];
    try {
      const detail = await api.get(`/procurement/requisitions/${row.id}`).catch(()=>null);
      const rawItems = detail?.data?.items || [];
      items = rawItems.map(it => ({
        material_id: it.material_id||'', description: it.material_name||it.description||'',
        hsn_code: it.hsn_code||'', quantity: parseFloat(it.quantity)||1, uom_id: it.uom_id||'',
        estimated_price: parseFloat(it.estimated_price)||0, plant_id: it.plant_id||'',
        storage_location_id: it.storage_location_id||'', gl_account_id: it.gl_account_id||'',
        required_date: it.required_date?.split('T')[0]||''
      }));
    } catch {}
    setForm({ doc_type: row.doc_type||'goods', required_date: row.required_date?.split("T")[0]||"", description: row.description||"", priority: row.priority||"medium", cost_center_id: row.cost_center_id||'', project_id: row.project_id||'', items: items.length ? items : [{...emptyItem}] });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    setSaving(true); setModalError(null);
    try {
      if (!form.required_date) throw new Error('Required date is mandatory');
      if (!form.description) throw new Error('Description/purpose is mandatory');
      if (!form.cost_center_id && !form.project_id) throw new Error('Either Cost Center or Project is mandatory');
      if (!form.items.length) throw new Error('At least one item required');
      for (let i = 0; i < form.items.length; i++) {
        const it = form.items[i];
        if (!it.description && form.doc_type === 'service') throw new Error(`Item ${i+1}: Service description is mandatory`);
        if (!it.material_id && form.doc_type === 'goods') throw new Error(`Item ${i+1}: Material is mandatory for goods`);
        if (!it.quantity || parseFloat(it.quantity) <= 0) throw new Error(`Item ${i+1}: Quantity must be > 0`);
        if (!it.estimated_price || parseFloat(it.estimated_price) <= 0) throw new Error(`Item ${i+1}: Estimated price is mandatory`);
        if (!it.plant_id) throw new Error(`Item ${i+1}: Plant is mandatory`);
        if (!it.hsn_code) throw new Error(`Item ${i+1}: ${form.doc_type === 'goods' ? 'HSN' : 'SAC'} code is mandatory`);
        if (!it.storage_location_id && form.doc_type === 'goods') throw new Error(`Item ${i+1}: Storage location is mandatory for goods`);
      }
      if (editId) { await api.put(`/procurement/requisitions/${editId}`, form); }
      else { await api.post('/procurement/requisitions', form); }
      setShowCreate(false); setForm(emptyForm); setEditId(null);
      setAlert({ type:'success', message: editId ? 'Requisition updated' : 'Purchase requisition created' }); loadReqs();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleApprove = async (id) => {
    try { await api.post(`/procurement/requisitions/${id}/approve`); setAlert({type:'success',message:'Approved'}); setShowDetail(null); loadReqs(); }
    catch (err) { setModalError(err.message); }
  };
  const handleConvert = async () => {
    if (!convertForm.vendor_id) { setModalError('Select a vendor'); return; }
    const selected = (convertForm.selectedItems||[]).filter(s => s.selected && s.remaining > 0);
    if (!selected.length) { setModalError('Select at least one item'); return; }
    setSaving(true); setModalError(null);
    try {
      await api.post(`/procurement/requisitions/${showConvert.id}/convert`, {
        vendor_id: convertForm.vendor_id,
        payment_term_id: convertForm.payment_term_id,
        selected_items: selected.map(s => ({ id: s.id, po_qty: s.po_qty, unit_price: s.unit_price })),
      });
      setShowConvert(null); setAlert({type:'success',message:'Converted to Purchase Order!'}); loadReqs();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const openConvert = async (pr) => {
    setShowDetail(null);
    try {
      const detail = await api.get(`/procurement/requisitions/${pr.id}/detail`).catch(()=>null);
      const items = (detail?.data?.items || []).map(it => ({
        id: it.id, line_number: it.line_number,
        material_code: it.material_code, material_name: it.material_name || it.description,
        description: it.description, pr_qty: parseFloat(it.quantity),
        converted_qty: parseFloat(it.converted_qty || 0),
        remaining: parseFloat(it.quantity) - parseFloat(it.converted_qty || 0),
        po_qty: parseFloat(it.quantity) - parseFloat(it.converted_qty || 0),
        unit_price: parseFloat(it.estimated_price || 0),
        selected: (parseFloat(it.quantity) - parseFloat(it.converted_qty || 0)) > 0,
      }));
      setConvertForm({ vendor_id: '', payment_term_id: '', selectedItems: items });
      setShowConvert(pr); setModalError(null);
    } catch (err) { setModalError(err.message); }
  };

  const columns = [
    { key:'doc_number', label:'PR #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key:'doc_type', label:'Type', render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium ${v==='service'?'bg-violet-100 text-violet-700':'bg-blue-100 text-blue-700'}`}>{(v||'goods').charAt(0).toUpperCase()+(v||'goods').slice(1)}</span> },
    { key:'created_at', label:'PR Date', render: v => formatDate(v) },
    { key:'requester_name', label:'Requester', render: v => <span className="font-medium">{v}</span> },
    { key:'id', label:'Cost Center / Project', render:(_,r) => r.cc_code ? <span className="text-xs">{r.cc_code} — {r.cc_name}</span> : r.project_code ? <span className="text-xs">{r.project_code} — {r.project_name}</span> : '—' },
    { key:'required_date', label:'Required By', render: v => formatDate(v) || '—' },
    { key:'priority', label:'Priority', render: v => <span className={`badge ${v==='high'?'badge-danger':v==='low'?'badge-neutral':'badge-warning'} capitalize`}>{v}</span> },
    { key:'total_amount', label:'Amount', className:'text-right', render: v => <span className="font-semibold">{formatCurrency(v)}</span> },
    { key:'status', label:'Status', render: v => <StatusBadge status={v}/> },
    { key:'_actions', label:'', render:(_,r) => <button onClick={e => { e.stopPropagation(); loadDetail(r.id); }} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-3.5 h-3.5 text-gray-500"/></button> },
  ];

  const isGoods = form.doc_type === 'goods';
  const handleBulkDelete = async () => {
    try { const r = await api.post('/procurement/bulk-delete', { entity: 'requisitions', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadReqs(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Purchase Requisitions</h1><p className="text-sm text-gray-400 mt-1">Request goods or services for procurement</p></div>
        <><DownloadButton data={reqs} filename="Requisitions" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Requisition</button></>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={[{key:'',label:'All'},{key:'draft',label:'Draft'},{key:'approved',label:'Approved'}]} active={statusFilter} onChange={setStatusFilter}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={reqs} loading={loading} onRowClick={r => loadDetail(r.id)}/></div>

      {/* CREATE / EDIT */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} 
        title={editId ? "Edit Requisition" : "Create Purchase Requisition"} size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving?'Saving...':editId?'Update':'Create PR'}</button></>}>
        <div className="space-y-4">
          {/* HEADER */}
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Document Type *">
              <select value={form.doc_type} onChange={e => { s('doc_type', e.target.value); setForm(f => ({...f, doc_type: e.target.value, items: [{...emptyItem}]})); }} className="select-field">
                <option value="goods">Goods</option><option value="service">Service</option>
              </select>
            </FormField>
            <FormField label="PR Date"><input type="date" value={today} className="input-field bg-gray-100" disabled/></FormField>
            <FormField label="Required Date *"><input type="date" value={form.required_date} onChange={e => s('required_date', e.target.value)} className="input-field" min={today}/></FormField>
            <FormField label="Priority *">
              <select value={form.priority} onChange={e => s('priority', e.target.value)} className="select-field">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label={form.project_id ? 'Cost Center (disabled — project selected)' : 'Cost Center *'}>
              <select value={form.cost_center_id} onChange={e => setForm(prev => ({...prev, cost_center_id: e.target.value, project_id: ''}))} className="select-field" disabled={!!form.project_id}>
                <option value="">Select cost center...</option>
                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.cc_code} — {cc.cc_name}</option>)}
              </select>
            </FormField>
            <FormField label={form.cost_center_id ? 'Project (disabled — cost center selected)' : 'Project *'}>
              <select value={form.project_id||''} onChange={e => setForm(prev => ({...prev, project_id: e.target.value, cost_center_id: ''}))} className="select-field" disabled={!!form.cost_center_id}>
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code || p.project_name} — {p.project_name}</option>)}
              </select>
            </FormField>
            <FormField label="Description / Purpose *"><input value={form.description} onChange={e => s('description', e.target.value)} className="input-field" placeholder="What is being requested and why"/></FormField>
          </div>
          {!form.cost_center_id && !form.project_id && <p className="text-xs text-amber-600">* Select either a Cost Center or a Project</p>}

          {/* LINE ITEMS */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">
                {isGoods ? 'Material Items' : 'Service Items'}
              </h3>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add Item</button>
            </div>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg"><table className="w-full text-xs" style={{minWidth:"1200px"}}>
                <thead><tr className="bg-gray-50 border-b text-gray-500">
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left">{isGoods ? 'Material' : 'Service Description'}</th>
                  <th className="px-2 py-2 text-left w-16">{isGoods ? "HSN *" : "SAC *"}</th>
                  <th className="px-2 py-2 text-left w-28">Plant *</th>
                  {isGoods && <th className="px-2 py-2 text-left w-24">Store *</th>}
                  <th className="px-2 py-2 text-right w-14">Qty *</th>
                  {isGoods && <th className="px-2 py-2 text-left w-16">UoM</th>}
                  <th className="px-2 py-2 text-right w-20">Price *</th>
                  <th className="px-2 py-2 text-left w-36">GL Account</th>
                  <th className="px-2 py-2 text-right w-20">Total</th>
                  <th className="w-6"></th>
                </tr></thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 text-gray-400">{idx+1}</td>
                      <td className="px-2 py-1.5">
                        {isGoods ? (
                          <div>
                            <SearchableSelect value={item.material_id} onChange={val=>updateItem(idx,'material_id',val)} options={materials.map(m=>({value:m.id,label:`${m.material_code} — ${m.material_name}`}))} placeholder="Select material..." className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                            <span className="text-gray-400 text-xs mt-0.5 block">{item.description}</span>
                          </div>
                        ) : (
                          <div>
                            <select value={item.service_id||''} onChange={e => updateItem(idx, 'service_id', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none mb-0.5">
                              <option value="">— Select service or type below —</option>
                              {services.map(sv => <option key={sv.id} value={sv.id}>{sv.service_code} — {sv.service_name} ({sv.sac_code})</option>)}
                            </select>
                            <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none" placeholder="Service description *"/>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5"><input value={item.hsn_code||''} onChange={e => updateItem(idx, 'hsn_code', e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none" maxLength={8}/></td>
                      <td className="px-2 py-1.5">
                        <select value={item.plant_id||''} onChange={e => updateItem(idx, 'plant_id', e.target.value, { storage_location_id: '' })} className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none" required>
                          <option value="">Select...</option>
                          {plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}
                        </select>
                      </td>
                      {isGoods && <td className="px-2 py-1.5">
                        <select value={item.storage_location_id||''} onChange={e => updateItem(idx, 'storage_location_id', e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none" required>
                          <option value="">Select...</option>
                          {getStoresForPlant(item.plant_id).map(sl => <option key={sl.id} value={sl.id}>{sl.sloc_code} — {sl.sloc_name}</option>)}
                        </select>
                      </td>}
                      <td className="px-2 py-1.5"><input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right bg-white focus:outline-none"/></td>
                      {isGoods && <td className="px-2 py-1.5"><select value={item.uom_id||''} onChange={e => updateItem(idx, 'uom_id', e.target.value)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none"><option value="">-</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}</select></td>}
                      <td className="px-2 py-1.5"><input type="number" step="0.01" min="0.01" value={item.estimated_price} onChange={e => updateItem(idx, 'estimated_price', parseFloat(e.target.value)||0)} className="w-full px-1 py-1 border border-gray-200 rounded text-xs text-right bg-white focus:outline-none"/></td>
                      <td className="px-2 py-1.5"><SearchableSelect value={item.gl_account_id||''} onChange={val=>updateItem(idx,'gl_account_id',val)} options={glAccounts.map(g=>({value:g.id,label:`${g.account_code} — ${g.account_name}`}))} placeholder="Select GL..." className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white" /></td>
                      <td className="px-2 py-1.5 text-right font-medium text-sm">{formatCurrency(lineTotal(item))}</td>
                      <td className="px-2 py-1.5"><button type="button" onClick={() => removeItem(idx)} className="text-gray-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5"/></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-semibold">
                    <td colSpan={isGoods ? 7 : 4} className="px-3 py-2 text-right text-sm">Grand Total:</td>
                    <td className="px-2 py-2 text-right text-base">{formatCurrency(grandTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={`Requisition — ${showDetail?.doc_number}`} size="xl"
        footer={<>
          {['draft','rejected'].includes(showDetail?.status) && <button onClick={() => { openEdit(showDetail); setShowDetail(null); }} className="btn-secondary flex items-center gap-2"><Edit2 className="w-4 h-4"/> Edit</button>}
          {showDetail?.status === 'draft' && <button onClick={() => handleApprove(showDetail.id)} className="btn-primary flex items-center gap-2"><CheckCircle className="w-4 h-4"/> Approve</button>}
          {showDetail?.status === 'submitted' && <span className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg font-medium">⏳ Awaiting Approval</span>}
          <button onClick={() => setPrintTarget({entityType:'purchase_requisition',entityId:showDetail.id,docNumber:showDetail.doc_number})} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4"/> Print</button>
          <button onClick={() => setShowDetail(null)} className="btn-secondary">Close</button>
        </>}>
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Type</p><p className="font-medium capitalize">{showDetail.doc_type||'goods'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">PR Date</p><p>{formatDate(showDetail.created_at)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Required By</p><p>{formatDate(showDetail.required_date)||'—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Priority</p><p className="capitalize">{showDetail.priority}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status}/></div>
          </div>
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Requester</p><p className="font-medium">{showDetail.requester_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Cost Center</p><p>{showDetail.cc_code ? `${showDetail.cc_code} — ${showDetail.cc_name}` : '—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Project</p><p>{showDetail.project_name || '—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Description</p><p>{showDetail.description||'—'}</p></div>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {(() => { const isDetailGoods = (showDetail.doc_type||'goods') === 'goods'; return (
            <table className="w-full text-sm"><thead><tr className="bg-gray-50 border-b">
              <th className="px-3 py-2 text-left text-xs text-gray-500">#</th>
              <th className="px-3 py-2 text-left text-xs text-gray-500">{isDetailGoods ? 'Material' : 'Service'}</th>
              <th className="px-3 py-2 text-left text-xs text-gray-500">{isDetailGoods ? 'HSN' : 'SAC'}</th>
              <th className="px-3 py-2 text-left text-xs text-gray-500">Plant</th>
              {isDetailGoods && <th className="px-3 py-2 text-left text-xs text-gray-500">Store</th>}
              <th className="px-3 py-2 text-right text-xs text-gray-500">Qty</th>
              <th className="px-3 py-2 text-right text-xs text-gray-500">Converted</th>
              <th className="px-3 py-2 text-right text-xs text-gray-500">Price</th>
              <th className="px-3 py-2 text-right text-xs text-gray-500">Total</th>
              <th className="px-3 py-2 text-center text-xs text-gray-500">Status</th>
            </tr></thead>
            <tbody>{(showDetail.items||[]).map((it,i) => {
              const conv = parseFloat(it.converted_qty||0);
              const qty = parseFloat(it.quantity);
              const remaining = qty - conv;
              return (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-2 text-gray-400">{it.line_number}</td>
                <td className="px-3 py-2">{it.material_code ? <span className="font-mono text-xs text-blue-600">{it.material_code}</span> : ''} {it.material_name||it.description}</td>
                <td className="px-3 py-2 text-xs">{it.hsn_code||'—'}</td>
                <td className="px-3 py-2 text-xs">{it.plant_code ? `${it.plant_code}` : '—'}</td>
                {isDetailGoods && <td className="px-3 py-2 text-xs">{it.sloc_code || '—'}</td>}
                <td className="px-3 py-2 text-right">{it.quantity} {it.uom_code||''}</td>
                <td className="px-3 py-2 text-right">{conv > 0 ? <span className="text-amber-600">{conv}</span> : '0'}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(it.estimated_price)}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(qty*parseFloat(it.estimated_price||0))}</td>
                <td className="px-3 py-2 text-center">{remaining <= 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">Converted</span> : conv > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">Partial</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Open</span>}</td>
              </tr>);
            })}</tbody>
            <tfoot><tr className="bg-blue-50 font-semibold"><td colSpan={isDetailGoods ? 8 : 7} className="px-3 py-2 text-right">Grand Total:</td><td className="px-3 py-2 text-right text-base">{formatCurrency(showDetail.total_amount)}</td><td></td></tr></tfoot>
            </table>
            ); })()}
          </div>
          {showDetail?.status === 'submitted' && (
            <ApprovalPanel entityType="purchase_requisition" entityId={showDetail.id}
              currentUserId={user?.id} onDecision={() => { loadDetail(showDetail.id); loadReqs(); }} />
          )}
          <DocumentTrace entityType="requisition" entityId={showDetail?.id}/>
        </div>}
      </Modal>

      {/* CONVERT TO PO */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showConvert} onClose={() => setShowConvert(null)} title="Convert to Purchase Order" size="xl"
        footer={<><button onClick={() => setShowConvert(null)} className="btn-secondary">Cancel</button><button onClick={handleConvert} disabled={saving || !convertForm.selectedItems?.some(s => s.selected)} className="btn-primary">{saving?'Converting...':'Create PO'}</button></>}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Select items from <span className="font-mono font-medium text-blue-600">{showConvert?.doc_number}</span> to include in the PO</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Vendor *"><select value={convertForm.vendor_id} onChange={e => setConvertForm({...convertForm, vendor_id: e.target.value})} className="select-field"><option value="">Select vendor...</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.bp_number} - {v.display_name}</option>)}</select></FormField>
            <FormField label="Payment Terms"><select value={convertForm.payment_term_id} onChange={e => setConvertForm({...convertForm, payment_term_id: e.target.value})} className="select-field"><option value="">Select...</option>{paymentTerms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}</select></FormField>
          </div>
          {/* Line items with checkboxes */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="px-2 py-2 w-8"><input type="checkbox" checked={convertForm.selectedItems?.every(s => s.remaining > 0 ? s.selected : true)} onChange={e => { const chk = e.target.checked; setConvertForm(f => ({...f, selectedItems: f.selectedItems.map(s => s.remaining > 0 ? {...s, selected: chk} : s)})); }} className="rounded border-gray-300 text-blue-600" /></th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">#</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Material / Service</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">PR Qty</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Converted</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Remaining</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">PO Qty</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Unit Price</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">Total</th>
              </tr></thead>
              <tbody>{(convertForm.selectedItems||[]).map((si, idx) => {
                const disabled = si.remaining <= 0;
                return (
                  <tr key={idx} className={`border-b border-gray-100 dark:border-gray-800 ${disabled ? 'opacity-40 bg-gray-50 dark:bg-gray-800/50' : si.selected ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                    <td className="px-2 py-2"><input type="checkbox" checked={si.selected && !disabled} disabled={disabled} onChange={e => { const items = [...convertForm.selectedItems]; items[idx] = {...items[idx], selected: e.target.checked}; setConvertForm({...convertForm, selectedItems: items}); }} className="rounded border-gray-300 text-blue-600" /></td>
                    <td className="px-2 py-2 text-gray-400">{si.line_number}</td>
                    <td className="px-2 py-2">{si.material_code ? <span className="font-mono text-xs text-blue-600">{si.material_code} </span> : ''}{si.material_name || si.description}</td>
                    <td className="px-2 py-2 text-right">{si.pr_qty}</td>
                    <td className="px-2 py-2 text-right">{parseFloat(si.converted_qty||0) > 0 ? <span className="text-amber-600">{si.converted_qty}</span> : '0'}</td>
                    <td className="px-2 py-2 text-right font-medium">{disabled ? <span className="text-rose-500">0</span> : si.remaining}</td>
                    <td className="px-2 py-2 text-right">{disabled ? '—' : <input type="number" min="0.001" max={si.remaining} step="0.001" value={si.po_qty} onChange={e => { const items = [...convertForm.selectedItems]; const val = parseFloat(e.target.value)||0; items[idx] = {...items[idx], po_qty: Math.min(val, si.remaining)}; setConvertForm({...convertForm, selectedItems: items}); }} className="w-20 px-1 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-xs text-right bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-400" disabled={!si.selected} />}</td>
                    <td className="px-2 py-2 text-right">{disabled ? '—' : <input type="number" min="0" step="0.01" value={si.unit_price} onChange={e => { const items = [...convertForm.selectedItems]; items[idx] = {...items[idx], unit_price: parseFloat(e.target.value)||0}; setConvertForm({...convertForm, selectedItems: items}); }} className="w-20 px-1 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-xs text-right bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-400" disabled={!si.selected} />}</td>
                    <td className="px-2 py-2 text-right font-medium">{disabled ? '—' : formatCurrency((si.po_qty||0) * (si.unit_price||0))}</td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr className="bg-blue-50 dark:bg-blue-900/20 font-semibold">
                <td colSpan={8} className="px-2 py-2 text-right">PO Total:</td>
                <td className="px-2 py-2 text-right text-base">{formatCurrency((convertForm.selectedItems||[]).filter(s => s.selected && s.remaining > 0).reduce((sum, s) => sum + (s.po_qty||0)*(s.unit_price||0), 0))}</td>
              </tr></tfoot>
            </table>
          </div>
          {(convertForm.selectedItems||[]).some(s => s.remaining <= 0) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Items with 0 remaining quantity have already been fully converted to POs and are disabled.</p>
          )}
        </div>
      </Modal>
      {printTarget && <PrintFormatModal {...printTarget} onClose={() => setPrintTarget(null)} />}
    </div>
  );
}
