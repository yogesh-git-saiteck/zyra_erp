import { useState, useEffect} from 'react';
import { Plus, Send, RotateCcw, Eye, Trash2, Printer } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert, PageLoader ,BulkActionBar, DownloadButton, SearchableSelect } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ExportButton } from '../../components/common/SharedFeatures';
import { printJournalEntry } from '../../utils/printUtils';

export default function JournalEntries() {
  const [journals, setJournals] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [glAccounts, setGlAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyLine = { gl_account_id: '', debit_amount: '', credit_amount: '', description: '' };
  const [form, setForm] = useState({
    posting_date: new Date().toISOString().split('T')[0],
    document_date: new Date().toISOString().split('T')[0],
    description: '', reference: '', currency: 'INR',
    lines: [{ ...emptyLine }, { ...emptyLine }]
  });

  useEffect(() => { loadJournals(); loadLookups(); }, [statusFilter, search]);

  const loadJournals = async () => {
    try { const res = await api.get('/finance/journals', { status: statusFilter, search }).catch(()=>null); setJournals(res?.data || []); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [gl, cc] = await Promise.all([api.get('/master/gl-accounts').catch(()=>null), api.get('/master/cost-centers').catch(()=>null)]);
      setGlAccounts(gl?.data || []); setCostCenters(cc?.data || []);
    } catch {}
  };

  const loadDetail = async (id) => {
    try { const res = await api.get(`/finance/journals/${id}`).catch(()=>null); setShowDetail(res?.data); }
    catch (err) { setModalError(err.message); }
  };

  const handleCreate = async () => {
    const totalD = form.lines.reduce((s, l) => s + parseFloat(l.debit_amount || 0), 0);
    const totalC = form.lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
    if (Math.abs(totalD - totalC) > 0.01) { setAlert({ type: 'error', message: `Debits (${totalD.toFixed(2)}) must equal Credits (${totalC.toFixed(2)})` }); return; }
    if (form.lines.some(l => !l.gl_account_id)) { setAlert({ type: 'error', message: 'All lines need a GL account' }); return; }

    setSaving(true);
    try {
      await api.post('/finance/journals', form);
      setShowCreate(false);
      setForm({ posting_date: new Date().toISOString().split('T')[0], document_date: new Date().toISOString().split('T')[0], description: '', reference: '', currency: 'USD', lines: [{ ...emptyLine }, { ...emptyLine }] });
      setAlert({ type: 'success', message: 'Journal entry created' }); loadJournals();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handlePost = async (id) => {
    try { await api.post(`/finance/journals/${id}/post`); setAlert({ type: 'success', message: 'Journal entry posted' }); loadJournals(); setShowDetail(null); }
    catch (err) { setModalError(err.message); }
  };

  const handleReverse = async (id) => {
    try { await api.post(`/finance/journals/${id}/reverse`); setAlert({ type: 'success', message: 'Journal entry reversed' }); loadJournals(); setShowDetail(null); }
    catch (err) { setModalError(err.message); }
  };

  const updateLine = (idx, field, value) => {
    const lines = [...form.lines];
    lines[idx] = { ...lines[idx], [field]: value };
    if (field === 'debit_amount' && parseFloat(value) > 0) lines[idx].credit_amount = '';
    if (field === 'credit_amount' && parseFloat(value) > 0) lines[idx].debit_amount = '';
    setForm({ ...form, lines });
  };
  const addLine = () => setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  const removeLine = (idx) => { if (form.lines.length > 2) setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) }); };

  const totalDebit = form.lines.reduce((s, l) => s + parseFloat(l.debit_amount || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + parseFloat(l.credit_amount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const columns = [
    { key: 'doc_number', label: 'Document', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'posting_date', label: 'Posting Date', render: v => formatDate(v) },
    { key: 'description', label: 'Description', render: v => <span className="text-gray-700">{v || '—'}</span> },
    { key: 'reference', label: 'Reference', render: v => <span className="text-gray-500">{v || '—'}</span> },
    { key: 'total_debit', label: 'Debit', className: 'text-right', render: v => <span className="text-gray-900 font-medium">{formatCurrency(v)}</span> },
    { key: 'total_credit', label: 'Credit', className: 'text-right', render: v => <span className="text-gray-900 font-medium">{formatCurrency(v)}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (v, row) => (
      <button onClick={(e) => { e.stopPropagation(); loadDetail(v); }} className="btn-ghost text-xs">
        <Eye className="w-3.5 h-3.5" />
      </button>
    )},
  ];

  const tabs = [
    { key: '', label: 'All' }, { key: 'draft', label: 'Draft' },
    { key: 'posted', label: 'Posted' }, { key: 'reversed', label: 'Reversed' },
  ];
  const handleBulkDelete = async () => {
    try { const r = await api.post('/finance/bulk-delete', { entity: 'journals', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadJournals(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Journal Entries</h1><p className="text-sm text-gray-400 mt-1">Create, post, and manage journal entries</p></div>
        <><DownloadButton data={journals} filename="JournalEntries" /><button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Entry</button></>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <Tabs tabs={tabs} active={statusFilter} onChange={setStatusFilter} />
        <SearchInput value={search} onChange={setSearch} placeholder="Search journals..." className="w-64" />
      </div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={journals} loading={loading} onRowClick={row => loadDetail(row.id)} emptyMessage="No journal entries found." />
      </div>

      {/* CREATE MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} title="Create Journal Entry" size="xl"
        footer={<>
          <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} disabled={saving || !isBalanced} className="btn-primary">{saving ? 'Creating...' : 'Create Entry'}</button>
        </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Posting Date" required><input type="date" value={form.posting_date} onChange={e => setForm({...form, posting_date: e.target.value})} className="input-field" /></FormField>
            <FormField label="Document Date"><input type="date" value={form.document_date} onChange={e => setForm({...form, document_date: e.target.value})} className="input-field" /></FormField>
            <FormField label="Reference"><input value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} className="input-field" /></FormField>
            <FormField label="Currency"><select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} className="select-field"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></FormField>
          </div>
          <FormField label="Description"><input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" placeholder="Journal entry description" /></FormField>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Line Items</span>
              <button onClick={addLine} className="text-xs text-blue-600 hover:underline">+ Add Line</button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">GL Account</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium w-32">Debit</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium w-32">Credit</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Description</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr></thead>
                <tbody>
                  {form.lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-2 py-1">
                        <SearchableSelect value={line.gl_account_id} onChange={val=>updateLine(idx,'gl_account_id',val)} options={glAccounts.map(a=>({value:a.id,label:`${a.account_code} — ${a.account_name}`}))} placeholder="Select account..." className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white" />
                      </td>
                      <td className="px-2 py-1"><input type="number" step="0.01" min="0" value={line.debit_amount} onChange={e => updateLine(idx, 'debit_amount', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded text-right bg-white focus:border-blue-400 focus:outline-none" placeholder="0.00" /></td>
                      <td className="px-2 py-1"><input type="number" step="0.01" min="0" value={line.credit_amount} onChange={e => updateLine(idx, 'credit_amount', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded text-right bg-white focus:border-blue-400 focus:outline-none" placeholder="0.00" /></td>
                      <td className="px-2 py-1"><input value={line.description || ''} onChange={e => updateLine(idx, 'description', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white focus:border-blue-400 focus:outline-none" /></td>
                      <td className="px-2 py-1"><button onClick={() => removeLine(idx)} className="text-gray-400 hover:text-rose-500" disabled={form.lines.length <= 2}><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-gray-50 font-semibold text-sm">
                  <td className="px-3 py-2 text-right">Total:</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totalDebit)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totalCredit)}</td>
                  <td className="px-3 py-2">
                    {isBalanced ? <span className="text-emerald-600 text-xs">Balanced ✓</span> : <span className="text-rose-600 text-xs">Unbalanced (diff: {formatCurrency(Math.abs(totalDebit - totalCredit))})</span>}
                  </td>
                  <td></td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)} title={`Journal Entry — ${showDetail?.doc_number || ''}`} size="xl"
        footer={<>
          <button onClick={() => printJournalEntry(showDetail)} className="btn-secondary flex items-center gap-2"><Printer className="w-4 h-4" /> Print</button>
          {showDetail?.status === 'draft' && <button onClick={() => handlePost(showDetail.id)} className="btn-primary flex items-center gap-2"><Send className="w-4 h-4" /> Post</button>}
          {showDetail?.status === 'posted' && <button onClick={() => handleReverse(showDetail.id)} className="btn-secondary flex items-center gap-2 text-rose-600 border-rose-200 hover:bg-rose-50"><RotateCcw className="w-4 h-4" /> Reverse</button>}
          <button onClick={() => setShowDetail(null)} className="btn-secondary">Close</button>
        </>}>
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div><p className="text-xs text-gray-500">Status</p><StatusBadge status={showDetail.status} size="xl" /></div>
              <div><p className="text-xs text-gray-500">Posting Date</p><p className="text-sm font-medium">{formatDate(showDetail.posting_date)}</p></div>
              <div><p className="text-xs text-gray-500">Reference</p><p className="text-sm">{showDetail.reference || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Currency</p><p className="text-sm">{showDetail.currency}</p></div>
            </div>
            {showDetail.description && <div><p className="text-xs text-gray-500">Description</p><p className="text-sm">{showDetail.description}</p></div>}

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">#</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Account</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Description</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">Debit</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500 font-medium">Credit</th>
                </tr></thead>
                <tbody>
                  {(showDetail.lines || []).map((l, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-400">{l.line_number}</td>
                      <td className="px-3 py-2"><span className="font-mono text-xs text-blue-600">{l.account_code}</span> {l.account_name}</td>
                      <td className="px-3 py-2 text-gray-500">{l.description || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium">{parseFloat(l.debit_amount) > 0 ? formatCurrency(l.debit_amount) : ''}</td>
                      <td className="px-3 py-2 text-right font-medium">{parseFloat(l.credit_amount) > 0 ? formatCurrency(l.credit_amount) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-gray-50 font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-right">Total:</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(showDetail.total_debit)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(showDetail.total_credit)}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
