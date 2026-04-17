import { useState, useEffect} from 'react';
import { Plus, Warehouse, Eye, Trash2, Package, Edit2 } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert ,BulkActionBar, DownloadButton } from '../components/common/index';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';
import { ExportButton, BulkImportExport } from '../components/common/SharedFeatures';

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ plants: [{}] });
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [matTypes, setMatTypes] = useState([]);
  const [matGroups, setMatGroups] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [plants, setPlants] = useState([]);

  useEffect(() => { loadMaterials(); loadLookups(); }, [search]);

  const loadMaterials = async () => {
    try { const res = await api.get('/master/materials', { search, all: true }).catch(()=>null); setMaterials(res?.data || []); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [t, g, u, p] = await Promise.all([
        api.get('/master/material-types').catch(()=>null), api.get('/master/material-groups').catch(()=>null),
        api.get('/master/uom').catch(()=>null), api.get('/master/plants').catch(()=>null)
      ]);
      setMatTypes(t?.data || []); setMatGroups(g?.data || []); setUoms(u?.data || []); setPlants(p?.data || []);
    } catch {}
  };
  const loadDetail = async (id) => {
    try { const res = await api.get(`/master/materials/${id}`).catch(()=>null); setShowDetail(res?.data); } catch (err) { setModalError(err.message); }
  };
  const openEdit = async (id) => {
    try {
      const res = await api.get(`/master/materials/${id}`).catch(()=>null);
      const m = res?.data;
      setEditId(id);
      setForm({
        material_name: m.material_name, description: m.description||'', material_type_id: m.material_type_id||'',
        material_group_id: m.material_group_id||'', base_uom_id: m.base_uom_id||'',
        standard_price: m.standard_price||'', sales_price: m.sales_price||'',
        is_batch_managed: m.is_batch_managed||false, is_serial_managed: m.is_serial_managed||false,
        hsn_code: m.hsn_code||'', sac_code: m.sac_code||'', gst_rate: m.gst_rate||'',
        plants: (m.plant_data||[]).map(p => ({ plant_id: p.plant_id, reorder_point: p.reorder_point||0, safety_stock: p.safety_stock||0, procurement_type: p.procurement_type||'external', lead_time_days: p.lead_time_days||0 }))
      });
      if (!m.plant_data?.length) setForm(prev => ({...prev, plants: [{}]}));
      setShowCreate(true);
    } catch (err) { setModalError(err.message); }
  };
  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true); setModalError(null);
    try {
      if (!form.material_name) throw new Error('Material name is mandatory');
      if (!form.description) throw new Error('Description is mandatory');
      if (!form.material_type_id) throw new Error('Material type is mandatory');
      if (!form.material_group_id) throw new Error('Material group is mandatory');
      if (!form.base_uom_id) throw new Error('Base UoM is mandatory');
      if (!form.standard_price && parseFloat(form.standard_price) !== 0) throw new Error('Standard price is mandatory');
      if (!form.sales_price && parseFloat(form.sales_price) !== 0) throw new Error('Sales price is mandatory');
      if (!form.hsn_code) throw new Error('HSN code is mandatory');
      if (form.gst_rate === '' || form.gst_rate === undefined || form.gst_rate === null) throw new Error('GST rate is mandatory (can be 0)');
      const validPlants = (form.plants || []).filter(p => p.plant_id);
      if (!validPlants.length) throw new Error('At least one plant must be assigned');
      for (let i = 0; i < validPlants.length; i++) {
        const p = validPlants[i];
        const ss = parseFloat(p.safety_stock)||0;
        const rp = parseFloat(p.reorder_point)||0;
        if (ss > 0 && rp > 0 && ss >= rp) throw new Error(`Plant ${i+1}: Safety stock (${ss}) must be less than reorder point (${rp})`);
      }
      if (editId) { await api.put(`/master/materials/${editId}`, { ...form, plants: validPlants }); setAlert({ type: 'success', message: 'Material updated' }); }
      else { await api.post('/master/materials', { ...form, plants: validPlants }); setAlert({ type: 'success', message: 'Material created with plant assignment' }); }
      setShowCreate(false); setForm({ plants: [{}] }); setEditId(null); loadMaterials();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const addPlantRow = () => setForm({ ...form, plants: [...(form.plants || []), {}] });
  const removePlantRow = (idx) => setForm({ ...form, plants: form.plants.filter((_, i) => i !== idx) });
  const updatePlant = (idx, field, val) => {
    const updated = [...form.plants]; updated[idx] = { ...updated[idx], [field]: val }; setForm({ ...form, plants: updated });
  };

  const columns = [
    { key: 'material_code', label: 'Code', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'material_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'type_name', label: 'Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{v || '—'}</span> },
    { key: 'base_uom', label: 'UoM', render: v => <span className="text-gray-500 font-mono">{v}</span> },
    { key: 'assigned_plants', label: 'Plants', render: (v, row) =>
      <span className="text-xs">{v ? <span className="text-gray-700">{v}</span> : <span className="text-red-500 font-medium">No plant!</span>}</span>
    },
    { key: 'total_stock', label: 'Stock', className: 'text-right',
      render: v => <span className={`font-semibold ${parseFloat(v) > 0 ? 'text-green-700' : 'text-gray-400'}`}>{parseFloat(v||0).toFixed(0)}</span> },
    { key: 'standard_price', label: 'Std Price', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'sales_price', label: 'Sales Price', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'id', label: '', render: (v) => <div className="flex gap-1">
      <button onClick={() => openEdit(v)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4"/></button>
      <button onClick={() => loadDetail(v)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Eye className="w-4 h-4" /></button>
    </div> },
  ];
  const handleBulkDelete = async () => {
    try { const r = await api.post('/master/bulk-delete', { entity: 'materials', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadMaterials(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Materials</h1><p className="text-sm text-gray-400 mt-1">Material master — with plant assignments and stock levels</p></div>
        <div className="flex items-center gap-2">
          <BulkImportExport entity="materials" onImportComplete={loadMaterials}/>
          <ExportButton entity="materials" />
          <button onClick={() => { setForm({ plants: [{}] }); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Material</button>
        </div>
      </div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search materials..." className="w-72" />
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={materials} loading={loading} emptyMessage="No materials." /></div>

      {/* CREATE MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }} title={editId ? "Edit Material" : "Create Material"} size="xl"
        footer={<><button onClick={() => { setShowCreate(false); setEditId(null); }} className="btn-secondary">Cancel</button>
          <><DownloadButton data={materials} filename="MaterialsPage" /><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update Material' : 'Create Material'}</button></></>}>
        <form onSubmit={handleCreate} className="space-y-5">
          <FormField label="Material Name *"><input value={form.material_name||''} onChange={e=>setForm({...form,material_name:e.target.value})} className="input-field" required /></FormField>
          <FormField label="Description *"><textarea value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} className="input-field" rows={2} required /></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type *"><select value={form.material_type_id||''} onChange={e=>setForm({...form,material_type_id:e.target.value})} className="select-field" required><option value="">Select...</option>{matTypes.map(t=><option key={t.id} value={t.id}>{t.type_code} — {t.type_name}</option>)}</select></FormField>
            <FormField label="Group *"><select value={form.material_group_id||''} onChange={e=>setForm({...form,material_group_id:e.target.value})} className="select-field" required><option value="">Select...</option>{matGroups.map(g=><option key={g.id} value={g.id}>{g.group_name}</option>)}</select></FormField>
            <FormField label="Base UoM *"><select value={form.base_uom_id||''} onChange={e=>setForm({...form,base_uom_id:e.target.value})} className="select-field" required><option value="">Select...</option>{uoms.map(u=><option key={u.id} value={u.id}>{u.uom_code} - {u.uom_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Standard Price *"><input type="number" step="0.01" min="0" value={form.standard_price||''} onChange={e=>setForm({...form,standard_price:e.target.value})} className="input-field" required /></FormField>
            <FormField label="Sales Price *"><input type="number" step="0.01" min="0" value={form.sales_price||''} onChange={e=>setForm({...form,sales_price:e.target.value})} className="input-field" required /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="HSN Code *"><input value={form.hsn_code||''} onChange={e=>setForm({...form,hsn_code:e.target.value})} className="input-field" placeholder="e.g. 73042900" maxLength={8} required/></FormField>
            <FormField label="GST Rate % *"><input type="number" step="0.5" min="0" value={form.gst_rate ?? ''} onChange={e=>setForm({...form,gst_rate:e.target.value})} className="input-field" placeholder="e.g. 18 (0 allowed)" required/></FormField>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={form.is_batch_managed||false} onChange={e=>setForm({...form,is_batch_managed:e.target.checked})} className="w-4 h-4" />Batch Managed</label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" checked={form.is_serial_managed||false} onChange={e=>setForm({...form,is_serial_managed:e.target.checked})} className="w-4 h-4" />Serial Managed</label>
          </div>
          {/* PLANT ASSIGNMENT */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Warehouse className="w-4 h-4 text-blue-600" /> Plant Assignment <span className="text-red-500">*</span></h3>
              <button type="button" onClick={addPlantRow} className="text-xs text-blue-600 hover:text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Add Plant</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Assign material to plants where it will be stocked/procured. Set reorder points per plant.</p>
            <div className="space-y-2">
              {(form.plants||[{}]).map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 rounded-lg border">
                  <div className="col-span-3"><label className="text-xs text-gray-500 block mb-1">Plant *</label>
                    <select value={p.plant_id||''} onChange={e=>updatePlant(idx,'plant_id',e.target.value)} className="select-field text-sm" required><option value="">Select...</option>{plants.map(pl=><option key={pl.id} value={pl.id}>{pl.plant_code} - {pl.plant_name}</option>)}</select></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Reorder Pt</label><input type="number" value={p.reorder_point||''} onChange={e=>updatePlant(idx,'reorder_point',e.target.value)} className="input-field text-sm" placeholder="0" /></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Safety Stock</label><input type="number" value={p.safety_stock||''} onChange={e=>updatePlant(idx,'safety_stock',e.target.value)} className="input-field text-sm" placeholder="0" /></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Procurement</label>
                    <select value={p.procurement_type||'external'} onChange={e=>updatePlant(idx,'procurement_type',e.target.value)} className="select-field text-sm"><option value="external">Buy</option><option value="internal">Make</option><option value="both">Both</option></select></div>
                  <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Lead Time (d)</label><input type="number" value={p.lead_time_days||''} onChange={e=>updatePlant(idx,'lead_time_days',e.target.value)} className="input-field text-sm" placeholder="0" /></div>
                  <div className="col-span-1 flex justify-center">{form.plants.length > 1 && <button type="button" onClick={()=>removePlantRow(idx)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>}</div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={()=>setShowDetail(null)} title={showDetail ? `${showDetail.material_code} — ${showDetail.material_name}` : ''} size="xl">
        {showDetail && <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            {[['Type', showDetail.type_name],['Group', showDetail.group_name],['Std Price', formatCurrency(showDetail.standard_price)],['Sales Price', formatCurrency(showDetail.sales_price)]].map(([l,v])=>
              <div key={l} className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500">{l}</p><p className="font-medium text-sm">{v||'—'}</p></div>)}
          </div>
          {showDetail.description && <p className="text-sm text-gray-600">{showDetail.description}</p>}
          <div><h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Warehouse className="w-4 h-4"/> Plant Assignments ({showDetail.plant_data?.length||0})</h3>
            {showDetail.plant_data?.length ? <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-b"><th className="text-left py-2">Plant</th><th className="text-right">Reorder</th><th className="text-right">Safety</th><th>Procurement</th><th className="text-right">Lead Time</th></tr></thead>
              <tbody>{showDetail.plant_data.map(p=><tr key={p.id} className="border-b border-gray-100"><td className="py-2 font-medium">{p.plant_code} - {p.plant_name}</td><td className="text-right">{p.reorder_point||0}</td><td className="text-right">{p.safety_stock||0}</td><td>{p.procurement_type}</td><td className="text-right">{p.lead_time_days||0}d</td></tr>)}</tbody></table>
            : <p className="text-sm text-red-500">No plants assigned</p>}
          </div>
          <div><h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Package className="w-4 h-4"/> Stock Levels</h3>
            {showDetail.stock?.length ? <table className="w-full text-sm"><thead><tr className="text-xs text-gray-500 border-b"><th className="text-left py-2">Plant</th><th className="text-left">Storage Loc</th><th className="text-right">Qty</th></tr></thead>
              <tbody>{showDetail.stock.map((s,i)=><tr key={i} className="border-b border-gray-100"><td className="py-2">{s.plant_code} - {s.plant_name}</td><td>{s.sloc_code} - {s.sloc_name}</td><td className="text-right font-semibold text-green-700">{parseFloat(s.quantity).toFixed(0)}</td></tr>)}</tbody></table>
            : <p className="text-sm text-gray-400">No stock</p>}
          </div>
        </div>}
      </Modal>
    </div>
  );
}
