import { useState, useEffect } from 'react';
import { Plus, Calculator, Lock, Unlock, DollarSign, Receipt, ShieldAlert, TrendingDown } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, StatusBadge , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';

export default function FinanceAdvanced() {
  const [tab, setTab] = useState('tax');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [taxCalc, setTaxCalc] = useState({ code: '', amount: '', result: null });
  const [creditCheck, setCreditCheck] = useState({ id: '', result: null });
  const [customers, setCustomers] = useState([]);

  useEffect(() => { loadData(); }, [tab]);
  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'tax') { const r = await api.get('/finance/tax-codes'); setData(r?.data || []); }
      else if (tab === 'currency') { const r = await api.get('/finance/exchange-rates'); setData(r?.data || []); }
      else if (tab === 'periods') { const r = await api.get('/finance/periods'); setData(r?.data || []); }
      else if (tab === 'budgets') { const r = await api.get('/finance/budgets'); setData(r?.data || []); }
      else if (tab === 'credit') { const r = await api.get('/master/business-partners', { type: 'customer', all: true }); setCustomers(r?.data?.rows || r?.data || []); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const endpoints = { tax: '/finance/tax-codes', currency: '/finance/exchange-rates', budgets: '/finance/budgets' };
      await api.post(endpoints[tab], form); setShowCreate(false); setForm({}); setAlert({ type: 'success', message: 'Created' }); loadData();
    } catch (e) { setModalError(e.message); } finally { setSaving(false); }
  };

  const handleCalcTax = async () => {
    try { const r = await api.get('/finance/tax-calculate', { tax_code: taxCalc.code, amount: taxCalc.amount }); setTaxCalc({ ...taxCalc, result: r?.data }); }
    catch (e) { setModalError(e.message); }
  };

  const handleClosePeriod = async (id) => {
    try { await api.post(`/finance/periods/${id}/close`); setAlert({ type: 'success', message: 'Period closed' }); loadData(); }
    catch (e) { setModalError(e.message); }
  };
  const handleReopenPeriod = async (id) => {
    try { await api.post(`/finance/periods/${id}/reopen`); setAlert({ type: 'success', message: 'Period reopened' }); loadData(); }
    catch (e) { setModalError(e.message); }
  };

  const handleCreditCheck = async () => {
    try { const r = await api.get(`/finance/credit-check/${creditCheck.id}`); setCreditCheck({ ...creditCheck, result: r?.data }); }
    catch (e) { setModalError(e.message); }
  };

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Finance Advanced</h1><p className="text-sm text-gray-400 mt-1">Tax, Currency, Budgets, Periods, Credit Control</p></div>
        {['tax', 'currency', 'budgets'].includes(tab) && <button onClick={() => { setForm({}); setShowCreate(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New</button>}
      </div>

      <Tabs tabs={[
        { key: 'tax', label: 'Tax Codes' }, { key: 'currency', label: 'Exchange Rates' },
        { key: 'periods', label: 'Period Closing' }, { key: 'budgets', label: 'Budgets' }, { key: 'credit', label: 'Credit Control' },
      ]} active={tab} onChange={setTab} />

      {/* TAX CODES */}
      {tab === 'tax' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
            { key: 'tax_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
            { key: 'tax_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
            { key: 'tax_type', label: 'Type', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 uppercase">{v}</span> },
            { key: 'tax_rate', label: 'Rate', className: 'text-right', render: v => `${v}%` },
            { key: 'components', label: 'Components', render: v => { const c = typeof v === 'string' ? JSON.parse(v) : (v || []); return c.length ? c.map(x => `${x.name}: ${x.rate}%`).join(', ') : '—'; }},
            { key: 'is_active', label: 'Active', render: v => v ? <span className="text-emerald-600">Active</span> : <span className="text-gray-400">Inactive</span> },
          ]} data={data} loading={loading} /></div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><Calculator className="w-4 h-4 text-blue-600" /> Tax Calculator</h3>
            <div className="flex gap-3 items-end">
              <FormField label="Tax Code"><select value={taxCalc.code} onChange={e => setTaxCalc({...taxCalc, code: e.target.value})} className="select-field w-40"><option value="">Select...</option>{data.map(t => <option key={t.tax_code} value={t.tax_code}>{t.tax_code} ({t.tax_rate}%)</option>)}</select></FormField>
              <FormField label="Taxable Amount"><input type="number" value={taxCalc.amount} onChange={e => setTaxCalc({...taxCalc, amount: e.target.value})} className="input-field w-40" /></FormField>
              <><DownloadButton data={data} filename="FinanceAdvanced" /><button onClick={handleCalcTax} className="btn-primary mb-0.5">Calculate</button></>
            </div>
            {taxCalc.result && (
              <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 grid grid-cols-4 gap-4 text-sm">
                <div><span className="text-gray-400 text-xs">Taxable</span><p className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(taxCalc.result.taxable)}</p></div>
                <div><span className="text-gray-400 text-xs">Tax</span><p className="font-bold text-rose-600">{formatCurrency(taxCalc.result.tax)}</p></div>
                <div><span className="text-gray-400 text-xs">Total</span><p className="font-bold text-emerald-600">{formatCurrency(taxCalc.result.total)}</p></div>
                <div><span className="text-gray-400 text-xs">Breakdown</span>{taxCalc.result.breakdown.map((b, i) => <p key={i} className="text-xs text-gray-600 dark:text-gray-400">{b.name}: {formatCurrency(b.amount)}</p>)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXCHANGE RATES */}
      {tab === 'currency' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'from_currency', label: 'From', render: v => <span className="font-mono font-medium">{v}</span> },
          { key: 'to_currency', label: 'To', render: v => <span className="font-mono font-medium">{v}</span> },
          { key: 'exchange_rate', label: 'Rate', className: 'text-right', render: v => parseFloat(v).toFixed(4) },
          { key: 'rate_date', label: 'Effective Date', render: v => formatDate(v) },
          { key: 'source', label: 'Source', render: v => <span className="capitalize text-gray-500">{v}</span> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* PERIOD CLOSING */}
      {tab === 'periods' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'period_year', label: 'Year' },
          { key: 'period_month', label: 'Month', render: v => new Date(2026, v - 1).toLocaleString('default', { month: 'long' }) },
          { key: 'status', label: 'Status', render: v => <span className={`badge ${v === 'open' ? 'badge-success' : 'badge-danger'}`}>{v === 'open' ? 'Open' : 'Closed'}</span> },
          { key: 'closed_by_name', label: 'Closed By', render: v => v || '—' },
          { key: 'closed_at', label: 'Closed At', render: v => v ? formatDate(v) : '—' },
          { key: 'id', label: '', render: (v, row) => row.status === 'open'
            ? <button onClick={() => handleClosePeriod(v)} className="text-xs text-rose-600 hover:underline flex items-center gap-1"><Lock className="w-3 h-3" /> Close</button>
            : <button onClick={() => handleReopenPeriod(v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Unlock className="w-3 h-3" /> Reopen</button>
          },
        ]} data={data} loading={loading} /></div>
      )}

      {/* BUDGETS */}
      {tab === 'budgets' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
          { key: 'budget_name', label: 'Budget', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
          { key: 'fiscal_year', label: 'Year' },
          { key: 'cost_center', label: 'Cost Center', render: v => v || 'All' },
          { key: 'account_name', label: 'GL Account', render: v => v || '—' },
          { key: 'budget_amount', label: 'Budget', className: 'text-right', render: v => formatCurrency(v) },
          { key: 'actual_amount', label: 'Actual', className: 'text-right', render: v => formatCurrency(v) },
          { key: 'available_amount', label: 'Available', className: 'text-right', render: v => <span className={parseFloat(v) < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}>{formatCurrency(v)}</span> },
          { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
        ]} data={data} loading={loading} /></div>
      )}

      {/* CREDIT CONTROL */}
      {tab === 'credit' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-600" /> Credit Check</h3>
            <div className="flex gap-3 items-end">
              <FormField label="Customer"><select value={creditCheck.id} onChange={e => setCreditCheck({...creditCheck, id: e.target.value})} className="select-field w-64"><option value="">Select customer...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></FormField>
              <button onClick={handleCreditCheck} className="btn-primary mb-0.5">Check Credit</button>
            </div>
            {creditCheck.result && (
              <div className="mt-4 space-y-3">
                {creditCheck.result.is_exceeded && <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 rounded-lg p-3"><p className="text-sm text-rose-700 dark:text-rose-400 font-medium">⚠️ Credit limit exceeded! Available: {formatCurrency(creditCheck.result.available_credit)}</p></div>}
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { label: 'Credit Limit', value: formatCurrency(creditCheck.result.credit_limit), color: 'text-gray-900 dark:text-gray-100' },
                    { label: 'Outstanding', value: formatCurrency(creditCheck.result.outstanding_balance), color: 'text-amber-600' },
                    { label: 'Committed Orders', value: formatCurrency(creditCheck.result.committed_orders), color: 'text-blue-600' },
                    { label: 'Total Exposure', value: formatCurrency(creditCheck.result.total_exposure), color: 'text-rose-600' },
                    { label: 'Available', value: formatCurrency(creditCheck.result.available_credit), color: creditCheck.result.is_exceeded ? 'text-rose-600 font-bold' : 'text-emerald-600' },
                  ].map((c, i) => <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center"><p className="text-xs text-gray-400">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => setShowCreate(false)} title={`New ${tab}`} size="xl"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={handleCreate} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
        <div className="space-y-4">
          {tab === 'tax' && <>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tax Code" required><input value={form.tax_code || ''} onChange={e => setForm({...form, tax_code: e.target.value.toUpperCase()})} className="input-field font-mono" /></FormField>
              <FormField label="Tax Name" required><input value={form.tax_name || ''} onChange={e => setForm({...form, tax_name: e.target.value})} className="input-field" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Type"><select value={form.tax_type || 'gst'} onChange={e => setForm({...form, tax_type: e.target.value})} className="select-field"><option value="gst">GST</option><option value="igst">IGST</option><option value="vat">VAT</option><option value="sales_tax">Sales Tax</option><option value="exempt">Exempt</option></select></FormField>
              <FormField label="Rate (%)" required><input type="number" step="0.01" value={form.rate || ''} onChange={e => setForm({...form, rate: e.target.value})} className="input-field" /></FormField>
            </div>
          </>}
          {tab === 'currency' && <>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="From"><select value={form.from_currency || ''} onChange={e => setForm({...form, from_currency: e.target.value})} className="select-field"><option value="">-</option>{['USD','EUR','GBP','INR','JPY','CNY','AUD','CAD'].map(c => <option key={c}>{c}</option>)}</select></FormField>
              <FormField label="To"><select value={form.to_currency || ''} onChange={e => setForm({...form, to_currency: e.target.value})} className="select-field"><option value="">-</option>{['USD','EUR','GBP','INR','JPY','CNY','AUD','CAD'].map(c => <option key={c}>{c}</option>)}</select></FormField>
              <FormField label="Rate" required><input type="number" step="0.0001" value={form.rate || ''} onChange={e => setForm({...form, rate: e.target.value})} className="input-field" /></FormField>
            </div>
            <FormField label="Effective Date"><input type="date" value={form.effective_date || ''} onChange={e => setForm({...form, effective_date: e.target.value})} className="input-field" /></FormField>
          </>}
          {tab === 'budgets' && <>
            <FormField label="Budget Name" required><input value={form.budget_name || ''} onChange={e => setForm({...form, budget_name: e.target.value})} className="input-field" /></FormField>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Fiscal Year"><input type="number" value={form.fiscal_year || new Date().getFullYear()} onChange={e => setForm({...form, fiscal_year: parseInt(e.target.value)})} className="input-field" /></FormField>
              <FormField label="Cost Center"><input value={form.cost_center || ''} onChange={e => setForm({...form, cost_center: e.target.value})} className="input-field" /></FormField>
              <FormField label="Budget Amount" required><input type="number" value={form.budget_amount || ''} onChange={e => setForm({...form, budget_amount: e.target.value})} className="input-field" /></FormField>
            </div>
          </>}
        </div>
      </Modal>
    </div>
  );
}
