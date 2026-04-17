import { useState, useEffect} from 'react';
import { Plus, Edit2, Landmark, XCircle ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge, Tabs ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ExportButton } from '../../components/common/SharedFeatures';

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('active');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const emptyForm = { asset_name:'', description:'', class_id:'', plant_id:'', cost_center_id:'', acquisition_date:'', acquisition_cost:'', salvage_value:'0', useful_life_months:'60', location:'', serial_number:'' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [classes, setClasses] = useState([]);
  const [plants, setPlants] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [overview, setOverview] = useState({});

  useEffect(() => { loadAssets(); loadLookups(); loadOverview(); }, [statusF, search]);
  const loadAssets = async () => { try { setAssets((await api.get('/assets/assets', { status: statusF, search }).catch(()=>null))?.data || []); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => { try { const [c,p,cc] = await Promise.all([api.get('/assets/classes').catch(()=>null), api.get('/master/plants').catch(()=>null), api.get('/master/cost-centers').catch(()=>null)]); setClasses(c?.data||[]); setPlants(p?.data||[]); setCostCenters(cc?.data||[]); } catch {} };
  const loadOverview = async () => { try { setOverview((await api.get('/assets/overview').catch(()=>null))?.data || {}); } catch {} };

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (row) => {
    setEditId(row.id);
    setForm({ asset_name: row.asset_name, description: row.description||'', class_id: row.class_id||'', plant_id: row.plant_id||'',
      cost_center_id: row.cost_center_id||'', location: row.location||'', serial_number: row.serial_number||'',
      useful_life_months: row.useful_life_months||'60', acquisition_date: row.acquisition_date?.split('T')[0]||'',
      acquisition_cost: row.acquisition_cost||'', salvage_value: row.salvage_value||'0' });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) { await api.put(`/assets/assets/${editId}`, form); setAlert({ type: 'success', message: 'Asset updated' }); }
      else { await api.post('/assets/assets', form); setAlert({ type: 'success', message: 'Asset created' }); }
      setShowForm(false); setEditId(null); loadAssets(); loadOverview();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleDispose = async (id) => {
    const amt = prompt('Disposal amount:'); if (amt === null) return;
    try { await api.post(`/assets/assets/${id}/dispose`, { disposal_amount: amt }); setAlert({ type: 'success', message: 'Asset disposed' }); loadAssets(); loadOverview(); }
    catch (err) { setModalError(err.message); }
  };

  const columns = [
    { key: 'asset_code', label: 'Code', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'asset_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'class_name', label: 'Class', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{v||'—'}</span> },
    { key: 'acquisition_cost', label: 'Cost', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'net_book_value', label: 'NBV', className: 'text-right', render: v => <span className="font-medium text-green-700">{formatCurrency(v)}</span> },
    { key: 'location', label: 'Location', render: v => v||'—' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v}/> },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      {row.status === 'active' && <button onClick={() => openEdit(row)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4"/></button>}
      {row.status === 'active' && <button onClick={() => handleDispose(v)} className="p-1 rounded hover:bg-red-50 text-red-400"><XCircle className="w-4 h-4"/></button>}
    </div> },
      { key: '_del', label: '', render: (v, row) => {row.status !== 'disposed' && <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>} },
  ];

  const kpis = [
    { label: 'Total Assets', value: overview.total_assets || 0 },
    { label: 'Total Cost', value: formatCurrency(overview.total_cost) },
    { label: 'Total NBV', value: formatCurrency(overview.total_nbv) },
    { label: 'Depreciation', value: formatCurrency(overview.total_depreciation) },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/assets/assets/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadAssets(); loadOverview(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/assets/bulk-delete', { entity: 'assets', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadAssets(); loadOverview(); }
    catch (e) { setModalError(e.message); }
  };



  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Assets</h1></div>
        <div className="flex gap-2"><ExportButton entity="assets"/><><DownloadButton data={assets} filename="AssetsPage" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Asset</button></></div></div>
      <div className="grid grid-cols-4 gap-4">{kpis.map(k => <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm"><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-gray-900 mt-1">{k.value}</p></div>)}</div>
      <div className="flex items-center gap-4">
        <Tabs tabs={[{key:'active',label:'Active'},{key:'disposed',label:'Disposed'},{key:'',label:'All'}]} active={statusF} onChange={setStatusF}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={assets} loading={loading}/></div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title={editId ? 'Edit Asset' : 'Create Asset'} size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Asset Name" required><input value={form.asset_name} onChange={e=>setForm({...form,asset_name:e.target.value})} className="input-field" required/></FormField>
          <FormField label="Description"><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="input-field" rows={2}/></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Class"><select value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value})} className="select-field"><option value="">Select...</option>{classes.map(c=><option key={c.id} value={c.id}>{c.class_code} - {c.class_name}</option>)}</select></FormField>
            <FormField label="Plant"><select value={form.plant_id} onChange={e=>setForm({...form,plant_id:e.target.value})} className="select-field"><option value="">Select...</option>{plants.map(p=><option key={p.id} value={p.id}>{p.plant_code} - {p.plant_name}</option>)}</select></FormField>
            <FormField label="Cost Center"><select value={form.cost_center_id} onChange={e=>setForm({...form,cost_center_id:e.target.value})} className="select-field"><option value="">Select...</option>{costCenters.map(c=><option key={c.id} value={c.id}>{c.cc_code} - {c.cc_name}</option>)}</select></FormField>
          </div>
          {!editId && <div className="grid grid-cols-3 gap-4">
            <FormField label="Acquisition Date"><input type="date" value={form.acquisition_date} onChange={e=>setForm({...form,acquisition_date:e.target.value})} className="input-field"/></FormField>
            <FormField label="Cost"><input type="number" step="0.01" value={form.acquisition_cost} onChange={e=>setForm({...form,acquisition_cost:e.target.value})} className="input-field"/></FormField>
            <FormField label="Salvage Value"><input type="number" step="0.01" value={form.salvage_value} onChange={e=>setForm({...form,salvage_value:e.target.value})} className="input-field"/></FormField>
          </div>}
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Useful Life (months)"><input type="number" value={form.useful_life_months} onChange={e=>setForm({...form,useful_life_months:e.target.value})} className="input-field"/></FormField>
            <FormField label="Location"><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} className="input-field"/></FormField>
            <FormField label="Serial Number"><input value={form.serial_number} onChange={e=>setForm({...form,serial_number:e.target.value})} className="input-field"/></FormField>
          </div>
        </form>
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.asset_name} />
    </div>
  );
}
