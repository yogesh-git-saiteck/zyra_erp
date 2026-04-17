import { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate, formatNumber } from '../../utils/formatters';

export default function LeaveManagement() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' });

  useEffect(() => { loadLeaves(); loadLookups(); }, [statusFilter]);

  const loadLeaves = async () => {
    try { const r = await api.get('/hr/leave', { status: statusFilter }).catch(()=>null); setLeaves(r?.data || []); } catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try { const [e, lt] = await Promise.all([api.get('/hr/employees').catch(()=>null), api.get('/hr/leave-types').catch(()=>null)]); setEmployees(e?.data || []); setLeaveTypes(lt?.data || []); } catch {}
  };

  const handleCreate = async () => {
    setSaving(true);
    try { await api.post('/hr/leave', form); setShowCreate(false); setAlert({ type: 'success', message: 'Leave request created' }); loadLeaves(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleApprove = async (id) => { try { await api.post(`/hr/leave/${id}/approve`); setAlert({ type: 'success', message: 'Approved' }); loadLeaves(); } catch (err) { setModalError(err.message); } };
  const handleReject = async (id) => { try { await api.post(`/hr/leave/${id}/reject`); setAlert({ type: 'success', message: 'Rejected' }); loadLeaves(); } catch (err) { setModalError(err.message); } };

  const columns = [
    { key: 'employee_number', label: 'Emp #', render: v => <span className="font-mono text-blue-600">{v}</span> },
    { key: 'employee_name', label: 'Employee', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'dept_name', label: 'Department' },
    { key: 'type_name', label: 'Leave Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{v}</span> },
    { key: 'start_date', label: 'From', render: v => formatDate(v) },
    { key: 'end_date', label: 'To', render: v => formatDate(v) },
    { key: 'days', label: 'Days', className: 'text-right', render: v => <span className="font-semibold">{formatNumber(v, 1)}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (v, row) => row.status === 'pending' ? (
      <div className="flex gap-1">
        <button onClick={e => { e.stopPropagation(); handleApprove(v); }} title="Approve" className="p-1 hover:bg-emerald-50 rounded"><CheckCircle className="w-4 h-4 text-emerald-500" /></button>
        <button onClick={e => { e.stopPropagation(); handleReject(v); }} title="Reject" className="p-1 hover:bg-rose-50 rounded"><XCircle className="w-4 h-4 text-rose-500" /></button>
      </div>
    ) : null },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Leave Management</h1><p className="text-sm text-gray-400 mt-1">Leave requests and approvals</p></div>
        <><DownloadButton data={leaves} filename="LeaveManagement" /><button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Request</button></></div>
      <Tabs tabs={[{ key: '', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }]} active={statusFilter} onChange={setStatusFilter} />
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={columns} data={leaves} loading={loading} /></div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Leave Request" size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Submit'}</button></>}>
        <div className="space-y-4">
          <FormField label="Employee" required><select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})} className="select-field"><option value="">Select...</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.employee_number} - {emp.display_name}</option>)}</select></FormField>
          <FormField label="Leave Type" required><select value={form.leave_type_id} onChange={e => setForm({...form, leave_type_id: e.target.value})} className="select-field"><option value="">Select...</option>{leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.type_code} - {lt.type_name} ({lt.days_per_year} days/yr)</option>)}</select></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From" required><input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="input-field" /></FormField>
            <FormField label="To" required><input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="input-field" /></FormField>
          </div>
          <FormField label="Reason"><textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="input-field" rows={3} /></FormField>
        </div>
      </Modal>
    </div>
  );
}
