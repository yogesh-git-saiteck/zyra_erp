import { useState, useEffect} from 'react';
import { Plus, Edit2, Users ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge ,DeleteConfirm,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ExportButton, BulkImportExport } from '../../components/common/SharedFeatures';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const emptyForm = { first_name:'', last_name:'', email:'', phone:'', department_id:'', position_id:'', hire_date:'', employment_type:'full_time', salary:'', currency:'INR',
    pan_number:'', aadhaar_number:'', pf_number:'', uan_number:'', esi_number:'', bank_account_number:'', bank_ifsc:'', bank_name:'',
    date_of_birth:'', gender:'', grade:'', reporting_manager_id:'', notice_period_days:'30', emergency_contact_name:'', emergency_contact_phone:'' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [depts, setDepts] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => { loadEmployees(); loadLookups(); }, [search]);
  const loadEmployees = async () => {
    try { setEmployees((await api.get('/hr/employees', { search }).catch(()=>null))?.data || []); } catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try { const [d,p] = await Promise.all([api.get('/hr/departments').catch(()=>null), api.get('/hr/positions').catch(()=>null)]); setDepts(d?.data||[]); setPositions(p?.data||[]); } catch {}
  };

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (row) => {
    setEditId(row.id);
    setForm({ first_name: row.first_name||'', last_name: row.last_name||'', email: row.email||'', phone: row.phone||'',
      department_id: row.department_id||'', position_id: row.position_id||'', hire_date: row.hire_date?.split('T')[0]||'',
      employment_type: row.employment_type||'full_time', salary: row.salary||'', currency: row.currency||'INR',
      display_name: row.employee_name||'', status: row.status||'active',
      pan_number: row.pan_number||'', aadhaar_number: row.aadhaar_number||'', pf_number: row.pf_number||'',
      uan_number: row.uan_number||'', esi_number: row.esi_number||'', bank_account_number: row.bank_account_number||'',
      bank_ifsc: row.bank_ifsc||'', bank_name: row.bank_name||'', date_of_birth: row.date_of_birth?.split('T')[0]||'',
      gender: row.gender||'', grade: row.grade||'', reporting_manager_id: row.reporting_manager_id||'',
      notice_period_days: row.notice_period_days||'30', emergency_contact_name: row.emergency_contact_name||'', emergency_contact_phone: row.emergency_contact_phone||'' });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) { await api.put(`/hr/employees/${editId}`, form); setAlert({ type: 'success', message: 'Employee updated' }); }
      else { await api.post('/hr/employees', form); setAlert({ type: 'success', message: 'Employee created' }); }
      setShowForm(false); setEditId(null); setForm(emptyForm); loadEmployees();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'employee_number', label: 'Emp #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'employee_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'dept_name', label: 'Department', render: v => <span className="text-gray-600">{v||'—'}</span> },
    { key: 'position_name', label: 'Position', render: v => <span className="text-gray-500">{v||'—'}</span> },
    { key: 'employment_type', label: 'Type', render: v => <StatusBadge status={v}/> },
    { key: 'salary', label: 'Salary', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v}/> },
    { key: 'id', label: '', render: (v, row) => <button onClick={() => openEdit(row)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4"/></button> },
      { key: '_del', label: '', render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/hr/employees/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadEmployees(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/hr/bulk-delete', { entity: 'employees', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadEmployees(); }
    catch (e) { setModalError(e.message); }
  };



  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Employees</h1></div>
        <div className="flex items-center gap-2"><BulkImportExport entity="employees" onImportComplete={loadEmployees}/><ExportButton entity="employees"/><><DownloadButton data={employees} filename="Employees" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Employee</button></></div>
      </div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={employees} loading={loading}/></div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title={editId ? 'Edit Employee' : 'Create Employee'} size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          {!editId && <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name" required><input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})} className="input-field" required/></FormField>
            <FormField label="Last Name" required><input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})} className="input-field" required/></FormField>
          </div>}
          {!editId && <div className="grid grid-cols-2 gap-4">
            <FormField label="Email" required><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="input-field" required/></FormField>
            <FormField label="Phone"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="input-field"/></FormField>
          </div>}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Department"><select value={form.department_id} onChange={e=>setForm({...form,department_id:e.target.value})} className="select-field"><option value="">Select...</option>{depts.map(d=><option key={d.id} value={d.id}>{d.dept_code} - {d.dept_name}</option>)}</select></FormField>
            <FormField label="Position"><select value={form.position_id} onChange={e=>setForm({...form,position_id:e.target.value})} className="select-field"><option value="">Select...</option>{positions.map(p=><option key={p.id} value={p.id}>{p.position_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {!editId && <FormField label="Hire Date"><input type="date" value={form.hire_date} onChange={e=>setForm({...form,hire_date:e.target.value})} className="input-field"/></FormField>}
            <FormField label="Employment Type"><select value={form.employment_type} onChange={e=>setForm({...form,employment_type:e.target.value})} className="select-field"><option value="full_time">Full Time</option><option value="part_time">Part Time</option><option value="contract">Contract</option><option value="intern">Intern</option></select></FormField>
            <FormField label="Salary"><input type="number" step="0.01" value={form.salary} onChange={e=>setForm({...form,salary:e.target.value})} className="input-field"/></FormField>
          </div>
          {editId && <FormField label="Status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="select-field"><option value="active">Active</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select></FormField>}
          <div className="border-t pt-3 mt-2"><p className="text-xs font-semibold text-gray-500 mb-2">PERSONAL DETAILS</p></div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Date of Birth"><input type="date" value={form.date_of_birth} onChange={e=>setForm({...form,date_of_birth:e.target.value})} className="input-field"/></FormField>
            <FormField label="Gender"><select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})} className="select-field"><option value="">Select...</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></FormField>
            <FormField label="Grade / Pay Band"><input value={form.grade} onChange={e=>setForm({...form,grade:e.target.value})} className="input-field" placeholder="e.g. L5, Band A"/></FormField>
          </div>
          <div className="border-t pt-3 mt-2"><p className="text-xs font-semibold text-gray-500 mb-2">STATUTORY DETAILS</p></div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="PAN Number"><input value={form.pan_number} onChange={e=>setForm({...form,pan_number:e.target.value.toUpperCase()})} className="input-field" placeholder="ABCDE1234F" maxLength={10}/></FormField>
            <FormField label="Aadhaar Number"><input value={form.aadhaar_number} onChange={e=>setForm({...form,aadhaar_number:e.target.value})} className="input-field" placeholder="1234 5678 9012" maxLength={12}/></FormField>
            <FormField label="PF Number"><input value={form.pf_number} onChange={e=>setForm({...form,pf_number:e.target.value})} className="input-field" placeholder="TN/CHN/12345/123"/></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="UAN (Universal Account Number)"><input value={form.uan_number} onChange={e=>setForm({...form,uan_number:e.target.value})} className="input-field" placeholder="100012345678"/></FormField>
            <FormField label="ESI IP Number"><input value={form.esi_number} onChange={e=>setForm({...form,esi_number:e.target.value})} className="input-field"/></FormField>
            <FormField label="Notice Period (days)"><input type="number" value={form.notice_period_days} onChange={e=>setForm({...form,notice_period_days:e.target.value})} className="input-field"/></FormField>
          </div>
          <div className="border-t pt-3 mt-2"><p className="text-xs font-semibold text-gray-500 mb-2">BANK DETAILS (SALARY ACCOUNT)</p></div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Bank Name"><input value={form.bank_name} onChange={e=>setForm({...form,bank_name:e.target.value})} className="input-field"/></FormField>
            <FormField label="Account Number"><input value={form.bank_account_number} onChange={e=>setForm({...form,bank_account_number:e.target.value})} className="input-field"/></FormField>
            <FormField label="IFSC Code"><input value={form.bank_ifsc} onChange={e=>setForm({...form,bank_ifsc:e.target.value.toUpperCase()})} className="input-field" placeholder="SBIN0001234" maxLength={11}/></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Emergency Contact Name"><input value={form.emergency_contact_name} onChange={e=>setForm({...form,emergency_contact_name:e.target.value})} className="input-field"/></FormField>
            <FormField label="Emergency Contact Phone"><input value={form.emergency_contact_phone} onChange={e=>setForm({...form,emergency_contact_phone:e.target.value})} className="input-field"/></FormField>
          </div>
        </form>
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={(confirmDelete?.first_name||"") + " " + (confirmDelete?.last_name||"")} />
    </div>
  );
}
