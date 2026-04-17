import { useState, useEffect } from 'react';
import { Shield, Activity, Users, Database } from 'lucide-react';
import { DataTable, SearchInput, Tabs, PageLoader , DownloadButton } from '../../components/common/index';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../utils/api';
import { formatDateTime, formatNumber } from '../../utils/formatters';

const COLORS = ['#1a6af5', '#7c3aed', '#059669', '#d97706', '#e11d48', '#0891b2', '#6366f1', '#ea580c'];

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => { loadData(); }, [entityFilter, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        api.get('/admin/audit-log', { entity_type: entityFilter, date_from: dateFrom, date_to: dateTo }).catch(()=>null),
        api.get('/admin/audit-log/stats').catch(()=>null),
      ]);
      setLogs(l?.data || []); setStats(s?.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const columns = [
    { key: 'created_at', label: 'Timestamp', render: v => <span className="text-xs text-gray-500 font-mono">{formatDateTime(v)}</span> },
    { key: 'user_name', label: 'User', render: (v, row) => <div><span className="font-medium text-gray-900">{v}</span><br/><span className="text-xs text-gray-400">{row.username}</span></div> },
    { key: 'action', label: 'Action', render: v => {
      const colors = { CREATE: 'badge-success', UPDATE: 'badge-info', DELETE: 'badge-danger', POST: 'badge-success', DEACTIVATE: 'badge-warning', REVERSE: 'badge-warning' };
      return <span className={`badge ${colors[v] || 'badge-neutral'}`}>{v}</span>;
    }},
    { key: 'entity_type', label: 'Entity', render: v => <span className="capitalize text-gray-700">{(v || '').replace(/_/g, ' ')}</span> },
    { key: 'module', label: 'Module', render: v => v || '—' },
    { key: 'ip_address', label: 'IP', render: v => <span className="text-xs font-mono text-gray-400">{v || '—'}</span> },
    { key: 'description', label: 'Details', render: v => <span className="text-xs text-gray-500 max-w-[200px] truncate block">{v || '—'}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Audit Log</h1><p className="text-sm text-gray-400 mt-1">System-wide activity tracking</p></div></div><DownloadButton data={logs} filename="AuditLogPage" />

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
            <div><p className="text-lg font-bold text-gray-900">{formatNumber(stats.total || 0)}</p><p className="text-xs text-gray-400">Total Events</p></div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-2">By Action</p>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byAction || []} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="action" tick={{ fontSize: 10, fill: '#64748b' }} width={60} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>{(stats.byAction || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-2">Top Users</p>
            <div className="space-y-1.5">{(stats.byUser || []).slice(0, 4).map((u, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{u.name}</span>
                <span className="font-semibold text-gray-900">{u.count}</span>
              </div>
            ))}</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} className="select-field w-44 py-1.5 text-sm">
          <option value="">All entities</option>
          {(stats?.byEntity || []).map(e => <option key={e.entity_type} value={e.entity_type}>{e.entity_type?.replace(/_/g, ' ')}</option>)}
        </select>
        <div className="flex items-center gap-2"><label className="text-xs text-gray-500">From:</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field py-1.5 text-sm w-36" /></div>
        <div className="flex items-center gap-2"><label className="text-xs text-gray-500">To:</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field py-1.5 text-sm w-36" /></div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={columns} data={logs} loading={loading} emptyMessage="No audit events found" /></div>
    </div>
  );
}
