import { useState, useEffect} from 'react';
import { Plus, Trophy, Edit2, XCircle, CheckCircle, Phone, Mail, Calendar, MessageSquare, LayoutGrid, List ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert, PageLoader ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import { ExportButton } from '../../components/common/SharedFeatures';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import CRMKanban from './CRMKanban';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const STAGES = ['prospect', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
const STAGE_COLORS = { prospect: '#94a3b8', qualification: '#3b82f6', proposal: '#8b5cf6', negotiation: '#f59e0b', closed_won: '#10b981', closed_lost: '#ef4444' };

export default function CRMPage() {
  const [tab, setTab] = useState('opportunities');
  const [selectedIds, setSelectedIds] = useState([]);
  const [opps, setOpps] = useState([]);
  const [activities, setActivities] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showCreateActivity, setShowCreateActivity] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ opportunity_name: '', customer_id: '', stage: 'prospect', probability: 10, expected_value: '', expected_close: '', source: '', description: '' });
  const [actForm, setActForm] = useState({ activity_type: 'call', subject: '', description: '', bp_id: '', due_date: '' });

  useEffect(() => { loadData(); loadLookups(); }, [stageFilter, search, tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'opportunities') {
        const [o, p] = await Promise.all([
          api.get('/crm/opportunities', { stage: stageFilter, search }).catch(()=>null),
          api.get('/crm/pipeline').catch(()=>null)
        ]);
        setOpps(o?.data || []); setPipeline(p?.data || []);
      } else {
        const res = await api.get('/crm/activities', { status: stageFilter === 'completed' ? 'completed' : stageFilter === 'open' ? 'open' : '' }).catch(()=>null);
        setActivities(res?.data || []);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try { const c = await api.get('/master/business-partners', { type: 'customer', all: true }).catch(()=>null); setCustomers(c?.data?.rows || []); } catch {}
  };

  const handleCreateOpp = async () => {
    if (!form.opportunity_name || !form.customer_id) { setAlert({ type: 'error', message: 'Name and customer required' }); return; }
    setSaving(true);
    try {
      if (editId) { await api.put(`/crm/opportunities/${editId}`, form); } else { await api.post('/crm/opportunities', form); } setShowCreate(false);
      setForm({ opportunity_name: '', customer_id: '', stage: 'prospect', probability: 10, expected_value: '', expected_close: '', source: '', description: '' });
      setAlert({ type: 'success', message: 'Opportunity created' }); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleWon = async (id) => {
    try { await api.post(`/crm/opportunities/${id}/won`); setAlert({ type: 'success', message: 'Marked as Won!' }); loadData(); }
    catch (err) { setModalError(err.message); }
  };
  const handleLost = async (id) => {
    try { await api.post(`/crm/opportunities/${id}/lost`, { lost_reason: 'Lost to competitor' }); setAlert({ type: 'success', message: 'Marked as Lost' }); loadData(); }
    catch (err) { setModalError(err.message); }
  };

  const handleCreateActivity = async () => {
    setSaving(true);
    try {
      await api.post('/crm/activities', actForm); setShowCreateActivity(false);
      setActForm({ activity_type: 'call', subject: '', description: '', bp_id: '', due_date: '' });
      setAlert({ type: 'success', message: 'Activity created' }); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleCompleteActivity = async (id) => {
    try { await api.post(`/crm/activities/${id}/complete`); loadData(); } catch {}
  };

  const oppColumns = [
    { key: 'opportunity_name', label: 'Opportunity', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'customer_name', label: 'Customer', render: v => <span className="text-gray-700">{v}</span> },
    { key: 'stage', label: 'Stage', render: v => (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize">
        <span className="w-2 h-2 rounded-full" style={{ background: STAGE_COLORS[v] || '#94a3b8' }} />
        {(v || '').replace('_', ' ')}
      </span>
    )},
    { key: 'probability', label: 'Prob.', render: v => <span className="text-gray-600">{v}%</span> },
    { key: 'expected_value', label: 'Value', className: 'text-right', render: v => <span className="font-semibold">{formatCurrency(v)}</span> },
    { key: 'expected_close', label: 'Close Date', render: v => formatDate(v) || '—' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (v, row) => row.status === 'open' ? (
      <div className="flex gap-1">
        <button onClick={e => { e.stopPropagation(); openEdit(row); }} title="Edit" className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-500" /></button>
        <button onClick={e => { e.stopPropagation(); handleWon(v); }} title="Won" className="p-1 hover:bg-emerald-50 rounded"><Trophy className="w-3.5 h-3.5 text-emerald-500" /></button>
        <button onClick={e => { e.stopPropagation(); handleLost(v); }} title="Lost" className="p-1 hover:bg-rose-50 rounded"><XCircle className="w-3.5 h-3.5 text-rose-500" /></button>
      </div>
    ) : null },
      { key: '_del', label: '', render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
      { key: '_del', label: '', render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
  ];

  const actColumns = [
    { key: 'activity_type', label: 'Type', render: v => {
      const icons = { call: Phone, email: Mail, meeting: Calendar, task: CheckCircle, note: MessageSquare };
      const Icon = icons[v] || MessageSquare;
      return <div className="flex items-center gap-2"><Icon className="w-4 h-4 text-gray-400" /><span className="capitalize">{v}</span></div>;
    }},
    { key: 'subject', label: 'Subject', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'bp_name', label: 'Contact', render: v => v || '—' },
    { key: 'due_date', label: 'Due', render: v => v ? formatDate(v) : '—' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (v, row) => row.status === 'open' ? (
      <button onClick={e => { e.stopPropagation(); handleCompleteActivity(v); }} className="text-xs text-blue-600 hover:underline">Complete</button>
    ) : null },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/crm/opportunities/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/crm/bulk-delete', { entity: 'opportunities', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };



  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">CRM</h1><p className="text-sm text-gray-400 mt-1">Customer Relationship Management</p></div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreateActivity(true)} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Activity</button>
          <><DownloadButton data={opps} filename="CRMPage" /><button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Opportunity</button></>
        </div>
      </div>

      <Tabs tabs={[{ key: 'opportunities', label: 'Opportunities' }, { key: 'kanban', label: 'Pipeline Board' }, { key: 'activities', label: 'Activities' }]} active={tab} onChange={setTab} />

      {tab === 'kanban' && <CRMKanban />}

      {tab === 'opportunities' && (
        <>
          {/* Pipeline Chart */}
          {pipeline.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Pipeline by Stage</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pipeline} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} width={100} tickFormatter={v => v.replace('_', ' ')} />
                    <Tooltip formatter={v => formatCurrency(v)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {pipeline.map((entry, i) => <Cell key={i} fill={STAGE_COLORS[entry.stage] || '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search opportunities..." className="w-64" />
          </div>
          <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={oppColumns} data={opps} loading={loading} /></div>
        </>
      )}

      {tab === 'activities' && (
        <>
          <div className="flex items-center gap-4">
            <Tabs tabs={[{ key: '', label: 'All' }, { key: 'open', label: 'Open' }, { key: 'completed', label: 'Completed' }]} active={stageFilter} onChange={setStageFilter} />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={actColumns} data={activities} loading={loading} /></div>
        </>
      )}

      {/* Create Opportunity */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} title={editId ? 'Edit Opportunity' : 'Create Opportunity'} size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateOpp} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          <FormField label="Opportunity Name" required><input value={form.opportunity_name} onChange={e => setForm({...form, opportunity_name: e.target.value})} className="input-field" placeholder="e.g. Enterprise License Deal" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Customer" required><select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} className="select-field"><option value="">Select...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></FormField>
            <FormField label="Stage"><select value={form.stage} onChange={e => setForm({...form, stage: e.target.value})} className="select-field">{STAGES.filter(s => !s.startsWith('closed')).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Expected Value"><input type="number" step="0.01" value={form.expected_value} onChange={e => setForm({...form, expected_value: e.target.value})} className="input-field" /></FormField>
            <FormField label="Probability %"><input type="number" min="0" max="100" value={form.probability} onChange={e => setForm({...form, probability: e.target.value})} className="input-field" /></FormField>
            <FormField label="Expected Close"><input type="date" value={form.expected_close} onChange={e => setForm({...form, expected_close: e.target.value})} className="input-field" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Source"><input value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="input-field" placeholder="e.g. Website, Referral" /></FormField>
            <FormField label="Description"><input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" /></FormField>
          </div>
        </div>
      </Modal>

      {/* Create Activity */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateActivity} onClose={() => setShowCreateActivity(false)} title="Create Activity" size="xl"
        footer={<><button onClick={() => setShowCreateActivity(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateActivity} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type"><select value={actForm.activity_type} onChange={e => setActForm({...actForm, activity_type: e.target.value})} className="select-field"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="task">Task</option><option value="note">Note</option></select></FormField>
            <FormField label="Due Date"><input type="date" value={actForm.due_date} onChange={e => setActForm({...actForm, due_date: e.target.value})} className="input-field" /></FormField>
          </div>
          <FormField label="Subject" required><input value={actForm.subject} onChange={e => setActForm({...actForm, subject: e.target.value})} className="input-field" placeholder="Activity subject" /></FormField>
          <FormField label="Contact"><select value={actForm.bp_id} onChange={e => setActForm({...actForm, bp_id: e.target.value})} className="select-field"><option value="">Select...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></FormField>
          <FormField label="Description"><textarea value={actForm.description} onChange={e => setActForm({...actForm, description: e.target.value})} className="input-field" rows={3} /></FormField>
        </div>
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.opportunity_name} />
    </div>
  );
}
