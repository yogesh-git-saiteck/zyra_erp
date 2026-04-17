import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Clock, Mail, Shield, CheckSquare, LayoutGrid, Upload, Printer,
  Globe, GitBranch, Database, Plus, Trash2, Play, ToggleLeft, ToggleRight, RefreshCw, Eye, Pencil, PenLine
} from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, PageLoader , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDateTime, formatNumber } from '../../utils/formatters';

export default function AdminPlatform() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPreview, setShowPreview] = useState(null);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [backupInfo, setBackupInfo] = useState(null);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.get('/auth/users').catch(()=>null), api.get('/auth/roles').catch(()=>null)]);
      setUsers(u?.data || []); setRoles(r?.data || []);

      if (tab === 'overview') { const ov = await api.get('/platform/overview').catch(()=>null); setOverview(ov?.data); }
      else if (tab === 'notifications') { const d = await api.get('/platform/notification-rules').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'jobs') { const d = await api.get('/platform/scheduled-jobs').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'emails') { const d = await api.get('/platform/email-templates').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'rules') { const d = await api.get('/platform/business-rules').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'validations') { const d = await api.get('/platform/validation-rules').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'approvals') { const d = await api.get('/platform/approval-rules').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'print') { const d = await api.get('/platform/print-templates').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'languages') { const d = await api.get('/platform/languages').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'imports') { const d = await api.get('/platform/import-log').catch(()=>null); setData(d?.data || []); }
      else if (tab === 'backup') { const d = await api.get('/platform/backup/info').catch(()=>null); setBackupInfo(d?.data); }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const entities = ['sales_order', 'purchase_order', 'ap_invoice', 'ar_invoice', 'payment', 'leave_request', 'employee', 'asset', 'quotation', 'production_order', 'gate_pass'];
  const triggers = ['on_create', 'on_update', 'on_status_change', 'on_approve', 'on_overdue', 'scheduled'];
  const ruleTypes = ['required', 'min_length', 'max_length', 'regex', 'min_value', 'max_value', 'email', 'phone'];

  // Field definitions per entity — used in Approval Rules, Business Rules, and Validations
  const entityFields = {
    sales_order:      [{ key:'total_amount', label:'Total Amount' }, { key:'subtotal', label:'Subtotal' }, { key:'tax_amount', label:'Tax Amount' }, { key:'status', label:'Status' }, { key:'priority', label:'Priority' }, { key:'currency', label:'Currency' }, { key:'customer_po_number', label:'Customer PO#' }],
    purchase_order:   [{ key:'total_amount', label:'Total Amount' }, { key:'subtotal', label:'Subtotal' }, { key:'tax_amount', label:'Tax Amount' }, { key:'status', label:'Status' }, { key:'currency', label:'Currency' }, { key:'doc_type', label:'Doc Type' }],
    ap_invoice:       [{ key:'total_amount', label:'Total Amount' }, { key:'subtotal', label:'Subtotal' }, { key:'tax_amount', label:'Tax Amount' }, { key:'status', label:'Status' }, { key:'due_date', label:'Due Date' }, { key:'currency', label:'Currency' }],
    ar_invoice:       [{ key:'total_amount', label:'Total Amount' }, { key:'subtotal', label:'Subtotal' }, { key:'tax_amount', label:'Tax Amount' }, { key:'status', label:'Status' }, { key:'due_date', label:'Due Date' }, { key:'currency', label:'Currency' }],
    payment:          [{ key:'amount', label:'Amount' }, { key:'payment_method', label:'Payment Method' }, { key:'status', label:'Status' }, { key:'currency', label:'Currency' }],
    leave_request:    [{ key:'leave_days', label:'Leave Days' }, { key:'leave_type_id', label:'Leave Type' }, { key:'status', label:'Status' }],
    employee:         [{ key:'basic_salary', label:'Basic Salary' }, { key:'employment_type', label:'Employment Type' }, { key:'status', label:'Status' }, { key:'department_id', label:'Department' }],
    asset:            [{ key:'acquisition_cost', label:'Acquisition Cost' }, { key:'net_book_value', label:'Net Book Value' }, { key:'status', label:'Status' }, { key:'useful_life_years', label:'Useful Life (Years)' }],
    quotation:        [{ key:'total_amount', label:'Total Amount' }, { key:'subtotal', label:'Subtotal' }, { key:'status', label:'Status' }, { key:'valid_until', label:'Valid Until' }],
    production_order: [{ key:'planned_quantity', label:'Planned Qty' }, { key:'completed_quantity', label:'Completed Qty' }, { key:'status', label:'Status' }, { key:'priority', label:'Priority' }],
    gate_pass:        [{ key:'pass_type', label:'Pass Type (RGP/NRGP)' }, { key:'status', label:'Status' }, { key:'party_name', label:'Party Name' }, { key:'purpose', label:'Purpose' }, { key:'issue_date', label:'Issue Date' }, { key:'expected_return_date', label:'Expected Return Date' }],
  };

  const getEntityFields = (entityType) => entityFields[entityType] || [];

  const handleCreate = async () => {
    setSaving(true);
    try {
      const endpoints = {
        notifications: '/platform/notification-rules', jobs: '/platform/scheduled-jobs',
        emails: '/platform/email-templates', rules: '/platform/business-rules',
        validations: '/platform/validation-rules', approvals: '/platform/approval-rules',
        print: '/platform/print-templates',
      };
      if (editId) {
        await api.put(`${endpoints[tab]}/${editId}`, form);
        setAlert({ type: 'success', message: 'Updated' });
      } else {
        await api.post(endpoints[tab], form);
        setAlert({ type: 'success', message: 'Created' });
      }
      setShowCreate(false); setForm({}); setEditId(null); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const openEdit = (row) => {
    const steps = Array.isArray(row.approver_steps) && row.approver_steps.length
      ? row.approver_steps
      : (row.approver_role || row.approver_user_id
        ? [{ step: 1, approver_role: row.approver_role || '', approver_user_id: row.approver_user_id || '' }]
        : [{ step: 1, approver_role: '', approver_user_id: '' }]);
    setForm({ ...row, approver_steps: steps });
    setEditId(row.id);
    setModalError(null);
    setShowCreate(true);
  };

  const handleToggle = async (id) => {
    const endpoints = { notifications: 'notification-rules', jobs: 'scheduled-jobs', rules: 'business-rules' };
    try { await api.put(`/platform/${endpoints[tab]}/${id}/toggle`); loadData(); } catch (err) { setModalError(err.message); }
  };

  const handleDelete = async (id) => {
    const endpoints = { notifications: 'notification-rules', jobs: 'scheduled-jobs', rules: 'business-rules', validations: 'validation-rules', approvals: 'approval-rules' };
    try { await api.delete(`/platform/${endpoints[tab]}/${id}`); loadData(); } catch (err) { setModalError(err.message); }
  };

  const handleRunJob = async (id) => {
    try { const r = await api.post(`/platform/scheduled-jobs/${id}/run`); setAlert({ type: 'success', message: `Job executed — ${r?.data?.affected || 0} records affected` }); loadData(); }
    catch (err) { setModalError(err.message); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'notifications', label: 'Notifications' }, { key: 'jobs', label: 'Scheduled Jobs' },
    { key: 'emails', label: 'Email Templates' }, { key: 'rules', label: 'Business Rules' },
    { key: 'validations', label: 'Validations' }, { key: 'approvals', label: 'Approval Rules' },
    { key: 'print', label: 'Print Templates' }, { key: 'languages', label: 'Languages' },
    { key: 'imports', label: 'Import Log' }, { key: 'backup', label: 'Backup' },
  ];

  const openCreate = (defaults = {}) => {
    const init = tab === 'approvals'
      ? { approver_steps: [{ step: 1, approver_role: '', approver_user_id: '' }], ...defaults }
      : defaults;
    setForm(init);
    setEditId(null);
    setModalError(null);
    setShowCreate(true);
  };

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admin Platform</h1><p className="text-sm text-gray-400 mt-1">Configure every aspect of Zyra — zero code required</p></div>
        {['notifications', 'jobs', 'rules', 'validations', 'approvals', 'print', 'emails'].includes(tab) && (
          <div className="flex items-center gap-2">
            <DownloadButton data={data} filename="AdminPlatform" />
            {tab === 'print' && (
              <button onClick={async () => { try { await api.post('/platform/print-templates/seed-defaults'); const d = await api.get('/platform/print-templates'); setData(d?.data || []); setAlert({ type: 'success', message: 'Missing templates created (existing templates were not changed)' }); } catch(e) { setAlert({ type: 'error', message: e.message }); } }} className="btn-secondary flex items-center gap-2 text-xs" title="Only creates missing templates — never overwrites saved templates">
                Add Missing Templates
              </button>
            )}
            <button onClick={() => tab === 'print' ? navigate('/settings/print-builder/new') : openCreate()} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New</button>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Notification Rules', value: `${overview.notifications?.active}/${overview.notifications?.total}`, icon: Bell, color: 'from-blue-500 to-blue-600' },
            { label: 'Scheduled Jobs', value: `${overview.jobs?.active}/${overview.jobs?.total}`, icon: Clock, color: 'from-violet-500 to-violet-600' },
            { label: 'Business Rules', value: `${overview.rules?.active}/${overview.rules?.total}`, icon: Shield, color: 'from-rose-500 to-rose-600' },
            { label: 'Email Templates', value: overview.emailTemplates?.total, icon: Mail, color: 'from-emerald-500 to-emerald-600' },
            { label: 'Validation Rules', value: overview.validations?.total, icon: CheckSquare, color: 'from-amber-500 to-amber-600' },
            { label: 'Approval Rules', value: `${overview.approvals?.active}/${overview.approvals?.total}`, icon: GitBranch, color: 'from-cyan-500 to-cyan-600' },
          ].map((c, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3 cursor-pointer hover:shadow-card"
              onClick={() => setTab(tabs[i + 1]?.key || 'overview')}>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}><c.icon className="w-5 h-5 text-white" /></div>
              <div><p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value || 0}</p><p className="text-xs text-gray-400">{c.label}</p></div>
            </div>
          ))}
        </div>
      )}

      {/* NOTIFICATION RULES */}
      {tab === 'notifications' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'rule_name', label: 'Rule', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize text-gray-600 dark:text-gray-400">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'trigger_event', label: 'Trigger', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'channel', label: 'Channel', render: v => <span className="capitalize">{v}</span> },
          { key: 'is_active', label: 'Active', render: (v, row) => <button onClick={() => handleToggle(row.id)}>{v ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}</button> },
          { key: 'id', label: '', render: v => <button onClick={() => handleDelete(v)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* SCHEDULED JOBS */}
      {tab === 'jobs' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'job_name', label: 'Job', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'job_type', label: 'Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{v}</span> },
          { key: 'schedule_description', label: 'Schedule' },
          { key: 'run_count', label: 'Runs', className: 'text-right', render: v => formatNumber(v) },
          { key: 'last_run_at', label: 'Last Run', render: v => v ? formatDateTime(v) : 'Never' },
          { key: 'last_run_status', label: 'Status', render: v => v ? <span className={`badge ${v === 'completed' ? 'badge-success' : 'badge-danger'}`}>{v}</span> : '—' },
          { key: 'is_active', label: 'Active', render: (v, row) => <button onClick={() => handleToggle(row.id)}>{v ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}</button> },
          { key: 'id', label: '', render: v => <div className="flex gap-1"><button onClick={() => handleRunJob(v)} title="Run now" className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"><Play className="w-3.5 h-3.5 text-blue-500" /></button><button onClick={() => handleDelete(v)} title="Delete" className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button></div> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* EMAIL TEMPLATES */}
      {tab === 'emails' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'template_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'template_key', label: 'Key', render: v => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">{v}</span> },
          { key: 'subject', label: 'Subject' },
          { key: 'variables', label: 'Variables', render: v => { const vars = typeof v === 'string' ? JSON.parse(v) : v; return <span className="text-xs text-gray-500">{(vars||[]).length} vars</span>; } },
          { key: 'id', label: '', render: (v, row) => <button onClick={() => setShowPreview(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><Eye className="w-3.5 h-3.5 text-gray-400" /></button> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* BUSINESS RULES */}
      {tab === 'rules' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'rule_name', label: 'Rule', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'trigger_point', label: 'Trigger', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'action_type', label: 'Action', render: v => <span className={`badge ${v === 'block' ? 'badge-danger' : v === 'warn' ? 'badge-warning' : 'badge-info'} capitalize`}>{v}</span> },
          { key: 'error_message', label: 'Message', render: v => <span className="text-xs text-gray-500">{v || '—'}</span> },
          { key: 'is_active', label: 'Active', render: (v, row) => <button onClick={() => handleToggle(row.id)}>{v ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}</button> },
          { key: 'id', label: '', render: (v, row) => (
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(row)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
              <button onClick={() => handleDelete(v)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
            </div>
          ) },
        ]} data={data} loading={loading} /></div>
      )}

      {/* VALIDATION RULES */}
      {tab === 'validations' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'field_name', label: 'Field', render: v => <span className="font-mono text-sm">{v}</span> },
          { key: 'rule_type', label: 'Rule', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'rule_value', label: 'Value', render: v => v || '—' },
          { key: 'error_message', label: 'Error Message' },
          { key: 'id', label: '', render: v => <button onClick={() => handleDelete(v)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* APPROVAL RULES */}
      {tab === 'approvals' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'rule_name', label: 'Rule', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'condition_field', label: 'When', render: (v, row) => v ? <span className="text-xs font-mono">{v} {row.condition_operator} {row.condition_value}</span> : 'Always' },
          { key: 'approver_steps', label: 'Approval Levels', render: (v, row) => {
            const steps = Array.isArray(v) && v.length ? v : (row.approver_role || row.approver_name ? [{ step: 1, approver_role: row.approver_role, approver_user_name: row.approver_name }] : []);
            if (!steps.length) return '—';
            return (
              <div className="space-y-0.5">
                {steps.map((s, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-gray-400">L{s.step}:</span>{' '}
                    {s.approver_role ? <span className="font-medium">{s.approver_role}</span> : null}
                    {s.approver_role && s.approver_user_name ? ' / ' : null}
                    {s.approver_user_name ? <span className="text-blue-600 dark:text-blue-400">{s.approver_user_name}</span> : null}
                    {!s.approver_role && !s.approver_user_name ? '—' : null}
                  </div>
                ))}
              </div>
            );
          } },
          { key: 'id', label: '', render: (v, row) => (
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(row)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"><Pencil className="w-3.5 h-3.5 text-blue-400" /></button>
              <button onClick={() => handleDelete(v)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
            </div>
          ) },
        ]} data={data} loading={loading} /></div>
      )}

      {/* PRINT TEMPLATES */}
      {tab === 'print' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'id', label: '', render: v => <button onClick={() => navigate(`/settings/print-builder/${v}`)} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"><PenLine className="w-3 h-3" /> Build</button> },
          { key: 'template_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'entity_type', label: 'Document', render: v => <span className="capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'company_name', label: 'Company', render: v => v || '—' },
          { key: 'is_default', label: 'Default', render: v => v ? <span className="text-emerald-600 font-medium">Yes</span> : '—' },
        ]} data={data} loading={loading} /></div>
      )}

      {/* LANGUAGES */}
      {tab === 'languages' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'language_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
          { key: 'language_name', label: 'Language', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'is_default', label: 'Default', render: v => v ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">Default</span> : '—' },
          { key: 'is_active', label: 'Active', render: v => v ? <span className="text-emerald-600">Active</span> : <span className="text-gray-400">Inactive</span> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* IMPORT LOG */}
      {tab === 'imports' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize">{(v||'').replace(/_/g,' ')}</span> },
          { key: 'total_rows', label: 'Total', className: 'text-right' },
          { key: 'success_rows', label: 'Success', className: 'text-right', render: v => <span className="text-emerald-600">{v}</span> },
          { key: 'failed_rows', label: 'Failed', className: 'text-right', render: v => <span className={parseInt(v) > 0 ? 'text-rose-600' : ''}>{v}</span> },
          { key: 'status', label: 'Status', render: v => <span className={`badge ${v === 'completed' ? 'badge-success' : 'badge-warning'}`}>{v}</span> },
          { key: 'created_at', label: 'Date', render: v => formatDateTime(v) },
        ]} data={data} loading={loading} emptyMessage="No imports yet. Use the Integration Hub or API to import data." /></div>
      )}

      {/* BACKUP */}
      {tab === 'backup' && backupInfo && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{backupInfo.totalTables}</p><p className="text-xs text-gray-400">Tables</p></div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatNumber(backupInfo.totalRows)}</p><p className="text-xs text-gray-400">Total Records</p></div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center"><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{backupInfo.dbSize}</p><p className="text-xs text-gray-400">Database Size</p></div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
            { key: 'tablename', label: 'Table', render: v => <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{v}</span> },
            { key: 'row_count', label: 'Rows', className: 'text-right', render: v => formatNumber(v) },
          ]} data={backupInfo.tables || []} /></div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
            <p className="text-xs text-gray-500">To backup: <code className="font-mono bg-gray-200 dark:bg-gray-800 px-1 rounded">pg_dump -U erp_admin nexus_erp {'>'} backup.sql</code></p>
            <p className="text-xs text-gray-500 mt-1">To restore: <code className="font-mono bg-gray-200 dark:bg-gray-800 px-1 rounded">psql -U erp_admin nexus_erp {'<'} backup.sql</code></p>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setEditId(null); }} title="" size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-400">{editId ? 'Editing existing record' : 'All fields marked * are required'}</span>
            <div className="flex gap-2">
              <button onClick={() => { setShowCreate(false); setEditId(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="btn-primary min-w-[110px]">
                {saving ? <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin"/>{editId ? 'Saving…' : 'Creating…'}</span> : (editId ? 'Save Changes' : 'Create')}
              </button>
            </div>
          </div>
        }>

        {/* Modal header band */}
        {tab === 'notifications' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Bell className="w-4.5 h-4.5 text-white w-5 h-5"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Notification Rule' : 'New Notification Rule'}</p><p className="text-blue-100 text-xs">Trigger alerts when specific events happen</p></div>
          </div>
        )}
        {tab === 'jobs' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-violet-600 to-violet-500 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-white"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Scheduled Job' : 'New Scheduled Job'}</p><p className="text-violet-100 text-xs">Automate recurring tasks on a cron schedule</p></div>
          </div>
        )}
        {tab === 'rules' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-rose-600 to-rose-500 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Shield className="w-5 h-5 text-white"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Business Rule' : 'New Business Rule'}</p><p className="text-rose-100 text-xs">Block or warn when a condition is met</p></div>
          </div>
        )}
        {tab === 'validations' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-amber-500 to-amber-400 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><CheckSquare className="w-5 h-5 text-white"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Validation Rule' : 'New Validation Rule'}</p><p className="text-amber-50 text-xs">Enforce field-level data quality rules</p></div>
          </div>
        )}
        {tab === 'approvals' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-cyan-600 to-cyan-500 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><GitBranch className="w-5 h-5 text-white"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Approval Rule' : 'New Approval Rule'}</p><p className="text-cyan-100 text-xs">Multi-level approval workflows per condition</p></div>
          </div>
        )}
        {tab === 'emails' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Mail className="w-5 h-5 text-white"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Email Template' : 'New Email Template'}</p><p className="text-emerald-100 text-xs">HTML email templates with dynamic variables</p></div>
          </div>
        )}
        {tab === 'print' && (
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-t-xl -mx-6 -mt-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Printer className="w-5 h-5 text-white"/></div>
            <div><p className="font-semibold text-white text-sm">{editId ? 'Edit Print Template' : 'New Print Template'}</p><p className="text-indigo-100 text-xs">Document layouts for POs, invoices and more</p></div>
          </div>
        )}

        <div className="space-y-5">

          {/* ── NOTIFICATIONS ── */}
          {tab === 'notifications' && <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Rule Name <span className="text-rose-500">*</span></label>
                <input value={form.rule_name || ''} onChange={e => setForm({...form, rule_name: e.target.value})} className="input-field" placeholder="e.g. New PO created alert" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Entity <span className="text-rose-500">*</span></label>
                  <select value={form.entity_type || ''} onChange={e => setForm({...form, entity_type: e.target.value})} className="select-field">
                    <option value="">Select entity…</option>{entities.map(e => <option key={e} value={e}>{e.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Trigger <span className="text-rose-500">*</span></label>
                  <select value={form.trigger_event || ''} onChange={e => setForm({...form, trigger_event: e.target.value})} className="select-field">
                    <option value="">Select trigger…</option>{triggers.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800"/>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Delivery</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Channel</label>
                  <div className="flex gap-2">
                    {[['in_app','In-App'],['email','Email'],['both','Both']].map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setForm({...form, channel: v})}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${form.channel===v||(!form.channel&&v==='in_app') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notify Role</label>
                  <select value={(form.notify_roles || [])[0] || ''} onChange={e => setForm({...form, notify_roles: [e.target.value]})} className="select-field">
                    <option value="">Any / All</option>{roles.map(r => <option key={r.id} value={r.role_code}>{r.role_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Message Template</label>
                <textarea value={form.message_template || ''} onChange={e => setForm({...form, message_template: e.target.value})} className="input-field font-mono text-xs" rows={2} placeholder="e.g. New {{entity_type}} {{doc_number}} created — Amount: {{amount}}" />
                <p className="mt-1 text-[10px] text-gray-400">Variables: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{{doc_number}}'}</code> <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{{amount}}'}</code> <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{{entity_type}}'}</code></p>
              </div>
            </div>
          </>}

          {/* ── SCHEDULED JOBS ── */}
          {tab === 'jobs' && <>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Job Name <span className="text-rose-500">*</span></label>
              <input value={form.job_name || ''} onChange={e => setForm({...form, job_name: e.target.value})} className="input-field" placeholder="e.g. Monthly Depreciation Run" />
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800"/>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Job Type</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {[['depreciation','📊 Depreciation Run'],['email_report','📧 Email Report'],['overdue_check','⏰ Overdue Check'],['auto_close','🔒 Auto-Close'],['data_sync','🔄 Data Sync']].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setForm({...form, job_type: v})}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all ${form.job_type===v ? 'bg-violet-600 text-white border-violet-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-violet-400'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Cron Expression</label>
                  <input value={form.schedule_cron || ''} onChange={e => setForm({...form, schedule_cron: e.target.value})} className="input-field font-mono" placeholder="0 9 * * *" />
                  <p className="mt-1 text-[10px] text-gray-400">Format: min hour day month weekday</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Human Description</label>
                  <input value={form.schedule_description || ''} onChange={e => setForm({...form, schedule_description: e.target.value})} className="input-field" placeholder="e.g. Every Monday at 8 AM" />
                </div>
                {form.schedule_cron && (
                  <div className="px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                    <p className="text-[10px] text-violet-600 dark:text-violet-400 font-mono font-semibold">{form.schedule_cron}</p>
                    <p className="text-[10px] text-violet-500 mt-0.5">{form.schedule_description || 'No description yet'}</p>
                  </div>
                )}
              </div>
            </div>
          </>}

          {/* ── BUSINESS RULES ── */}
          {tab === 'rules' && <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Rule Name <span className="text-rose-500">*</span></label>
                <input value={form.rule_name || ''} onChange={e => setForm({...form, rule_name: e.target.value})} className="input-field" placeholder="e.g. Block PO without approval" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Entity <span className="text-rose-500">*</span></label>
                  <select value={form.entity_type || ''} onChange={e => setForm({...form, entity_type: e.target.value, conditions: [{}]})} className="select-field">
                    <option value="">Select entity…</option>{entities.map(e => <option key={e} value={e}>{e.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Action</label>
                  <div className="flex gap-1.5">
                    {[['block','🚫 Block','rose'],['warn','⚠️ Warn','amber'],['notify','🔔 Notify','blue']].map(([v,l,c]) => (
                      <button key={v} type="button" onClick={() => setForm({...form, action_type: v})}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${form.action_type===v||(!form.action_type&&v==='block') ? `bg-${c}-600 text-white border-${c}-600` : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}
                        style={form.action_type===v||(!form.action_type&&v==='block') ? {background: v==='block'?'#e11d48':v==='warn'?'#d97706':'#2563eb', borderColor:'transparent', color:'white'} : {}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800"/>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Condition</p>
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-400 shrink-0">When</span>
                <select
                  value={(form.conditions || [{}])[0]?.field || ''}
                  onChange={e => setForm({...form, conditions: [{ ...(form.conditions || [{}])[0], field: e.target.value }]})}
                  className="select-field text-sm flex-1"
                  disabled={!form.entity_type}>
                  <option value="">{form.entity_type ? 'field…' : '← pick entity'}</option>
                  {getEntityFields(form.entity_type).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={(form.conditions || [{}])[0]?.operator || 'gt'} onChange={e => setForm({...form, conditions: [{ ...(form.conditions || [{}])[0], operator: e.target.value }]})} className="select-field text-sm w-36 shrink-0">
                  <option value="gt">&gt; greater than</option>
                  <option value="gte">≥ at least</option>
                  <option value="lt">&lt; less than</option>
                  <option value="lte">≤ at most</option>
                  <option value="eq">= equals</option>
                  <option value="neq">≠ not equals</option>
                  <option value="empty">is empty</option>
                  <option value="not_empty">is not empty</option>
                </select>
                <input placeholder="value" value={(form.conditions || [{}])[0]?.value || ''} onChange={e => setForm({...form, conditions: [{ ...(form.conditions || [{}])[0], value: e.target.value }]})} className="input-field text-sm w-28 shrink-0" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Error Message</label>
              <input value={form.error_message || ''} onChange={e => setForm({...form, error_message: e.target.value})} className="input-field" placeholder="Shown to the user when the rule fires" />
            </div>
          </>}

          {/* ── VALIDATIONS ── */}
          {tab === 'validations' && <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Entity <span className="text-rose-500">*</span></label>
                  <select value={form.entity_type || ''} onChange={e => setForm({...form, entity_type: e.target.value, field_name: ''})} className="select-field">
                    <option value="">Select entity…</option>{entities.map(e => <option key={e} value={e}>{e.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Field <span className="text-rose-500">*</span></label>
                  <select value={form.field_name || ''} onChange={e => setForm({...form, field_name: e.target.value})} className="select-field" disabled={!form.entity_type}>
                    <option value="">{form.entity_type ? 'Select field…' : '← pick entity first'}</option>
                    {getEntityFields(form.entity_type).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800"/>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Rule</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Rule Type</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ruleTypes.map(r => (
                      <button key={r} type="button" onClick={() => setForm({...form, rule_type: r})}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium border text-center transition-all ${form.rule_type===r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-amber-400'}`}>
                        {r.replace(/_/g,' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Value / Pattern</label>
                    <input value={form.rule_value || ''} onChange={e => setForm({...form, rule_value: e.target.value})} className="input-field font-mono" placeholder={form.rule_type==='regex'?'^[A-Z0-9]{10}$':form.rule_type==='min_length'?'e.g. 8':'value'} />
                    <p className="mt-1 text-[10px] text-gray-400">
                      {form.rule_type === 'regex' && 'Regular expression pattern'}
                      {(form.rule_type === 'min_length' || form.rule_type === 'max_length') && 'Character count'}
                      {(form.rule_type === 'min_value' || form.rule_type === 'max_value') && 'Numeric threshold'}
                      {form.rule_type === 'unique' && 'Leave blank — uniqueness is enforced automatically'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Error Message</label>
                    <input value={form.error_message || ''} onChange={e => setForm({...form, error_message: e.target.value})} className="input-field" placeholder="Invalid value for this field" />
                  </div>
                </div>
              </div>
              {form.entity_type && form.field_name && form.rule_type && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                  <CheckSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0"/>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <span className="font-semibold capitalize">{form.entity_type.replace(/_/g,' ')}</span> → field <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded font-mono">{form.field_name}</code> must pass <span className="font-semibold">{form.rule_type.replace(/_/g,' ')}</span>{form.rule_value ? ` (${form.rule_value})` : ''}
                  </p>
                </div>
              )}
            </div>
          </>}

          {/* ── APPROVALS ── */}
          {tab === 'approvals' && <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Rule Name <span className="text-rose-500">*</span></label>
                <input value={form.rule_name || ''} onChange={e => setForm({...form, rule_name: e.target.value})} className="input-field" placeholder="e.g. PO above ₹1,00,000 needs Finance Manager" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Document Type <span className="text-rose-500">*</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {entities.map(e => (
                    <button key={e} type="button" onClick={() => setForm({...form, entity_type: e, condition_field: ''})}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${form.entity_type===e ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-cyan-400'}`}>
                      {e.replace(/_/g,' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800"/>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Trigger Condition</p>
              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-400 shrink-0 font-medium">When</span>
                <select value={form.condition_field || ''} onChange={e => setForm({...form, condition_field: e.target.value})} className="select-field text-sm flex-1" disabled={!form.entity_type}>
                  <option value="">{form.entity_type ? 'field…' : '← pick document type'}</option>
                  {getEntityFields(form.entity_type).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={form.condition_operator || '>='} onChange={e => setForm({...form, condition_operator: e.target.value})} className="select-field text-sm w-36 shrink-0">
                  <option value=">=">≥ at least</option><option value=">">&gt; greater</option>
                  <option value="<=">≤ at most</option><option value="<">&lt; less</option>
                  <option value="=">=  equals</option><option value="!=">≠ not equal</option>
                </select>
                <input value={form.condition_value || ''} onChange={e => setForm({...form, condition_value: e.target.value})} className="input-field text-sm w-28 shrink-0" placeholder="10000" />
              </div>
              {form.condition_field && form.condition_value && form.entity_type && (
                <div className="px-3 py-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800 text-xs text-cyan-700 dark:text-cyan-300">
                  Approval required when <span className="font-mono font-bold">{form.condition_field}</span> {form.condition_operator||'>='} <span className="font-mono font-bold">{form.condition_value}</span> on <span className="font-bold">{(form.entity_type||'').replace(/_/g,' ')}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Approval Levels</p>
                <button type="button" onClick={() => { const s = form.approver_steps || [{ step: 1, approver_role: '', approver_user_id: '' }]; setForm({ ...form, approver_steps: [...s, { step: s.length + 1, approver_role: '', approver_user_id: '' }] }); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
                  <Plus size={11}/> Add Level
                </button>
              </div>
              {(form.approver_steps || [{ step: 1, approver_role: '', approver_user_id: '' }]).map((step, idx) => {
                const steps = form.approver_steps || [{ step: 1, approver_role: '', approver_user_id: '' }];
                return (
                  <div key={idx} className="flex items-center gap-2 p-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="w-7 h-7 rounded-full bg-cyan-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{step.step}</div>
                    <select value={step.approver_role || ''} onChange={e => { const s=[...steps]; s[idx]={...s[idx],approver_role:e.target.value}; setForm({...form,approver_steps:s}); }} className="select-field text-sm flex-1">
                      <option value="">Any role…</option>{roles.map(r => <option key={r.id} value={r.role_code}>{r.role_name}</option>)}
                    </select>
                    <span className="text-[10px] text-gray-400 font-medium shrink-0">OR</span>
                    <select value={step.approver_user_id || ''} onChange={e => { const s=[...steps]; s[idx]={...s[idx],approver_user_id:e.target.value}; setForm({...form,approver_steps:s}); }} className="select-field text-sm flex-1">
                      <option value="">Specific user…</option>{users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                    </select>
                    {steps.length > 1 && (
                      <button type="button" onClick={() => { const s=steps.filter((_,i)=>i!==idx).map((st,i)=>({...st,step:i+1})); setForm({...form,approver_steps:s}); }} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg text-gray-400 hover:text-rose-500 transition-colors shrink-0">
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>}

          {/* ── EMAIL TEMPLATES ── */}
          {tab === 'emails' && <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Template Key <span className="text-rose-500">*</span></label>
                <input value={form.template_key || ''} onChange={e => setForm({...form, template_key: e.target.value.toLowerCase().replace(/\s/g,'_')})} className="input-field font-mono" placeholder="po_approved" />
                <p className="mt-1 text-[10px] text-gray-400">snake_case, no spaces</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Display Name <span className="text-rose-500">*</span></label>
                <input value={form.template_name || ''} onChange={e => setForm({...form, template_name: e.target.value})} className="input-field" placeholder="PO Approved Notification" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Subject Line <span className="text-rose-500">*</span></label>
              <input value={form.subject || ''} onChange={e => setForm({...form, subject: e.target.value})} className="input-field" placeholder="Your PO {{doc_number}} has been approved" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">HTML Body</label>
              <textarea value={form.body_html || ''} onChange={e => setForm({...form, body_html: e.target.value})} className="input-field font-mono text-xs leading-relaxed" rows={7} placeholder={'<h2>Hello {{recipient_name}},</h2>\n<p>Your <strong>{{doc_number}}</strong> has been approved.</p>'} />
              <p className="mt-1 text-[10px] text-gray-400">Supports HTML. Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{{variable}}'}</code> for dynamic values.</p>
            </div>
          </>}

          {/* ── PRINT TEMPLATES ── */}
          {tab === 'print' && <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Template Name <span className="text-rose-500">*</span></label>
                <input value={form.template_name || ''} onChange={e => setForm({...form, template_name: e.target.value})} className="input-field" placeholder="Standard PO Template" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Document Type <span className="text-rose-500">*</span></label>
                <select value={form.entity_type || ''} onChange={e => setForm({...form, entity_type: e.target.value})} className="select-field">
                  <option value="">Select…</option>
                  <option value="purchase_order">Purchase Order</option><option value="sales_order">Sales Order</option>
                  <option value="quotation">Quotation</option><option value="ap_invoice">AP Invoice</option>
                  <option value="ar_invoice">AR Invoice</option><option value="payment">Payment</option>
                </select>
              </div>
            </div>
            <div className="h-px bg-gray-100 dark:bg-gray-800"/>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Company Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Company Name</label>
                  <input value={form.company_name || ''} onChange={e => setForm({...form, company_name: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Logo URL</label>
                  <input value={form.logo_url || ''} onChange={e => setForm({...form, logo_url: e.target.value})} className="input-field" placeholder="https://…" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Address</label>
                <textarea value={form.company_address || ''} onChange={e => setForm({...form, company_address: e.target.value})} className="input-field" rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Phone</label>
                  <input value={form.company_phone || ''} onChange={e => setForm({...form, company_phone: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Email</label>
                  <input value={form.company_email || ''} onChange={e => setForm({...form, company_email: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">GST / Tax ID</label>
                  <input value={form.company_tax_id || ''} onChange={e => setForm({...form, company_tax_id: e.target.value})} className="input-field font-mono" />
                </div>
              </div>
            </div>
          </>}

        </div>
      </Modal>

      {/* EMAIL PREVIEW */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showPreview} onClose={() => setShowPreview(null)} title={`Preview: ${showPreview?.template_name}`} size="xl">
        {showPreview && (
          <div className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Subject: <span className="text-gray-900 dark:text-gray-100 font-medium">{showPreview.subject}</span></p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: showPreview.body_html }} />
            <div className="text-xs text-gray-400">Variables: {((typeof showPreview.variables === 'string' ? JSON.parse(showPreview.variables) : showPreview.variables) || []).map(v => <code key={v} className="mx-1 px-1 bg-gray-100 dark:bg-gray-800 rounded">{`{{${v}}}`}</code>)}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
