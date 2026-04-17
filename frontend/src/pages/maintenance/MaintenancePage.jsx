import { useState, useEffect} from 'react';
import { Plus, Edit2, CheckCircle, Wrench ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function MaintenancePage() {
  const [orders, setOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const emptyForm = { asset_id:'', order_type:'corrective', priority:'medium', description:'', planned_start:'', planned_end:'', assigned_to:'', estimated_cost:'' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => { loadOrders(); loadLookups(); }, [search]);
  const loadOrders = async () => { try { setOrders((await api.get('/maintenance/orders', { search }).catch(()=>null))?.data || []); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => { try { const [a,u] = await Promise.all([api.get('/assets/assets').catch(()=>null), api.get('/auth/users').catch(()=>null)]); setAssets(a?.data||[]); setUsers(u?.data||[]); } catch {} };

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (row) => {
    setEditId(row.id);
    setForm({ asset_id: row.asset_id||'', order_type: row.order_type, priority: row.priority, description: row.description||'',
      planned_start: row.planned_start?.split('T')[0]||'', planned_end: row.planned_end?.split('T')[0]||'',
      assigned_to: row.assigned_to||'', estimated_cost: row.estimated_cost||'' });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) { await api.put(`/maintenance/orders/${editId}`, form); setAlert({ type: 'success', message: 'Updated' }); }
      else { await api.post('/maintenance/orders', form); setAlert({ type: 'success', message: 'Created' }); }
      setShowForm(false); setEditId(null); loadOrders();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleComplete = async (id) => {
    const cost = prompt('Actual cost:'); if (cost === null) return;
    try { await api.post(`/maintenance/orders/${id}/complete`, { actual_cost: cost }); setAlert({ type: 'success', message: 'Completed' }); loadOrders(); }
    catch (err) { setModalError(err.message); }
  };

  const columns = [
    { key: 'doc_number', label: 'MO #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'asset_name', label: 'Asset', render: v => <span className="font-medium">{v||'—'}</span> },
    { key: 'order_type', label: 'Type', render: v => <StatusBadge status={v}/> },
    { key: 'priority', label: 'Priority', render: v => <span className={`badge ${v==='high'?'badge-warning':v==='critical'?'badge-danger':'badge-info'}`}>{v}</span> },
    { key: 'description', label: 'Description', render: v => <span className="text-gray-600 text-sm truncate max-w-48 block">{v||'—'}</span> },
    { key: 'estimated_cost', label: 'Est. Cost', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v}/> },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      {row.status === 'draft' && <button onClick={() => openEdit(row)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4"/></button>}
      {['draft','confirmed'].includes(row.status) && <button onClick={() => handleComplete(v)} className="p-1 rounded hover:bg-green-50 text-green-500"><CheckCircle className="w-4 h-4"/></button>}
    </div> },
      { key: '_del', label: '', render: (v, row) => {row.status === 'draft' && <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>} },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/maintenance/orders/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadOrders(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/maintenance/bulk-delete', { entity: 'orders', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadOrders(); }
    catch (e) { setModalError(e.message); }
  };



  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Maintenance Orders</h1></div>
        <><DownloadButton data={orders} filename="MaintenancePage" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Order</button></></div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={orders} loading={loading}/></div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title={editId ? 'Edit Maintenance Order' : 'Create Maintenance Order'} size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Asset"><select value={form.asset_id} onChange={e=>setForm({...form,asset_id:e.target.value})} className="select-field"><option value="">Select...</option>{assets.map(a=><option key={a.id} value={a.id}>{a.asset_code} - {a.asset_name}</option>)}</select></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type"><select value={form.order_type} onChange={e=>setForm({...form,order_type:e.target.value})} className="select-field"><option value="corrective">Corrective</option><option value="preventive">Preventive</option></select></FormField>
            <FormField label="Priority"><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="select-field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></FormField>
            <FormField label="Assigned To"><select value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})} className="select-field"><option value="">Select...</option>{users.map(u=><option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></FormField>
          </div>
          <FormField label="Description"><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="input-field" rows={3}/></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Planned Start"><input type="date" value={form.planned_start} onChange={e=>setForm({...form,planned_start:e.target.value})} className="input-field"/></FormField>
            <FormField label="Planned End"><input type="date" value={form.planned_end} onChange={e=>setForm({...form,planned_end:e.target.value})} className="input-field"/></FormField>
            <FormField label="Estimated Cost"><input type="number" step="0.01" value={form.estimated_cost} onChange={e=>setForm({...form,estimated_cost:e.target.value})} className="input-field"/></FormField>
          </div>
        </form>
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />
    </div>
  );
}
