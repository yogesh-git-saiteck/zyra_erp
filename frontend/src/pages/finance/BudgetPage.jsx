import { useState, useEffect } from 'react';
import { Plus, CheckCircle2, BarChart3, Trash2 } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, Tabs, StatusBadge , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';

export default function BudgetPage() {
  const [tab, setTab] = useState('budgets');
  const [budgets, setBudgets] = useState([]);
  const [bva, setBva] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [costCenters, setCostCenters] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [profitCenters, setProfitCenters] = useState([]);
  const [fy, setFy] = useState(new Date().getFullYear());
  const empty = { company_id:'', cost_center_id:'', gl_account_id:'', fiscal_year: fy, budget_type:'annual', annual_amount:0,
    m1:0,m2:0,m3:0,m4:0,m5:0,m6:0,m7:0,m8:0,m9:0,m10:0,m11:0,m12:0, notes:'' };
  const [form, setForm] = useState(empty);

  useEffect(() => { loadLookups(); }, []);
  useEffect(() => { loadData(); }, [tab, fy]);

  const loadLookups = async () => {
    try {
      const [cc, gl, c, pc] = await Promise.all([api.get('/org/cost-centers').catch(()=>null), api.get('/master/gl-accounts').catch(()=>null), api.get('/org/companies').catch(()=>null), api.get('/org/profit-centers').catch(()=>null)]);
      setCostCenters(cc?.data||[]); setGlAccounts(gl?.data||[]); setCompanies(c?.data||[]); setProfitCenters(pc?.data||[]);
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'budgets') setBudgets((await api.get('/phase-b/budgets', { fiscal_year: fy }).catch(()=>null))?.data||[]);
      else setBva((await api.get('/phase-b/budget-vs-actual', { fiscal_year: fy }).catch(()=>null))?.data||[]);
    } catch {} finally { setLoading(false); }
  };

  const s = (k,v) => setForm(p => {
    const updated = { ...p, [k]: v };
    // Auto-calculate annual from monthly when monthly type
    if (k.startsWith('m') && k.length <= 3 && updated.budget_type === 'monthly') {
      updated.annual_amount = [1,2,3,4,5,6,7,8,9,10,11,12].reduce((sum,i) => sum + parseFloat(updated[`m${i}`]||0), 0);
    }
    // When switching to monthly, recalculate annual from months
    if (k === 'budget_type' && v === 'monthly') {
      updated.annual_amount = [1,2,3,4,5,6,7,8,9,10,11,12].reduce((sum,i) => sum + parseFloat(updated[`m${i}`]||0), 0);
    }
    return updated;
  });
  const monthlySum = [1,2,3,4,5,6,7,8,9,10,11,12].reduce((sum,i) => sum + parseFloat(form[`m${i}`]||0), 0);
  const handleSave = async (e) => {
    e?.preventDefault(); setSaving(true); setModalError(null);
    if (!form.company_id) { setModalError('Company is required'); setSaving(false); return; }
    if (!form.cost_center_id) { setModalError('Cost Center is required'); setSaving(false); return; }
    if (!form.gl_account_id) { setModalError('GL Account is required'); setSaving(false); return; }
    if (!form.fiscal_year) { setModalError('Fiscal Year is required'); setSaving(false); return; }
    if (!form.budget_type) { setModalError('Budget Type is required'); setSaving(false); return; }
    if (form.budget_type === 'annual' && (!form.annual_amount || parseFloat(form.annual_amount) <= 0)) { setModalError('Annual Amount must be greater than 0'); setSaving(false); return; }
    if (form.budget_type === 'monthly') {
      const ms = [1,2,3,4,5,6,7,8,9,10,11,12].reduce((sum,i) => sum + parseFloat(form[`m${i}`]||0), 0);
      if (ms <= 0) { setModalError('At least one month must have a budget amount'); setSaving(false); return; }
    }
    try {
      await api.post('/phase-b/budgets', form);
      setAlert({ type:'success', message:'Budget created' });
      setShowForm(false); setForm(empty); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const approve = async (id) => {
    try { await api.post(`/phase-b/budgets/${id}/approve`); setAlert({ type:'success', message:'Budget approved' }); loadData(); }
    catch (e) { setModalError(e.message); }
  };

  const months = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Budget Management</h1><p className="text-sm text-gray-400 mt-1">Annual budgets per cost center with variance tracking</p></div>
        <div className="flex items-center gap-3">
          <FormField label="Fiscal Year"><input type="number" value={fy} onChange={e=>setFy(parseInt(e.target.value))} className="input-field w-24"/></FormField>
          <button onClick={() => { setForm({...empty, fiscal_year: fy}); setModalError(null); setShowForm(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Budget</button>
        </div>
      </div>

      <Tabs tabs={[{key:'budgets',label:'Budgets'},{key:'bva',label:'Budget vs Actual'}]} active={tab} onChange={setTab}/>

      {tab === 'budgets' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[
          { key:'cc_code', label:'Cost Center', render:(v,r) => <span className="font-mono font-medium">{v} — {r.cc_name}</span> },
          { key:'account_code', label:'GL Account', render:(v,r) => v ? <span className="text-xs">{v} — {r.account_name}</span> : <span className="text-gray-400">All</span> },
          { key:'cc_code', label:'Cost Center', render:(v,r) => <span className="font-mono text-xs">{r.cc_code} — {r.cc_name}</span> },
          { key:'account_code', label:'GL Account', render:(v,r) => r.account_code ? <span className="text-xs">{r.account_code} — {r.account_name}</span> : '—' },
          { key:'fiscal_year', label:'FY' },
          { key:'annual_amount', label:'Annual Budget', className:'text-right', render: v => <span className="font-semibold">{formatCurrency(v || 0)}</span> },
          { key:'budget_type', label:'Type', render: v => <span className="text-xs capitalize">{v || 'annual'}</span> },
          { key:'status', label:'Status', render: v => <StatusBadge status={v}/> },
          { key:'id', label:'', render:(v,r) => <div className="flex gap-1">{r.status==='draft' && <button onClick={() => approve(v)} className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>}<button onClick={async () => { if(confirm('Delete this budget?')) { try { await api.delete(`/phase-b/budgets/${v}`); setAlert({type:'success',message:'Budget deleted'}); loadData(); } catch(e) { setAlert({type:'error',message:e.message}); }}}} className="p-1 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500"/></button></div> },
        ]} data={budgets} loading={loading}/>
      </div>}

      {tab === 'bva' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[
          { key:'cc_code', label:'Cost Center', render:(v,r) => <span className="font-mono font-medium">{v} — {r.cc_name}</span> },
          { key:'account_code', label:'GL Account', render:(v,r) => v ? `${v} — ${r.account_name}` : 'All' },
          { key:'budget', label:'Budget', className:'text-right', render: v => formatCurrency(v) },
          { key:'committed', label:'Committed (PR+PO)', className:'text-right', render: v => <span className="text-orange-600">{formatCurrency(v)}</span> },
          { key:'actual', label:'Actual (Posted)', className:'text-right', render: v => formatCurrency(v) },
          { key:'available', label:'Available', className:'text-right', render: v => <span className={parseFloat(v) < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-medium'}>{formatCurrency(v)}</span> },
          { key:'variance', label:'Variance', className:'text-right', render: v => <span className={parseFloat(v) < 0 ? 'text-red-600 font-medium' : 'text-green-600'}>{formatCurrency(v)}</span> },
          { key:'utilization_pct', label:'Used %', render: v => {
            const pct = parseFloat(v);
            return <div className="flex items-center gap-2"><div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{width:`${Math.min(pct,100)}%`}}/></div><span className={`text-xs font-medium ${pct > 100 ? 'text-red-600' : ''}`}>{pct}%</span></div>;
          }},
        ]} data={bva} loading={loading}/>
      </div>}

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={() => { setShowForm(false); setModalError(null); }} title="Create Budget" size="xl"
        footer={<><button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button><DownloadButton data={budgets} filename="BudgetPage" /><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?'Saving...':'Create'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Company *"><select value={form.company_id} onChange={e=>s('company_id',e.target.value)} className="select-field"><option value="">Select...</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></FormField>
            <FormField label="Cost Center *"><select value={form.cost_center_id} onChange={e=>s('cost_center_id',e.target.value)} className="select-field"><option value="">Select...</option>{costCenters.map(cc=><option key={cc.id} value={cc.id}>{cc.cc_code} — {cc.cc_name}</option>)}</select></FormField>
            <FormField label="Profit Center"><select value={form.profit_center_id||''} onChange={e=>s('profit_center_id',e.target.value)} className="select-field"><option value="">Select...</option>{profitCenters.map(pc=><option key={pc.id} value={pc.id}>{pc.pc_code} — {pc.pc_name}</option>)}</select></FormField>
            <FormField label="GL Account *"><select value={form.gl_account_id} onChange={e=>s('gl_account_id',e.target.value)} className="select-field"><option value="">Select...</option>{glAccounts.filter(g=>g.account_type==='expense').map(g=><option key={g.id} value={g.id}>{g.account_code} — {g.account_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Fiscal Year *"><input type="number" value={form.fiscal_year} onChange={e=>s('fiscal_year',parseInt(e.target.value))} className="input-field"/></FormField>
            <FormField label="Budget Type *"><select value={form.budget_type} onChange={e=>s('budget_type',e.target.value)} className="select-field"><option value="annual">Annual</option><option value="monthly">Monthly</option></select></FormField>
            <FormField label="Annual Amount *"><input type="number" value={form.budget_type === 'monthly' ? monthlySum : form.annual_amount} onChange={e=>s('annual_amount',parseFloat(e.target.value)||0)} className="input-field" step="0.01" disabled={form.budget_type === 'monthly'}/></FormField>
          </div>
          {form.budget_type === 'monthly' && <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">Monthly Breakdown</p>
              <p className="text-xs text-gray-400">Sum: <strong className={monthlySum > 0 ? 'text-emerald-600' : 'text-rose-500'}>{formatCurrency(monthlySum)}</strong></p>
            </div>
            <div className="grid grid-cols-6 gap-2">{months.map((m,i) => <FormField key={i} label={m}><input type="number" value={form[`m${i+1}`]||0} onChange={e=>s(`m${i+1}`,parseFloat(e.target.value)||0)} className="input-field text-xs" step="0.01"/></FormField>)}</div>
          </div>}
          <FormField label="Notes"><input value={form.notes||''} onChange={e=>s('notes',e.target.value)} className="input-field"/></FormField>
        </form>
      </Modal>
    </div>
  );
}
