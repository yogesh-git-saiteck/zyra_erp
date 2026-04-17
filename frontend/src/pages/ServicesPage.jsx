import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Layers } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, DeleteConfirm, BulkActionBar, DownloadButton } from '../components/common/index';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadServices(); }, [search]);
  useEffect(() => {
    api.get('/master/uom').then(r => setUoms(r?.data || [])).catch(() => {});
  }, []);

  const loadServices = async () => {
    setLoading(true);
    try {
      const r = await api.get('/master/services', { search }).catch(() => null);
      setServices(r?.data || []);
    } finally { setLoading(false); }
  };

  const emptyForm = { service_name: '', description: '', sac_code: '', service_category: '', uom_id: '', standard_rate: '', currency: 'INR', gst_rate: '18', notes: '' };

  const openCreate = () => { setForm(emptyForm); setEditId(null); setModalError(null); setShowModal(true); };
  const openEdit = (row) => {
    setForm({
      service_name: row.service_name, description: row.description || '',
      sac_code: row.sac_code || '', service_category: row.service_category || '',
      uom_id: row.uom_id || '', standard_rate: row.standard_rate || '',
      currency: row.currency || 'INR', gst_rate: row.gst_rate ?? '18', notes: row.notes || ''
    });
    setEditId(row.id); setModalError(null); setShowModal(true);
  };

  const s = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setModalError(null); setSaving(true);
    try {
      if (!form.service_name.trim()) throw new Error('Service name is required');
      if (!form.sac_code.trim()) throw new Error('SAC code is required');
      if (editId) await api.put(`/master/services/${editId}`, form);
      else await api.post('/master/services', form);
      setAlert({ type: 'success', message: editId ? 'Service updated' : 'Service created' });
      setShowModal(false); loadServices();
    } catch (e) { setModalError(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/master/services/${id}`);
      setAlert({ type: 'success', message: 'Service deleted' }); setConfirmDelete(null); loadServices();
    } catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const columns = [
    { key: 'service_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'service_name', label: 'Service Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{v}</span> },
    { key: 'sac_code', label: 'SAC Code', render: v => v ? <span className="font-mono text-violet-600 dark:text-violet-400 text-xs">{v}</span> : <span className="text-gray-400">—</span> },
    { key: 'service_category', label: 'Category', render: v => v || <span className="text-gray-400">—</span> },
    { key: 'uom_name', label: 'UoM', render: v => v || <span className="text-gray-400">—</span> },
    { key: 'standard_rate', label: 'Rate', className: 'text-right', render: (v, row) => <span className="font-medium">{formatCurrency(v, row.currency)}</span> },
    { key: 'gst_rate', label: 'GST%', className: 'text-right', render: v => <span>{v}%</span> },
    { key: 'description', label: 'Description', render: v => <span className="text-xs text-gray-500 truncate max-w-[200px] block">{v || '—'}</span> },
    {
      key: 'id', label: '', render: (v, row) => (
        <div className="flex gap-1">
          <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Edit"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
          <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-violet-600" /> Service Master
          </h1>
          <p className="text-sm text-gray-400 mt-1">Define services with SAC codes for use in transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <DownloadButton data={services} filename="services" label="Export" />
          <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Service</button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services, SAC code..." className="input-field pl-9" />
        </div>
      </div>

      <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])} />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          columns={columns} data={services} loading={loading} emptyMessage="No services defined yet" />
      </div>

      {/* Create / Edit */}
      <Modal error={modalError} onClearError={() => setModalError(null)}
        isOpen={showModal} onClose={() => { setShowModal(false); setEditId(null); }}
        title={editId ? 'Edit Service' : 'New Service'} size="lg"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : (editId ? 'Update' : 'Create')}</button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Service Name *">
              <input value={form.service_name || ''} onChange={e => s('service_name', e.target.value)} className="input-field" placeholder="e.g. Consulting Services" />
            </FormField>
            <FormField label="SAC Code *">
              <input value={form.sac_code || ''} onChange={e => s('sac_code', e.target.value)} className="input-field" placeholder="e.g. 998314" maxLength={10} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <input value={form.service_category || ''} onChange={e => s('service_category', e.target.value)} className="input-field" placeholder="e.g. IT Services" />
            </FormField>
            <FormField label="Unit of Measure">
              <select value={form.uom_id || ''} onChange={e => s('uom_id', e.target.value)} className="select-field">
                <option value="">— Select UoM —</option>
                {uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Standard Rate">
              <input type="number" value={form.standard_rate || ''} onChange={e => s('standard_rate', e.target.value)} className="input-field" placeholder="0.00" step="0.01" min="0" />
            </FormField>
            <FormField label="Currency">
              <select value={form.currency || 'INR'} onChange={e => s('currency', e.target.value)} className="select-field">
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </FormField>
            <FormField label="GST Rate %">
              <input type="number" value={form.gst_rate ?? '18'} onChange={e => s('gst_rate', e.target.value)} className="input-field" placeholder="18" step="0.01" min="0" max="100" />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea value={form.description || ''} onChange={e => s('description', e.target.value)} className="input-field" rows={2} placeholder="Short description of the service" />
          </FormField>
          <FormField label="Notes">
            <textarea value={form.notes || ''} onChange={e => s('notes', e.target.value)} className="input-field" rows={2} placeholder="Internal notes" />
          </FormField>
        </div>
      </Modal>

      {confirmDelete && (
        <DeleteConfirm
          message={`Delete service "${confirmDelete.service_name}"?`}
          onConfirm={() => handleDelete(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
