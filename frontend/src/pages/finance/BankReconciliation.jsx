import { useState, useEffect } from 'react';
import { Plus, Upload, Zap, CheckCircle, XCircle, Building2, ArrowLeftRight } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, StatusBadge , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';

export default function BankReconciliation() {
  const [tab, setTab] = useState('accounts');
  const [accounts, setAccounts] = useState([]);
  const [statements, setStatements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [reconFilter, setReconFilter] = useState('');
  const [form, setForm] = useState({});
  const [importData, setImportData] = useState('');
  const [glAccounts, setGlAccounts] = useState([]);

  useEffect(() => { loadData(); }, [selectedBank, reconFilter]);
  const loadData = async () => {
    setLoading(true);
    try {
      const [ac, gl, pay] = await Promise.all([
        api.get('/finance/bank-accounts').catch(()=>null), api.get('/finance/bank-gl-accounts').catch(()=>null), api.get('/finance/payments').catch(()=>null)
      ]);
      setAccounts(ac?.data || []); setGlAccounts(gl?.data || []); setPayments(pay?.data || []);
      if (selectedBank) {
        const st = await api.get('/finance/bank-statements', { bank_account_id: selectedBank, reconciled: reconFilter }).catch(()=>null);
        setStatements(st?.data || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleCreateAccount = async () => {
    setSaving(true);
    try { await api.post('/finance/bank-accounts', form); setShowCreate(false); setAlert({ type: 'success', message: 'Bank account created' }); loadData(); }
    catch (e) { setModalError(e.message); } finally { setSaving(false); }
  };

  const handleImport = async () => {
    try {
      const lines = importData.trim().split('\n').filter(l => l.trim());
      const stmts = lines.map(l => {
        const parts = l.split(',').map(p => p.trim());
        return { date: parts[0], reference: parts[1], description: parts[2], debit: parseFloat(parts[3]) || 0, credit: parseFloat(parts[4]) || 0, balance: parseFloat(parts[5]) || 0 };
      });
      const r = await api.post('/finance/bank-statements/import', { bank_account_id: selectedBank, statements: stmts });
      setShowImport(false); setImportData(''); setAlert({ type: 'success', message: `${r?.data?.imported || 0} statements imported` }); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const handleAutoReconcile = async () => {
    try {
      const r = await api.post('/finance/bank-statements/auto-reconcile', { bank_account_id: selectedBank });
      setAlert({ type: 'success', message: `Auto-matched ${r?.data?.matched || 0} of ${r?.data?.total || 0} statements` }); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const handleManualReconcile = async (stmtId, paymentId) => {
    try {
      await api.post(`/finance/bank-statements/${stmtId}/reconcile`, { matched_payment_id: paymentId });
      setAlert({ type: 'success', message: 'Reconciled' }); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const unmatchedCount = statements.filter(s => !s.is_reconciled).length;
  const matchedCount = statements.filter(s => s.is_reconciled).length;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bank Reconciliation</h1><p className="text-sm text-gray-400 mt-1">Match bank statements with ERP transactions</p></div>
        <div className="flex gap-2">
          <button onClick={() => { setForm({}); setShowCreate(true); }} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Bank Account</button>
          {selectedBank && <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2"><Upload className="w-4 h-4" /> Import</button>}
          {selectedBank && <><DownloadButton data={accounts} filename="BankReconciliation" /><button onClick={handleAutoReconcile} className="btn-primary flex items-center gap-2"><Zap className="w-4 h-4" /> Auto-Reconcile</button></>}
        </div>
      </div>

      <Tabs tabs={[{ key: 'accounts', label: 'Bank Accounts', count: accounts.length }, { key: 'reconcile', label: 'Reconciliation' }]} active={tab} onChange={setTab} />

      {tab === 'accounts' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'account_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
            { key: 'account_name', label: 'Account Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
            { key: 'bank_name', label: 'Bank' }, { key: 'account_number', label: 'Account #', render: v => v ? <span className="font-mono text-sm">{v}</span> : '—' },
            { key: 'currency', label: 'Currency' },
            { key: 'current_balance', label: 'Balance', className: 'text-right', render: v => formatCurrency(v) },
            { key: 'id', label: '', render: (v) => <button onClick={() => { setSelectedBank(v); setTab('reconcile'); }} className="text-xs text-blue-600 hover:underline">Reconcile →</button> },
          ]} data={accounts} loading={loading} />
        </div>
      )}

      {tab === 'reconcile' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <FormField label="Bank Account"><select value={selectedBank} onChange={e => setSelectedBank(e.target.value)} className="select-field w-64">
              <option value="">Select...</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
            </select></FormField>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setReconFilter('')} className={`px-3 py-1 text-xs rounded-full ${!reconFilter ? 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>All ({statements.length})</button>
              <button onClick={() => setReconFilter('false')} className={`px-3 py-1 text-xs rounded-full ${reconFilter === 'false' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>Unmatched ({unmatchedCount})</button>
              <button onClick={() => setReconFilter('true')} className={`px-3 py-1 text-xs rounded-full ${reconFilter === 'true' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>Matched ({matchedCount})</button>
            </div>
          </div>
          {selectedBank ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <DataTable columns={[
                { key: 'statement_date', label: 'Date', render: v => formatDate(v) },
                { key: 'reference', label: 'Reference', render: v => <span className="font-mono text-sm">{v || '—'}</span> },
                { key: 'description', label: 'Description' },
                { key: 'debit_amount', label: 'Debit', className: 'text-right', render: v => parseFloat(v) > 0 ? <span className="text-rose-600">{formatCurrency(v)}</span> : '—' },
                { key: 'credit_amount', label: 'Credit', className: 'text-right', render: v => parseFloat(v) > 0 ? <span className="text-emerald-600">{formatCurrency(v)}</span> : '—' },
                { key: 'balance', label: 'Balance', className: 'text-right', render: v => formatCurrency(v) },
                { key: 'is_reconciled', label: 'Status', render: (v, row) => v ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5" /> Matched</span> : <span className="flex items-center gap-1 text-amber-600 text-xs"><XCircle className="w-3.5 h-3.5" /> Unmatched</span> },
                { key: 'id', label: '', render: (v, row) => !row.is_reconciled && (
                  <select onChange={e => { if (e.target.value) handleManualReconcile(v, e.target.value); }} className="text-xs border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 bg-white dark:bg-gray-800">
                    <option value="">Match to...</option>
                    {payments.filter(p => Math.abs(parseFloat(p.amount) - (parseFloat(row.debit_amount) || parseFloat(row.credit_amount))) < 0.01).map(p => <option key={p.id} value={p.id}>{p.doc_number || 'PAY'} - {formatCurrency(p.amount)}</option>)}
                  </select>
                )},
              ]} data={statements} loading={loading} emptyMessage="No statements. Import bank statements to begin reconciliation." />
            </div>
          ) : <p className="text-center text-gray-400 py-8">Select a bank account to start reconciliation</p>}
        </div>
      )}

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Bank Account" size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateAccount} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Account Code" required><input value={form.account_code || ''} onChange={e => setForm({...form, account_code: e.target.value})} className="input-field font-mono" /></FormField>
            <FormField label="Account Name" required><input value={form.account_name || ''} onChange={e => setForm({...form, account_name: e.target.value})} className="input-field" /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Bank Name"><input value={form.bank_name || ''} onChange={e => setForm({...form, bank_name: e.target.value})} className="input-field" /></FormField>
            <FormField label="Account Number"><input value={form.account_number || ''} onChange={e => setForm({...form, account_number: e.target.value})} className="input-field font-mono" /></FormField>
            <FormField label="IFSC / SWIFT"><input value={form.ifsc_code || ''} onChange={e => setForm({...form, ifsc_code: e.target.value})} className="input-field font-mono" /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Currency"><select value={form.currency || 'USD'} onChange={e => setForm({...form, currency: e.target.value})} className="select-field"><option>USD</option><option>INR</option><option>EUR</option><option>GBP</option></select></FormField>
            <FormField label="GL Account"><select value={form.gl_account_id || ''} onChange={e => setForm({...form, gl_account_id: e.target.value})} className="select-field"><option value="">Select...</option>{glAccounts.map(g => <option key={g.id} value={g.id}>{g.account_code} — {g.account_name}</option>)}</select></FormField>
            <FormField label="Opening Balance"><input type="number" value={form.opening_balance || ''} onChange={e => setForm({...form, opening_balance: e.target.value})} className="input-field" /></FormField>
          </div>
        </div>
      </Modal>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showImport} onClose={() => setShowImport(false)} title="Import Bank Statements" size="xl"
        footer={<><button onClick={() => setShowImport(false)} className="btn-secondary">Cancel</button><button onClick={handleImport} className="btn-primary">Import</button></>}>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Paste CSV data: date, reference, description, debit, credit, balance (one line per transaction)</p>
          <textarea value={importData} onChange={e => setImportData(e.target.value)} className="input-field font-mono text-xs" rows={10} placeholder="2026-03-01, TXN001, Office Supplies, 500, 0, 49500&#10;2026-03-02, TXN002, Customer Payment, 0, 15000, 64500" />
          <p className="text-xs text-gray-400">{importData.trim().split('\n').filter(l => l.trim()).length} line(s) detected</p>
        </div>
      </Modal>
    </div>
  );
}
