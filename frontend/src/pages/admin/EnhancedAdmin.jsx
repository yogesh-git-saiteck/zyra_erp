import { useState, useEffect } from 'react';
import {
  ShieldCheck, Mail, RefreshCw, Package, Users, Database, Activity, Bell,
  Play, ToggleLeft, ToggleRight, Trash2, Plus, Eye, Key
} from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDateTime, formatNumber } from '../../utils/formatters';

export default function EnhancedAdmin() {
  const [tab, setTab] = useState('notifications');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [apiUsage, setApiUsage] = useState(null);

  useEffect(() => { loadData(); }, [tab]);
  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'notifications') { const r = await api.get('/finance/notifications'); setData(r?.data?.notifications || []); }
      else if (tab === 'email') { const r = await api.get('/enhanced/email-queue'); setData(r?.data || []); }
      else if (tab === 'recurring') { const r = await api.get('/enhanced/recurring'); setData(r?.data || []); }
      else if (tab === 'batches') { const r = await api.get('/enhanced/batches'); setData(r?.data || []); }
      else if (tab === 'serials') { const r = await api.get('/enhanced/serial-numbers'); setData(r?.data || []); }
      else if (tab === 'sessions') { const r = await api.get('/enhanced/sessions/active'); setData(r?.data || []); }
      else if (tab === 'archive') { const r = await api.get('/enhanced/archive-policies'); setData(r?.data || []); }
      else if (tab === 'activity') { const r = await api.get('/enhanced/analytics/page-views'); setAnalytics(r?.data); }
      else if (tab === 'api') { const r = await api.get('/enhanced/api-usage'); setApiUsage(r?.data); }
      else if (tab === '2fa') {}
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSetup2FA = async () => {
    try { const r = await api.post('/enhanced/2fa/setup'); setAlert({ type: 'success', message: `2FA setup initiated. Secret: ${r?.data?.secret?.substring(0, 12)}...` }); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const handleProcessEmails = async () => {
    try { const r = await api.post('/enhanced/email/process-queue'); setAlert({ type: 'success', message: `Processed ${r?.data?.processed}: ${r?.data?.sent} sent, ${r?.data?.failed} failed` }); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const handleRunArchive = async (id) => {
    try { const r = await api.post(`/enhanced/archive/run/${id}`); setAlert({ type: 'success', message: `${r?.data?.eligible_records} records eligible for archiving` }); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const handleMarkRead = async (id) => {
    try { await api.put(`/finance/notifications/${id}/read`); loadData(); } catch {}
  };

  const handleReadAll = async () => {
    try { await api.put('/finance/notifications/read-all'); setAlert({ type: 'success', message: 'All marked as read' }); loadData(); } catch {}
  };

  const tabs = [
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'email', label: 'Email Queue', icon: Mail },
    { key: 'recurring', label: 'Recurring Docs', icon: RefreshCw },
    { key: 'batches', label: 'Batch Tracking', icon: Package },
    { key: 'serials', label: 'Serial Numbers', icon: Key },
    { key: 'sessions', label: 'Active Sessions', icon: Users },
    { key: 'activity', label: 'User Activity', icon: Activity },
    { key: 'archive', label: 'Archiving', icon: Database },
    { key: 'api', label: 'API Monitor', icon: Activity },
    { key: '2fa', label: '2FA Setup', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Enhanced Administration</h1><p className="text-sm text-gray-400 mt-1">Advanced features: 2FA, email, batches, sessions, archiving, API monitoring</p></div>
        <div className="flex gap-2">
          {tab === 'email' && <><DownloadButton data={data} filename="EnhancedAdmin" /><button onClick={handleProcessEmails} className="btn-primary flex items-center gap-2"><Play className="w-4 h-4" /> Process Queue</button></>}
          {tab === 'notifications' && <button onClick={handleReadAll} className="btn-secondary text-sm">Mark All Read</button>}
          {['recurring', 'batches', 'serials'].includes(tab) && <button onClick={() => { setForm({}); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New</button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* NOTIFICATIONS */}
      {tab === 'notifications' && <div className="space-y-2">
        {data.length === 0 && <p className="text-center text-gray-400 py-8">No notifications</p>}
        {data.map(n => (
          <div key={n.id} className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-3 flex items-center gap-3 cursor-pointer ${n.is_read ? 'opacity-60' : 'border-l-4 border-blue-500'}`} onClick={() => handleMarkRead(n.id)}>
            <Bell className={`w-4 h-4 ${n.notification_type === 'warning' ? 'text-amber-500' : n.notification_type === 'error' ? 'text-rose-500' : 'text-blue-500'}`} />
            <div className="flex-1"><p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p><p className="text-xs text-gray-400">{n.message}</p></div>
            <span className="text-xs text-gray-400">{formatDateTime(n.created_at)}</span>
          </div>
        ))}
      </div>}

      {/* EMAIL QUEUE */}
      {tab === 'email' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'to_email', label: 'To', render: v => <span className="text-sm">{v}</span> },
        { key: 'subject', label: 'Subject', render: v => <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{v}</span> },
        { key: 'template_key', label: 'Template', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
        { key: 'status', label: 'Status', render: v => <span className={`badge ${v === 'sent' ? 'badge-success' : v === 'failed' ? 'badge-danger' : 'badge-warning'}`}>{v}</span> },
        { key: 'attempts', label: 'Attempts', className: 'text-right' },
        { key: 'sent_at', label: 'Sent At', render: v => v ? formatDateTime(v) : '—' },
        { key: 'created_at', label: 'Queued', render: v => formatDateTime(v) },
      ]} data={data} loading={loading} emptyMessage="Email queue is empty." /></div>}

      {/* RECURRING */}
      {tab === 'recurring' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'template_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
        { key: 'entity_type', label: 'Type', render: v => <span className="capitalize">{(v||'').replace(/_/g,' ')}</span> },
        { key: 'frequency', label: 'Frequency', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{v}</span> },
        { key: 'next_run_date', label: 'Next Run', render: v => v || '—' },
        { key: 'occurrences_created', label: 'Created', className: 'text-right' },
        { key: 'is_active', label: 'Active', render: (v, row) => <button onClick={async () => { await api.put(`/enhanced/recurring/${row.id}/toggle`); loadData(); }}>{v ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}</button> },
      ]} data={data} loading={loading} /></div>}

      {/* BATCHES */}
      {tab === 'batches' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'batch_number', label: 'Batch #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
        { key: 'material_code', label: 'Material', render: (v, r) => <span>{v} - {r.material_name}</span> },
        { key: 'plant_code', label: 'Plant' },
        { key: 'quantity', label: 'Qty', className: 'text-right', render: v => formatNumber(v) },
        { key: 'manufacture_date', label: 'Mfg Date', render: v => v ? v.split('T')[0] : '—' },
        { key: 'expiry_date', label: 'Expiry', render: v => v ? <span className={new Date(v) < new Date() ? 'text-rose-600 font-bold' : ''}>{v.split('T')[0]}</span> : '—' },
        { key: 'status', label: 'Status', render: v => <span className={`badge ${v === 'active' ? 'badge-success' : 'badge-danger'} capitalize`}>{v}</span> },
      ]} data={data} loading={loading} /></div>}

      {/* SERIAL NUMBERS */}
      {tab === 'serials' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'serial_number', label: 'Serial #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
        { key: 'material_code', label: 'Material', render: (v, r) => <span>{v} - {r.material_name}</span> },
        { key: 'status', label: 'Status', render: v => <span className={`badge ${v === 'in_stock' ? 'badge-success' : v === 'sold' ? 'badge-info' : 'badge-warning'} capitalize`}>{(v||'').replace(/_/g,' ')}</span> },
        { key: 'current_location', label: 'Location', render: v => v || '—' },
        { key: 'warranty_end', label: 'Warranty End', render: v => v ? v.split('T')[0] : '—' },
      ]} data={data} loading={loading} /></div>}

      {/* SESSIONS */}
      {tab === 'sessions' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'username', label: 'User', render: (v, r) => <span className="font-medium">{r.first_name} {r.last_name} <span className="text-gray-400">({v})</span></span> },
        { key: 'ip_address', label: 'IP', render: v => <span className="font-mono text-sm">{v || '—'}</span> },
        { key: 'started_at', label: 'Login Time', render: v => formatDateTime(v) },
        { key: 'last_active_at', label: 'Last Active', render: v => formatDateTime(v) },
        { key: 'is_active', label: 'Status', render: v => v ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Online</span> : 'Offline' },
      ]} data={data} loading={loading} emptyMessage="No active sessions in the last 30 minutes." /></div>}

      {/* ACTIVITY ANALYTICS */}
      {tab === 'activity' && analytics && <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 p-3 pb-0">Top Pages (30 days)</h3><DataTable columns={[
            { key: 'page_path', label: 'Page', render: v => <span className="font-mono text-sm">{v}</span> },
            { key: 'page_title', label: 'Title' },
            { key: 'views', label: 'Views', className: 'text-right' },
            { key: 'unique_users', label: 'Users', className: 'text-right' },
          ]} data={analytics.top_pages || []} /></div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 p-3 pb-0">Top Users (30 days)</h3><DataTable columns={[
            { key: 'username', label: 'User', render: (v, r) => <span className="font-medium">{r.first_name} {r.last_name}</span> },
            { key: 'page_views', label: 'Page Views', className: 'text-right' },
          ]} data={analytics.top_users || []} /></div>
        </div>
      </div>}

      {/* ARCHIVE */}
      {tab === 'archive' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize font-medium">{(v||'').replace(/_/g,' ')}</span> },
        { key: 'table_name', label: 'Table', render: v => <span className="font-mono text-sm">{v}</span> },
        { key: 'condition_field', label: 'Condition', render: (v, r) => v ? `${v} ${r.condition_operator} ${r.condition_value}` : 'All records' },
        { key: 'retention_days', label: 'Retention', render: v => `${v} days` },
        { key: 'records_archived', label: 'Archived', className: 'text-right', render: v => formatNumber(v) },
        { key: 'last_run_at', label: 'Last Run', render: v => v ? formatDateTime(v) : 'Never' },
        { key: 'id', label: '', render: v => <button onClick={() => handleRunArchive(v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Play className="w-3 h-3" /> Run</button> },
      ]} data={data} loading={loading} /></div>}

      {/* API MONITOR */}
      {tab === 'api' && apiUsage && <div className="space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 p-3 pb-0">API Usage (24h)</h3><DataTable columns={[
          { key: 'endpoint', label: 'Endpoint', render: v => <span className="font-mono text-sm">{v}</span> },
          { key: 'requests', label: 'Requests', className: 'text-right' },
          { key: 'avg_response_ms', label: 'Avg Response', className: 'text-right', render: v => `${v}ms` },
        ]} data={apiUsage.summary || []} /></div>
        {(apiUsage.errors || []).length > 0 && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden border-l-4 border-rose-500"><h3 className="text-sm font-semibold text-rose-600 p-3 pb-0">Errors (24h)</h3><DataTable columns={[
          { key: 'endpoint', label: 'Endpoint', render: v => <span className="font-mono text-sm">{v}</span> },
          { key: 'status_code', label: 'Status', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">{v}</span> },
          { key: 'count', label: 'Count', className: 'text-right' },
        ]} data={apiUsage.errors || []} /></div>}
      </div>}

      {/* 2FA */}
      {tab === '2fa' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 max-w-lg">
        <div className="flex items-center gap-3 mb-4"><ShieldCheck className="w-8 h-8 text-blue-600" /><div><h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Two-Factor Authentication</h3><p className="text-sm text-gray-400">Add an extra layer of security to your account</p></div></div>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">When enabled, you'll need to enter a 6-digit code from Google Authenticator (or compatible app) each time you log in.</p>
          <button onClick={handleSetup2FA} className="btn-primary flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Setup 2FA</button>
          <button onClick={async () => { try { await api.post('/enhanced/2fa/disable'); setAlert({ type: 'success', message: '2FA disabled' }); } catch (e) { setAlert({ type: 'error', message: e.message }); } }} className="btn-secondary text-sm text-rose-600">Disable 2FA</button>
        </div>
      </div>}

      {/* CREATE MODAL */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={`New ${tab}`} size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={async () => {
          try {
            const endpoints = { recurring: '/enhanced/recurring', batches: '/enhanced/batches', serials: '/enhanced/serial-numbers' };
            await api.post(endpoints[tab], form); setShowCreate(false); setForm({}); setAlert({ type: 'success', message: 'Created' }); loadData();
          } catch (e) { setAlert({ type: 'error', message: e.message }); }
        }} className="btn-primary">Create</button></>}>
        <div className="space-y-4">
          {tab === 'recurring' && <>
            <FormField label="Name" required><input value={form.template_name || ''} onChange={e => setForm({...form, template_name: e.target.value})} className="input-field" /></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Entity Type"><select value={form.entity_type || ''} onChange={e => setForm({...form, entity_type: e.target.value})} className="select-field"><option value="">Select...</option><option value="sales_order">Sales Order</option><option value="purchase_order">Purchase Order</option><option value="invoice">Invoice</option><option value="journal_entry">Journal Entry</option></select></FormField>
              <FormField label="Frequency"><select value={form.frequency || 'monthly'} onChange={e => setForm({...form, frequency: e.target.value})} className="select-field"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></FormField>
            </div>
            <FormField label="Next Run Date"><input type="date" value={form.next_run_date || ''} onChange={e => setForm({...form, next_run_date: e.target.value})} className="input-field" /></FormField>
          </>}
          {tab === 'batches' && <>
            <FormField label="Batch Number" required><input value={form.batch_number || ''} onChange={e => setForm({...form, batch_number: e.target.value})} className="input-field font-mono" /></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Manufacture Date"><input type="date" value={form.manufacture_date || ''} onChange={e => setForm({...form, manufacture_date: e.target.value})} className="input-field" /></FormField>
              <FormField label="Expiry Date"><input type="date" value={form.expiry_date || ''} onChange={e => setForm({...form, expiry_date: e.target.value})} className="input-field" /></FormField>
            </div>
            <FormField label="Quantity"><input type="number" value={form.quantity || ''} onChange={e => setForm({...form, quantity: e.target.value})} className="input-field" /></FormField>
          </>}
          {tab === 'serials' && <>
            <FormField label="Serial Number" required><input value={form.serial_number || ''} onChange={e => setForm({...form, serial_number: e.target.value})} className="input-field font-mono" /></FormField>
            <FormField label="Warranty End"><input type="date" value={form.warranty_end || ''} onChange={e => setForm({...form, warranty_end: e.target.value})} className="input-field" /></FormField>
          </>}
        </div>
      </Modal>
    </div>
  );
}
