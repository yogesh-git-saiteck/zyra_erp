import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Truck, RotateCcw, XCircle, Lock, Send } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Alert } from '../../components/common/index';
import ApprovalPanel from '../../components/common/ApprovalPanel';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import { formatDate } from '../../utils/formatters';

const STATUS_COLORS = {
  draft: 'gray', approved: 'blue', issued: 'yellow',
  partially_returned: 'orange', returned: 'green',
  closed: 'green', cancelled: 'red'
};

const PASS_TYPE_COLOR = { RGP: 'blue', NRGP: 'purple' };

const emptyItem = { material_id: '', description: '', quantity: 1, uom_id: '', uom_code: '', serial_number: '', batch_number: '', unit_value: '', remarks: '' };
const emptyForm = {
  pass_type: 'RGP', party_id: '', party_name: '', party_type: 'external',
  purpose: '', issue_date: new Date().toISOString().split('T')[0],
  expected_return_date: '', vehicle_number: '', driver_name: '',
  driver_contact: '', gate_number: '', security_name: '', reference_doc: '',
  notes: '', plant_id: '', items: [{ ...emptyItem }]
};

export default function GatePasses() {
  const { user } = useAuth();
  const [passes, setPasses] = useState([]);
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showDetail, setShowDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [partners, setPartners] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [assets, setAssets] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [plants, setPlants] = useState([]);
  const today = new Date().toISOString().split('T')[0];
  const [showReturnModal, setShowReturnModal] = useState(null);
  const [returnRows, setReturnRows] = useState([]);
  const [showIssueModal, setShowIssueModal] = useState(null);
  const [issueForm, setIssueForm] = useState({});

  useEffect(() => { load(); loadOverview(); loadLookups(); }, [search, typeFilter, statusFilter]);

  const load = async () => {
    try {
      const r = await api.get('/gate-passes', { search, pass_type: typeFilter, status: statusFilter }).catch(() => null);
      setPasses(r?.data || []);
    } finally { setLoading(false); }
  };

  const loadOverview = async () => {
    const r = await api.get('/gate-passes/overview').catch(() => null);
    if (r?.data) setOverview(r.data);
  };

  const loadLookups = async () => {
    const [bp, mat, uom, pl, ast] = await Promise.all([
      api.get('/master/business-partners', { all: true }).catch(() => null),
      api.get('/master/materials', { all: true }).catch(() => null),
      api.get('/master/uom').catch(() => null),
      api.get('/org/plants').catch(() => null),
      api.get('/assets/assets').catch(() => null),
    ]);
    setPartners(bp?.data?.rows || bp?.data || []);
    setMaterials(mat?.data || []);
    setUoms(uom?.data || []);
    setPlants(pl?.data || []);
    setAssets(ast?.data || []);
  };

  const loadDetail = async (id) => {
    const r = await api.get(`/gate-passes/${id}`).catch(() => null);
    if (r?.data) setShowDetail(r.data);
  };

  const flashAlert = (type, msg) => { setAlert({ type, msg }); setTimeout(() => setAlert(null), 4000); };

  const openCreate = () => { setForm({ ...emptyForm, items: [{ ...emptyItem }] }); setEditId(null); setModalError(null); setShowCreate(true); };
  const openEdit = (gp) => {
    setForm({
      ...emptyForm, pass_type: gp.pass_type,
      party_id: gp.party_id || '', party_name: gp.party_name || '',
      party_type: gp.party_type || 'external', purpose: gp.purpose || '',
      issue_date: gp.issue_date?.split('T')[0] || emptyForm.issue_date,
      expected_return_date: gp.expected_return_date?.split('T')[0] || '',
      vehicle_number: gp.vehicle_number || '', driver_name: gp.driver_name || '',
      driver_contact: gp.driver_contact || '', gate_number: gp.gate_number || '',
      security_name: gp.security_name || '', reference_doc: gp.reference_doc || '',
      notes: gp.notes || '', plant_id: gp.plant_id || '',
      items: gp.items?.length ? gp.items.map(i => ({
        material_id: i.material_id || '', description: i.description || '',
        quantity: i.quantity, uom_id: i.uom_id || '', uom_code: i.uom_code || '',
        serial_number: i.serial_number || '', batch_number: i.batch_number || '',
        unit_value: i.unit_value || '', remarks: i.remarks || ''
      })) : [{ ...emptyItem }]
    });
    setEditId(gp.id); setModalError(null); setShowCreate(true);
  };

  const s = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const updateItem = (idx, field, val) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    if (field === 'material_id' && val) {
      // check materials first, then assets
      const mat = materials.find(m => m.id === val);
      if (mat) {
        items[idx].description = mat.material_name;
        items[idx].item_source = 'material';
        const uom = uoms.find(u => u.id === mat.base_uom_id);
        if (uom) { items[idx].uom_id = uom.id; items[idx].uom_code = uom.uom_code; }
      } else {
        const ast = assets.find(a => a.id === val);
        if (ast) { items[idx].description = ast.asset_name; items[idx].item_source = 'asset'; }
      }
    }
    if (field === 'uom_id' && val) {
      const uom = uoms.find(u => u.id === val);
      if (uom) items[idx].uom_code = uom.uom_code;
    }
    setForm(p => ({ ...p, items }));
  };

  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { ...emptyItem }] }));
  const removeItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    if (!form.items.length || !form.items[0].description) { setModalError('Add at least one item'); return; }
    if (form.pass_type === 'RGP' && !form.expected_return_date) { setModalError('Expected return date is required for RGP'); return; }
    setSaving(true); setModalError(null);
    try {
      if (editId) {
        await api.put(`/gate-passes/${editId}`, form);
        flashAlert('success', 'Gate pass updated');
      } else {
        const r = await api.post('/gate-passes', form);
        flashAlert('success', `${r.data?.doc_number || 'Gate pass'} created`);
      }
      setShowCreate(false); load(); loadOverview();
    } catch (e) { setModalError(e.message || 'Failed to save'); } finally { setSaving(false); }
  };

  const doSubmit = async (id) => {
    const r = await api.post('/workflow/submit', { entity_type: 'gate_pass', entity_id: id }).catch(e => { flashAlert('error', e.message); return null; });
    if (!r) return;
    flashAlert('success', 'Submitted for approval'); loadDetail(id); load(); loadOverview();
  };

  const doApprove = async (id) => {
    const r = await api.post(`/gate-passes/${id}/approve`).catch(e => { flashAlert('error', e.message); return null; });
    if (!r) return;
    flashAlert('success', 'Approved'); loadDetail(id); load(); loadOverview();
  };

  const openIssue = (gp) => { setIssueForm({ gate_number: gp.gate_number || '', security_name: gp.security_name || '', vehicle_number: gp.vehicle_number || '', driver_name: gp.driver_name || '' }); setShowIssueModal(gp); };

  const doIssue = async () => {
    if (!showIssueModal) return;
    await api.post(`/gate-passes/${showIssueModal.id}/issue`, issueForm).catch(e => { flashAlert('error', e.message); return null; });
    flashAlert('success', 'Gate pass issued — goods released'); setShowIssueModal(null);
    loadDetail(showIssueModal.id); load(); loadOverview();
  };

  const openReturn = (gp) => {
    setReturnRows(gp.items.filter(i => parseFloat(i.quantity) - parseFloat(i.returned_qty) > 0).map(i => ({
      gate_pass_item_id: i.id, description: i.description,
      max_qty: parseFloat(i.quantity) - parseFloat(i.returned_qty),
      returned_qty: parseFloat(i.quantity) - parseFloat(i.returned_qty),
      condition: 'good', notes: ''
    })));
    setShowReturnModal(gp);
  };

  const doReturn = async () => {
    if (!showReturnModal) return;
    const returns = returnRows.filter(r => parseFloat(r.returned_qty) > 0);
    if (!returns.length) { flashAlert('error', 'Enter return quantity'); return; }
    await api.post(`/gate-passes/${showReturnModal.id}/return`, { returns }).catch(e => { flashAlert('error', e.message); return null; });
    flashAlert('success', 'Return recorded'); setShowReturnModal(null);
    loadDetail(showReturnModal.id); load(); loadOverview();
  };

  const doClose = async (id) => {
    await api.post(`/gate-passes/${id}/close`).catch(e => { flashAlert('error', e.message); return null; });
    flashAlert('success', 'Gate pass closed'); loadDetail(id); load(); loadOverview();
  };

  const doCancel = async (id) => {
    if (!window.confirm('Cancel this gate pass?')) return;
    await api.post(`/gate-passes/${id}/cancel`).catch(e => { flashAlert('error', e.message); return null; });
    flashAlert('success', 'Cancelled'); setShowDetail(null); load(); loadOverview();
  };

  const columns = [
    { key: 'doc_number', label: 'Doc No.' },
    { key: 'pass_type', label: 'Type', render: (val) => (
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${val === 'RGP' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{val}</span>
    )},
    { key: 'party_display', label: 'Party', render: (val, row) => val || row.party_name || '—' },
    { key: 'purpose', label: 'Purpose', render: (val) => val ? (val.length > 40 ? val.slice(0, 40) + '…' : val) : '—' },
    { key: 'issue_date', label: 'Issue Date', render: (val) => formatDate(val) },
    { key: 'expected_return_date', label: 'Return By', render: (val, row) => row.pass_type === 'RGP' ? (val ? formatDate(val) : '—') : 'N/A' },
    { key: 'item_count', label: 'Items', render: (val) => val || 0 },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    { key: 'id', label: '', render: (val, row) => (
      <button onClick={e => { e.stopPropagation(); loadDetail(row.id); }} className="text-blue-600 hover:underline text-xs">View</button>
    )}
  ];

  const isOverdue = (gp) => gp?.pass_type === 'RGP' && ['issued','partially_returned'].includes(gp.status) && gp.expected_return_date && new Date(gp.expected_return_date) < new Date();

  return (
    <div className="p-6 space-y-4">
      {alert && <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />}

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'RGP Issued', value: overview.rgp_issued || 0, color: 'blue' },
          { label: 'NRGP Issued', value: overview.nrgp_issued || 0, color: 'purple' },
          { label: 'Pending Returns', value: overview.partial_returns || 0, color: 'orange' },
          { label: 'Overdue RGP', value: overview.overdue || 0, color: 'red' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-lg border p-4 flex flex-col`}>
            <span className="text-xs text-gray-500">{c.label}</span>
            <span className={`text-2xl font-bold text-${c.color}-600`}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search doc, party, vehicle…" />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">All Types</option>
            <option value="RGP">RGP</option>
            <option value="NRGP">NRGP</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="issued">Issued</option>
            <option value="partially_returned">Partially Returned</option>
            <option value="returned">Returned</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">
          <Plus size={14} /> New Gate Pass
        </button>
      </div>

      <DataTable columns={columns} data={passes} loading={loading}
        onRowClick={r => { setShowDetail({ id: r.id, doc_number: r.doc_number }); loadDetail(r.id); }}
        emptyMessage="No gate passes found" />

      {/* ── Detail Modal ─────────────────────────────────────────────────── */}
      {showDetail && (
        <Modal isOpen={!!showDetail} onClose={() => setShowDetail(null)}
          title={`Gate Pass — ${showDetail.doc_number || '…'}`} size="xl">
          {showDetail.id && <DetailView
            data={showDetail}
            onSubmit={doSubmit} onApprove={doApprove} onIssue={openIssue} onReturn={openReturn}
            onClose={doClose} onCancel={doCancel} onEdit={openEdit}
            onRefresh={(id) => { loadDetail(id); load(); loadOverview(); }}
            isOverdue={isOverdue} />}
        </Modal>
      )}

      {/* ── Create / Edit Modal ───────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}
        title={editId ? 'Edit Gate Pass' : 'New Gate Pass'} size="xl">
        <div className="space-y-4">
          {modalError && <Alert type="error" message={modalError} />}

          {/* Row 1: Pass Type + Issue Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pass Type *</label>
              <div className="flex gap-4 mt-1">
                {['RGP','NRGP'].map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="pass_type" value={t}
                      checked={form.pass_type === t} onChange={() => s('pass_type', t)} />
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${t === 'RGP' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{t}</span>
                    <span className="text-xs text-gray-600">{t === 'RGP' ? 'Returnable' : 'Non-Returnable'}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Issue Date *</label>
              <input type="date" value={form.issue_date} min={today}
                onChange={e => s('issue_date', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* Row 2: Party select + free text */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Party (Business Partner)</label>
              <select value={form.party_id} onChange={e => {
                const bp = partners.find(p => p.id === e.target.value);
                s('party_id', e.target.value);
                if (bp) s('party_name', bp.display_name);
                else if (!e.target.value) s('party_name', '');
              }} className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="">— Select from list —</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.display_name} ({p.bp_number})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Party Name <span className="text-gray-400 font-normal">(type if not in list)</span></label>
              <input value={form.party_name} onChange={e => { s('party_name', e.target.value); if (!e.target.value) s('party_id', ''); }}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. External Visitor / Contractor" />
            </div>
          </div>

          {/* Row 3: Purpose + Reference */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Purpose / Reason *</label>
              <input value={form.purpose} onChange={e => s('purpose', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. Repair, Exhibition, Sample, Return to Vendor" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Reference Document</label>
              <input value={form.reference_doc} onChange={e => s('reference_doc', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="PO No / SO No / Job Order No" />
            </div>
          </div>

          {/* RGP: Expected return date */}
          {form.pass_type === 'RGP' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expected Return Date *</label>
                <input type="date" value={form.expected_return_date} min={today}
                  onChange={e => s('expected_return_date', e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
          )}

          {/* Row 4: Vehicle + Driver + Contact */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle Number</label>
              <input value={form.vehicle_number} onChange={e => s('vehicle_number', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. TN01AB1234" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Driver Name</label>
              <input value={form.driver_name} onChange={e => s('driver_name', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Driver full name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Driver Contact</label>
              <input value={form.driver_contact} onChange={e => s('driver_contact', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Mobile number" />
            </div>
          </div>

          {/* Row 5: Gate + Security + Plant */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Gate No.</label>
              <input value={form.gate_number} onChange={e => s('gate_number', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="e.g. Gate 1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Security Personnel</label>
              <input value={form.security_name} onChange={e => s('security_name', e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Security officer name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plant</label>
              <select value={form.plant_id} onChange={e => s('plant_id', e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm">
                <option value="">— Select Plant —</option>
                {plants.map(p => <option key={p.id} value={p.id}>{p.plant_name}</option>)}
              </select>
            </div>
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Items / Materials</span>
              <button onClick={addItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus size={12} /> Add Item</button>
            </div>
            <div className="border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left min-w-[180px]">Material / Asset</th>
                    <th className="p-2 text-left min-w-[140px]">Description *</th>
                    <th className="p-2 text-right w-20">Qty *</th>
                    <th className="p-2 text-left w-24">UOM</th>
                    <th className="p-2 text-left min-w-[100px]">Serial / Batch</th>
                    <th className="p-2 text-right w-24">Value (₹)</th>
                    <th className="p-2 text-left min-w-[100px]">Remarks</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1">
                        <select value={it.material_id} onChange={e => updateItem(idx, 'material_id', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs">
                          <option value="">— Select —</option>
                          {materials.length > 0 && <optgroup label="Materials">
                            {materials.map(m => <option key={m.id} value={m.id}>{m.material_code} — {m.material_name}</option>)}
                          </optgroup>}
                          {assets.length > 0 && <optgroup label="Assets">
                            {assets.map(a => <option key={a.id} value={a.id}>{a.asset_code} — {a.asset_name}</option>)}
                          </optgroup>}
                        </select>
                      </td>
                      <td className="p-1">
                        <input value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs" placeholder="Description" />
                      </td>
                      <td className="p-1">
                        <input type="number" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs text-right" min="0.001" step="any" />
                      </td>
                      <td className="p-1">
                        <select value={it.uom_id} onChange={e => updateItem(idx, 'uom_id', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs">
                          <option value="">—</option>
                          {uoms.map(u => <option key={u.id} value={u.id}>{u.uom_code}</option>)}
                        </select>
                      </td>
                      <td className="p-1">
                        <input value={it.serial_number} onChange={e => updateItem(idx, 'serial_number', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs" placeholder="Serial / Batch" />
                      </td>
                      <td className="p-1">
                        <input type="number" value={it.unit_value} onChange={e => updateItem(idx, 'unit_value', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs text-right" min="0" step="any" placeholder="0.00" />
                      </td>
                      <td className="p-1">
                        <input value={it.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-xs" placeholder="Remarks" />
                      </td>
                      <td className="p-1 text-center">
                        {form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><XCircle size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => s('notes', e.target.value)} rows={3}
              className="w-full border rounded px-2 py-1.5 text-sm resize-none" placeholder="Any additional notes or instructions…" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowCreate(false)} className="px-4 py-1.5 border rounded text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : editId ? 'Update' : 'Create Gate Pass'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Issue Modal ───────────────────────────────────────────────────── */}
      <Modal isOpen={!!showIssueModal} onClose={() => setShowIssueModal(null)} title="Issue Gate Pass — Confirm Gate Release" size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Confirm vehicle and security details at the gate before releasing goods.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Gate Number', key: 'gate_number', placeholder: 'e.g. Gate 1' },
              { label: 'Security Personnel', key: 'security_name', placeholder: 'Officer name' },
              { label: 'Vehicle Number', key: 'vehicle_number', placeholder: 'e.g. TN01AB1234' },
              { label: 'Driver Name', key: 'driver_name', placeholder: 'Driver full name' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                <input value={issueForm[f.key] || ''} onChange={e => setIssueForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm" placeholder={f.placeholder} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowIssueModal(null)} className="px-4 py-1.5 border rounded text-sm">Cancel</button>
            <button onClick={doIssue} className="px-4 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 flex items-center gap-1">
              <Truck size={14} /> Release Goods
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Return Modal (RGP) ────────────────────────────────────────────── */}
      <Modal isOpen={!!showReturnModal} onClose={() => setShowReturnModal(null)} title="Record Return — RGP" size="lg">
        <div className="space-y-3">
          <div className="border rounded overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Item</th>
                  <th className="p-2 text-right">Pending Qty</th>
                  <th className="p-2 text-right">Returning Qty</th>
                  <th className="p-2">Condition</th>
                  <th className="p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {returnRows.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{r.description}</td>
                    <td className="p-2 text-right">{r.max_qty}</td>
                    <td className="p-2">
                      <input type="number" value={r.returned_qty}
                        onChange={e => { const rr = [...returnRows]; rr[idx].returned_qty = Math.min(parseFloat(e.target.value)||0, r.max_qty); setReturnRows(rr); }}
                        className="w-20 border rounded px-1 py-0.5 text-xs text-right" min="0" max={r.max_qty} step="any" />
                    </td>
                    <td className="p-2">
                      <select value={r.condition} onChange={e => { const rr = [...returnRows]; rr[idx].condition = e.target.value; setReturnRows(rr); }}
                        className="border rounded px-1 py-0.5 text-xs">
                        <option value="good">Good</option>
                        <option value="damaged">Damaged</option>
                        <option value="partial">Partial</option>
                        <option value="lost">Lost</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input value={r.notes} onChange={e => { const rr = [...returnRows]; rr[idx].notes = e.target.value; setReturnRows(rr); }}
                        className="w-full border rounded px-1 py-0.5 text-xs" placeholder="Optional remarks" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button onClick={() => setShowReturnModal(null)} className="px-4 py-1.5 border rounded text-sm">Cancel</button>
            <button onClick={doReturn} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1">
              <RotateCcw size={14} /> Record Return
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Detail sub-component ──────────────────────────────────────────────────────
function DetailView({ data, onSubmit, onApprove, onIssue, onReturn, onClose, onCancel, onEdit, onRefresh, isOverdue }) {
  const gp = data;

  if (!gp || !gp.items) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const overdue = isOverdue(gp);

  return (
    <div className="space-y-4 p-1">
      {overdue && (
        <div className="bg-red-50 border border-red-300 rounded p-2 text-red-700 text-sm flex items-center gap-2">
          <span className="font-semibold">⚠ Overdue!</span> Expected return was {formatDate(gp.expected_return_date)}
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Info label="Doc No." value={gp.doc_number} />
        <Info label="Type" value={
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${gp.pass_type === 'RGP' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{gp.pass_type}</span>
        } />
        <Info label="Status" value={<StatusBadge status={gp.status} />} />
        <Info label="Plant" value={gp.plant_name || '—'} />
        <Info label="Party" value={gp.party_display || gp.party_name || '—'} />
        <Info label="Purpose" value={gp.purpose || '—'} />
        <Info label="Issue Date" value={formatDate(gp.issue_date)} />
        {gp.pass_type === 'RGP' && <Info label="Return By" value={formatDate(gp.expected_return_date)} />}
        {gp.actual_return_date && <Info label="Actual Return" value={formatDate(gp.actual_return_date)} />}
        <Info label="Vehicle" value={gp.vehicle_number || '—'} />
        <Info label="Driver" value={gp.driver_name || '—'} />
        {gp.driver_contact && <Info label="Driver Contact" value={gp.driver_contact} />}
        {gp.gate_number && <Info label="Gate" value={gp.gate_number} />}
        {gp.security_name && <Info label="Security" value={gp.security_name} />}
        {gp.reference_doc && <Info label="Ref. Doc" value={gp.reference_doc} />}
        <Info label="Created By" value={gp.created_by_name || '—'} />
        {gp.approved_by_name && <Info label="Approved By" value={gp.approved_by_name} />}
        {gp.issued_by_name && <Info label="Issued By" value={gp.issued_by_name} />}
      </div>

      {gp.notes && <div className="text-sm text-gray-600 bg-gray-50 rounded p-2"><span className="font-medium">Notes: </span>{gp.notes}</div>}

      {/* Items */}
      <div>
        <div className="font-semibold text-sm mb-1 text-gray-700">Items</div>
        <table className="w-full text-xs border rounded overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Material / Description</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-left">UOM</th>
              {gp.pass_type === 'RGP' && <th className="p-2 text-right">Returned</th>}
              {gp.pass_type === 'RGP' && <th className="p-2 text-right">Pending</th>}
              <th className="p-2 text-left">Serial / Batch</th>
              <th className="p-2 text-right">Value</th>
              <th className="p-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {gp.items?.map((it, i) => (
              <tr key={it.id} className="border-t">
                <td className="p-2">{i + 1}</td>
                <td className="p-2">{it.material_code ? `${it.material_code} — ` : ''}{it.description}</td>
                <td className="p-2 text-right">{it.quantity}</td>
                <td className="p-2">{it.uom_code || it.uom_code_ref || '—'}</td>
                {gp.pass_type === 'RGP' && <td className="p-2 text-right text-green-700">{it.returned_qty || 0}</td>}
                {gp.pass_type === 'RGP' && <td className="p-2 text-right text-orange-600">{Math.max(0, parseFloat(it.quantity) - parseFloat(it.returned_qty || 0))}</td>}
                <td className="p-2">{[it.serial_number, it.batch_number].filter(Boolean).join(' / ') || '—'}</td>
                <td className="p-2 text-right">{it.unit_value ? `₹${parseFloat(it.unit_value).toLocaleString()}` : '—'}</td>
                <td className="p-2">{it.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Return history (RGP) */}
      {gp.pass_type === 'RGP' && gp.returns?.length > 0 && (
        <div>
          <div className="font-semibold text-sm mb-1 text-gray-700">Return History</div>
          <table className="w-full text-xs border rounded overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2">Condition</th>
                <th className="p-2">Received By</th>
                <th className="p-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {gp.returns.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{formatDate(r.return_date)}</td>
                  <td className="p-2 text-right">{r.returned_qty}</td>
                  <td className="p-2 capitalize">{r.condition}</td>
                  <td className="p-2">{r.received_by_name || '—'}</td>
                  <td className="p-2">{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approval Panel — shows pending approvers when in workflow */}
      {gp.status === 'pending_approval' && (
        <ApprovalPanel
          document={{ ...gp, entity_type: 'gate_pass' }}
          onApprove={() => onRefresh(gp.id)}
          onReject={() => onRefresh(gp.id)}
        />
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {gp.status === 'draft' && (
          <>
            <button onClick={() => onSubmit(gp.id)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Send size={14} /> Submit for Approval
            </button>
            <button onClick={() => onApprove(gp.id)} className="flex items-center gap-1 px-3 py-1.5 border border-blue-400 text-blue-600 rounded text-sm hover:bg-blue-50">
              <CheckCircle size={14} /> Direct Approve
            </button>
            <button onClick={() => onEdit(gp)} className="flex items-center gap-1 px-3 py-1.5 border rounded text-sm hover:bg-gray-50">
              Edit
            </button>
          </>
        )}
        {gp.status === 'approved' && (
          <button onClick={() => onIssue(gp)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700">
            <Truck size={14} /> Issue at Gate
          </button>
        )}
        {gp.pass_type === 'RGP' && ['issued','partially_returned'].includes(gp.status) && (
          <button onClick={() => onReturn(gp)} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">
            <RotateCcw size={14} /> Record Return
          </button>
        )}
        {['issued','partially_returned','returned','approved'].includes(gp.status) && (
          <button onClick={() => onClose(gp.id)} className="flex items-center gap-1 px-3 py-1.5 border border-gray-400 rounded text-sm hover:bg-gray-50">
            <Lock size={14} /> Close
          </button>
        )}
        {!['closed','cancelled','returned','pending_approval'].includes(gp.status) && (
          <button onClick={() => onCancel(gp.id)} className="flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50 ml-auto">
            <XCircle size={14} /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
