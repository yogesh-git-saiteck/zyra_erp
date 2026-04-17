import { useState, useEffect } from 'react';
import { Plus, Edit2, Play, PlayCircle, CheckCircle, Trash2, Eye, AlertTriangle, Activity, ShoppingCart, ArrowRight } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert, DeleteConfirm, BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber, formatDate } from '../../utils/formatters';

export default function ProductionOrders() {
  const [orders, setOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showComplete, setShowComplete] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [boms, setBoms] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [routings, setRoutings] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completedQty, setCompletedQty] = useState('');
  const [scrapQty, setScrapQty] = useState('0');
  const [showRecordOutput, setShowRecordOutput] = useState(null);
  const [outputQty, setOutputQty] = useState('');
  const [outputScrap, setOutputScrap] = useState('0');
  const [shortageOrder, setShortageOrder] = useState(null);   // order row when start fails with shortages
  const [shortageDetails, setShortageDetails] = useState([]); // structured shortage list from detail endpoint
  const [raisingPRs, setRaisingPRs] = useState(false);
  const [prResult, setPrResult] = useState(null);             // result after PRs raised
  const [form, setForm] = useState({
    material_id: '', bom_id: '', planned_qty: '', uom_id: '',
    planned_start: '', planned_end: '', priority: 'medium', lot_number: '',
    order_type: 'PP01', routing_id: '',
  });

  useEffect(() => { loadOrders(); }, [statusFilter, search]);
  useEffect(() => { loadLookups(); }, []);

  const loadOrders = async () => {
    try {
      const res = await api.get('/production/orders', { status: statusFilter, search }).catch(() => null);
      setOrders(res?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const loadLookups = async () => {
    try {
      const [m, b, u, rt] = await Promise.all([
        api.get('/master/materials', { all: true }).catch(() => null),
        api.get('/production/bom').catch(() => null),
        api.get('/master/uom').catch(() => null),
        api.get('/production/routings').catch(() => null),
      ]);
      setMaterials(m?.data || []);
      setBoms(b?.data || []);
      setUoms(u?.data || []);
      setRoutings(rt?.data || []);
    } catch {}
  };

  const loadDetail = async (id) => {
    try {
      const res = await api.get(`/production/orders/${id}`).catch(() => null);
      setDetailData(res?.data || null);
      setShowDetail(id);
    } catch (err) { setModalError(err.message); }
  };

  const openEdit = (row) => {
    setEditId(row.id);
    setForm({
      material_id: row.material_id || '',
      bom_id: row.bom_id || '',
      routing_id: row.routing_id || '',
      planned_qty: row.planned_qty || '',
      planned_start: row.planned_start?.split('T')[0] || '',
      planned_end: row.planned_end?.split('T')[0] || '',
      priority: row.priority || 'medium',
      lot_number: row.lot_number || '',
      order_type: row.order_type || 'PP01',
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.material_id || !form.planned_qty) {
      setModalError('Material and quantity required');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/production/orders/${editId}`, form);
        setAlert({ type: 'success', message: 'Production order updated' });
      } else {
        await api.post('/production/orders', form);
        setAlert({ type: 'success', message: 'Production order created' });
      }
      setShowCreate(false);
      setEditId(null);
      setForm({ material_id: '', bom_id: '', routing_id: '', planned_qty: '', uom_id: '', planned_start: '', planned_end: '', priority: 'medium', lot_number: '', order_type: 'PP01' });
      loadOrders();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleRelease = async (id) => {
    try {
      await api.post(`/production/orders/${id}/release`);
      setAlert({ type: 'success', message: 'Order released to production' });
      loadOrders();
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const handleStart = async (id, row) => {
    try {
      await api.post(`/production/orders/${id}/start`);
      setAlert({ type: 'success', message: 'Production started' });
      loadOrders();
    } catch (err) {
      const isShortage = err.message?.toLowerCase().includes('insufficient components')
        || err.message?.toLowerCase().includes('cannot start');
      if (isShortage) {
        // Load structured shortage data from order detail
        try {
          const det = await api.get(`/production/orders/${id}`);
          const shorts = (det?.data?.components || []).filter(c => !c.sufficient);
          setShortageDetails(shorts);
        } catch { setShortageDetails([]); }
        setShortageOrder(row || orders.find(o => o.id === id) || { id, doc_number: id });
        setPrResult(null);
      } else {
        setAlert({ type: 'error', message: err.message });
      }
    }
  };

  const handleRaiseShortPRs = async () => {
    if (!shortageOrder) return;
    setRaisingPRs(true);
    try {
      const res = await api.post(`/production/orders/${shortageOrder.id}/raise-shortage-prs`);
      setPrResult(res);
      loadOrders();
    } catch (err) {
      setModalError(err.message);
    } finally { setRaisingPRs(false); }
  };

  const handleRecordOutput = async () => {
    if (outputQty === '' || outputQty === null) { setModalError('Enter completed quantity'); return; }
    try {
      await api.post(`/production/orders/${showRecordOutput.id}/record-output`, {
        completed_qty: outputQty,
        scrap_qty: outputScrap || 0,
      });
      setShowRecordOutput(null);
      setAlert({ type: 'success', message: 'Progress recorded' });
      loadOrders();
    } catch (err) { setModalError(err.message); }
  };

  const handleComplete = async () => {
    if (!completedQty) { setModalError('Enter completed quantity'); return; }
    try {
      await api.post(`/production/orders/${showComplete.id}/complete`, {
        completed_qty: completedQty,
        scrap_qty: scrapQty || 0,
      });
      setShowComplete(null);
      setAlert({ type: 'success', message: 'Production order completed — stock updated' });
      loadOrders();
    } catch (err) { setModalError(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/production/orders/${id}`);
      setAlert({ type: 'success', message: 'Deleted' });
      setConfirmDelete(null);
      loadOrders();
    } catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const handleBulkDelete = async () => {
    try {
      const r = await api.post('/production/bulk-delete', { entity: 'orders', ids: selectedIds });
      setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` });
      setSelectedIds([]);
      loadOrders();
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const columns = [
    { key: 'doc_number', label: 'Order #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    {
      key: 'material_code', label: 'Material',
      render: (v, row) => <div><span className="font-mono text-xs text-blue-600">{v}</span> <span className="text-gray-700">{row.material_name}</span></div>
    },
    { key: 'planned_qty', label: 'Planned', className: 'text-right', render: (v, row) => `${formatNumber(v)} ${row.uom_code || ''}` },
    {
      key: 'completed_qty', label: 'Progress', className: 'text-right',
      render: (v, row) => {
        const done = parseFloat(v || 0);
        const planned = parseFloat(row.planned_qty || 1);
        const pct = Math.min(100, Math.round((done / planned) * 100));
        const complete = done >= planned;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className={complete ? 'text-emerald-600 font-medium text-xs' : 'text-xs'}>
              {formatNumber(done)} / {formatNumber(planned)} ({pct}%)
              {parseFloat(row.scrap_qty) > 0 && <span className="text-red-400 ml-1">+{formatNumber(row.scrap_qty)} scrap</span>}
            </span>
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${complete ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-400' : 'bg-gray-200'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      }
    },
    { key: 'lot_number', label: 'Lot #', render: v => v ? <span className="font-mono text-xs text-gray-500">{v}</span> : '—' },
    { key: 'planned_start', label: 'Start', render: v => formatDate(v) || '—' },
    { key: 'planned_end', label: 'End', render: v => formatDate(v) || '—' },
    { key: 'priority', label: 'Priority', render: v => <span className={`badge ${v === 'high' ? 'badge-danger' : v === 'low' ? 'badge-neutral' : 'badge-warning'} capitalize`}>{v}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    {
      key: 'id', label: '', render: (v, row) => (
        <div className="flex gap-1">
          <button onClick={e => { e.stopPropagation(); loadDetail(v); }} title="View" className="p-1 hover:bg-gray-100 rounded"><Eye className="w-3.5 h-3.5 text-gray-500" /></button>
          {row.status === 'draft' && (
            <button onClick={e => { e.stopPropagation(); openEdit(row); }} title="Edit" className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-500" /></button>
          )}
          {row.status === 'draft' && (
            <button onClick={e => { e.stopPropagation(); handleRelease(v); }} title="Release" className="p-1 hover:bg-blue-50 rounded"><Play className="w-3.5 h-3.5 text-blue-500" /></button>
          )}
          {row.status === 'confirmed' && (
            <button onClick={e => { e.stopPropagation(); handleStart(v, row); }} title="Start Production" className="p-1 hover:bg-violet-50 rounded"><PlayCircle className="w-3.5 h-3.5 text-violet-500" /></button>
          )}
          {row.status === 'in_process' && (
            <button onClick={e => { e.stopPropagation(); setShowRecordOutput(row); setOutputQty(row.completed_qty || '0'); setOutputScrap(row.scrap_qty || '0'); setModalError(null); }} title="Record Output" className="p-1 hover:bg-blue-50 rounded"><Activity className="w-3.5 h-3.5 text-blue-500" /></button>
          )}
          {(row.status === 'confirmed' || row.status === 'in_process') && (
            <button onClick={e => { e.stopPropagation(); setShowComplete(row); setCompletedQty(row.planned_qty); setScrapQty('0'); }} title="Complete" className="p-1 hover:bg-emerald-50 rounded"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /></button>
          )}
          {row.status === 'draft' && (
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(row); }} title="Delete" className="p-1 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
          )}
        </div>
      )
    },
  ];

  const tabs = [
    { key: '', label: 'All' },
    { key: 'draft', label: 'Planned' },
    { key: 'confirmed', label: 'Released' },
    { key: 'in_process', label: 'In Process' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Production Orders</h1><p className="text-sm text-gray-400 mt-1">Plan and track manufacturing</p></div>
        <div className="flex gap-2">
          <DownloadButton data={orders} filename="ProductionOrders" />
          <button onClick={() => { setEditId(null); setForm({ material_id: '', bom_id: '', routing_id: '', planned_qty: '', uom_id: '', planned_start: '', planned_end: '', priority: 'medium', lot_number: '', order_type: 'PP01' }); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Order</button>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={tabs} active={statusFilter} onChange={setStatusFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search orders..." className="w-64" />
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
          columns={columns} data={orders} loading={loading} onRowClick={r => loadDetail(r.id)} />
      </div>

      {/* CREATE / EDIT */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate}
        onClose={() => { setShowCreate(false); setModalError(null); setEditId(null); }}
        title={editId ? 'Edit Production Order' : 'Create Production Order'} size="xl"
        footer={<><button onClick={() => { setShowCreate(false); setEditId(null); }} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          {/* SAP production version banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
            <strong>SAP CO01 equivalent.</strong> Select Order Type, then link a BOM (CS01) + Routing (CA01) — this forms the Production Version for this order.
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Order Type">
              <select value={form.order_type} onChange={e => setForm({ ...form, order_type: e.target.value })} className="select-field">
                <option value="PP01">PP01 — Production Order</option>
                <option value="PP02">PP02 — Process Order</option>
                <option value="PP03">PP03 — Rework Order</option>
              </select>
            </FormField>
            <FormField label="Material to Produce" required>
              <select value={form.material_id} onChange={e => {
                const mat = materials.find(m => m.id === e.target.value);
                setForm({ ...form, material_id: e.target.value, uom_id: mat?.base_uom_id || '' });
              }} className="select-field">
                <option value="">Select...</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.material_code} — {m.material_name}</option>)}
              </select>
            </FormField>
            <FormField label="BOM (CS01)">
              <select value={form.bom_id} onChange={e => setForm({ ...form, bom_id: e.target.value })} className="select-field">
                <option value="">Select BOM...</option>
                {boms.filter(b => !form.material_id || b.material_id === form.material_id).map(b => (
                  <option key={b.id} value={b.id}>{b.material_code} — {b.bom_name || 'Default'} {b.status === 'obsolete' ? '(obsolete)' : ''}</option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Planned Quantity" required>
              <input type="number" min="1" value={form.planned_qty} onChange={e => setForm({ ...form, planned_qty: e.target.value })} className="input-field" />
            </FormField>
            <FormField label="UoM">
              <select value={form.uom_id} onChange={e => setForm({ ...form, uom_id: e.target.value })} className="select-field">
                <option value="">—</option>
                {uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code} — {u.uom_name}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="select-field">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Planned Start">
              <input type="date" value={form.planned_start} onChange={e => setForm({ ...form, planned_start: e.target.value })} className="input-field" />
            </FormField>
            <FormField label="Planned End">
              <input type="date" value={form.planned_end} onChange={e => setForm({ ...form, planned_end: e.target.value })} className="input-field" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Routing (CA01)">
              <select value={form.routing_id || ''} onChange={e => setForm({ ...form, routing_id: e.target.value })} className="select-field">
                <option value="">— None —</option>
                {routings.filter(r => !form.material_id || !r.material_id || r.material_id === form.material_id).map(r => (
                  <option key={r.id} value={r.id}>{r.routing_name}{r.material_code ? ` (${r.material_code})` : ''}{r.routing_status === 'inactive' ? ' [inactive]' : ''}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Lot / Batch Number">
              <input value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })} className="input-field" placeholder="e.g. LOT-2026-001" />
            </FormField>
          </div>
        </div>
      </Modal>

      {/* RECORD OUTPUT */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showRecordOutput}
        onClose={() => { setShowRecordOutput(null); setModalError(null); }}
        title="Record Production Output" size="sm"
        footer={<><button onClick={() => setShowRecordOutput(null)} className="btn-secondary">Cancel</button><button onClick={handleRecordOutput} className="btn-primary">Save Progress</button></>}>
        {showRecordOutput && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Update progress for <span className="font-mono font-medium text-blue-600">{showRecordOutput.doc_number}</span> — {showRecordOutput.material_name}
            </p>
            <p className="text-xs text-gray-400">Planned: {formatNumber(showRecordOutput.planned_qty)} {showRecordOutput.uom_code}</p>
            <FormField label="Good Quantity Completed So Far" required>
              <input type="number" step="0.001" min="0" max={showRecordOutput.planned_qty} value={outputQty} onChange={e => setOutputQty(e.target.value)} className="input-field" />
            </FormField>
            <FormField label="Scrap / Rejected Quantity">
              <input type="number" step="0.001" min="0" value={outputScrap} onChange={e => setOutputScrap(e.target.value)} className="input-field" />
            </FormField>
            <p className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded p-2">
              This records progress only — no stock movements. Use <strong>Complete</strong> when the order is fully finished to issue components and receipt finished goods.
            </p>
          </div>
        )}
      </Modal>

      {/* COMPLETE */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showComplete}
        onClose={() => { setShowComplete(null); setModalError(null); }}
        title="Complete Production Order" size="sm"
        footer={<><button onClick={() => setShowComplete(null)} className="btn-secondary">Cancel</button><button onClick={handleComplete} className="btn-primary">Complete &amp; Issue Stock</button></>}>
        {showComplete && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Completing <span className="font-mono font-medium text-blue-600">{showComplete.doc_number}</span> — {showComplete.material_name}
            </p>
            {showComplete.lot_number && <p className="text-xs text-gray-400">Lot: {showComplete.lot_number}</p>}
            <FormField label="Good Quantity Produced" required>
              <input type="number" step="0.001" value={completedQty} onChange={e => setCompletedQty(e.target.value)} className="input-field" />
              <p className="text-xs text-gray-400 mt-1">Planned: {formatNumber(showComplete.planned_qty)} {showComplete.uom_code}</p>
            </FormField>
            <FormField label="Scrap / Rejected Quantity">
              <input type="number" step="0.001" min="0" value={scrapQty} onChange={e => setScrapQty(e.target.value)} className="input-field" />
              <p className="text-xs text-gray-400 mt-1">Scrap is recorded but not added to stock</p>
            </FormField>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              BOM components will be automatically issued from stock and finished goods receipted.
            </div>
          </div>
        )}
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail}
        onClose={() => { setShowDetail(null); setDetailData(null); setModalError(null); }}
        title={detailData ? `${detailData.doc_number} — ${detailData.material_name}` : 'Production Order'} size="xl">
        {detailData && (
          <div className="space-y-4">
            {/* Production Version Banner */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Production Version (BOM + Routing)</p>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  <span className="text-xs text-gray-500">BOM:</span>
                  <span className="text-xs font-medium text-violet-600">{detailData.bom_name || <span className="text-gray-400 italic">Not assigned</span>}</span>
                </div>
                <span className="text-gray-300">+</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs text-gray-500">Routing:</span>
                  <span className="text-xs font-medium text-amber-600">{detailData.routing_name || <span className="text-gray-400 italic">Not assigned</span>}</span>
                </div>
                <span className="ml-auto text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{detailData.order_type || 'PP01'}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={detailData.status} /></div>
              <div><p className="text-xs text-gray-500">Planned Qty</p><p className="text-sm font-medium">{formatNumber(detailData.planned_qty)} {detailData.uom_code}</p></div>
              <div><p className="text-xs text-gray-500">Completed Qty</p><p className="text-sm font-medium text-emerald-600">{formatNumber(detailData.completed_qty || 0)} {detailData.uom_code}</p></div>
              <div><p className="text-xs text-gray-500">Scrap Qty</p><p className="text-sm font-medium text-red-500">{formatNumber(detailData.scrap_qty || 0)}</p></div>
              <div><p className="text-xs text-gray-500">Priority</p><p className="text-sm capitalize">{detailData.priority}</p></div>
              <div><p className="text-xs text-gray-500">Planned Start</p><p className="text-sm">{formatDate(detailData.planned_start) || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Planned End</p><p className="text-sm">{formatDate(detailData.planned_end) || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Lot # / Plant</p><p className="text-sm font-mono">{detailData.lot_number || '—'} {detailData.plant_code ? `· ${detailData.plant_code}` : ''}</p></div>
            </div>
            {detailData.routing_operations?.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-gray-700">Routing Operations ({detailData.routing_operations.length})</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Op#</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Operation</th>
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Work Center</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">Setup</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">Run</th>
                    </tr></thead>
                    <tbody>
                      {detailData.routing_operations.map((op, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{op.operation_no}</td>
                          <td className="px-3 py-2 font-medium">{op.operation_name}</td>
                          <td className="px-3 py-2 text-violet-600 text-xs">{op.wc_code ? `${op.wc_code} — ${op.wc_name}` : '—'}</td>
                          <td className="px-3 py-2 text-right text-xs">{op.setup_time || 0} {op.time_unit}</td>
                          <td className="px-3 py-2 text-right text-xs">{op.run_time || 0} {op.time_unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {detailData.components?.length > 0 && (
              <>
                <h4 className="text-sm font-semibold text-gray-700">Required Components</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left text-xs text-gray-500">Component</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">Required</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500">In Stock</th>
                        <th className="px-3 py-2 text-center text-xs text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.components.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-3 py-2"><span className="font-mono text-xs text-blue-600">{c.material_code}</span> {c.material_name}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(c.required_qty, 3)} {c.uom_code}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(c.available_stock, 3)}</td>
                          <td className="px-3 py-2 text-center">
                            {c.sufficient
                              ? <span className="text-xs text-emerald-600 font-medium">OK</span>
                              : <span className="text-xs text-red-500 font-medium flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Short</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />

      {/* COMPONENT SHORTAGE MODAL — raised when Start is blocked */}
      <Modal
        error={modalError} onClearError={() => setModalError(null)}
        isOpen={!!shortageOrder}
        onClose={() => { setShortageOrder(null); setShortageDetails([]); setPrResult(null); setModalError(null); }}
        title={`Component Shortage — ${shortageOrder?.doc_number || ''}`}
        size="xl"
        footer={
          prResult ? (
            <button
              onClick={() => { setShortageOrder(null); setShortageDetails([]); setPrResult(null); }}
              className="btn-primary">Done</button>
          ) : (
            <>
              <button onClick={() => { setShortageOrder(null); setShortageDetails([]); setPrResult(null); setModalError(null); }} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleRaiseShortPRs} disabled={raisingPRs} className="btn-primary flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                {raisingPRs ? 'Raising PRs...' : 'Raise Purchase Requisitions'}
              </button>
            </>
          )
        }
      >
        {shortageOrder && !prResult && (
          <div className="space-y-4">
            {/* Warning Banner */}
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Cannot start — insufficient components</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Production order <span className="font-mono font-bold">{shortageOrder.doc_number}</span> for{' '}
                  <span className="font-medium">{shortageOrder.material_name}</span> cannot start because the following components are not available in stock.
                </p>
              </div>
            </div>

            {/* Shortage table */}
            {shortageDetails.length > 0 ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Component</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">Required</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">In Stock</th>
                      <th className="px-3 py-2 text-right text-xs text-red-500">Shortage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortageDetails.map((c, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-blue-600">{c.material_code}</span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">{c.material_name}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-sm">{formatNumber(c.required_qty, 3)} {c.uom_code}</td>
                        <td className="px-3 py-2 text-right text-sm">{formatNumber(c.available_stock, 3)}</td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-red-600">
                          {formatNumber(c.required_qty - c.available_stock, 3)} {c.uom_code}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Loading shortage details…</p>
            )}

            {/* Action explanation */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
              <ShoppingCart className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Raise Purchase Requisitions</p>
                <p className="mt-1">
                  One PR will be created with a line item for each shortage material. The PR will be placed in{' '}
                  <strong>Approved</strong> status and can be converted to a Purchase Order from{' '}
                  <span className="font-medium">Procurement → Requisitions</span>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* PR raised success view */}
        {prResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Purchase Requisition raised successfully
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  PR <span className="font-mono font-bold">{prResult?.data?.pr_doc_number}</span> created with{' '}
                  {prResult?.data?.shortages_count} item(s). Review and convert to PO in Procurement → Requisitions.
                </p>
              </div>
            </div>

            {prResult?.data?.shortages?.length > 0 && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-b">
                      <th className="px-3 py-2 text-left text-xs text-gray-500">Material</th>
                      <th className="px-3 py-2 text-right text-xs text-gray-500">PR Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prResult.data.shortages.map((s, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-blue-600">{s.material_code}</span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">{s.material_name}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-amber-600">
                          {formatNumber(s.shortage_qty, 3)} {s.uom_code}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ArrowRight className="w-3.5 h-3.5" />
              Next step: go to <strong>Procurement → Requisitions</strong> to convert PR {prResult?.data?.pr_doc_number} into a Purchase Order.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
