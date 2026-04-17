import { useState, useEffect } from 'react';
import {
  Plus, Plug, Zap, ArrowLeftRight, Key, Webhook, Play, Trash2, CheckCircle,
  XCircle, Clock, Copy, Eye, EyeOff, RefreshCw, Settings2, ArrowRight, Search
} from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate, formatDateTime, formatNumber } from '../../utils/formatters';

export default function IntegrationHub() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [connectors, setConnectors] = useState([]);
  const [connections, setConnections] = useState([]);
  const [flows, setFlows] = useState([]);
  const [execLog, setExecLog] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [schemas, setSchemas] = useState({});
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Modals
  const [showNewConnection, setShowNewConnection] = useState(false);
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(null);
  const [searchCon, setSearchCon] = useState('');

  // Forms
  const [connForm, setConnForm] = useState({ connector_id: '', connection_name: '', credentials: {} });
  const [flowForm, setFlowForm] = useState({ connection_id: '', flow_name: '', direction: 'inbound', trigger_type: 'manual', source_entity: '', target_entity: '', field_mapping: [] });
  const [apiKeyForm, setApiKeyForm] = useState({ key_name: '', permissions: { read: true, write: false }, rate_limit_per_min: 100 });
  const [webhookForm, setWebhookForm] = useState({ connection_id: '', target_entity: '', field_mapping: [] });

  useEffect(() => { loadAll(); }, [tab]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, con, conns, fl, el, wh, ak, sch] = await Promise.all([
        api.get('/integrations/overview').catch(()=>null),
        api.get('/integrations/connectors').catch(()=>null),
        api.get('/integrations/connections').catch(()=>null),
        api.get('/integrations/flows').catch(()=>null),
        api.get('/integrations/execution-log').catch(()=>null),
        api.get('/integrations/webhooks').catch(()=>null),
        api.get('/integrations/api-keys').catch(()=>null),
        api.get('/integrations/schemas').catch(()=>null),
      ]);
      setOverview(ov?.data); setConnectors(con?.data || []); setConnections(conns?.data || []);
      setFlows(fl?.data || []); setExecLog(el?.data || []);
      setWebhooks(wh?.data || []); setApiKeys(ak?.data || []); setSchemas(sch?.data || {});
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  // ===== HANDLERS =====
  const handleCreateConnection = async () => {
    if (!connForm.connector_id || !connForm.connection_name) { setAlert({ type: 'error', message: 'Select connector and enter name' }); return; }
    setSaving(true);
    try { await api.post('/integrations/connections', connForm); setShowNewConnection(false); setAlert({ type: 'success', message: 'Connection created' }); loadAll(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleTestConnection = async (id) => {
    try { const r = await api.post(`/integrations/connections/${id}/test`); setAlert({ type: 'success', message: r?.data?.message || 'Test passed' }); loadAll(); }
    catch (err) { setModalError(err.message); }
  };

  const handleCreateFlow = async () => {
    if (!flowForm.connection_id || !flowForm.flow_name || !flowForm.source_entity || !flowForm.target_entity) {
      setAlert({ type: 'error', message: 'All fields required' }); return;
    }
    if (!flowForm.field_mapping.length) { setAlert({ type: 'error', message: 'Add at least one field mapping' }); return; }
    setSaving(true);
    try { await api.post('/integrations/flows', flowForm); setShowNewFlow(false); setAlert({ type: 'success', message: 'Flow created' }); loadAll(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleRunFlow = async (id) => {
    try { const r = await api.post(`/integrations/flows/${id}/run`); setAlert({ type: 'success', message: `Flow executed — ${r?.data?.records || 0} records processed` }); loadAll(); }
    catch (err) { setModalError(err.message); }
  };

  const handleCreateApiKey = async () => {
    if (!apiKeyForm.key_name) { setAlert({ type: 'error', message: 'Key name required' }); return; }
    setSaving(true);
    try {
      const r = await api.post('/integrations/api-keys', apiKeyForm);
      setShowNewApiKey(false); setShowApiSecret(r?.data); setAlert({ type: 'success', message: 'API key created' }); loadAll();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleCreateWebhook = async () => {
    if (!webhookForm.connection_id || !webhookForm.target_entity) { setAlert({ type: 'error', message: 'Connection and target required' }); return; }
    setSaving(true);
    try { await api.post('/integrations/webhooks', webhookForm); setShowNewWebhook(false); setAlert({ type: 'success', message: 'Webhook created' }); loadAll(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  // ===== FIELD MAPPING HELPERS =====
  const sourceFields = flowForm.source_entity && schemas[flowForm.source_entity] ? schemas[flowForm.source_entity].fields : [];
  const targetFields = flowForm.target_entity && schemas[flowForm.target_entity] ? schemas[flowForm.target_entity].fields : [];

  const addMapping = () => setFlowForm({ ...flowForm, field_mapping: [...flowForm.field_mapping, { source: '', target: '', transform: '' }] });
  const updateMapping = (idx, field, value) => {
    const m = [...flowForm.field_mapping]; m[idx] = { ...m[idx], [field]: value }; setFlowForm({ ...flowForm, field_mapping: m });
  };
  const removeMapping = (idx) => setFlowForm({ ...flowForm, field_mapping: flowForm.field_mapping.filter((_, i) => i !== idx) });
  const autoMap = () => {
    const maps = [];
    for (const sf of sourceFields) {
      const match = targetFields.find(tf => tf.key === sf.key || tf.label.toLowerCase() === sf.label.toLowerCase());
      if (match) maps.push({ source: sf.key, target: match.key, transform: '' });
    }
    setFlowForm({ ...flowForm, field_mapping: maps });
    if (maps.length) setAlert({ type: 'success', message: `Auto-mapped ${maps.length} field(s)` });
    else setAlert({ type: 'warning', message: 'No matching fields found' });
  };

  const filteredConnectors = searchCon ? connectors.filter(c => c.connector_name.toLowerCase().includes(searchCon.toLowerCase()) || c.category?.toLowerCase().includes(searchCon.toLowerCase())) : connectors;
  const categories = [...new Set(connectors.map(c => c.category).filter(Boolean))];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Integration Hub</h1>
          <p className="text-sm text-gray-400 mt-1">Connect Zyra with external systems — bidirectional data flows</p>
        </div>
        <div className="flex gap-2">
          {tab === 'connections' && <button onClick={() => { setConnForm({ connector_id: '', connection_name: '', credentials: {} }); setShowNewConnection(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Connection</button>}
          {tab === 'flows' && <button onClick={() => { setFlowForm({ connection_id: '', flow_name: '', direction: 'inbound', trigger_type: 'manual', source_entity: '', target_entity: '', field_mapping: [] }); setShowNewFlow(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Flow</button>}
          {tab === 'api-keys' && <button onClick={() => { setApiKeyForm({ key_name: '', permissions: { read: true, write: false }, rate_limit_per_min: 100 }); setShowNewApiKey(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Generate Key</button>}
          {tab === 'webhooks' && <button onClick={() => { setWebhookForm({ connection_id: '', target_entity: '', field_mapping: [] }); setShowNewWebhook(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Webhook</button>}
        </div>
      </div>

      <Tabs tabs={[
        { key: 'overview', label: 'Overview' }, { key: 'marketplace', label: 'App Marketplace' },
        { key: 'connections', label: 'Connections', count: connections.length },
        { key: 'flows', label: 'Data Flows', count: flows.length },
        { key: 'webhooks', label: 'Webhooks', count: webhooks.length },
        { key: 'api-keys', label: 'API Keys', count: apiKeys.length },
        { key: 'log', label: 'Execution Log' },
      ]} active={tab} onChange={setTab} />

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && overview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Available Apps', value: overview.connectors?.total, icon: Plug, color: 'from-blue-500 to-blue-600' },
              { label: 'Connections', value: `${overview.connections?.active}/${overview.connections?.total}`, icon: Zap, color: 'from-emerald-500 to-emerald-600' },
              { label: 'Data Flows', value: `${overview.flows?.active}/${overview.flows?.total}`, icon: ArrowLeftRight, color: 'from-violet-500 to-violet-600' },
              { label: 'Executions (30d)', value: overview.executions?.total, icon: Play, color: 'from-amber-500 to-amber-600' },
              { label: 'Webhooks', value: overview.webhooks?.total, icon: Webhook, color: 'from-pink-500 to-pink-600' },
              { label: 'API Keys', value: overview.apiKeys?.total, icon: Key, color: 'from-cyan-500 to-cyan-600' },
            ].map((c, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 text-center">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mx-auto mb-2`}><c.icon className="w-5 h-5 text-white" /></div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{c.value || 0}</p>
                <p className="text-xs text-gray-400">{c.label}</p>
              </div>
            ))}
          </div>
          {overview.flows?.total_runs > 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Total flow executions: {formatNumber(overview.flows.total_runs)}</p>}
        </div>
      )}

      {/* ===== APP MARKETPLACE ===== */}
      {tab === 'marketplace' && (
        <div className="space-y-4">
          <SearchInput value={searchCon} onChange={setSearchCon} placeholder="Search apps..." className="w-72" />
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setSearchCon('')} className={`px-3 py-1 rounded-full text-xs border ${!searchCon ? 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-950 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>All</button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setSearchCon(cat)} className={`px-3 py-1 rounded-full text-xs border capitalize ${searchCon === cat ? 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-950 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>{cat}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConnectors.filter(c => c.is_template).map(c => (
              <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 hover:shadow-card transition-all cursor-pointer group"
                onClick={() => { setConnForm({ connector_id: c.id, connection_name: `My ${c.connector_name}`, credentials: {} }); setShowNewConnection(true); setTab('connections'); }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{c.icon}</span>
                  <div><h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.connector_name}</h3>
                    <span className="text-[10px] text-gray-400 uppercase">{c.category}</span></div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{c.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500">{c.auth_type}</span>
                  <span className="text-xs text-blue-600 font-medium group-hover:underline">Connect →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== CONNECTIONS ===== */}
      {tab === 'connections' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'icon', label: '', render: v => <span className="text-xl">{v}</span> },
            { key: 'connection_name', label: 'Connection', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
            { key: 'connector_name', label: 'App' },
            { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
            { key: 'last_tested_at', label: 'Last Tested', render: v => v ? formatDateTime(v) : '—' },
            { key: 'last_sync_at', label: 'Last Sync', render: v => v ? formatDateTime(v) : '—' },
            { key: 'id', label: '', render: (v, row) => (
              <div className="flex gap-1">
                <button onClick={e => { e.stopPropagation(); handleTestConnection(v); }} title="Test" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><Zap className="w-3.5 h-3.5 text-amber-500" /></button>
                <button onClick={e => { e.stopPropagation(); api.delete(`/integrations/connections/${v}`).then(() => { setAlert({ type: 'success', message: 'Deleted' }); loadAll(); }); }} title="Delete" className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
              </div>
            )},
          ]} data={connections} loading={loading} emptyMessage="No connections yet. Browse the App Marketplace to get started." />
        </div>
      )}

      {/* ===== DATA FLOWS ===== */}
      {tab === 'flows' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'icon', label: '', render: v => <span className="text-lg">{v}</span> },
            { key: 'flow_name', label: 'Flow', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
            { key: 'direction', label: 'Direction', render: v => <span className={`badge ${v === 'inbound' ? 'badge-info' : 'badge-success'} capitalize`}>{v}</span> },
            { key: 'source_entity', label: 'Source', render: v => <span className="capitalize text-gray-600 dark:text-gray-400">{(v || '').replace(/_/g, ' ')}</span> },
            { key: 'target_entity', label: 'Target', render: v => <span className="capitalize text-gray-600 dark:text-gray-400">{(v || '').replace(/_/g, ' ')}</span> },
            { key: 'trigger_type', label: 'Trigger', render: v => <span className="capitalize text-gray-500">{v}</span> },
            { key: 'run_count', label: 'Runs', className: 'text-right', render: v => formatNumber(v) },
            { key: 'last_run_status', label: 'Last Run', render: v => v ? <StatusBadge status={v} /> : <span className="text-gray-400">Never</span> },
            { key: 'id', label: '', render: (v, row) => (
              <div className="flex gap-1">
                <button onClick={e => { e.stopPropagation(); handleRunFlow(v); }} title="Run now" className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"><Play className="w-3.5 h-3.5 text-blue-500" /></button>
                <button onClick={e => { e.stopPropagation(); api.delete(`/integrations/flows/${v}`).then(() => { loadAll(); }); }} title="Delete" className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button>
              </div>
            )},
          ]} data={flows} loading={loading} emptyMessage="No data flows configured yet." />
        </div>
      )}

      {/* ===== WEBHOOKS ===== */}
      {tab === 'webhooks' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'connection_name', label: 'Connection' },
            { key: 'webhook_key', label: 'Endpoint', render: v => <span className="font-mono text-xs text-blue-600 dark:text-blue-400">/api/integrations/webhook/{v.substring(0, 12)}...</span> },
            { key: 'target_entity', label: 'Target', render: v => <span className="capitalize">{(v || '').replace(/_/g, ' ')}</span> },
            { key: 'receive_count', label: 'Received', className: 'text-right', render: v => formatNumber(v) },
            { key: 'last_received_at', label: 'Last Received', render: v => v ? formatDateTime(v) : '—' },
            { key: 'is_active', label: 'Active', render: v => v ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-300" /> },
          ]} data={webhooks} loading={loading} emptyMessage="No webhooks configured." />
        </div>
      )}

      {/* ===== API KEYS ===== */}
      {tab === 'api-keys' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">API keys allow external systems to read/write Zyra data. Treat keys like passwords — never share them publicly.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            <DataTable columns={[
              { key: 'key_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
              { key: 'api_key', label: 'Key', render: v => <span className="font-mono text-xs text-gray-500">{v.substring(0, 20)}...</span> },
              { key: 'permissions', label: 'Permissions', render: v => {
                const p = typeof v === 'string' ? JSON.parse(v) : v;
                return <div className="flex gap-1">{p?.read && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">Read</span>}{p?.write && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">Write</span>}</div>;
              }},
              { key: 'usage_count', label: 'Usage', className: 'text-right', render: v => formatNumber(v) },
              { key: 'last_used_at', label: 'Last Used', render: v => v ? formatDateTime(v) : 'Never' },
              { key: 'is_active', label: 'Active', render: v => v ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-gray-300" /> },
              { key: 'id', label: '', render: v => <button onClick={() => api.delete(`/integrations/api-keys/${v}`).then(() => { setAlert({ type: 'success', message: 'Key revoked' }); loadAll(); })} title="Revoke" className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button> },
            ]} data={apiKeys} loading={loading} emptyMessage="No API keys generated." />
          </div>
        </div>
      )}

      {/* ===== EXECUTION LOG ===== */}
      {tab === 'log' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'icon', label: '', render: v => <span className="text-lg">{v}</span> },
            { key: 'flow_name', label: 'Flow', render: v => <span className="font-medium">{v}</span> },
            { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
            { key: 'records_processed', label: 'Processed', className: 'text-right', render: v => formatNumber(v) },
            { key: 'records_success', label: 'Success', className: 'text-right', render: v => <span className="text-emerald-600">{formatNumber(v)}</span> },
            { key: 'records_failed', label: 'Failed', className: 'text-right', render: v => <span className={parseInt(v) > 0 ? 'text-rose-600 font-semibold' : 'text-gray-300'}>{formatNumber(v)}</span> },
            { key: 'duration_ms', label: 'Duration', render: v => v ? `${v}ms` : '—' },
            { key: 'started_at', label: 'Started', render: v => formatDateTime(v) },
          ]} data={execLog} loading={loading} emptyMessage="No executions yet. Run a flow to see results here." />
        </div>
      )}

      {/* ===== NEW CONNECTION MODAL ===== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showNewConnection} onClose={() => setShowNewConnection(false)} title="Create Connection" size="xl"
        footer={<><button onClick={() => setShowNewConnection(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreateConnection} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Connection'}</button></>}>
        <div className="space-y-4">
          <FormField label="App / Connector" required>
            <select value={connForm.connector_id} onChange={e => {
              const c = connectors.find(cn => cn.id === e.target.value);
              setConnForm({ ...connForm, connector_id: e.target.value, connection_name: c ? `My ${c.connector_name}` : '' });
            }} className="select-field">
              <option value="">Select app...</option>
              {connectors.filter(c => c.is_template).map(c => <option key={c.id} value={c.id}>{c.icon} {c.connector_name} — {c.description?.substring(0, 50)}</option>)}
            </select>
          </FormField>
          <FormField label="Connection Name" required><input value={connForm.connection_name} onChange={e => setConnForm({ ...connForm, connection_name: e.target.value })} className="input-field" placeholder="e.g. Production Salesforce" /></FormField>
          {connForm.connector_id && (() => {
            const c = connectors.find(cn => cn.id === connForm.connector_id);
            if (!c) return null;
            return (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase">Authentication: {c.auth_type}</p>
                {c.auth_type === 'api_key' && (
                  <FormField label="API Key"><input value={connForm.credentials.api_key || ''} onChange={e => setConnForm({ ...connForm, credentials: { ...connForm.credentials, api_key: e.target.value } })} className="input-field font-mono" placeholder="Enter API key" /></FormField>
                )}
                {c.auth_type === 'oauth2' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Client ID"><input value={connForm.credentials.client_id || ''} onChange={e => setConnForm({ ...connForm, credentials: { ...connForm.credentials, client_id: e.target.value } })} className="input-field font-mono" /></FormField>
                    <FormField label="Client Secret"><input type="password" value={connForm.credentials.client_secret || ''} onChange={e => setConnForm({ ...connForm, credentials: { ...connForm.credentials, client_secret: e.target.value } })} className="input-field font-mono" /></FormField>
                  </div>
                )}
                {c.base_url && <FormField label="Base URL"><input value={connForm.credentials.base_url || c.base_url} onChange={e => setConnForm({ ...connForm, credentials: { ...connForm.credentials, base_url: e.target.value } })} className="input-field font-mono text-xs" /></FormField>}
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* ===== NEW FLOW + FIELD MAPPING MODAL ===== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showNewFlow} onClose={() => setShowNewFlow(false)} title="Create Data Flow" size="xl"
        footer={<><button onClick={() => setShowNewFlow(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreateFlow} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Flow'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Connection" required><select value={flowForm.connection_id} onChange={e => setFlowForm({ ...flowForm, connection_id: e.target.value })} className="select-field"><option value="">Select...</option>{connections.map(c => <option key={c.id} value={c.id}>{c.connection_name}</option>)}</select></FormField>
            <FormField label="Flow Name" required><input value={flowForm.flow_name} onChange={e => setFlowForm({ ...flowForm, flow_name: e.target.value })} className="input-field" placeholder="e.g. Sync Customers from Salesforce" /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Direction"><select value={flowForm.direction} onChange={e => setFlowForm({ ...flowForm, direction: e.target.value })} className="select-field"><option value="inbound">Inbound (External → Zyra)</option><option value="outbound">Outbound (Zyra → External)</option></select></FormField>
            <FormField label="Trigger"><select value={flowForm.trigger_type} onChange={e => setFlowForm({ ...flowForm, trigger_type: e.target.value })} className="select-field"><option value="manual">Manual</option><option value="scheduled">Scheduled</option><option value="webhook">On Webhook</option><option value="on_create">On Record Create</option></select></FormField>
            <div />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={flowForm.direction === 'inbound' ? 'Source (External)' : 'Source (Zyra)'} required>
              <select value={flowForm.source_entity} onChange={e => setFlowForm({ ...flowForm, source_entity: e.target.value, field_mapping: [] })} className="select-field">
                <option value="">Select entity...</option>
                {Object.entries(schemas).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormField>
            <FormField label={flowForm.direction === 'inbound' ? 'Target (Zyra)' : 'Target (External)'} required>
              <select value={flowForm.target_entity} onChange={e => setFlowForm({ ...flowForm, target_entity: e.target.value, field_mapping: [] })} className="select-field">
                <option value="">Select entity...</option>
                {Object.entries(schemas).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </FormField>
          </div>

          {/* ===== VISUAL FIELD MAPPER ===== */}
          {flowForm.source_entity && flowForm.target_entity && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Field Mapping</span>
                  <span className="text-xs text-gray-400">({flowForm.field_mapping.length} mapped)</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={autoMap} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Zap className="w-3 h-3" /> Auto-Map</button>
                  <button onClick={addMapping} className="text-xs text-blue-600 hover:underline">+ Add</button>
                </div>
              </div>

              {/* Mapping header */}
              <div className="grid grid-cols-[1fr_32px_1fr_80px_32px] gap-2 mb-2 text-[10px] font-semibold text-gray-400 uppercase">
                <span>Source Field</span><span /><span>Target Field</span><span>Transform</span><span />
              </div>

              {/* Mapping rows */}
              <div className="space-y-1.5">
                {flowForm.field_mapping.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_32px_1fr_80px_32px] gap-2 items-center">
                    <select value={m.source} onChange={e => updateMapping(i, 'source', e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      <option value="">—</option>{sourceFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-gray-300" /></div>
                    <select value={m.target} onChange={e => updateMapping(i, 'target', e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      <option value="">—</option>{targetFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select value={m.transform} onChange={e => updateMapping(i, 'transform', e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <option value="">None</option><option value="uppercase">UPPER</option><option value="lowercase">lower</option><option value="trim">Trim</option><option value="to_number">→ Number</option><option value="to_date">→ Date</option>
                    </select>
                    <button onClick={() => removeMapping(i)} className="p-1 text-gray-400 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {flowForm.field_mapping.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No field mappings. Click "Auto-Map" to match fields automatically, or "Add" to map manually.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ===== NEW API KEY MODAL ===== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showNewApiKey} onClose={() => setShowNewApiKey(false)} title="Generate API Key" size="xl"
        footer={<><button onClick={() => setShowNewApiKey(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreateApiKey} disabled={saving} className="btn-primary">{saving ? 'Generating...' : 'Generate Key'}</button></>}>
        <div className="space-y-4">
          <FormField label="Key Name" required><input value={apiKeyForm.key_name} onChange={e => setApiKeyForm({ ...apiKeyForm, key_name: e.target.value })} className="input-field" placeholder="e.g. Shopify Production" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Permissions">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apiKeyForm.permissions.read} onChange={e => setApiKeyForm({ ...apiKeyForm, permissions: { ...apiKeyForm.permissions, read: e.target.checked } })} className="w-4 h-4 rounded" /> Read</label>
              <label className="flex items-center gap-2 text-sm mt-1"><input type="checkbox" checked={apiKeyForm.permissions.write} onChange={e => setApiKeyForm({ ...apiKeyForm, permissions: { ...apiKeyForm.permissions, write: e.target.checked } })} className="w-4 h-4 rounded" /> Write</label>
            </FormField>
            <FormField label="Rate Limit (per min)"><input type="number" value={apiKeyForm.rate_limit_per_min} onChange={e => setApiKeyForm({ ...apiKeyForm, rate_limit_per_min: parseInt(e.target.value) })} className="input-field" /></FormField>
          </div>
        </div>
      </Modal>

      {/* ===== API SECRET DISPLAY (one-time) ===== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showApiSecret} onClose={() => setShowApiSecret(null)} title="API Key Created — Save Your Secret" size="xl">
        {showApiSecret && (
          <div className="space-y-4">
            <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
              <p className="text-sm text-rose-700 dark:text-rose-400 font-medium">⚠️ Copy the API secret now. It will NOT be shown again.</p>
            </div>
            <FormField label="API Key"><div className="flex gap-2"><input readOnly value={showApiSecret.api_key} className="input-field font-mono text-xs flex-1" /><button onClick={() => navigator.clipboard.writeText(showApiSecret.api_key)} className="btn-ghost"><Copy className="w-4 h-4" /></button></div></FormField>
            <FormField label="API Secret"><div className="flex gap-2"><input readOnly value={showApiSecret.api_secret} className="input-field font-mono text-xs flex-1" /><button onClick={() => navigator.clipboard.writeText(showApiSecret.api_secret)} className="btn-ghost"><Copy className="w-4 h-4" /></button></div></FormField>
          </div>
        )}
      </Modal>

      {/* ===== NEW WEBHOOK MODAL ===== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showNewWebhook} onClose={() => setShowNewWebhook(false)} title="Create Webhook Endpoint" size="xl"
        footer={<><button onClick={() => setShowNewWebhook(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreateWebhook} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create Webhook'}</button></>}>
        <div className="space-y-4">
          <FormField label="Connection" required><select value={webhookForm.connection_id} onChange={e => setWebhookForm({ ...webhookForm, connection_id: e.target.value })} className="select-field"><option value="">Select...</option>{connections.map(c => <option key={c.id} value={c.id}>{c.connection_name}</option>)}</select></FormField>
          <FormField label="Target Entity" required><select value={webhookForm.target_entity} onChange={e => setWebhookForm({ ...webhookForm, target_entity: e.target.value })} className="select-field"><option value="">Select...</option>{Object.entries(schemas).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></FormField>
          <p className="text-xs text-gray-400">After creation, you'll receive a unique webhook URL and secret to configure in your external system.</p>
        </div>
      </Modal>
    </div>
  );
}
