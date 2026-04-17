import { useState, useEffect } from 'react';
import { Play, Eye, DollarSign, Users, TrendingDown, FileText } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, StatusBadge , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function PayrollPage() {
  const [runs, setRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [showRun, setShowRun] = useState(false);
  const [showSlips, setShowSlips] = useState(null);
  const [showSlipDetail, setShowSlipDetail] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => { loadData(); }, []);
  const loadData = async () => { setLoading(true); try { setRuns((await api.get('/hr/payroll'))?.data || []); } catch {} finally { setLoading(false); } };
  const handleRunPayroll = async () => {
    try { const r = await api.post('/hr/payroll/run', { period_month: month, period_year: year }); setAlert({ type: 'success', message: `Payroll processed: ${r?.data?.employees} employees, Net: ${formatCurrency(r?.data?.total_net)}` }); setShowRun(false); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
  };
  const viewPayslips = async (runId) => {
    try { setPayslips((await api.get(`/hr/payroll/${runId}/payslips`))?.data || []); setShowSlips(runId); } catch (e) { setAlert({ type: 'error', message: e.message }); }
  };
  const viewSlipDetail = async (slipId) => {
    try { setShowSlipDetail((await api.get(`/hr/payslip/${slipId}`))?.data); } catch (e) { setAlert({ type: 'error', message: e.message }); }
  };

  const latest = runs[0];
  const fc = formatCurrency;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Indian Payroll</h1><p className="text-sm text-gray-400 mt-1">PF, ESI, Professional Tax, TDS — Full statutory compliance</p></div>
        <><DownloadButton data={runs} filename="PayrollPage" /><button onClick={() => setShowRun(true)} className="btn-primary flex items-center gap-2"><Play className="w-4 h-4" /> Run Payroll</button></>
      </div>

      {latest && <div className="grid grid-cols-5 gap-4">{[
        { label: 'Period', value: `${new Date(2026, latest.period_month - 1).toLocaleString('default', { month: 'short' })} ${latest.period_year}`, icon: DollarSign, color: 'from-blue-500 to-blue-600' },
        { label: 'Employees', value: latest.employee_count, icon: Users, color: 'from-emerald-500 to-emerald-600' },
        { label: 'Total Gross', value: fc(latest.total_gross), icon: TrendingDown, color: 'from-violet-500 to-violet-600' },
        { label: 'Total Net', value: fc(latest.total_net), icon: DollarSign, color: 'from-amber-500 to-amber-600' },
        { label: 'Employer PF+ESI', value: fc(parseFloat(latest.total_employer_pf||0) + parseFloat(latest.total_employer_esi||0)), icon: FileText, color: 'from-rose-500 to-rose-600' },
      ].map((c, i) => (
        <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}><c.icon className="w-5 h-5 text-white" /></div>
          <div><p className="text-lg font-bold">{c.value}</p><p className="text-xs text-gray-400">{c.label}</p></div>
        </div>
      ))}</div>}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={[
        { key: 'period_month', label: 'Period', render: (v, row) => <span className="font-medium">{new Date(2026, v - 1).toLocaleString('default', { month: 'long' })} {row.period_year}</span> },
        { key: 'run_date', label: 'Run Date', render: v => formatDate(v) },
        { key: 'employee_count', label: 'Employees', className: 'text-right' },
        { key: 'total_gross', label: 'Gross', className: 'text-right', render: v => fc(v) },
        { key: 'total_deductions', label: 'Deductions', className: 'text-right', render: v => <span className="text-rose-600">{fc(v)}</span> },
        { key: 'total_net', label: 'Net Pay', className: 'text-right', render: v => <span className="text-emerald-600 font-bold">{fc(v)}</span> },
        { key: 'status', label: 'Status', render: v => <StatusBadge status={v}/> },
        { key: 'id', label: '', render: v => <button onClick={() => viewPayslips(v)} className="p-1 hover:bg-gray-100 rounded"><Eye className="w-4 h-4 text-gray-400" /></button> },
      ]} data={runs} loading={loading} emptyMessage="No payroll runs yet." /></div>

      {/* RUN PAYROLL */}
      <Modal isOpen={showRun} onClose={() => setShowRun(false)} title="Run Monthly Payroll" size="xl"
        footer={<><button onClick={() => setShowRun(false)} className="btn-secondary">Cancel</button><button onClick={handleRunPayroll} className="btn-primary">Process Payroll</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Month"><select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="select-field">{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2026, i).toLocaleString('default', { month: 'long' })}</option>)}</select></FormField>
          <FormField label="Year"><input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="input-field" /></FormField>
        </div>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs space-y-1">
          <p className="font-semibold text-blue-800">Indian Statutory Components:</p>
          <p className="text-blue-700">Earnings: Basic + HRA (40%) + DA + Special Allowance + Conveyance (₹1,600) + Medical (₹1,250)</p>
          <p className="text-blue-700">PF: Employee 12% + Employer 12% (on Basic+DA, capped at ₹15,000 base)</p>
          <p className="text-blue-700">ESI: Employee 0.75% + Employer 3.25% (if gross ≤ ₹21,000)</p>
          <p className="text-blue-700">Professional Tax: ₹200/month (gross {'>'} ₹15,000)</p>
          <p className="text-blue-700">TDS: Monthly based on annual income (New/Old regime per employee)</p>
        </div>
      </Modal>

      {/* PAYSLIPS LIST */}
      <Modal isOpen={!!showSlips} onClose={() => setShowSlips(null)} title="Payslips" size="xl">
        <DataTable columns={[
          { key: 'employee_number', label: '#', render: v => <span className="font-mono text-xs">{v}</span> },
          { key: 'first_name', label: 'Name', render: (v, r) => <span className="font-medium">{v} {r.last_name}</span> },
          { key: 'department', label: 'Dept' },
          { key: 'basic_salary', label: 'Basic', className: 'text-right', render: v => fc(v) },
          { key: 'hra', label: 'HRA', className: 'text-right', render: v => fc(v) },
          { key: 'gross_salary', label: 'Gross', className: 'text-right', render: v => <span className="font-medium">{fc(v)}</span> },
          { key: 'pf_deduction', label: 'PF', className: 'text-right', render: v => <span className="text-rose-500">{fc(v)}</span> },
          { key: 'esi_employee', label: 'ESI', className: 'text-right', render: v => parseFloat(v) > 0 ? <span className="text-rose-500">{fc(v)}</span> : '—' },
          { key: 'professional_tax', label: 'PT', className: 'text-right', render: v => parseFloat(v) > 0 ? <span className="text-rose-500">{fc(v)}</span> : '—' },
          { key: 'tds', label: 'TDS', className: 'text-right', render: v => parseFloat(v) > 0 ? <span className="text-rose-500">{fc(v)}</span> : '—' },
          { key: 'net_salary', label: 'Net', className: 'text-right', render: v => <span className="text-emerald-600 font-bold">{fc(v)}</span> },
          { key: 'id', label: '', render: v => <button onClick={() => viewSlipDetail(v)} className="p-1 hover:bg-gray-100 rounded text-blue-600" title="View Payslip"><FileText className="w-4 h-4"/></button> },
        ]} data={payslips} />
      </Modal>

      {/* PAYSLIP DETAIL (Printable) */}
      <Modal isOpen={!!showSlipDetail} onClose={() => setShowSlipDetail(null)} title="Payslip" size="xl">
        {showSlipDetail && (() => {
          const s = showSlipDetail;
          const monthName = new Date(2026, (s.period_month||1) - 1).toLocaleString('default', { month: 'long' });
          return <div className="space-y-4">
            <div className="text-center border-b pb-3">
              <h2 className="text-lg font-bold">PAYSLIP — {monthName} {s.period_year}</h2>
              <p className="text-sm text-gray-500">{s.employee_number} | {s.first_name} {s.last_name} | {s.department}</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="p-1.5 bg-gray-50 rounded"><span className="text-gray-500">PAN:</span> <span className="font-mono">{s.pan_number||'—'}</span></div>
              <div className="p-1.5 bg-gray-50 rounded"><span className="text-gray-500">UAN:</span> <span className="font-mono">{s.uan_number||'—'}</span></div>
              <div className="p-1.5 bg-gray-50 rounded"><span className="text-gray-500">PF#:</span> <span className="font-mono">{s.pf_number||'—'}</span></div>
              <div className="p-1.5 bg-gray-50 rounded"><span className="text-gray-500">Bank:</span> {s.bank_name||'—'} {s.bank_account_number ? `****${s.bank_account_number.slice(-4)}` : ''}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-green-700 border-b pb-1 mb-2">EARNINGS</h3>
                <table className="w-full text-sm">{[
                  ['Basic Salary', s.basic_salary], ['HRA', s.hra], ['DA', s.da],
                  ['Special Allowance', s.special_allowance], ['Conveyance', s.conveyance_allowance], ['Medical', s.medical_allowance],
                ].filter(([,v]) => parseFloat(v) > 0).map(([label, val], i) => (
                  <tr key={i} className="border-b border-gray-100"><td className="py-1 text-gray-600">{label}</td><td className="py-1 text-right font-medium">{fc(val)}</td></tr>
                ))}
                <tr className="font-bold bg-green-50"><td className="py-1.5 pl-1">Gross Salary</td><td className="py-1.5 text-right text-green-700">{fc(s.gross_salary)}</td></tr>
                </table>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-red-700 border-b pb-1 mb-2">DEDUCTIONS</h3>
                <table className="w-full text-sm">{[
                  ['PF (Employee 12%)', s.pf_deduction], ['ESI (Employee 0.75%)', s.esi_employee],
                  ['Professional Tax', s.professional_tax], ['TDS / Income Tax', s.tds],
                  ['Loan Recovery', s.loan_deduction],
                ].filter(([,v]) => parseFloat(v) > 0).map(([label, val], i) => (
                  <tr key={i} className="border-b border-gray-100"><td className="py-1 text-gray-600">{label}</td><td className="py-1 text-right font-medium text-red-600">{fc(val)}</td></tr>
                ))}
                <tr className="font-bold bg-red-50"><td className="py-1.5 pl-1">Total Deductions</td><td className="py-1.5 text-right text-red-700">{fc(s.total_deductions)}</td></tr>
                </table>
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <p className="text-sm text-gray-600">Net Pay (Take Home)</p>
              <p className="text-3xl font-bold text-blue-700">{fc(s.net_salary)}</p>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <p>Employer PF: {fc(s.pf_employer)} | Employer ESI: {fc(s.esi_employer)} | CTC: {fc(s.ctc)}</p>
              <p>Working Days: {s.working_days} | Leave Days: {s.leave_days}</p>
            </div>
          </div>;
        })()}
      </Modal>
    </div>
  );
}
