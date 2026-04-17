import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Eye, Trash2, CheckCircle, Archive, GitBranch } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert, BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber } from '../../utils/formatters';

export default function BOMPage() {
  const navigate = useNavigate();
  const [boms, setBoms] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [materials, setMaterials] = useState([]);
  const finishedGoods = materials.filter(m => m.is_produced === true);
  const componentMaterials = materials.filter(m => !m.is_produced);
  const [uoms, setUoms] = useState([]);
  const [plants, setPlants] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyComp = { component_id: '', quantity: 1, uom_id: '', scrap_percent: 0 };
  const [form, setForm] = useState({
    material_id: '', bom_name: '', base_quantity: 1, uom_id: '', status: 'released',
    plant_id: '', bom_usage: '1', valid_from: '', valid_to: '',
    items: [{ ...emptyComp }],
  });

  useEffect(() => { loadBoms(); }, [search, statusFilter]);
  useEffect(() => { loadLookups(); }, []);

  const loadBoms = async () => {
    try {
      const res = await api.get('/production/bom', { search, status: statusFilter || undefined }).catch(() => null);
      setBoms(res?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const loadLookups = async () => {
    try {
      const [m, u, p] = await Promise.all([
        api.get('/master/materials', { all: true }).catch(() => null),
        api.get('/master/uom').catch(() => null),
        api.get('/master/plants').catch(() => null),
      ]);
      setMaterials(m?.data || []);
      setUoms(u?.data || []);
      setPlants(p?.data || []);
    } catch {}
  };

  const loadDetail = async (id) => {
    try {
      const res = await api.get(`/production/bom/${id}`).catch(() => null);
      setShowDetail(res?.data);
    } catch (err) { setModalError(err.message); }
  };

  const updateComp = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'component_id') {
      const mat = materials.find(m => m.id === value);
      if (mat) items[idx].uom_id = mat.base_uom_id || '';
    }
    setForm({ ...form, items });
  };

  const updateOp = (idx, field, value) => {
    const operations = [...form.operations];
    operations[idx] = { ...operations[idx], [field]: value };
    setForm({ ...form, operations });
  };

  const openEdit = async (row) => {
    setEditId(row.id);
    try {
      const res = await api.get(`/production/bom/${row.id}`).catch(() => null);
      const data = res?.data;
      setForm({
        material_id: data?.material_id || row.material_id,
        bom_name: data?.bom_name || row.bom_name || '',
        base_quantity: data?.base_quantity || row.base_quantity || 1,
        uom_id: data?.uom_id || row.uom_id || '',
        status: data?.status || row.status || 'released',
        plant_id: data?.plant_id || row.plant_id || '',
        bom_usage: data?.bom_usage || row.bom_usage || '1',
        valid_from: data?.valid_from?.split('T')[0] || row.valid_from?.split('T')[0] || '',
        valid_to: data?.valid_to?.split('T')[0] || row.valid_to?.split('T')[0] || '',
        items: data?.items?.length ? data.items.map(i => ({
          component_id: i.component_id, quantity: i.quantity, uom_id: i.uom_id, scrap_percent: i.scrap_percent || 0,
        })) : [{ ...emptyComp }],
      });
    } catch {
      setForm({ material_id: row.material_id, bom_name: row.bom_name || '', base_quantity: row.base_quantity || 1, uom_id: row.uom_id || '', status: row.status || 'released', plant_id: row.plant_id || '', bom_usage: row.bom_usage || '1', valid_from: '', valid_to: '', items: [{ ...emptyComp }] });
    }
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.material_id || !form.items.some(i => i.component_id)) {
      setModalError('Product and at least one component required');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/production/bom/${editId}`, form);
        setAlert({ type: 'success', message: 'BOM updated' });
      } else {
        await api.post('/production/bom', form);
        setAlert({ type: 'success', message: 'BOM created' });
      }
      setShowCreate(false);
      setEditId(null);
      setForm({ material_id: '', bom_name: '', base_quantity: 1, uom_id: '', status: 'released', plant_id: '', bom_usage: '1', valid_from: '', valid_to: '', items: [{ ...emptyComp }] });
      loadBoms();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleRelease = async (id) => {
    try {
      await api.post(`/production/bom/${id}/release`);
      setAlert({ type: 'success', message: 'BOM released' });
      loadBoms();
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const handleObsolete = async (id) => {
    if (!confirm('Mark this BOM as obsolete? It can no longer be used for new production orders.')) return;
    try {
      await api.post(`/production/bom/${id}/obsolete`);
      setAlert({ type: 'success', message: 'BOM marked obsolete' });
      loadBoms();
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const handleBulkDelete = async () => {
    try {
      const r = await api.post('/production/bulk-delete', { entity: 'bom', ids: selectedIds });
      setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` });
      setSelectedIds([]);
      loadBoms();
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const statusColor = (s) => {
    if (s === 'released') return 'bg-emerald-100 text-emerald-700';
    if (s === 'obsolete') return 'bg-gray-100 text-gray-500';
    return 'bg-amber-100 text-amber-700'; // draft
  };

  const columns = [
    {
      key: 'material_code', label: 'Product',
      render: (v, row) => <div><span className="font-mono text-blue-600 font-medium">{v}</span> <span className="text-gray-700">{row.material_name}</span></div>
    },
    { key: 'bom_name', label: 'BOM Name', render: v => v || '—' },
    { key: 'version', label: 'Ver.', className: 'text-center', render: v => <span className="text-xs font-mono text-gray-500">v{v || 1}</span> },
    { key: 'base_quantity', label: 'Base Qty', className: 'text-right', render: (v, row) => `${formatNumber(v)} ${row.uom_code || ''}` },
    { key: 'component_count', label: 'Components', className: 'text-right', render: v => <span className="font-medium">{v}</span> },
    { key: 'plant_code', label: 'Plant', render: v => <span className="font-mono text-gray-600">{v}</span> },
    { key: 'status', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColor(v)}`}>{v || 'released'}</span> },
    {
      key: 'id', label: '', render: (v, row) => (
        <div className="flex gap-1">
          <button onClick={e => { e.stopPropagation(); openEdit(row); }} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={e => { e.stopPropagation(); loadDetail(v); }} className="p-1 hover:bg-gray-100 rounded text-gray-500" title="View"><Eye className="w-3.5 h-3.5" /></button>
          {row.status === 'draft' && (
            <button onClick={e => { e.stopPropagation(); handleRelease(v); }} className="p-1 hover:bg-emerald-50 rounded text-emerald-600" title="Release"><CheckCircle className="w-3.5 h-3.5" /></button>
          )}
          {row.status === 'released' && (
            <button onClick={e => { e.stopPropagation(); handleObsolete(v); }} className="p-1 hover:bg-gray-100 rounded text-gray-400" title="Mark Obsolete"><Archive className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )
    },
  ];

  const statusTabs = [
    { key: '', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'released', label: 'Released' },
    { key: 'obsolete', label: 'Obsolete' },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bill of Materials</h1><p className="text-sm text-gray-400 mt-1">Product structure, components, and routing</p></div>
        <div className="flex gap-2">
          <DownloadButton data={boms} filename="BOM" />
          <button onClick={() => { setEditId(null); setForm({ material_id: '', bom_name: '', base_quantity: 1, uom_id: '', status: 'released', plant_id: '', bom_usage: '1', valid_from: '', valid_to: '', items: [{ ...emptyComp }] }); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New BOM</button>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={statusTabs} active={statusFilter} onChange={setStatusFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search BOMs..." className="w-64" />
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          columns={columns} data={boms} loading={loading} onRowClick={r => loadDetail(r.id)} />
      </div>

      {/* CREATE / EDIT */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate}
        onClose={() => { setShowCreate(false); setModalError(null); setEditId(null); }}
        title={editId ? 'Edit Bill of Materials' : 'Create Bill of Materials'} size="2xl"
        footer={<><button onClick={() => { setShowCreate(false); setEditId(null); }} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          {/* Row 1: Product + BOM Name + Status */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-2">
              <FormField label="Finished Product" required>
                <select value={form.material_id} onChange={e => setForm({ ...form, material_id: e.target.value })} className="select-field">
                  <option value="">Select finished good...</option>
                  {finishedGoods.map(m => <option key={m.id} value={m.id}>{m.material_code} — {m.material_name}</option>)}
                  {finishedGoods.length === 0 && <option disabled>No finished goods found — set is_produced on material type</option>}
                </select>
              </FormField>
            </div>
            <FormField label="BOM Name / Alt">
              <input value={form.bom_name} onChange={e => setForm({ ...form, bom_name: e.target.value })} className="input-field" placeholder="e.g. Standard BOM" />
            </FormField>
            <FormField label="Status">
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="select-field">
                <option value="draft">Draft</option>
                <option value="released">Released</option>
              </select>
            </FormField>
          </div>
          {/* Row 2: Plant + BOM Usage + Base Qty + UoM */}
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Plant">
              <select value={form.plant_id} onChange={e => setForm({ ...form, plant_id: e.target.value })} className="select-field">
                <option value="">— Default —</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}
              </select>
            </FormField>
            <FormField label="BOM Usage">
              <select value={form.bom_usage} onChange={e => setForm({ ...form, bom_usage: e.target.value })} className="select-field">
                <option value="1">1 — Production</option>
                <option value="2">2 — Engineering</option>
                <option value="5">5 — Sales</option>
              </select>
            </FormField>
            <FormField label="Base Quantity">
              <input type="number" min="1" value={form.base_quantity} onChange={e => setForm({ ...form, base_quantity: e.target.value })} className="input-field" />
            </FormField>
            <FormField label="UoM">
              <select value={form.uom_id} onChange={e => setForm({ ...form, uom_id: e.target.value })} className="select-field">
                <option value="">—</option>
                {uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}
              </select>
            </FormField>
          </div>
          {/* Row 3: Valid From / To */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Valid From">
              <input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} className="input-field" />
            </FormField>
            <FormField label="Valid To (leave blank = no expiry)">
              <input type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} className="input-field" />
            </FormField>
          </div>

          {/* Components */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Components for {formatNumber(form.base_quantity)} base unit(s)</span>
            <button onClick={() => setForm({ ...form, items: [...form.items, { ...emptyComp }] })} className="text-xs text-blue-600 hover:underline font-medium">+ Add Component</button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs text-gray-500">Component</th>
                <th className="px-3 py-2 text-xs text-gray-500 w-24">Qty</th>
                <th className="px-3 py-2 text-xs text-gray-500 w-28">UoM</th>
                <th className="px-3 py-2 text-xs text-gray-500 w-20">Scrap%</th>
                <th className="w-8"></th>
              </tr></thead>
              <tbody>
                {form.items.map((it, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="px-2 py-1">
                      <select value={it.component_id} onChange={e => updateComp(idx, 'component_id', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none">
                        <option value="">Select...</option>
                        {componentMaterials.filter(m => m.id !== form.material_id).map(m => <option key={m.id} value={m.id}>{m.material_code} — {m.material_name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1"><input type="number" step="0.001" min="0.001" value={it.quantity} onChange={e => updateComp(idx, 'quantity', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded text-right bg-white focus:outline-none" /></td>
                    <td className="px-2 py-1">
                      <select value={it.uom_id} onChange={e => updateComp(idx, 'uom_id', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:outline-none">
                        <option value="">—</option>{uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1"><input type="number" step="0.1" min="0" value={it.scrap_percent} onChange={e => updateComp(idx, 'scrap_percent', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded text-right bg-white focus:outline-none" /></td>
                    <td className="px-2 py-1"><button onClick={() => { if (form.items.length > 1) setForm({ ...form, items: form.items.filter((_, i) => i !== idx) }); }} className="text-gray-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
            <p><strong>SAP CS01 equivalent.</strong> BOM Usage 1 = Production is the standard. Set Valid From to control effective date.</p>
            <p>
              <GitBranch className="w-3 h-3 inline mr-1" />
              Next step: define <button onClick={() => { setShowCreate(false); navigate('/production/routing'); }} className="font-medium underline">Routing (CA01)</button> — assign operations &amp; work centers to this product.
            </p>
          </div>
        </div>
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)}
        title={showDetail ? `BOM — ${showDetail.material_code} ${showDetail.material_name}` : 'BOM Detail'} size="xl">
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div><p className="text-xs text-gray-500">Status</p><span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${statusColor(showDetail.status)}`}>{showDetail.status || 'released'}</span></div>
              <div><p className="text-xs text-gray-500">Version</p><p className="text-sm font-mono">v{showDetail.version || 1}</p></div>
              <div><p className="text-xs text-gray-500">Base Quantity</p><p className="text-sm">{formatNumber(showDetail.base_quantity)} {showDetail.uom_code}</p></div>
              <div><p className="text-xs text-gray-500">Plant</p><p className="text-sm">{showDetail.plant_code || '—'}</p></div>
              <div><p className="text-xs text-gray-500">BOM Usage</p><p className="text-sm">{showDetail.bom_usage === '1' ? '1 — Production' : showDetail.bom_usage === '2' ? '2 — Engineering' : showDetail.bom_usage === '5' ? '5 — Sales' : showDetail.bom_usage || '1 — Production'}</p></div>
              <div><p className="text-xs text-gray-500">Valid From</p><p className="text-sm">{showDetail.valid_from ? showDetail.valid_from.split('T')[0] : '—'}</p></div>
              <div><p className="text-xs text-gray-500">Valid To</p><p className="text-sm">{showDetail.valid_to ? showDetail.valid_to.split('T')[0] : 'No expiry'}</p></div>
            </div>

            <h4 className="text-sm font-semibold text-gray-700">Components ({showDetail.items?.length || 0})</h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs text-gray-500">#</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">Component</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">Quantity</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">Scrap %</th>
                </tr></thead>
                <tbody>
                  {(showDetail.items || []).map((it, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-400">{it.line_number}</td>
                      <td className="px-3 py-2"><span className="font-mono text-xs text-blue-600">{it.material_code}</span> {it.material_name}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatNumber(it.quantity, 3)} {it.uom_code}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{it.scrap_percent || 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800 flex-wrap">
              <GitBranch className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500">Process flow:</span>
              <button onClick={() => { setShowDetail(null); navigate('/production/work-centers'); }} className="text-xs text-blue-600 hover:underline font-medium">Work Centers</button>
              <span className="text-xs text-gray-300">→</span>
              <span className="text-xs font-semibold text-violet-600">BOM ✓</span>
              <span className="text-xs text-gray-300">→</span>
              <button onClick={() => { setShowDetail(null); navigate('/production/routing'); }} className="text-xs text-blue-600 hover:underline font-medium">Routing (CA01)</button>
              <span className="text-xs text-gray-300">→</span>
              <button onClick={() => { setShowDetail(null); navigate('/production/orders'); }} className="text-xs text-blue-600 hover:underline font-medium">Production Order</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
