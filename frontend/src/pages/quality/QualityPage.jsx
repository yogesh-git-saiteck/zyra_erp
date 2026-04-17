import { useState, useEffect} from 'react';
import { Plus, Eye, CheckCircle, XCircle, AlertTriangle ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge, Tabs ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate } from '../../utils/formatters';
import { ExportButton } from '../../components/common/SharedFeatures';

export default function QualityPage() {
  const [tab, setTab] = useState('inspections');
  const [selectedIds, setSelectedIds] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showNcrForm, setShowNcrForm] = useState(false);
  const [showResult, setShowResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [plants, setPlants] = useState([]);
  const [users, setUsers] = useState([]);
  const emptyForm = { material_id:'', plant_id:'', quantity:'', sample_size:'', inspection_type:'incoming', notes:'' };
  const [form, setForm] = useState(emptyForm);
  const emptyNcr = { inspection_id:'', ncr_type:'material', severity:'minor', description:'', assigned_to:'' };
  const [ncrForm, setNcrForm] = useState(emptyNcr);
  const [resultForm, setResultForm] = useState({ result:'pass', notes:'', accepted_qty:'', rejected_qty:'0', rejection_reason:'', criteria:[] });

  useEffect(() => { loadData(); loadLookups(); }, [tab, search]);
  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'inspections') setInspections((await api.get('/quality/inspections', { search }).catch(()=>null))?.data || []);
      else setNcrs((await api.get('/quality/ncr', { search }).catch(()=>null))?.data || []);
    } catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [m, p, u] = await Promise.all([api.get('/master/materials', { all: true }).catch(()=>null), api.get('/master/plants').catch(()=>null), api.get('/auth/users').catch(()=>null)]);
      setMaterials(m?.data || []); setPlants(p?.data || []); setUsers(u?.data || []);
    } catch {}
  };
  const loadDetail = async (id) => { try { setShowDetail((await api.get(`/quality/inspections/${id}`).catch(()=>null))?.data); } catch (e) { setModalError(e.message); } };
  const handleCreate = async (e) => {
    e?.preventDefault(); setSaving(true);
    try { await api.post('/quality/inspections', form); setShowCreate(false); setForm(emptyForm); setAlert({ type:'success', message:'Created' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const openResult = (insp) => {
    setShowResult(insp);
    setResultForm({ result:'pass', notes:'', accepted_qty: insp.quantity||'', rejected_qty:'0', rejection_reason:'',
      criteria: [{ parameter_name:'Visual Inspection', specification:'No defects', actual_value:'', result:'pending', remarks:'' },
                 { parameter_name:'Dimensional Check', specification:'Within tolerance', actual_value:'', result:'pending', remarks:'' }] });
  };
  const addCriterion = () => setResultForm({...resultForm, criteria: [...resultForm.criteria, { parameter_name:'', specification:'', actual_value:'', result:'pending', remarks:'' }]});
  const updateCriterion = (idx, field, val) => { const c = [...resultForm.criteria]; c[idx] = {...c[idx], [field]: val}; setResultForm({...resultForm, criteria: c}); };
  const handleResult = async () => {
    setSaving(true);
    try {
      if (resultForm.criteria.length) await api.post(`/quality/inspections/${showResult.id}/criteria`, { criteria: resultForm.criteria });
      await api.post(`/quality/inspections/${showResult.id}/result`, resultForm);
      setShowResult(null); setAlert({ type:'success', message:`Inspection ${resultForm.result}` }); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleCreateNcr = async () => {
    setSaving(true);
    try { await api.post('/quality/ncr', ncrForm); setShowNcrForm(false); setAlert({ type:'success', message:'NCR raised' }); setTab('ncr'); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleNcrUpdate = async (id, data) => {
    try { await api.put(`/quality/ncr/${id}`, data); setAlert({ type:'success', message:'Updated' }); loadData(); } catch (err) { setModalError(err.message); }
  };

  const inspCols = [
    { key: 'doc_number', label: '#', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'material_name', label: 'Material', render: v => <span className="font-medium">{v}</span> },
    { key: 'inspection_type', label: 'Type', render: v => <span className="capitalize text-xs">{v||'incoming'}</span> },
    { key: 'quantity', label: 'Qty', className: 'text-right' },
    { key: 'accepted_qty', label: 'Accepted', className: 'text-right', render: v => v != null ? <span className="text-green-600">{v}</span> : '—' },
    { key: 'rejected_qty', label: 'Rejected', className: 'text-right', render: v => parseFloat(v||0) > 0 ? <span className="text-red-600">{v}</span> : '—' },
    { key: 'result', label: 'Result', render: v => !v ? <span className="text-gray-400">Pending</span> : v==='pass' ? <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5"/>Pass</span> : <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3.5 h-3.5"/>Fail</span> },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      <button onClick={() => loadDetail(v)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Eye className="w-4 h-4"/></button>
      {!row.result && <button onClick={() => openResult(row)} className="p-1 hover:bg-green-50 rounded text-green-600" title="Record result"><CheckCircle className="w-4 h-4"/></button>}
    </div> },
      { key: '_del', label: '', render: (v, row) => {row.status === 'pending' && <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>} },
      { key: '_del', label: '', render: (v, row) => {row.status === 'pending' && <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>} },
  ];
  const ncrCols = [
    { key: 'ncr_number', label: 'NCR #', render: v => <span className="font-mono text-red-700 font-medium">{v}</span> },
    { key: 'material_name', label: 'Material' },
    { key: 'severity', label: 'Severity', render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium ${v==='critical'?'bg-red-100 text-red-700':v==='major'?'bg-orange-100 text-orange-700':'bg-yellow-100 text-yellow-700'}`}>{v}</span> },
    { key: 'description', label: 'Description', render: v => <span className="text-sm truncate max-w-[200px] block">{v}</span> },
    { key: 'assigned_to_name', label: 'Assigned To' },
    { key: 'status', label: 'Status', render: (v, row) => <select value={v} onChange={e => handleNcrUpdate(row.id, { status: e.target.value })} className="text-xs border rounded px-1 py-0.5 bg-white"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select> },
    { key: 'created_at', label: 'Raised', render: v => formatDate(v) },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/quality/inspections/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/quality/bulk-delete', { entity: 'inspections', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };



  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Quality Management</h1><p className="text-sm text-gray-400 mt-1">Inspections, criteria, NCR workflow</p></div>
        <div className="flex gap-2"><ExportButton entity="inspections"/>
          {tab === 'inspections' && <><DownloadButton data={inspections} filename="QualityPage" /><button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Inspection</button></>}
          {tab === 'ncr' && <button onClick={() => { setNcrForm(emptyNcr); setShowNcrForm(true); }} className="btn-primary flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Raise NCR</button>}
        </div>
      </div>
      <Tabs tabs={[{key:'inspections',label:'Inspections'},{key:'ncr',label:'NCR Reports'}]} active={tab} onChange={t => { setTab(t); setSearch(''); }}/>
      <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        {tab === 'inspections' ? <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={inspCols} data={inspections} loading={loading}/> : <DataTable columns={ncrCols} data={ncrs} loading={loading} emptyMessage="No NCR reports."/>}
      </div>

      {/* CREATE INSPECTION */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} title="Create Inspection" size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving?'Creating...':'Create'}</button></>}>
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Type"><select value={form.inspection_type} onChange={e=>setForm({...form,inspection_type:e.target.value})} className="select-field"><option value="incoming">Incoming</option><option value="in_process">In-Process</option><option value="final">Final</option><option value="outgoing">Outgoing</option></select></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Material" required><select value={form.material_id} onChange={e=>setForm({...form,material_id:e.target.value})} className="select-field" required><option value="">Select...</option>{materials.map(m=><option key={m.id} value={m.id}>{m.material_code} - {m.material_name}</option>)}</select></FormField>
            <FormField label="Plant"><select value={form.plant_id} onChange={e=>setForm({...form,plant_id:e.target.value})} className="select-field"><option value="">Select...</option>{plants.map(p=><option key={p.id} value={p.id}>{p.plant_code} - {p.plant_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Quantity"><input type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} className="input-field"/></FormField>
            <FormField label="Sample Size"><input type="number" value={form.sample_size} onChange={e=>setForm({...form,sample_size:e.target.value})} className="input-field"/></FormField>
          </div>
          <FormField label="Notes"><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="input-field" rows={2}/></FormField>
        </form>
      </Modal>

      {/* RECORD RESULT + CRITERIA */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showResult} onClose={() => setShowResult(null)} title={`Record Result — ${showResult?.doc_number}`} size="xl"
        footer={<><button onClick={() => setShowResult(null)} className="btn-secondary">Cancel</button><button onClick={handleResult} disabled={saving} className="btn-primary">{saving?'Saving...':'Record Result'}</button></>}>
        {showResult && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Result"><select value={resultForm.result} onChange={e=>setResultForm({...resultForm,result:e.target.value})} className="select-field"><option value="pass">Pass</option><option value="fail">Fail</option><option value="conditional">Conditional</option></select></FormField>
            <FormField label="Accepted Qty"><input type="number" value={resultForm.accepted_qty} onChange={e=>setResultForm({...resultForm,accepted_qty:e.target.value})} className="input-field"/></FormField>
            <FormField label="Rejected Qty"><input type="number" value={resultForm.rejected_qty} onChange={e=>setResultForm({...resultForm,rejected_qty:e.target.value})} className="input-field"/></FormField>
            <FormField label="Rejection Reason"><input value={resultForm.rejection_reason} onChange={e=>setResultForm({...resultForm,rejection_reason:e.target.value})} className="input-field"/></FormField>
          </div>
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-gray-700">Inspection Criteria</h3><button type="button" onClick={addCriterion} className="text-xs text-blue-600 font-medium">+ Add Parameter</button></div>
            <table className="w-full text-xs border rounded overflow-hidden"><thead><tr className="bg-gray-50 text-gray-500"><th className="px-2 py-1.5 text-left">Parameter</th><th className="px-2 py-1.5 text-left">Specification</th><th className="px-2 py-1.5 text-left">Actual</th><th className="px-2 py-1.5 text-left w-20">Result</th><th className="px-2 py-1.5 text-left">Remarks</th></tr></thead>
            <tbody>{resultForm.criteria.map((c, idx) => (
              <tr key={idx} className="border-t"><td className="px-1 py-1"><input value={c.parameter_name} onChange={e=>updateCriterion(idx,'parameter_name',e.target.value)} className="input-field text-xs" placeholder="e.g. Hardness"/></td>
              <td className="px-1 py-1"><input value={c.specification} onChange={e=>updateCriterion(idx,'specification',e.target.value)} className="input-field text-xs"/></td>
              <td className="px-1 py-1"><input value={c.actual_value} onChange={e=>updateCriterion(idx,'actual_value',e.target.value)} className="input-field text-xs"/></td>
              <td className="px-1 py-1"><select value={c.result} onChange={e=>updateCriterion(idx,'result',e.target.value)} className="select-field text-xs"><option value="pending">—</option><option value="pass">Pass</option><option value="fail">Fail</option></select></td>
              <td className="px-1 py-1"><input value={c.remarks} onChange={e=>updateCriterion(idx,'remarks',e.target.value)} className="input-field text-xs"/></td></tr>
            ))}</tbody></table>
          </div>
          <FormField label="Notes"><textarea value={resultForm.notes} onChange={e=>setResultForm({...resultForm,notes:e.target.value})} className="input-field" rows={2}/></FormField>
        </div>}
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail ? `Inspection — ${showDetail.doc_number}` : ''} size="xl"
        footer={<>{!showDetail?.result && <button onClick={() => { openResult(showDetail); setShowDetail(null); }} className="btn-primary">Record Result</button>}
          {showDetail?.result === 'fail' && <button onClick={() => { setNcrForm({...emptyNcr, inspection_id: showDetail.id}); setShowNcrForm(true); setShowDetail(null); }} className="btn-primary flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Raise NCR</button>}
          <button onClick={() => setShowDetail(null)} className="btn-secondary">Close</button></>}>
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Material</p><p className="font-medium">{showDetail.material_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Type</p><p className="capitalize">{showDetail.inspection_type||'incoming'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Qty</p><p>{showDetail.quantity}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Result</p>{showDetail.result ? <StatusBadge status={showDetail.result}/> : <span className="text-gray-400">Pending</span>}</div>
          </div>
          {showDetail.criteria?.length > 0 && <><h3 className="text-sm font-semibold text-gray-700">Criteria</h3>
            <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b"><th className="text-left py-1">Parameter</th><th className="text-left">Spec</th><th className="text-left">Actual</th><th className="text-left">Result</th></tr></thead>
            <tbody>{showDetail.criteria.map((c,i) => <tr key={i} className="border-b border-gray-100"><td className="py-1.5 font-medium">{c.parameter_name}</td><td>{c.specification}</td><td>{c.actual_value||'—'}</td>
              <td><span className={`px-1.5 py-0.5 rounded text-xs ${c.result==='pass'?'bg-green-100 text-green-700':c.result==='fail'?'bg-red-100 text-red-700':'bg-gray-100'}`}>{c.result}</span></td></tr>)}</tbody></table></>}
        </div>}
      </Modal>

      {/* NCR FORM */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showNcrForm} onClose={() => setShowNcrForm(false)} title="Raise NCR" size="xl"
        footer={<><button onClick={() => setShowNcrForm(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateNcr} disabled={saving} className="btn-primary">{saving?'Raising...':'Raise NCR'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type"><select value={ncrForm.ncr_type} onChange={e=>setNcrForm({...ncrForm,ncr_type:e.target.value})} className="select-field"><option value="material">Material</option><option value="process">Process</option><option value="supplier">Supplier</option></select></FormField>
            <FormField label="Severity"><select value={ncrForm.severity} onChange={e=>setNcrForm({...ncrForm,severity:e.target.value})} className="select-field"><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></FormField>
          </div>
          <FormField label="Description" required><textarea value={ncrForm.description} onChange={e=>setNcrForm({...ncrForm,description:e.target.value})} className="input-field" rows={3} required/></FormField>
          <FormField label="Assigned To"><select value={ncrForm.assigned_to} onChange={e=>setNcrForm({...ncrForm,assigned_to:e.target.value})} className="select-field"><option value="">Select...</option>{users.map(u=><option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></FormField>
        </div>
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.doc_number} />
    </div>
  );
}
