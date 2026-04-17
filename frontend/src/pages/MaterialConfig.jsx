import { useState, useEffect} from 'react';
import { Plus, Pencil, Trash2, Search, Package, FolderTree } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, StatusBadge, DeleteConfirm ,BulkActionBar, DownloadButton } from '../components/common/index';
import api from '../utils/api';

export default function MaterialConfig() {
  const [tab, setTab] = useState('types');
  const [selectedIds, setSelectedIds] = useState([]);
  const [types, setTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [t, g] = await Promise.all([api.get('/master/material-types').catch(()=>null), api.get('/master/material-groups').catch(()=>null)]);
      setTypes(t?.data || []); setGroups(g?.data || []);
    } catch {} finally { setLoading(false); }
  };

  const openCreate = () => {
    if (tab === 'types') setForm({ type_code: '', type_name: '', is_stocked: true, is_purchased: true, is_sold: true, is_produced: false });
    else setForm({ group_code: '', group_name: '', parent_id: '' });
    setEditId(null); setModalError(null); setShowModal(true);
  };

  const openEdit = (row) => {
    if (tab === 'types') setForm({ type_name: row.type_name, is_stocked: row.is_stocked, is_purchased: row.is_purchased, is_sold: row.is_sold, is_produced: row.is_produced });
    else setForm({ group_name: row.group_name, parent_id: row.parent_id || '' });
    setEditId(row.id); setModalError(null); setShowModal(true);
  };

  const handleSave = async () => {
    setModalError(null);
    try {
      if (tab === 'types') {
        if (!editId && (!form.type_code || !form.type_name)) return setModalError('Code and name are required');
        if (editId) await api.put(`/master/material-types/${editId}`, form);
        else await api.post('/master/material-types', form);
      } else {
        if (!editId && (!form.group_code || !form.group_name)) return setModalError('Code and name are required');
        if (editId) await api.put(`/master/material-groups/${editId}`, form);
        else await api.post('/master/material-groups', form);
      }
      setAlert({ type: 'success', message: editId ? 'Updated' : 'Created' });
      setShowModal(false); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const handleDelete = async (id) => {
    try {
      if (tab === 'types') await api.delete(`/master/material-types/${id}`);
      else await api.delete(`/master/material-groups/${id}`);
      setAlert({ type: 'success', message: 'Deleted' }); setConfirmDelete(null); loadData();
    } catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const typeColumns = [
    { key: 'type_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'type_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{v}</span> },
    { key: 'is_stocked', label: 'Stocked', render: v => v ? <span className="text-emerald-500 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
    { key: 'is_purchased', label: 'Purchased', render: v => v ? <span className="text-emerald-500 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
    { key: 'is_sold', label: 'Sold', render: v => v ? <span className="text-emerald-500 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
    { key: 'is_produced', label: 'Produced', render: v => v ? <span className="text-emerald-500 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
    { key: 'id', label: '', render: (v, row) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
        <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
      </div>
    )},
  ];

  const groupColumns = [
    { key: 'group_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'group_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{v}</span> },
    { key: 'parent_id', label: 'Parent', render: (v) => { const p = groups.find(g => g.id === v); return p ? <span className="text-xs text-gray-500">{p.group_code} — {p.group_name}</span> : '—'; }},
    { key: 'id', label: '', render: (v, row) => (
      <div className="flex gap-1">
        <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
        <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
      </div>
    )},
  ];
  const handleBulkDelete = async () => {
    try { const r = await api.post('/master/bulk-delete', { entity: 'material-types', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Material Configuration</h1><p className="text-xs text-gray-400 mt-0.5">Define material types and groups used in material master</p></div>
        <><DownloadButton data={types} filename="MaterialConfig" /><button onClick={openCreate} className="btn-primary flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> {tab === 'types' ? 'New Type' : 'New Group'}</button></>
      </div>

      <Tabs tabs={[{ key: 'types', label: 'Material Types', count: types.length }, { key: 'groups', label: 'Material Groups', count: groups.length }]} active={tab} onChange={setTab} />

      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {tab === 'types' ? (
          <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={typeColumns} data={types} loading={loading} emptyMessage="No material types. Create types like FERT (Finished Product), ROH (Raw Material), etc." />
        ) : (
          <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={groupColumns} data={groups} loading={loading} emptyMessage="No material groups. Create groups like Electronics, Raw Materials, etc." />
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? (tab === 'types' ? 'Edit Material Type' : 'Edit Material Group') : (tab === 'types' ? 'New Material Type' : 'New Material Group')} size="xl"
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} className="btn-primary">{editId ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          {tab === 'types' ? (<>
            {!editId && <FormField label="Type Code *"><input value={form.type_code || ''} onChange={e => setForm({...form, type_code: e.target.value.toUpperCase()})} className="input-field font-mono" placeholder="e.g. FERT, ROH, HALB" maxLength={10} /></FormField>}
            <FormField label="Type Name *"><input value={form.type_name || ''} onChange={e => setForm({...form, type_name: e.target.value})} className="input-field" placeholder="e.g. Finished Product" /></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Can be Stocked?"><select value={form.is_stocked ? 'true' : 'false'} onChange={e => setForm({...form, is_stocked: e.target.value === 'true'})} className="select-field"><option value="true">Yes</option><option value="false">No</option></select></FormField>
              <FormField label="Can be Purchased?"><select value={form.is_purchased ? 'true' : 'false'} onChange={e => setForm({...form, is_purchased: e.target.value === 'true'})} className="select-field"><option value="true">Yes</option><option value="false">No</option></select></FormField>
              <FormField label="Can be Sold?"><select value={form.is_sold ? 'true' : 'false'} onChange={e => setForm({...form, is_sold: e.target.value === 'true'})} className="select-field"><option value="true">Yes</option><option value="false">No</option></select></FormField>
              <FormField label="Can be Produced?"><select value={form.is_produced ? 'true' : 'false'} onChange={e => setForm({...form, is_produced: e.target.value === 'true'})} className="select-field"><option value="true">Yes</option><option value="false">No</option></select></FormField>
            </div>
          </>) : (<>
            {!editId && <FormField label="Group Code *"><input value={form.group_code || ''} onChange={e => setForm({...form, group_code: e.target.value.toUpperCase()})} className="input-field font-mono" placeholder="e.g. ELEC, MECH, RAW" maxLength={20} /></FormField>}
            <FormField label="Group Name *"><input value={form.group_name || ''} onChange={e => setForm({...form, group_name: e.target.value})} className="input-field" placeholder="e.g. Electronics" /></FormField>
            <FormField label="Parent Group"><select value={form.parent_id || ''} onChange={e => setForm({...form, parent_id: e.target.value})} className="select-field"><option value="">None (Top Level)</option>{groups.filter(g => g.id !== editId).map(g => <option key={g.id} value={g.id}>{g.group_code} — {g.group_name}</option>)}</select></FormField>
          </>)}
        </div>
      </Modal>

      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.type_code || confirmDelete?.group_code} />
    </div>
  );
}
