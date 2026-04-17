import { useState, useEffect } from 'react';
import { Plus, Edit2, Eye, Trash2, GitBranch, Clock, ChevronRight } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber } from '../../utils/formatters';

export default function RoutingPage() {
  const [routings, setRoutings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [editId, setEditId] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [plants, setPlants] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyOp = { operation_no: '', operation_name: '', work_center_id: '', setup_time: 0, run_time: 0, time_unit: 'MIN', description: '' };
  const [form, setForm] = useState({ routing_name: '', material_id: '', plant_id: '', routing_status: 'active', task_list_type: 'N', operations: [{ ...emptyOp }] });

  useEffect(() => { load(); }, [search]);
  useEffect(() => { loadLookups(); }, []);

  const load = async () => {
    setLoading(true);
    try { setRoutings((await api.get('/production/routings', { search }))?.data || []); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  };

  const loadLookups = async () => {
    try {
      const [m, p, wc] = await Promise.all([
        api.get('/master/materials', { all: true }).catch(() => null),
        api.get('/master/plants').catch(() => null),
        api.get('/production/work-centers').catch(() => null),
      ]);
      setMaterials(m?.data || []);
      setPlants(p?.data || []);
      setWorkCenters(wc?.data || []);
    } catch {}
  };

  const loadDetail = async (id) => {
    try {
      const res = await api.get(`/production/routings/${id}`);
      setShowDetail(res?.data);
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ routing_name: '', material_id: '', plant_id: '', routing_status: 'active', task_list_type: 'N', operations: [{ ...emptyOp, operation_no: 10 }] });
    setShowForm(true);
  };

  const openEdit = async (row) => {
    setEditId(row.id);
    try {
      const res = await api.get(`/production/routings/${row.id}`);
      const data = res?.data;
      setForm({
        routing_name: data?.routing_name || '',
        material_id: data?.material_id || '',
        plant_id: data?.plant_id || '',
        routing_status: data?.routing_status || 'active',
        task_list_type: data?.task_list_type || 'N',
        operations: data?.operations?.length ? data.operations.map(o => ({
          operation_no: o.operation_no,
          operation_name: o.operation_name,
          work_center_id: o.work_center_id || '',
          setup_time: o.setup_time || 0,
          run_time: o.run_time || 0,
          time_unit: o.time_unit || 'MIN',
          description: o.description || '',
        })) : [{ ...emptyOp, operation_no: 10 }],
      });
    } catch {
      setForm({ routing_name: row.routing_name, material_id: row.material_id || '', plant_id: row.plant_id || '', routing_status: row.routing_status || 'active', task_list_type: row.task_list_type || 'N', operations: [{ ...emptyOp, operation_no: 10 }] });
    }
    setShowForm(true);
  };

  const updateOp = (idx, field, value) => {
    const operations = [...form.operations];
    operations[idx] = { ...operations[idx], [field]: value };
    setForm({ ...form, operations });
  };

  const addOp = () => {
    const lastNo = form.operations.length ? parseInt(form.operations[form.operations.length - 1].operation_no || 0) : 0;
    setForm({ ...form, operations: [...form.operations, { ...emptyOp, operation_no: lastNo + 10 }] });
  };

  const removeOp = (idx) => {
    if (form.operations.length > 1) setForm({ ...form, operations: form.operations.filter((_, i) => i !== idx) });
  };

  const handleSave = async () => {
    if (!form.routing_name) { setModalError('Routing name is required'); return; }
    if (!form.operations.some(o => o.operation_name)) { setModalError('At least one operation is required'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/production/routings/${editId}`, form);
        setAlert({ type: 'success', message: 'Routing updated' });
      } else {
        await api.post('/production/routings', form);
        setAlert({ type: 'success', message: 'Routing created' });
      }
      setShowForm(false);
      load();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this routing?')) return;
    try {
      await api.delete(`/production/routings/${id}`);
      setAlert({ type: 'success', message: 'Routing deleted' });
      load();
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  // Total time for a routing (sum of setup + run for all ops)
  const totalTime = (ops) => ops?.reduce((s, o) => s + parseFloat(o.setup_time || 0) + parseFloat(o.run_time || 0), 0) || 0;

  const TASK_LIST_LABELS = { N: 'N — Normal', R: 'R — Rate', S: 'S — Standard' };

  const columns = [
    {
      key: 'routing_name', label: 'Routing Name',
      render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span>
    },
    {
      key: 'material_code', label: 'Material',
      render: (v, row) => v
        ? <span><span className="font-mono text-xs text-blue-600">{v}</span> <span className="text-gray-600">{row.material_name}</span></span>
        : <span className="text-gray-400 text-xs">Generic</span>
    },
    { key: 'plant_code', label: 'Plant', render: v => v ? <span className="font-mono text-gray-600">{v}</span> : '—' },
    {
      key: 'task_list_type', label: 'Type',
      render: v => <span className="text-xs font-mono text-gray-500">{v || 'N'}</span>
    },
    {
      key: 'routing_status', label: 'Status',
      render: v => {
        const color = v === 'active' ? 'bg-emerald-100 text-emerald-700' : v === 'inactive' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700';
        return <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${color}`}>{v || 'active'}</span>;
      }
    },
    {
      key: 'operation_count', label: 'Operations',
      className: 'text-center',
      render: v => <span className="inline-flex items-center gap-1 text-sm font-medium text-violet-600"><GitBranch className="w-3.5 h-3.5" />{v}</span>
    },
    {
      key: 'id', label: '',
      render: (v, row) => (
        <div className="flex gap-1">
          <button onClick={e => { e.stopPropagation(); loadDetail(v); }} className="p-1 hover:bg-gray-100 rounded" title="View"><Eye className="w-3.5 h-3.5 text-gray-500" /></button>
          <button onClick={e => { e.stopPropagation(); openEdit(row); }} className="p-1 hover:bg-gray-100 rounded" title="Edit"><Edit2 className="w-3.5 h-3.5 text-gray-500" /></button>
          <button onClick={e => { e.stopPropagation(); handleDelete(v); }} className="p-1 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Routings</h1>
          <p className="text-sm text-gray-400 mt-1">Define manufacturing process steps and work center assignments</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Routing
        </button>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search routings..." className="w-72" />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={columns} data={routings} loading={loading} onRowClick={r => loadDetail(r.id)} />
      </div>

      {/* CREATE / EDIT */}
      <Modal
        error={modalError} onClearError={() => setModalError(null)}
        isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); setEditId(null); }}
        title={editId ? 'Edit Routing' : 'New Routing'} size="2xl"
        footer={
          <>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3 md:col-span-1">
              <FormField label="Routing Name" required>
                <input value={form.routing_name} onChange={e => setForm({ ...form, routing_name: e.target.value })}
                  className="input-field" placeholder="e.g. Standard Assembly Process" />
              </FormField>
            </div>
            <FormField label="Material (optional)">
              <select value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })} className="select-field">
                <option value="">— Generic (any material) —</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.material_code} — {m.material_name}</option>)}
              </select>
            </FormField>
            <FormField label="Plant">
              <select value={form.plant_id} onChange={e => setForm({ ...form, plant_id: e.target.value })} className="select-field">
                <option value="">— Default plant —</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}
              </select>
            </FormField>
            <FormField label="Task List Type">
              <select value={form.task_list_type} onChange={e => setForm({ ...form, task_list_type: e.target.value })} className="select-field">
                <option value="N">N — Normal Routing</option>
                <option value="R">R — Rate Routing</option>
                <option value="S">S — Standard</option>
              </select>
            </FormField>
            <FormField label="Status">
              <select value={form.routing_status} onChange={e => setForm({ ...form, routing_status: e.target.value })} className="select-field">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="locked">Locked</option>
              </select>
            </FormField>
          </div>

          {/* Operations */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Operations
              <span className="text-xs font-normal text-gray-400 ml-2">
                Total: {totalTime(form.operations).toFixed(0)} MIN
              </span>
            </p>
            <button onClick={addOp} className="text-xs text-blue-600 hover:underline font-medium">+ Add Operation</button>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left text-xs text-gray-500 w-14">Op #</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">Operation Name</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 w-36">Work Center</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-500 w-20">Setup</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-500 w-20">Run</th>
                  <th className="px-3 py-2 text-center text-xs text-gray-500 w-16">Unit</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">Description</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {form.operations.map((op, idx) => (
                  <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-2 py-1.5">
                      <input type="number" value={op.operation_no}
                        onChange={e => updateOp(idx, 'operation_no', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 text-center focus:outline-none focus:border-blue-400" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={op.operation_name}
                        onChange={e => updateOp(idx, 'operation_name', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-400"
                        placeholder="e.g. Cutting, Welding, Inspection" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={op.work_center_id}
                        onChange={e => updateOp(idx, 'work_center_id', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-400">
                        <option value="">— None —</option>
                        {workCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.wc_code} — {wc.wc_name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.5" value={op.setup_time}
                        onChange={e => updateOp(idx, 'setup_time', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 text-right focus:outline-none focus:border-blue-400" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.5" value={op.run_time}
                        onChange={e => updateOp(idx, 'run_time', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 text-right focus:outline-none focus:border-blue-400" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={op.time_unit}
                        onChange={e => updateOp(idx, 'time_unit', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-400">
                        <option value="MIN">MIN</option>
                        <option value="HR">HR</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={op.description}
                        onChange={e => updateOp(idx, 'description', e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-400"
                        placeholder="Optional notes" />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeOp(idx)} className="text-gray-300 hover:text-rose-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p><strong>SAP CA01 equivalent.</strong> Task List Type N = Normal Routing (standard); R = Rate Routing (for repetitive manufacturing).</p>
            <p>Operation numbers determine sequence (10, 20, 30…). Setup time is per batch; run time is per unit. Both drive scheduling and work center load.</p>
            <p><strong>Process flow:</strong> Work Centers (CR01) → BOM (CS01) → <strong>Routing ✓</strong> → Production Order (CO01) → MRP (MD01)</p>
          </div>
        </div>
      </Modal>

      {/* DETAIL VIEW */}
      <Modal
        isOpen={!!showDetail} onClose={() => setShowDetail(null)}
        title={showDetail ? `Routing — ${showDetail.routing_name}` : 'Routing Detail'} size="xl"
      >
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Material</p>
                <p className="text-sm font-medium">
                  {showDetail.material_code
                    ? <span><span className="font-mono text-blue-600">{showDetail.material_code}</span> — {showDetail.material_name}</span>
                    : <span className="text-gray-400">Generic</span>}
                </p>
              </div>
              <div><p className="text-xs text-gray-500">Plant</p><p className="text-sm">{showDetail.plant_code || '—'}</p></div>
              <div>
                <p className="text-xs text-gray-500">Task List Type</p>
                <p className="text-sm font-mono">{showDetail.task_list_type || 'N'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${showDetail.routing_status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {showDetail.routing_status || 'active'}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Time</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  {totalTime(showDetail.operations).toFixed(0)} MIN
                </p>
              </div>
            </div>

            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Operations ({showDetail.operations?.length || 0})
            </h4>

            {/* Visual flow */}
            <div className="space-y-2">
              {(showDetail.operations || []).map((op, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 shrink-0">
                      {op.operation_no}
                    </div>
                    {i < (showDetail.operations.length - 1) && (
                      <div className="w-0.5 h-4 bg-gray-200 dark:bg-gray-700 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{op.operation_name}</span>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Setup: {op.setup_time || 0} {op.time_unit}
                          </span>
                          <span className="flex items-center gap-1">
                            Run: {op.run_time || 0} {op.time_unit}
                          </span>
                        </div>
                      </div>
                      {op.wc_code && (
                        <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                          Work Center: <span className="font-mono font-medium">{op.wc_code}</span> — {op.wc_name}
                        </p>
                      )}
                      {op.description && <p className="text-xs text-gray-400 mt-1">{op.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
