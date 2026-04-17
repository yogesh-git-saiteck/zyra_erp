import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, Modal, FormField, Alert , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate } from '../../utils/formatters';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ employee_id: '', attendance_date: new Date().toISOString().split('T')[0], check_in: '', check_out: '', status: 'present' });

  useEffect(() => { loadData(); loadLookups(); }, [dateFilter]);

  const loadData = async () => {
    try { const r = await api.get('/hr/attendance', { date: dateFilter }); setRecords(r?.data || []); } catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => { try { const e = await api.get('/hr/employees'); setEmployees(e?.data || []); } catch {} };

  const handleCreate = async () => {
    try { await api.post('/hr/attendance', form); setShowCreate(false); setAlert({ type: 'success', message: 'Recorded' }); loadData(); }
    catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const columns = [
    { key: 'employee_number', label: 'Emp #', render: v => <span className="font-mono text-blue-600">{v}</span> },
    { key: 'employee_name', label: 'Employee', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'dept_name', label: 'Department' },
    { key: 'attendance_date', label: 'Date', render: v => formatDate(v) },
    { key: 'check_in', label: 'Check In', render: v => v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' },
    { key: 'check_out', label: 'Check Out', render: v => v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' },
    { key: 'hours_worked', label: 'Hours', className: 'text-right', render: v => v ? `${v}h` : '—' },
    { key: 'status', label: 'Status', render: v => {
      const colors = { present: 'badge-success', absent: 'badge-danger', late: 'badge-warning', half_day: 'badge-info' };
      return <span className={`badge ${colors[v] || 'badge-neutral'} capitalize`}>{(v || '').replace('_', ' ')}</span>;
    }},
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Attendance</h1><p className="text-sm text-gray-400 mt-1">Daily attendance tracking</p></div>
        <><DownloadButton data={records} filename="Attendance" /><button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Record</button></></div>
      <div className="flex items-center gap-3"><label className="text-sm text-gray-500">Date:</label><input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input-field w-44 py-1.5 text-sm" /></div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={columns} data={records} loading={loading} /></div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Record Attendance" size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} className="btn-primary">Save</button></>}>
        <div className="space-y-4">
          <FormField label="Employee" required><select value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value})} className="select-field"><option value="">Select...</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.employee_number} - {emp.display_name}</option>)}</select></FormField>
          <FormField label="Date"><input type="date" value={form.attendance_date} onChange={e => setForm({...form, attendance_date: e.target.value})} className="input-field" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Check In"><input type="time" value={form.check_in} onChange={e => setForm({...form, check_in: e.target.value ? `${form.attendance_date}T${e.target.value}` : ''})} className="input-field" /></FormField>
            <FormField label="Check Out"><input type="time" value={form.check_out} onChange={e => setForm({...form, check_out: e.target.value ? `${form.attendance_date}T${e.target.value}` : ''})} className="input-field" /></FormField>
          </div>
          <FormField label="Status"><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="select-field"><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="half_day">Half Day</option></select></FormField>
        </div>
      </Modal>
    </div>
  );
}
