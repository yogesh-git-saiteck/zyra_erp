import { useState, useEffect } from 'react';
import { Plus, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, Pencil, Trash2, Eye, BarChart3, Download } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, StatusBadge, DeleteConfirm, BulkActionBar , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function PettyCash() {
  const [tab, setTab] = useState('funds');
  const [funds, setFunds] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('');

  // Report state
  const [report, setReport] = useState(null);
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [reportFrom, setReportFrom] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [reportTo, setReportTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportFund, setReportFund] = useState('');
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterFund, setFilterFund] = useState('');
  const [users, setUsers] = useState([]);
  const [plants, setPlants] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => { loadData(); loadLookups(); if (tab === 'report') loadReport(); }, [tab, filterFund]);

  const loadReport = async () => {
    try {
      const r = await api.get('/finance/petty-cash/report', { fund_id: reportFund, period: reportPeriod, from: reportFrom, to: reportTo }).catch(()=>null);
      setReport(r?.data || null);
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [f, t] = await Promise.all([
        api.get('/finance/petty-cash/funds').catch(()=>null),
        api.get('/finance/petty-cash/txns', { fund_id: filterFund }).catch(()=>null)
      ]);
      setFunds(f?.data || []); setTxns(t?.data || []);
    } catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [u, p, g, cc, pj] = await Promise.all([
        api.get('/auth/users').catch(()=>null), api.get('/master/plants').catch(()=>null), api.get('/master/gl-accounts').catch(()=>null),
        api.get('/org/cost-centers').catch(()=>null), api.get('/projects/projects').catch(()=>null)
      ]);
      setUsers(u?.data || []); setPlants(p?.data || []); setGlAccounts(g?.data || []);
      setCostCenters(cc?.data || []); setProjects(pj?.data || []);
    } catch {}
  };

  // Fund actions
  const openCreateFund = () => { setForm({ fund_name: '', custodian_id: '', plant_id: '', gl_account_id: '', float_amount: '', bank_gl_id: '' }); setModalMode('fund'); setEditId(null); setModalError(null); setShowModal(true); };
  const openEditFund = (row) => { setForm({ fund_name: row.fund_name, custodian_id: row.custodian_id||'', plant_id: row.plant_id||'', gl_account_id: row.gl_account_id||'', float_amount: row.float_amount }); setModalMode('fund'); setEditId(row.id); setModalError(null); setShowModal(true); };

  // Transaction actions
  const openCreateTxn = (type = 'expense') => {
    setForm({ fund_id: funds.length === 1 ? funds[0].id : '', txn_type: type, amount: '', description: '', category: '', expense_gl_id: '', cost_center_id: '', project_id: '', receipt_number: '', paid_to: '', bank_gl_id: '' });
    setModalMode('txn'); setEditId(null); setModalError(null); setShowModal(true);
  };

  const handleSave = async () => {
    setModalError(null);
    try {
      if (modalMode === 'fund') {
        if (!form.fund_name) return setModalError('Fund name is required');
        if (!form.gl_account_id) return setModalError('Petty Cash GL account is required');
        if (parseFloat(form.float_amount || 0) > 0 && !form.bank_gl_id) return setModalError('Bank GL is required when setting initial float amount');
        if (editId) await api.put(`/finance/petty-cash/funds/${editId}`, form);
        else await api.post('/finance/petty-cash/funds', form);
      } else {
        if (!form.fund_id) return setModalError('Fund is required');
        if (!form.amount || parseFloat(form.amount) <= 0) return setModalError('Amount must be greater than 0');
        if (!form.description) return setModalError('Description is required');
        if (form.txn_type === 'expense') {
          if (!form.expense_gl_id) return setModalError('Expense GL (Debit account) is required');
          if (!form.category) return setModalError('Category is required');
          if (!form.paid_to) return setModalError('Paid To is required');
          if (!form.cost_center_id && !form.project_id) return setModalError('Cost Center or Project is required');
        }
        if (form.txn_type === 'replenish') {
          if (!form.bank_gl_id) return setModalError('Bank GL (Credit account) is required');
        }
        await api.post('/finance/petty-cash/txns', form);
      }
      setAlert({ type: 'success', message: editId ? 'Updated' : 'Created — GL posted' });
      setShowModal(false); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const handleDeleteFund = async (id) => {
    try { await api.delete(`/finance/petty-cash/funds/${id}`); setAlert({ type: 'success', message: 'Deleted' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleDeleteTxn = async (id) => {
    try { await api.delete(`/finance/petty-cash/txns/${id}`); setAlert({ type: 'success', message: 'Transaction deleted, balance reversed' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) { try { await api.delete(`/finance/petty-cash/txns/${id}`); } catch {} }
    setAlert({ type: 'success', message: `${selectedIds.length} transactions deleted` }); setSelectedIds([]); loadData();
  };

  const CATEGORIES = ['Office Supplies', 'Travel', 'Food & Refreshments', 'Courier & Postage', 'Maintenance', 'Miscellaneous', 'Staff Welfare', 'Cleaning', 'Fuel', 'Other'];

  const expenseGls = glAccounts.filter(g => g.account_type === 'expense');
  const bankGls = glAccounts.filter(g => g.account_name?.toLowerCase().includes('bank') || g.account_group?.toLowerCase().includes('bank'));
  const selectedFund = funds.find(f => f.id === form.fund_id);

  const fundCols = [
    { key: 'fund_name', label: 'Fund', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
    { key: 'custodian_name', label: 'Custodian' },
    { key: 'plant_code', label: 'Plant', render: (v, row) => v ? `${v} — ${row.plant_name}` : '—' },
    { key: 'float_amount', label: 'Float', className: 'text-right', render: v => formatCurrency(v) },
    { key: 'current_balance', label: 'Balance', className: 'text-right', render: v => <span className={`font-semibold ${parseFloat(v) < 500 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(v)}</span> },
    { key: 'account_code', label: 'GL', render: (v, row) => v ? <span className="font-mono text-xs text-blue-600">{v} — {row.account_name}</span> : '—' },
    { key: 'txn_count', label: 'Txns', className: 'text-right' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      <button onClick={() => openEditFund(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
      <button onClick={() => setConfirmDelete({ ...row, isFund: true })} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
      <button onClick={() => { setFilterFund(v); setTab('txns'); }} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" title="View transactions"><Eye className="w-3.5 h-3.5 text-gray-400" /></button>
    </div> },
  ];

  const txnCols = [
    { key: 'doc_number', label: '#', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'txn_type', label: 'Type', render: v => <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${v === 'expense' ? 'bg-rose-50 text-rose-600' : v === 'replenish' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{v}</span> },
    { key: 'fund_name', label: 'Fund' },
    { key: 'txn_date', label: 'Date', render: v => formatDate(v) },
    { key: 'amount', label: 'Amount', className: 'text-right', render: (v, row) => <span className={`font-semibold ${row.txn_type === 'replenish' ? 'text-emerald-600' : 'text-rose-600'}`}>{row.txn_type === 'replenish' ? '+' : '-'}{formatCurrency(v)}</span> },
    { key: 'category', label: 'Category', render: v => v || '—' },
    { key: 'description', label: 'Description', render: v => <span className="text-xs text-gray-500 truncate max-w-[200px] block">{v || '—'}</span> },
    { key: 'paid_to', label: 'Paid To', render: v => v || '—' },
    { key: 'journal_id', label: 'GL', render: v => v ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">Posted</span> : '—' },
    { key: 'id', label: '', render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Petty Cash</h1><p className="text-xs text-gray-400 mt-0.5">Manage petty cash funds, expenses, and replenishments — auto GL posting</p></div>
        <div className="flex gap-2">
          {tab === 'funds' && <><DownloadButton data={funds} filename="PettyCash" /><button onClick={openCreateFund} className="btn-primary flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> New Fund</button></>}
          {tab === 'txns' && <>
            <button onClick={() => openCreateTxn('expense')} className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg text-sm flex items-center gap-1.5"><ArrowUpRight className="w-4 h-4" /> Expense</button>
            <button onClick={() => openCreateTxn('replenish')} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg text-sm flex items-center gap-1.5"><ArrowDownLeft className="w-4 h-4" /> Replenish</button>
          </>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Tabs tabs={[{ key: 'funds', label: 'Funds', count: funds.length }, { key: 'txns', label: 'Transactions', count: txns.length }, { key: 'report', label: 'Report' }]} active={tab} onChange={setTab} />
        {tab === 'txns' && funds.length > 1 && <select value={filterFund} onChange={e => setFilterFund(e.target.value)} className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"><option value="">All Funds</option>{funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}</select>}
      </div>

      {/* Fund summary cards */}
      {tab === 'txns' && funds.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {funds.filter(f => !filterFund || f.id === filterFund).map(f => (
            <div key={f.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 shadow-sm">
              <p className="text-xs text-gray-400">{f.fund_name}</p>
              <p className={`text-lg font-bold ${parseFloat(f.current_balance) < 500 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(f.current_balance)}</p>
              <p className="text-[10px] text-gray-400">Float: {formatCurrency(f.float_amount)}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'txns' && <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />}

      {tab !== 'report' ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          {tab === 'funds' ? <DataTable columns={fundCols} data={funds} loading={loading} emptyMessage="No petty cash funds. Create one to start tracking expenses." />
          : <DataTable columns={txnCols} data={txns} loading={loading} selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds} emptyMessage="No transactions yet." />}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Report Filters */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-end gap-3 flex-wrap">
              <div><label className="text-[10px] text-gray-400 block mb-1">Period</label>
                <select value={reportPeriod} onChange={e => setReportPeriod(e.target.value)} className="px-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-900">
                  <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
                </select></div>
              <div><label className="text-[10px] text-gray-400 block mb-1">From</label><input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="px-3 py-1.5 text-xs border rounded-lg" /></div>
              <div><label className="text-[10px] text-gray-400 block mb-1">To</label><input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="px-3 py-1.5 text-xs border rounded-lg" /></div>
              {funds.length > 1 && <div><label className="text-[10px] text-gray-400 block mb-1">Fund</label><select value={reportFund} onChange={e => setReportFund(e.target.value)} className="px-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-900"><option value="">All Funds</option>{funds.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}</select></div>}
              <button onClick={loadReport} className="btn-primary text-xs px-4 py-1.5"><BarChart3 className="w-3.5 h-3.5 inline mr-1" />Generate</button>
            </div>
          </div>

          {report && <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-400">Total Expenses</p>
                <p className="text-2xl font-bold text-rose-600">{formatCurrency(report.totals?.total_expense || 0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-400">Total Replenished</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(report.totals?.total_replenish || 0)}</p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <p className="text-xs text-gray-400">Net Flow</p>
                <p className={`text-2xl font-bold ${(parseFloat(report.totals?.total_replenish||0) - parseFloat(report.totals?.total_expense||0)) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(parseFloat(report.totals?.total_replenish||0) - parseFloat(report.totals?.total_expense||0))}
                </p>
                <p className="text-[10px] text-gray-400">{report.totals?.total_txns || 0} transactions</p>
              </div>
            </div>

            {/* Period Table */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)} Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 dark:bg-gray-800/30 text-[10px] text-gray-400 uppercase">
                    <th className="px-4 py-2 text-left">Period</th>
                    <th className="px-4 py-2 text-right">Expenses</th>
                    <th className="px-4 py-2 text-right">Replenish</th>
                    <th className="px-4 py-2 text-right">Net</th>
                    <th className="px-4 py-2 text-right">Txns</th>
                  </tr></thead>
                  <tbody>{(report.period_data || []).map((r, i) => {
                    const net = parseFloat(r.total_replenish||0) - parseFloat(r.total_expense||0);
                    return <tr key={i} className="border-t border-gray-50 dark:border-gray-800">
                      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{r.period}</td>
                      <td className="px-4 py-2 text-right text-rose-600 font-medium">{formatCurrency(r.total_expense)}</td>
                      <td className="px-4 py-2 text-right text-emerald-600 font-medium">{formatCurrency(r.total_replenish)}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(net)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{r.txn_count}</td>
                    </tr>;
                  })}</tbody>
                </table>
                {!(report.period_data || []).length && <p className="text-center py-8 text-gray-400 text-sm">No data for selected period</p>}
              </div>
            </div>

            {/* Category Breakdown */}
            {(report.category_data || []).length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Expense by Category</h3>
                </div>
                <div className="p-4 space-y-2">
                  {report.category_data.map((c, i) => {
                    const pct = parseFloat(report.totals?.total_expense || 1) > 0 ? (parseFloat(c.total) / parseFloat(report.totals.total_expense) * 100) : 0;
                    return <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-32 truncate">{c.category || 'Uncategorized'}</span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-4 overflow-hidden">
                        <div className="bg-rose-400 h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-24 text-right">{formatCurrency(c.total)}</span>
                      <span className="text-[10px] text-gray-400 w-12 text-right">{pct.toFixed(0)}%</span>
                      <span className="text-[10px] text-gray-400 w-8 text-right">{c.count}</span>
                    </div>;
                  })}
                </div>
              </div>
            )}
          </>}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showModal} onClose={() => setShowModal(false)} title={modalMode === 'fund' ? (editId ? 'Edit Fund' : 'New Petty Cash Fund') : `Record ${form.txn_type === 'replenish' ? 'Replenishment' : 'Expense'}`} size="xl"
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} className="btn-primary">{editId ? 'Update' : modalMode === 'txn' ? 'Post' : 'Create'}</button></>}>
        <div className="space-y-4">
          {modalMode === 'fund' ? (<>
            <FormField label="Fund Name *"><input value={form.fund_name||''} onChange={e => setForm({...form, fund_name: e.target.value})} className="input-field" placeholder="e.g. Office Petty Cash" /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Custodian"><select value={form.custodian_id||''} onChange={e => setForm({...form, custodian_id: e.target.value})} className="select-field"><option value="">Select...</option>{users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></FormField>
              <FormField label="Plant"><select value={form.plant_id||''} onChange={e => setForm({...form, plant_id: e.target.value})} className="select-field"><option value="">Select...</option>{plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}</select></FormField>
            </div>
            <FormField label="Petty Cash GL Account (Debit) *"><select value={form.gl_account_id||''} onChange={e => setForm({...form, gl_account_id: e.target.value})} className="select-field"><option value="">Select petty cash / cash account...</option>{glAccounts.filter(g => g.account_type === 'asset').map(g => <option key={g.id} value={g.id}>{g.account_code} — {g.account_name}</option>)}</select></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Float Amount"><input type="number" min="0" value={form.float_amount||''} onChange={e => setForm({...form, float_amount: e.target.value})} className="input-field" placeholder="e.g. 10000" /></FormField>
              <FormField label="Bank GL (Credit) — for initial funding"><select value={form.bank_gl_id||''} onChange={e => setForm({...form, bank_gl_id: e.target.value})} className="select-field"><option value="">Select bank account...</option>{bankGls.map(g => <option key={g.id} value={g.id}>{g.account_code} — {g.account_name}</option>)}</select></FormField>
            </div>
            {parseFloat(form.float_amount||0) > 0 && form.bank_gl_id && (
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                GL Entry: <strong>Dr</strong> Petty Cash GL ₹{parseFloat(form.float_amount||0).toLocaleString()} | <strong>Cr</strong> Bank GL ₹{parseFloat(form.float_amount||0).toLocaleString()}
              </div>
            )}
          </>) : (<>
            {/* Expense vs Replenish — different forms */}
            {form.txn_type === 'expense' ? (<>
              <div className="px-3 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Record Expense</p>
                <p className="text-[10px] text-rose-500">Dr Expense GL (selected below), Cr Petty Cash GL</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Fund *"><select value={form.fund_id||''} onChange={e => setForm({...form, fund_id: e.target.value})} className="select-field"><option value="">Select...</option>{funds.map(f => <option key={f.id} value={f.id}>{f.fund_name} (Bal: {formatCurrency(f.current_balance)})</option>)}</select></FormField>
                <FormField label="Amount *"><input type="number" min="0.01" step="0.01" value={form.amount||''} onChange={e => setForm({...form, amount: e.target.value})} className="input-field" placeholder="0.00" /></FormField>
              </div>
              {selectedFund && <div className="text-xs text-gray-400 -mt-2">Available: <strong className={parseFloat(selectedFund.current_balance) < 500 ? 'text-rose-600' : 'text-emerald-600'}>{formatCurrency(selectedFund.current_balance)}</strong></div>}
              <FormField label="Debit GL Account (Expense) *"><select value={form.expense_gl_id||''} onChange={e => setForm({...form, expense_gl_id: e.target.value})} className="select-field"><option value="">Select expense account...</option>{expenseGls.map(g => <option key={g.id} value={g.id}>{g.account_code} — {g.account_name}</option>)}</select></FormField>
              <FormField label="Description *"><input value={form.description||''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" placeholder="e.g. Courier charges, Tea/Coffee" /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Category"><select value={form.category||''} onChange={e => setForm({...form, category: e.target.value})} className="select-field"><option value="">Select...</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></FormField>
                <FormField label="Paid To"><input value={form.paid_to||''} onChange={e => setForm({...form, paid_to: e.target.value})} className="input-field" placeholder="Name of person/vendor" /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Cost Center"><select value={form.cost_center_id||''} disabled={!!form.project_id} onChange={e => setForm({...form, cost_center_id: e.target.value, project_id: ''})} className={`select-field ${form.project_id ? 'opacity-50' : ''}`}><option value="">Select...</option>{costCenters.map(c => <option key={c.id} value={c.id}>{c.cc_code} — {c.cc_name}</option>)}</select></FormField>
                <FormField label="Project"><select value={form.project_id||''} disabled={!!form.cost_center_id} onChange={e => setForm({...form, project_id: e.target.value, cost_center_id: ''})} className={`select-field ${form.cost_center_id ? 'opacity-50' : ''}`}><option value="">Select...</option>{projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}</select></FormField>
              </div>
              <FormField label="Receipt/Voucher #"><input value={form.receipt_number||''} onChange={e => setForm({...form, receipt_number: e.target.value})} className="input-field" placeholder="Optional" /></FormField>
              {form.expense_gl_id && parseFloat(form.amount||0) > 0 && (
                <div className="px-3 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-xs text-rose-700 dark:text-rose-400">
                  GL Entry: <strong>Dr</strong> {expenseGls.find(g=>g.id===form.expense_gl_id)?.account_code || '?'} ₹{parseFloat(form.amount||0).toLocaleString()} | <strong>Cr</strong> Petty Cash GL ₹{parseFloat(form.amount||0).toLocaleString()}
                </div>
              )}
            </>) : (<>
              <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Replenish Fund</p>
                <p className="text-[10px] text-emerald-500">Dr Petty Cash GL, Cr Bank GL (selected below)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Fund *"><select value={form.fund_id||''} onChange={e => setForm({...form, fund_id: e.target.value})} className="select-field"><option value="">Select...</option>{funds.map(f => <option key={f.id} value={f.id}>{f.fund_name} (Bal: {formatCurrency(f.current_balance)})</option>)}</select></FormField>
                <FormField label="Replenish Amount *"><input type="number" min="0.01" step="0.01" value={form.amount||''} onChange={e => setForm({...form, amount: e.target.value})} className="input-field" placeholder="0.00" /></FormField>
              </div>
              {selectedFund && <div className="text-xs text-gray-400 -mt-2">Current balance: <strong>{formatCurrency(selectedFund.current_balance)}</strong> → After: <strong className="text-emerald-600">{formatCurrency(parseFloat(selectedFund.current_balance||0) + parseFloat(form.amount||0))}</strong></div>}
              <FormField label="Credit GL Account (Bank) *"><select value={form.bank_gl_id||''} onChange={e => setForm({...form, bank_gl_id: e.target.value})} className="select-field"><option value="">Select bank account...</option>{bankGls.map(g => <option key={g.id} value={g.id}>{g.account_code} — {g.account_name}</option>)}</select></FormField>
              <FormField label="Reference / Cheque #"><input value={form.description||''} onChange={e => setForm({...form, description: e.target.value})} className="input-field" placeholder="e.g. Bank transfer ref, Cheque no." /></FormField>
              {form.bank_gl_id && parseFloat(form.amount||0) > 0 && (
                <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-xs text-emerald-700 dark:text-emerald-400">
                  GL Entry: <strong>Dr</strong> Petty Cash GL ₹{parseFloat(form.amount||0).toLocaleString()} | <strong>Cr</strong> {bankGls.find(g=>g.id===form.bank_gl_id)?.account_code || '?'} ₹{parseFloat(form.amount||0).toLocaleString()}
                </div>
              )}
            </>)}
          </>)}
        </div>
      </Modal>

      <DeleteConfirm item={confirmDelete} onConfirm={(id) => confirmDelete?.isFund ? handleDeleteFund(id) : handleDeleteTxn(id)} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.fund_name || confirmDelete?.doc_number} />
    </div>
  );
}
