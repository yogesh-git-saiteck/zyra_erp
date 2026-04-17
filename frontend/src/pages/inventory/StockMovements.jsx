import { useState, useEffect } from 'react';
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, RotateCcw, Trash2, ClipboardCheck } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Tabs, Alert, BulkActionBar , DownloadButton, SearchableSelect } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber, formatDate, formatCurrency } from '../../utils/formatters';

const TYPE_CONFIG = {
  issue: { label: 'Goods Issue', icon: ArrowUpRight, color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  return: { label: 'Return', icon: RotateCcw, color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  adjustment: { label: 'Adjustment', icon: ClipboardCheck, color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  scrap: { label: 'Scrap', icon: Trash2, color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  receipt: { label: 'Goods Receipt', icon: ArrowDownLeft, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

export default function StockMovements() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [plants, setPlants] = useState([]);
  const [slocs, setSlocs] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [projects, setProjects] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const emptyForm = { movement_type: 'issue', material_id: '', plant_id: '', sloc_id: '', quantity: '', uom_id: '', batch_number: '', cost_center_id: '', project_id: '', to_plant_id: '', to_sloc_id: '', reason: '' };
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => { loadMovements(); loadLookups(); }, [typeFilter, search]);

  const loadMovements = async () => {
    try { const res = await api.get('/inventory/movements', { type: typeFilter, search }).catch(()=>null); setMovements(res?.data || []); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [m, p, s, u, cc, pj] = await Promise.all([
        api.get('/master/materials', { all: true }).catch(()=>null), api.get('/master/plants').catch(()=>null), api.get('/master/storage-locations').catch(()=>null),
        api.get('/master/uom').catch(()=>null), api.get('/org/cost-centers').catch(()=>null), api.get('/projects/projects').catch(()=>null)
      ]);
      setMaterials(m?.data || []); setPlants(p?.data || []); setSlocs(s?.data || []);
      setUoms(u?.data || []); setCostCenters(cc?.data || []); setProjects(pj?.data || []);
    } catch {}
  };

  const handleCreate = async () => {
    setModalError(null);
    if (!form.material_id || !form.plant_id || !form.quantity) { setModalError('Material, plant, and quantity are required'); return; }
    if (['issue', 'scrap'].includes(form.movement_type) && !form.cost_center_id && !form.project_id) { setModalError('Cost center or project is required for goods issue/scrap'); return; }
    if (form.movement_type === 'transfer' && !form.to_plant_id && !form.to_sloc_id) { setModalError('Destination plant or storage location required for transfer'); return; }
    setSaving(true);
    try {
      await api.post('/inventory/movements', form); setShowCreate(false);
      setForm({ ...emptyForm }); setAlert({ type: 'success', message: 'Stock movement posted' }); loadMovements();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleBulkDelete = async () => {
    try { const r = await api.post('/inventory/bulk-delete', { entity: 'movements', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadMovements(); }
    catch (e) { setModalError(e.message); }
  };

  const isTransfer = form.movement_type === 'transfer';
  const needsCostCenter = ['issue', 'scrap', 'return', 'adjustment'].includes(form.movement_type);
  const filteredSlocs = slocs.filter(s => !form.plant_id || s.plant_id === form.plant_id);
  const destSlocs = slocs.filter(s => !form.to_plant_id || s.plant_id === form.to_plant_id);
  const isInterPlant = isTransfer && form.to_plant_id && form.to_plant_id !== form.plant_id;

  const columns = [
    { key: 'doc_number', label: 'Doc #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'movement_type', label: 'Type', render: v => { const cfg = TYPE_CONFIG[v] || {}; return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label || v}</span>; }},
    { key: 'material_code', label: 'Material', render: (v, row) => <div><span className="font-mono text-xs text-blue-600">{v}</span> <span className="text-gray-700 dark:text-gray-300 text-sm">{row.material_name}</span></div> },
    { key: 'quantity', label: 'Qty', className: 'text-right', render: (v, row) => {
      const isIn = ['receipt', 'return'].includes(row.movement_type);
      return <span className={`font-semibold ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>{isIn ? '+' : '-'}{formatNumber(v, 1)} {row.uom_code || ''}</span>;
    }},
    { key: 'value_amount', label: 'Value', className: 'text-right', render: v => v ? formatCurrency(v) : '—' },
    { key: 'plant_code', label: 'Plant', render: v => <span className="font-mono text-xs text-gray-600">{v}</span> },
    { key: 'sloc_code', label: 'SLoc', render: v => v || '—' },
    { key: 'posting_date', label: 'Date', render: v => formatDate(v) },
    { key: 'journal_id', label: 'GL', render: v => v ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">Posted</span> : <span className="text-gray-300">—</span> },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stock Movements</h1><p className="text-xs text-gray-400 mt-0.5">Goods issue, transfer, return, adjustment, scrap — with auto GL posting</p></div>
        <><DownloadButton data={movements} filename="StockMovements" /><button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> Post Movement</button></>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={[{ key: '', label: 'All' }, { key: 'issue', label: 'Issue' }, { key: 'transfer', label: 'Transfer' }, { key: 'return', label: 'Return' }, { key: 'adjustment', label: 'Adjustment' }, { key: 'scrap', label: 'Scrap' }, { key: 'receipt', label: 'Receipt' }]} active={typeFilter} onChange={setTypeFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64" />
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={columns} data={movements} loading={loading} selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds} />
      </div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} title="Post Stock Movement" size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Posting...' : 'Post Movement'}</button></>}>
        <div className="space-y-4">
          <FormField label="Movement Type *">
            <div className="flex gap-2">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <button key={key} onClick={() => setForm({ ...form, movement_type: key, to_plant_id: '', to_sloc_id: '' })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap
                    ${form.movement_type === key ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  <cfg.icon className="w-4 h-4" /> {cfg.label}
                </button>
              ))}
            </div>
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Material *"><SearchableSelect value={form.material_id} onChange={val=>{ const mat=materials.find(m=>m.id===val); setForm({...form,material_id:val,uom_id:mat?.base_uom_id||form.uom_id}); }} options={materials.map(m=>({value:m.id,label:`${m.material_code} — ${m.material_name}`}))} placeholder="Select material..." className="select-field" /></FormField>
            <FormField label="Quantity *"><input type="number" step="0.001" min="0.001" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="input-field" placeholder="0" /></FormField>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 mb-2">Source</p>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Plant *"><select value={form.plant_id} onChange={e => setForm({ ...form, plant_id: e.target.value, sloc_id: '' })} className="select-field"><option value="">Select...</option>{plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}</select></FormField>
              <FormField label="Storage Location"><select value={form.sloc_id} onChange={e => setForm({ ...form, sloc_id: e.target.value })} className="select-field"><option value="">Select...</option>{filteredSlocs.map(s => <option key={s.id} value={s.id}>{s.sloc_code} — {s.sloc_name}</option>)}</select></FormField>
              <FormField label="UoM"><select value={form.uom_id} onChange={e => setForm({ ...form, uom_id: e.target.value })} className="select-field"><option value="">Select...</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}</select></FormField>
            </div>
          </div>

          {isTransfer && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">Destination {isInterPlant && <span className="text-amber-600 ml-2">⚡ Inter-plant — GL will be posted</span>}</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="To Plant *"><select value={form.to_plant_id} onChange={e => setForm({ ...form, to_plant_id: e.target.value, to_sloc_id: '' })} className="select-field"><option value="">Same plant</option>{plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}</select></FormField>
                <FormField label="To Storage Location"><select value={form.to_sloc_id} onChange={e => setForm({ ...form, to_sloc_id: e.target.value })} className="select-field"><option value="">Select...</option>{destSlocs.map(s => <option key={s.id} value={s.id}>{s.sloc_code} — {s.sloc_name}</option>)}</select></FormField>
              </div>
              {!isInterPlant && form.to_plant_id && <p className="text-xs text-gray-500 mt-1">Intra-plant transfer — no GL posting needed</p>}
            </div>
          )}

          {needsCostCenter && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Assign to Cost Center <strong>or</strong> Project (one is mandatory, both cannot be selected)</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField label={`Cost Center ${!form.project_id ? '*' : ''}`}>
                  <select value={form.cost_center_id} disabled={!!form.project_id} onChange={e => setForm({ ...form, cost_center_id: e.target.value, project_id: '' })} className={`select-field ${form.project_id ? 'opacity-50' : ''}`}><option value="">Select...</option>{costCenters.map(c => <option key={c.id} value={c.id}>{c.cc_code} — {c.cc_name}</option>)}</select>
                </FormField>
                <FormField label={`Project ${!form.cost_center_id ? '*' : ''}`}>
                  <select value={form.project_id} disabled={!!form.cost_center_id} onChange={e => setForm({ ...form, project_id: e.target.value, cost_center_id: '' })} className={`select-field ${form.cost_center_id ? 'opacity-50' : ''}`}><option value="">Select...</option>{projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}</select>
                </FormField>
              </div>
              {(form.cost_center_id || form.project_id) && <button onClick={() => setForm({...form, cost_center_id: '', project_id: ''})} className="text-xs text-blue-600 hover:underline">Clear selection</button>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Batch Number"><input value={form.batch_number} onChange={e => setForm({ ...form, batch_number: e.target.value })} className="input-field" placeholder="Optional" /></FormField>
            <FormField label="Reason / Notes"><input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="input-field" placeholder="Reason for movement" /></FormField>
          </div>

          <div className="text-xs text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <strong>GL Posting Rules:</strong> Goods Issue → Dr COGS, Cr Inventory | Scrap → Dr Write-off, Cr Inventory | Return → Dr Inventory, Cr COGS | Adjustment → Dr Adjustment, Cr Inventory | Inter-plant Transfer → Dr Dest Inventory, Cr Source Inventory | Intra-plant Transfer → No GL
          </div>
        </div>
      </Modal>
    </div>
  );
}
