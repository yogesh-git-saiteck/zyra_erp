import { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle, Clock, GitBranch, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate, formatCurrency } from '../../utils/formatters';

const ENTITY_URLS = {
  purchase_order: '/procurement/orders',
  purchase_requisition: '/procurement/requisitions',
  sales_order: '/sales/orders',
  ap_invoice: '/finance/ap',
  payment: '/finance/payments',
  journal_entry: '/finance/journals',
  leave_request: '/hr/leave',
  expense_claim: '/hr/expenses',
  gate_pass: '/logistics/gate-passes',
};

export default function WorkflowPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('my-approvals');
  const [approvals, setApprovals] = useState([]);
  const [instances, setInstances] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tplForm, setTplForm] = useState({ template_name: '', entity_type: '', description: '', steps: [{ step: 1, role: '', action: 'approve', condition: '' }] });

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'my-approvals') { const r = await api.get('/workflow/my-approvals'); setApprovals(r?.data || []); }
      else if (tab === 'instances') { const r = await api.get('/workflow/instances'); setInstances(r?.data || []); }
      else { const r = await api.get('/workflow/templates'); setTemplates(r?.data || []); }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const [showAction, setShowAction] = useState(null); // { id, action: 'approve'|'reject' }
  const [actionComments, setActionComments] = useState('');

  const handleApprove = async (id) => { setShowAction({ id, action: 'approve' }); setActionComments(''); };
  const handleReject = async (id) => { setShowAction({ id, action: 'reject' }); setActionComments(''); };
  const submitAction = async () => {
    try {
      await api.post(`/workflow/approvals/${showAction.id}/${showAction.action}`, { comments: actionComments });
      setAlert({ type: 'success', message: showAction.action === 'approve' ? 'Approved — entity status updated' : 'Rejected' });
      setShowAction(null); loadData();
    } catch (err) { setModalError(err.message); }
  };

  const handleCreateTemplate = async () => {
    if (!tplForm.template_name || !tplForm.entity_type) { setAlert({ type: 'error', message: 'Name and entity type required' }); return; }
    setSaving(true);
    try {
      await api.post('/workflow/templates', tplForm); setShowCreateTemplate(false);
      setTplForm({ template_name: '', entity_type: '', description: '', steps: [{ step: 1, role: '', action: 'approve', condition: '' }] });
      setAlert({ type: 'success', message: 'Template created' }); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const updateStep = (idx, field, value) => {
    const steps = [...tplForm.steps]; steps[idx] = { ...steps[idx], [field]: value };
    setTplForm({ ...tplForm, steps });
  };

  const approvalCols = [
    { key: 'entity_type', label: 'Entity', render: (v, row) => (
      <div>
        <button onClick={() => { const url = ENTITY_URLS[v]; if (url) navigate(url); }}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium capitalize">
          {(v || '').replace(/_/g, ' ')}
          <ExternalLink className="w-3 h-3" />
        </button>
        {row.doc_number && <span className="text-xs text-gray-500 font-mono">{row.doc_number}</span>}
      </div>
    )},
    { key: 'doc_amount', label: 'Amount', render: v => v ? <span className="font-mono text-sm">{formatCurrency(v)}</span> : '—' },
    { key: 'requester_name', label: 'Requested By' },
    { key: 'template_name', label: 'Workflow', render: v => <span className="text-xs text-gray-500">{v}</span> },
    { key: 'step_number', label: 'Step', render: v => <span className="font-mono text-xs">{v}</span> },
    { key: 'initiated_at', label: 'Submitted', render: v => formatDate(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: 'Actions', render: (v, row) => row.status === 'pending' ? (
      <div className="flex gap-1">
        <button onClick={() => handleApprove(v)} title="Approve"
          className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 font-medium">
          <CheckCircle className="w-3.5 h-3.5" /> Approve
        </button>
        <button onClick={() => handleReject(v)} title="Reject"
          className="flex items-center gap-1 px-2 py-1 text-xs bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 font-medium">
          <XCircle className="w-3.5 h-3.5" /> Reject
        </button>
      </div>
    ) : <span className="text-xs text-gray-400 capitalize">{row.status}</span> },
  ];

  const instanceCols = [
    { key: 'entity_type', label: 'Entity', render: (v, row) => (
      <div>
        <button onClick={() => { const url = ENTITY_URLS[v]; if (url) navigate(url); }}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 capitalize text-sm">
          {(v || '').replace(/_/g, ' ')} <ExternalLink className="w-3 h-3" />
        </button>
        {row.doc_number && <span className="text-xs text-gray-500 font-mono">{row.doc_number}</span>}
      </div>
    )},
    { key: 'template_name', label: 'Workflow', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'initiated_by_name', label: 'Initiated By' },
    { key: 'current_step', label: 'Step', render: v => <span className="font-mono">{v}</span> },
    { key: 'initiated_at', label: 'Started', render: v => formatDate(v) },
    { key: 'completed_at', label: 'Completed', render: v => v ? formatDate(v) : '—' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
  ];

  const templateCols = [
    { key: 'template_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'entity_type', label: 'Entity', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{(v || '').replace('_', ' ')}</span> },
    { key: 'description', label: 'Description', render: v => v || '—' },
    { key: 'steps', label: 'Steps', render: v => {
      const steps = typeof v === 'string' ? JSON.parse(v) : v;
      return <span className="text-gray-600">{steps?.length || 0} steps</span>;
    }},
    { key: 'is_active', label: 'Active', render: v => v ? <span className="text-emerald-600 font-medium">Yes</span> : <span className="text-gray-400">No</span> },
  ];

  const entityTypes = ['purchase_order', 'sales_order', 'payment', 'leave_request', 'requisition', 'journal_entry', 'asset_purchase', 'expense_claim', 'gate_pass'];
  const roles = ['ADMIN', 'FIN_MGR', 'SALES_MGR', 'PROC_MGR', 'HR_MGR', 'EXECUTIVE', 'manager'];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Workflow Engine</h1><p className="text-sm text-gray-400 mt-1">Approval workflows and templates</p></div>
        {tab === 'templates' && <><DownloadButton data={approvals} filename="WorkflowPage" /><button onClick={() => setShowCreateTemplate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Template</button></>}
      </div>

      <Tabs tabs={[
        { key: 'my-approvals', label: 'My Approvals', count: approvals.filter(a => a.status === 'pending').length },
        { key: 'instances', label: 'All Workflows' },
        { key: 'templates', label: 'Templates' },
      ]} active={tab} onChange={setTab} />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {tab === 'my-approvals' && <DataTable columns={approvalCols} data={approvals} loading={loading} emptyMessage="No pending approvals" />}
        {tab === 'instances' && <DataTable columns={instanceCols} data={instances} loading={loading} />}
        {tab === 'templates' && <DataTable columns={templateCols} data={templates} loading={loading} />}
      </div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateTemplate} onClose={() => setShowCreateTemplate(false)} title="Create Workflow Template" size="xl"
        footer={<><button onClick={() => setShowCreateTemplate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateTemplate} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Template Name" required><input value={tplForm.template_name} onChange={e => setTplForm({...tplForm, template_name: e.target.value})} className="input-field" placeholder="e.g. Purchase Order Approval" /></FormField>
            <FormField label="Entity Type" required><select value={tplForm.entity_type} onChange={e => setTplForm({...tplForm, entity_type: e.target.value})} className="select-field"><option value="">Select...</option>{entityTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></FormField>
          </div>
          <FormField label="Description"><input value={tplForm.description} onChange={e => setTplForm({...tplForm, description: e.target.value})} className="input-field" /></FormField>

          <div className="flex items-center justify-between"><span className="text-sm font-medium text-gray-700">Approval Steps</span>
            <button onClick={() => setTplForm({...tplForm, steps: [...tplForm.steps, { step: tplForm.steps.length + 1, role: '', action: 'approve', condition: '' }]})} className="text-xs text-blue-600 hover:underline">+ Add Step</button></div>
          <div className="space-y-2">
            {tplForm.steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">{step.step}</div>
                <select value={step.role} onChange={e => updateStep(idx, 'role', e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded bg-white"><option value="">Select role...</option>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select>
                <input value={step.condition} onChange={e => updateStep(idx, 'condition', e.target.value)} placeholder="Condition (optional)" className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded bg-white" />
                {tplForm.steps.length > 1 && <button onClick={() => setTplForm({...tplForm, steps: tplForm.steps.filter((_, i) => i !== idx).map((s, i) => ({...s, step: i + 1}))})} className="text-gray-400 hover:text-rose-500 text-xs">Remove</button>}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* APPROVE/REJECT COMMENTS */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showAction} onClose={() => setShowAction(null)}
        title={showAction?.action === 'approve' ? 'Approve — Add Comments' : 'Reject — Add Comments'} size="sm"
        footer={<>
          <button onClick={() => setShowAction(null)} className="btn-secondary">Cancel</button>
          <button onClick={submitAction} className={showAction?.action === 'approve' ? 'btn-primary' : 'bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700'}>
            {showAction?.action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </>}>
        <div className="space-y-4">
          <FormField label="Comments (optional)">
            <textarea value={actionComments} onChange={e => setActionComments(e.target.value)} className="input-field" rows={3}
              placeholder={showAction?.action === 'approve' ? 'Approval notes...' : 'Reason for rejection...'}/>
          </FormField>
          {showAction?.action === 'approve' && <p className="text-xs text-green-600">This will auto-update the document status to Approved/Confirmed.</p>}
          {showAction?.action === 'reject' && <p className="text-xs text-red-600">This will mark the document as Rejected.</p>}
        </div>
      </Modal>
    </div>
  );
}
