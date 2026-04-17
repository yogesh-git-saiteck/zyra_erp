import { useState, useEffect } from 'react';
import { Plus, CheckCircle2, XCircle, Eye, Trash2 } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, StatusBadge , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const EXPENSE_TYPES = ['travel','meals','accommodation','transport','office_supplies','communication','training','client_entertainment','fuel','parking','medical','other'];

export default function ExpenseClaims() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const emptyItem = { expense_date:'', expense_type:'travel', description:'', amount:0, receipt_number:'' };
  const emptyForm = { employee_id:'', claim_date:'', description:'', cost_center_id:'', notes:'', items:[{...emptyItem}] };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadClaims(); loadLookups(); }, []);

  const loadClaims = async () => { setLoading(true); try { setClaims((await api.get('/phase-b/expenses').catch(()=>null))?.data||[]); } catch {} finally { setLoading(false); } };
  const loadLookups = async () => {
    try {
      const [e, cc] = await Promise.all([api.get('/hr/employees').catch(()=>null), api.get('/org/cost-centers').catch(()=>null)]);
      setEmployees(e?.data||[]); setCostCenters(cc?.data||[]);
    } catch {}
  };

  const s = (k,v) => setForm(p => ({...p, [k]:v}));
  const addItem = () => setForm({...form, items:[...form.items, {...emptyItem}]});
  const removeItem = (i) => setForm({...form, items: form.items.filter((_,idx)=>idx!==i)});
  const updateItem = (i,k,v) => { const items=[...form.items]; items[i]={...items[i],[k]:v}; setForm({...form,items}); };

  const handleSave = async (e) => {
    e?.preventDefault(); setSaving(true); setModalError(null);
    try {
      if (!form.employee_id) throw new Error('Employee required');
      if (!form.items.length || !form.items[0].amount) throw new Error('At least one expense item required');
      await api.post('/phase-b/expenses', form);
      setShowForm(false); setForm(emptyForm); setAlert({type:'success', message:'Expense claim submitted'}); loadClaims();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const approve = async (id) => {
    try { await api.post(`/phase-b/expenses/${id}/approve`, {}); setAlert({type:'success', message:'Expense approved — JE posted'}); loadClaims(); setShowDetail(null); }
    catch (e) { setModalError(e.message); }
  };

  const reject = async (id) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try { await api.post(`/phase-b/expenses/${id}/reject`, { reason }); setAlert({type:'success', message:'Expense rejected'}); loadClaims(); setShowDetail(null); }
    catch (e) { setModalError(e.message); }
  };

  const loadDetail = async (id) => { try { setShowDetail((await api.get(`/phase-b/expenses/${id}`).catch(()=>null))?.data); } catch {} };

  const total = form.items.reduce((s,it) => s + (parseFloat(it.amount)||0), 0);

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={()=>setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Expense Claims</h1><p className="text-sm text-gray-400 mt-1">Employee expense reimbursement with approval workflow</p></div>
        <button onClick={() => { setForm(emptyForm); setModalError(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Claim</button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[
          { key:'doc_number', label:'Claim #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
          { key:'employee_name', label:'Employee', render:(v,r) => <span>{r.employee_number} — {v}</span> },
          { key:'claim_date', label:'Date', render: v => formatDate(v) },
          { key:'total_amount', label:'Amount', className:'text-right', render: v => <span className="font-semibold">{formatCurrency(v)}</span> },
          { key:'approved_amount', label:'Approved', className:'text-right', render: v => formatCurrency(v) },
          { key:'cc_code', label:'Cost Center', render:(v,r) => v ? `${v} — ${r.cc_name}` : '—' },
          { key:'status', label:'Status', render: v => <StatusBadge status={v}/> },
          { key:'id', label:'', render:(v,r) => <div className="flex gap-1">
            <button onClick={() => loadDetail(v)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-3.5 h-3.5 text-gray-500"/></button>
            {r.status === 'draft' && <button onClick={() => approve(v)} className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>}
            {r.status === 'draft' && <button onClick={() => reject(v)} className="px-2 py-0.5 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100">Reject</button>}
          </div> },
        ]} data={claims} loading={loading}/>
      </div>

      {/* CREATE */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title="Submit Expense Claim" size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?'Saving...':'Submit Claim'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Employee *"><select value={form.employee_id} onChange={e=>s('employee_id',e.target.value)} className="select-field" required><option value="">Select...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.employee_number} — {e.first_name} {e.last_name}</option>)}</select></FormField>
            <FormField label="Date"><input type="date" value={form.claim_date} onChange={e=>s('claim_date',e.target.value)} className="input-field"/></FormField>
            <FormField label="Cost Center"><select value={form.cost_center_id} onChange={e=>s('cost_center_id',e.target.value)} className="select-field"><option value="">Select...</option>{costCenters.map(cc=><option key={cc.id} value={cc.id}>{cc.cc_code} — {cc.cc_name}</option>)}</select></FormField>
          </div>
          <FormField label="Purpose / Description"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field" placeholder="e.g. Client visit to Mumbai"/></FormField>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">Expense Items</h3>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3"/> Add Item</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-1 text-xs font-semibold text-gray-500 px-2">
                <div className="col-span-2">Date</div><div className="col-span-2">Type</div><div className="col-span-4">Description</div><div className="col-span-1">Receipt#</div><div className="col-span-2 text-right">Amount</div><div></div>
              </div>
              {form.items.map((it,i) => (
                <div key={i} className="grid grid-cols-12 gap-1 items-center p-2 bg-gray-50 rounded border">
                  <div className="col-span-2"><input type="date" value={it.expense_date} onChange={e=>updateItem(i,'expense_date',e.target.value)} className="input-field text-xs"/></div>
                  <div className="col-span-2"><select value={it.expense_type} onChange={e=>updateItem(i,'expense_type',e.target.value)} className="select-field text-xs">{EXPENSE_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}</select></div>
                  <div className="col-span-4"><input value={it.description||''} onChange={e=>updateItem(i,'description',e.target.value)} className="input-field text-xs" placeholder="Details"/></div>
                  <div className="col-span-1"><input value={it.receipt_number||''} onChange={e=>updateItem(i,'receipt_number',e.target.value)} className="input-field text-xs" placeholder="#"/></div>
                  <div className="col-span-2"><input type="number" value={it.amount} onChange={e=>updateItem(i,'amount',parseFloat(e.target.value)||0)} className="input-field text-xs text-right" step="0.01"/></div>
                  <div>{form.items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="p-1 text-red-400"><Trash2 className="w-3 h-3"/></button>}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-right"><span className="text-gray-500">Total:</span> <span className="font-bold text-lg ml-2">{formatCurrency(total)}</span></div>
          </div>
        </form>
      </Modal>

      {/* DETAIL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={showDetail ? `Expense Claim — ${showDetail.doc_number}` : ''} size="xl"
        footer={showDetail?.status === 'draft' ? <><button onClick={() => reject(showDetail.id)} className="btn-secondary text-red-600">Reject</button><DownloadButton data={claims} filename="ExpenseClaims" /><button onClick={() => approve(showDetail.id)} className="btn-primary">Approve & Post JE</button></> : null}>
        {showDetail && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Employee</p><p className="font-medium">{showDetail.employee_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Date</p><p>{formatDate(showDetail.claim_date)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Total</p><p className="font-bold text-lg">{formatCurrency(showDetail.total_amount)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status}/></div>
          </div>
          {showDetail.description && <p className="text-sm text-gray-600">{showDetail.description}</p>}
          {showDetail.items?.length > 0 && <table className="w-full text-xs"><thead><tr className="text-gray-500 border-b"><th className="text-left py-1">Date</th><th>Type</th><th>Description</th><th>Receipt#</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{showDetail.items.map((it,i) => <tr key={i} className="border-b border-gray-100">
              <td className="py-1.5">{formatDate(it.expense_date)}</td>
              <td className="capitalize">{(it.expense_type||'').replace(/_/g,' ')}</td>
              <td>{it.description||'—'}</td><td>{it.receipt_number||'—'}</td>
              <td className="text-right font-medium">{formatCurrency(it.amount)}</td>
            </tr>)}</tbody></table>}
        </div>}
      </Modal>
    </div>
  );
}
