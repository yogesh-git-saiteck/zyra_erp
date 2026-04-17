import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Settings2, Clock, DollarSign } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber } from '../../utils/formatters';

export default function WorkCenters() {
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [plants, setPlants] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    wc_code: '', wc_name: '', plant_id: '', cost_center_id: '',
    capacity_qty: '', capacity_uom: 'HR', cost_per_hour: '', wc_category: 'machine',
  });

  useEffect(() => { load(); }, []);
  useEffect(() => { loadLookups(); }, []);

  const load = async () => {
    setLoading(true);
    try { setCenters((await api.get('/production/work-centers'))?.data || []); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  };

  const loadLookups = async () => {
    try {
      const [p, cc] = await Promise.all([
        api.get('/master/plants').catch(() => null),
        api.get('/master/cost-centers').catch(() => null),
      ]);
      setPlants(p?.data || []);
      setCostCenters(cc?.data || []);
    } catch {}
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ wc_code: '', wc_name: '', plant_id: '', cost_center_id: '', capacity_qty: '', capacity_uom: 'HR', cost_per_hour: '', wc_category: 'machine' });
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setForm({
      wc_code: row.wc_code || '',
      wc_name: row.wc_name || '',
      plant_id: row.plant_id || '',
      cost_center_id: row.cost_center_id || '',
      capacity_qty: row.capacity_qty || '',
      capacity_uom: row.capacity_uom || 'HR',
      cost_per_hour: row.cost_per_hour || '',
      wc_category: row.wc_category || 'machine',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.wc_code || !form.wc_name) { setModalError('Code and name are required'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/production/work-centers/${editId}`, form);
        setAlert({ type: 'success', message: 'Work center updated' });
      } else {
        await api.post('/production/work-centers', form);
        setAlert({ type: 'success', message: 'Work center created' });
      }
      setShowForm(false);
      load();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this work center?')) return;
    try {
      await api.delete(`/production/work-centers/${id}`);
      setAlert({ type: 'success', message: 'Work center deactivated' });
      load();
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const filtered = centers.filter(c =>
    !search || c.wc_code?.toLowerCase().includes(search.toLowerCase()) ||
    c.wc_name?.toLowerCase().includes(search.toLowerCase())
  );

  const WC_CATEGORIES = {
    machine:   'Machine Center',
    labor:     'Labor Center',
    assembly:  'Assembly Cell',
    testing:   'Testing Station',
    packaging: 'Packaging',
  };

  const columns = [
    {
      key: 'wc_code', label: 'Code',
      render: v => <span className="font-mono font-semibold text-blue-600">{v}</span>
    },
    { key: 'wc_name', label: 'Name' },
    {
      key: 'wc_category', label: 'Category',
      render: v => <span className="text-xs text-gray-600 dark:text-gray-400">{WC_CATEGORIES[v] || v || 'Machine Center'}</span>
    },
    { key: 'plant_code', label: 'Plant', render: v => v ? <span className="font-mono text-gray-600">{v}</span> : '—' },
    { key: 'cc_name', label: 'Cost Center', render: (v, row) => v ? `${row.cc_code} — ${v}` : '—' },
    {
      key: 'capacity_qty', label: 'Capacity / Day',
      className: 'text-right',
      render: (v, row) => v ? <span className="flex items-center justify-end gap-1"><Clock className="w-3 h-3 text-gray-400" />{formatNumber(v)} {row.capacity_uom}</span> : '—'
    },
    {
      key: 'cost_per_hour', label: 'Cost/Hr',
      className: 'text-right',
      render: v => v ? <span className="flex items-center justify-end gap-1"><DollarSign className="w-3 h-3 text-gray-400" />{formatNumber(v, 2)}</span> : '—'
    },
    {
      key: 'routing_op_count', label: 'Used In',
      className: 'text-center',
      render: v => <span className={`text-xs font-medium ${parseInt(v) > 0 ? 'text-violet-600' : 'text-gray-400'}`}>{v} operations</span>
    },
    {
      key: 'id', label: '',
      render: (v, row) => (
        <div className="flex gap-1">
          <button onClick={e => { e.stopPropagation(); openEdit(row); }} className="p-1 hover:bg-gray-100 rounded" title="Edit">
            <Edit2 className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button onClick={e => { e.stopPropagation(); handleDelete(v); }} className="p-1 hover:bg-rose-50 rounded" title="Deactivate">
            <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" />
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Work Centers</h1>
          <p className="text-sm text-gray-400 mt-1">Define manufacturing resources, capacity, and cost rates</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Work Center
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Work Centers', value: centers.length, color: 'text-blue-600' },
          { label: 'With Capacity Defined', value: centers.filter(c => c.capacity_qty).length, color: 'text-violet-600' },
          { label: 'Used in Routings', value: centers.filter(c => parseInt(c.routing_op_count) > 0).length, color: 'text-emerald-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
          </div>
        ))}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search work centers..." className="w-72" />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={columns} data={filtered} loading={loading} />
      </div>

      {/* CREATE / EDIT MODAL */}
      <Modal
        error={modalError} onClearError={() => setModalError(null)}
        isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }}
        title={editId ? 'Edit Work Center' : 'New Work Center'} size="lg"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Work Center Code" required>
              <input
                value={form.wc_code}
                onChange={e => setForm({ ...form, wc_code: e.target.value.toUpperCase() })}
                className="input-field font-mono"
                placeholder="e.g. WC-LATHE-01"
                disabled={!!editId}
              />
            </FormField>
            <FormField label="Work Center Name" required>
              <input
                value={form.wc_name}
                onChange={e => setForm({ ...form, wc_name: e.target.value })}
                className="input-field"
                placeholder="e.g. CNC Lathe Machine 1"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Category" required>
              <select value={form.wc_category} onChange={e => setForm({ ...form, wc_category: e.target.value })} className="select-field">
                <option value="machine">Machine Center</option>
                <option value="labor">Labor Center</option>
                <option value="assembly">Assembly Cell</option>
                <option value="testing">Testing Station</option>
                <option value="packaging">Packaging</option>
              </select>
            </FormField>
            <FormField label="Plant">
              <select value={form.plant_id} onChange={e => setForm({ ...form, plant_id: e.target.value })} className="select-field">
                <option value="">— None —</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}
              </select>
            </FormField>
            <FormField label="Cost Center">
              <select value={form.cost_center_id} onChange={e => setForm({ ...form, cost_center_id: e.target.value })} className="select-field">
                <option value="">— None —</option>
                {costCenters.map(c => <option key={c.id} value={c.id}>{c.cc_code} — {c.cc_name}</option>)}
              </select>
            </FormField>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Capacity &amp; Cost</p>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Capacity per Day">
                <input
                  type="number" min="0" step="0.5"
                  value={form.capacity_qty}
                  onChange={e => setForm({ ...form, capacity_qty: e.target.value })}
                  className="input-field"
                  placeholder="e.g. 8"
                />
              </FormField>
              <FormField label="Unit">
                <select value={form.capacity_uom} onChange={e => setForm({ ...form, capacity_uom: e.target.value })} className="select-field">
                  <option value="HR">HR — Hours</option>
                  <option value="MIN">MIN — Minutes</option>
                  <option value="PC">PC — Pieces</option>
                </select>
              </FormField>
              <FormField label="Cost per Hour">
                <input
                  type="number" min="0" step="0.01"
                  value={form.cost_per_hour}
                  onChange={e => setForm({ ...form, cost_per_hour: e.target.value })}
                  className="input-field"
                  placeholder="e.g. 250.00"
                />
              </FormField>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <p><strong>SAP CR01 equivalent.</strong> Work centers are assigned to routing operations (CA01). Each operation specifies setup and run times for scheduling and cost calculation.</p>
            <p><strong>Setup order:</strong> Create work centers first, then reference them in Routing operations.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
