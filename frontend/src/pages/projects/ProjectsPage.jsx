import { useState, useEffect} from 'react';
import { Plus, Edit2, CheckCircle, ListTodo, Flag, Target, Trash2 } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge, Tabs ,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [showDetail, setShowDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('tasks');
  const emptyForm = { project_name:'', customer_id:'', manager_id:'', project_type:'external', budget:'', start_date:'', end_date:'', description:'', profit_center_id:'' };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [profitCenters, setProfitCenters] = useState([]);

  // Task/Milestone forms
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editTaskId, setEditTaskId] = useState(null);
  const emptyTask = { task_name:'', description:'', assigned_to:'', priority:'medium', status:'todo', start_date:'', due_date:'', estimated_hours:'' };
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const emptyMs = { milestone_name:'', due_date:'', status:'pending' };
  const [msForm, setMsForm] = useState(emptyMs);

  useEffect(() => { loadProjects(); loadLookups(); }, [statusF, search]);
  const loadProjects = async () => { try { setProjects((await api.get('/projects/projects', { status: statusF, search }).catch(()=>null))?.data || []); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => {
    try { const [c, u, pc] = await Promise.all([api.get('/master/business-partners', { type:'customer', all: true }).catch(()=>null), api.get('/auth/users').catch(()=>null), api.get('/org/profit-centers').catch(()=>null)]);
      setCustomers(c?.data?.rows || c?.data || []); setUsers(u?.data || []); setProfitCenters(pc?.data || []);
    } catch {}
  };

  const loadDetail = async (id) => { try { setShowDetail((await api.get(`/projects/projects/${id}`).catch(()=>null))?.data); } catch (e) { setModalError(e.message); } };
  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (row) => {
    setEditId(row.id);
    setForm({ project_name: row.project_name, customer_id: row.customer_id||'', manager_id: row.manager_id||'',
      project_type: row.project_type||'external', budget: row.budget||'', start_date: row.start_date?.split('T')[0]||'',
      end_date: row.end_date?.split('T')[0]||'', description: row.description||'', status: row.status||'planning',
      profit_center_id: row.profit_center_id||'' });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault(); setModalError(null); setSaving(true);
    if (!form.project_name) { setModalError('Project Name is required'); setSaving(false); return; }
    if (!form.customer_id) { setModalError('Customer is required'); setSaving(false); return; }
    if (!form.manager_id) { setModalError('Project Manager is required'); setSaving(false); return; }
    if (!form.project_type) { setModalError('Type is required'); setSaving(false); return; }
    if (!form.profit_center_id) { setModalError('Profit Center is required'); setSaving(false); return; }
    if (!form.budget) { setModalError('Budget is required'); setSaving(false); return; }
    if (!form.start_date) { setModalError('Start Date is required'); setSaving(false); return; }
    if (!form.end_date) { setModalError('End Date is required'); setSaving(false); return; }
    if (!form.description) { setModalError('Description is required'); setSaving(false); return; }
    try {
      if (editId) { await api.put(`/projects/projects/${editId}`, form); setAlert({ type:'success', message:'Updated' }); }
      else { await api.post('/projects/projects', form); setAlert({ type:'success', message:'Created' }); }
      setShowForm(false); setEditId(null); loadProjects();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleStatusChange = async (id, status) => {
    try { await api.put(`/projects/projects/${id}/status`, { status }); loadProjects(); if (showDetail) loadDetail(id); }
    catch (err) { setModalError(err.message); }
  };

  // TASK handlers
  const handleSaveTask = async () => {
    try {
      if (editTaskId) { await api.put(`/projects/tasks/${editTaskId}`, taskForm); }
      else { await api.post(`/projects/projects/${showDetail.id}/tasks`, taskForm); }
      setShowTaskForm(false); setEditTaskId(null); setTaskForm(emptyTask); loadDetail(showDetail.id);
    } catch (err) { setModalError(err.message); }
  };
  const handleDeleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return;
    try { await api.delete(`/projects/tasks/${taskId}`); loadDetail(showDetail.id); } catch (err) { setModalError(err.message); }
  };
  const handleTaskStatus = async (taskId, status) => {
    try { await api.put(`/projects/tasks/${taskId}`, { status }); loadDetail(showDetail.id); } catch {}
  };

  // MILESTONE handlers
  const handleSaveMilestone = async () => {
    try {
      await api.post(`/projects/projects/${showDetail.id}/milestones`, msForm);
      setShowMilestoneForm(false); setMsForm(emptyMs); loadDetail(showDetail.id);
    } catch (err) { setModalError(err.message); }
  };
  const handleMilestoneStatus = async (msId, status) => {
    try { await api.put(`/projects/milestones/${msId}`, { status }); loadDetail(showDetail.id); } catch {}
  };

  const columns = [
    { key: 'project_code', label: 'Code', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'project_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'customer_name', label: 'Customer', render: v => v || '—' },
    { key: 'project_type', label: 'Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{v||'—'}</span> },
    { key: 'percent_complete', label: '% Complete', render: v => {
      const pct = parseFloat(v||0); return <div className="flex items-center gap-2"><div className="w-16 h-2 bg-gray-200 rounded-full"><div className="h-2 bg-blue-500 rounded-full" style={{width:`${pct}%`}}/></div><span className="text-xs">{pct}%</span></div>;
    }},
    { key: 'budget', label: 'Budget', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'start_date', label: 'Start', render: v => formatDate(v) },
    { key: 'status', label: 'Status', render: (v, row) =>
      <select value={v} onChange={e => handleStatusChange(row.id, e.target.value)} className="text-xs border rounded px-1 py-0.5 bg-white">
        {['planning','active','on_hold','completed','cancelled'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
      </select>
    },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Edit2 className="w-4 h-4"/></button>
      <button onClick={() => loadDetail(v)} className="p-1 hover:bg-gray-100 rounded text-blue-600"><ListTodo className="w-4 h-4"/></button>
    </div> },
  ];

  const taskStatusColors = { todo:'bg-gray-100 text-gray-600', in_progress:'bg-blue-100 text-blue-700', done:'bg-green-100 text-green-700', blocked:'bg-red-100 text-red-700' };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/projects/bulk-delete', { entity: 'projects', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadProjects(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Projects</h1><p className="text-sm text-gray-400 mt-1">Project management with tasks and milestones</p></div>
        <><DownloadButton data={projects} filename="ProjectsPage" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Project</button></>
      </div>
      <div className="flex items-center gap-4">
        <Tabs tabs={[{key:'',label:'All'},{key:'planning',label:'Planning'},{key:'active',label:'Active'},{key:'completed',label:'Completed'}]} active={statusF} onChange={setStatusF}/>
        <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/>
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={projects} loading={loading}/></div>

      {/* CREATE/EDIT */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title={editId ? 'Edit Project' : 'Create Project'} size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Project Name" required><input value={form.project_name} onChange={e=>setForm({...form,project_name:e.target.value})} className="input-field" required/></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Customer"><select value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})} className="select-field"><option value="">Select...</option>{customers.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></FormField>
            <FormField label="Project Manager"><select value={form.manager_id} onChange={e=>setForm({...form,manager_id:e.target.value})} className="select-field"><option value="">Select...</option>{users.map(u=><option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></FormField>
            <FormField label="Type"><select value={form.project_type} onChange={e=>setForm({...form,project_type:e.target.value})} className="select-field"><option value="external">External (Client)</option><option value="internal">Internal</option><option value="rnd">R&D</option></select></FormField>
            <FormField label="Profit Center"><select value={form.profit_center_id||''} onChange={e=>setForm({...form,profit_center_id:e.target.value})} className="select-field"><option value="">Select...</option>{profitCenters.map(pc=><option key={pc.id} value={pc.id}>{pc.pc_code} — {pc.pc_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Budget"><input type="number" step="0.01" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} className="input-field"/></FormField>
            <FormField label="Start Date"><input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="input-field"/></FormField>
            <FormField label="End Date"><input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className="input-field"/></FormField>
          </div>
          <FormField label="Description"><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="input-field" rows={2}/></FormField>
          {editId && <FormField label="Status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="select-field">{['planning','active','on_hold','completed','cancelled'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></FormField>}
        </form>
      </Modal>

      {/* PROJECT DETAIL WITH TASKS + MILESTONES */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail ? `${showDetail.project_code} — ${showDetail.project_name}` : ''} size="xl">
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Customer</p><p className="font-medium">{showDetail.customer_name||'—'}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Budget</p><p className="font-medium">{formatCurrency(showDetail.budget)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Progress</p><p className="font-bold text-blue-600">{showDetail.percent_complete||0}%</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status}/></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Type</p><p className="capitalize">{showDetail.project_type||'—'}</p></div>
          </div>

          <Tabs tabs={[{key:'tasks',label:`Tasks (${showDetail.tasks?.length||0})`},{key:'milestones',label:`Milestones (${showDetail.milestones?.length||0})`}]} active={detailTab} onChange={setDetailTab}/>

          {detailTab === 'tasks' && <div className="space-y-2">
            <div className="flex justify-end"><button onClick={() => { setEditTaskId(null); setTaskForm(emptyTask); setShowTaskForm(true); }} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add Task</button></div>
            {showDetail.tasks?.length ? showDetail.tasks.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                <button onClick={() => handleTaskStatus(t.id, t.status === 'done' ? 'todo' : 'done')}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${t.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                  {t.status === 'done' && <CheckCircle className="w-3 h-3"/>}
                </button>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.task_name}</p>
                  <div className="flex gap-2 mt-0.5 text-xs text-gray-500">
                    {t.assigned_name && <span>→ {t.assigned_name}</span>}
                    {t.due_date && <span>Due: {formatDate(t.due_date)}</span>}
                    {t.estimated_hours && <span>{t.estimated_hours}h est</span>}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${taskStatusColors[t.status]||'bg-gray-100'}`}>{(t.status||'todo').replace('_',' ')}</span>
                <select value={t.status} onChange={e => handleTaskStatus(t.id, e.target.value)} className="text-xs border rounded px-1 py-0.5">
                  <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option><option value="blocked">Blocked</option>
                </select>
                <button onClick={() => { setEditTaskId(t.id); setTaskForm({ task_name:t.task_name, description:t.description||'', assigned_to:t.assigned_to||'', priority:t.priority, status:t.status, start_date:t.start_date?.split('T')[0]||'', due_date:t.due_date?.split('T')[0]||'', estimated_hours:t.estimated_hours||'' }); setShowTaskForm(true); }} className="p-1 hover:bg-gray-100 rounded text-gray-400"><Edit2 className="w-3.5 h-3.5"/></button>
                <button onClick={() => handleDeleteTask(t.id)} className="p-1 hover:bg-red-50 rounded text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            )) : <p className="text-sm text-gray-400 text-center py-4">No tasks yet. Add the first task above.</p>}
          </div>}

          {detailTab === 'milestones' && <div className="space-y-2">
            <div className="flex justify-end"><button onClick={() => { setMsForm(emptyMs); setShowMilestoneForm(true); }} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add Milestone</button></div>
            {showDetail.milestones?.length ? showDetail.milestones.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <Flag className={`w-4 h-4 ${m.status === 'completed' ? 'text-green-500' : m.status === 'overdue' ? 'text-red-500' : 'text-orange-500'}`}/>
                <div className="flex-1"><p className="text-sm font-medium">{m.milestone_name}</p><p className="text-xs text-gray-500">Due: {formatDate(m.due_date)}</p></div>
                <select value={m.status} onChange={e => handleMilestoneStatus(m.id, e.target.value)} className="text-xs border rounded px-1 py-0.5">
                  <option value="pending">Pending</option><option value="completed">Completed</option><option value="overdue">Overdue</option>
                </select>
              </div>
            )) : <p className="text-sm text-gray-400 text-center py-4">No milestones yet.</p>}
          </div>}
        </div>}
      </Modal>

      {/* TASK FORM */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title={editTaskId ? 'Edit Task' : 'Add Task'} size="xl"
        footer={<><button onClick={() => setShowTaskForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSaveTask} className="btn-primary">{editTaskId ? 'Update' : 'Add'}</button></>}>
        <div className="space-y-4">
          <FormField label="Task Name" required><input value={taskForm.task_name} onChange={e=>setTaskForm({...taskForm,task_name:e.target.value})} className="input-field" required/></FormField>
          <FormField label="Description"><textarea value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} className="input-field" rows={2}/></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Assigned To"><select value={taskForm.assigned_to} onChange={e=>setTaskForm({...taskForm,assigned_to:e.target.value})} className="select-field"><option value="">Select...</option>{users.map(u=><option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></FormField>
            <FormField label="Priority"><select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})} className="select-field"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Start Date"><input type="date" value={taskForm.start_date} onChange={e=>setTaskForm({...taskForm,start_date:e.target.value})} className="input-field"/></FormField>
            <FormField label="Due Date"><input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})} className="input-field"/></FormField>
            <FormField label="Estimated Hours"><input type="number" step="0.5" value={taskForm.estimated_hours} onChange={e=>setTaskForm({...taskForm,estimated_hours:e.target.value})} className="input-field"/></FormField>
          </div>
        </div>
      </Modal>

      {/* MILESTONE FORM */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showMilestoneForm} onClose={() => setShowMilestoneForm(false)} title="Add Milestone" size="sm"
        footer={<><button onClick={() => setShowMilestoneForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSaveMilestone} className="btn-primary">Add</button></>}>
        <div className="space-y-4">
          <FormField label="Milestone Name" required><input value={msForm.milestone_name} onChange={e=>setMsForm({...msForm,milestone_name:e.target.value})} className="input-field" required/></FormField>
          <FormField label="Due Date"><input type="date" value={msForm.due_date} onChange={e=>setMsForm({...msForm,due_date:e.target.value})} className="input-field"/></FormField>
        </div>
      </Modal>
    </div>
  );
}
