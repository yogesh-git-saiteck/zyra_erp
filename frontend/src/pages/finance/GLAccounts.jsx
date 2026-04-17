import { useState, useEffect } from 'react';
import { Plus, Eye, Pencil, Trash2, Search, BookOpen, FolderTree, ChevronRight } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, StatusBadge , DownloadButton } from '../../components/common/index';
import { BulkImportExport } from '../../components/common/SharedFeatures';
import api from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';

export default function GLAccounts() {
  const [tab, setTab] = useState('coa');
  const [coas, setCoas] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState(''); // 'coa', 'gl', 'seed', 'editCoa', 'editGl'
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCoa, setSelectedCoa] = useState('');
  const [companies, setCompanies] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'tree'

  useEffect(() => { loadData(); loadCompanies(); }, [tab, typeFilter, search, selectedCoa]);

  const loadData = async () => {
    setLoading(true);
    try {
      const c = await api.get('/master/chart-of-accounts');
      setCoas(c?.data || []);
      if (tab === 'gl' || tab === 'coa') {
        const params = { type: typeFilter, search };
        const r = await api.get('/master/gl-accounts', params);
        setAccounts(r?.data || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };
  const loadCompanies = async () => { try { const r = await api.get('/org/companies'); setCompanies(r?.data || []); } catch {} };

  // COA actions
  const openCreateCoa = () => { setForm({ coa_code: '', coa_name: '', company_id: '' }); setModalMode('coa'); setEditId(null); setModalError(null); setShowModal(true); };
  const openEditCoa = (row) => { setForm({ coa_name: row.coa_name }); setModalMode('editCoa'); setEditId(row.id); setModalError(null); setShowModal(true); };
  const handleClearGlAccounts = async (coaId) => {
    try {
      const r = await api.delete(`/master/chart-of-accounts/${coaId}/gl-accounts`);
      setAlert({ type: 'success', message: `${r?.data?.deleted} GL accounts cleared` });
      setConfirmDelete(null); loadData();
    } catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const handleSaveCoa = async () => {
    setModalError(null);
    if (!form.coa_code || !form.coa_name) return setModalError('COA code and name are required');
    if (!form.company_id) return setModalError('Company is required');
    try {
      const r = await api.post('/master/chart-of-accounts', form);
      setAlert({ type: 'success', message: `Chart of Accounts "${r?.data?.coa_code}" created` });
      setShowModal(false); loadData();
    } catch (e) { setModalError(e.message); }
  };

  const handleUpdateCoa = async () => {
    try { await api.put(`/master/chart-of-accounts/${editId}`, form); setAlert({ type: 'success', message: 'Updated' }); setShowModal(false); loadData(); }
    catch (e) { setModalError(e.message); }
  };

  const handleDeleteCoa = async (id) => {
    try { await api.delete(`/master/chart-of-accounts/${id}`); setAlert({ type: 'success', message: 'Deleted' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const handleSeedTemplate = async () => {
    try {
      const r = await api.post(`/master/chart-of-accounts/${form.coa_id}/seed-template`, { template: form.template });
      setAlert({ type: 'success', message: `${r?.data?.created} GL accounts seeded from ${form.template} template` });
      setShowModal(false); loadData();
    } catch (e) { setModalError(e.message); }
  };

  // GL actions
  const openCreateGl = () => {
    const defaultCoa = coas.length === 1 ? coas[0].id : '';
    setForm({ account_code: '', account_name: '', account_type: 'asset', account_group: '', is_posting: true, is_reconciliation: false, currency: '', coa_id: defaultCoa });
    setModalMode('gl'); setEditId(null); setModalError(null); setShowModal(true);
  };
  const openEditGl = (row) => {
    setForm({ account_name: row.account_name, account_group: row.account_group, is_posting: row.is_posting, is_reconciliation: row.is_reconciliation, currency: row.currency });
    setModalMode('editGl'); setEditId(row.id); setModalError(null); setShowModal(true);
  };
  const handleSaveGl = async () => {
    setModalError(null);
    if (!form.account_code || !form.account_name || !form.account_type) return setModalError('Code, name, and type are required');
    if (coas.length === 0) return setModalError('Create a Chart of Accounts first');
    try {
      await api.post('/master/gl-accounts', { ...form, coa_id: form.coa_id || coas[0]?.id });
      setAlert({ type: 'success', message: `GL Account ${form.account_code} created` });
      setShowModal(false); loadData();
    } catch (e) { setModalError(e.message); }
  };
  const handleUpdateGl = async () => {
    try { await api.put(`/master/gl-accounts/${editId}`, form); setAlert({ type: 'success', message: 'Updated' }); setShowModal(false); loadData(); }
    catch (e) { setModalError(e.message); }
  };
  const handleDeleteGl = async (id) => {
    try { await api.delete(`/master/gl-accounts/${id}`); setAlert({ type: 'success', message: 'Account deleted/deactivated' }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };

  const handleModalSave = () => {
    if (modalMode === 'coa') handleSaveCoa();
    else if (modalMode === 'editCoa') handleUpdateCoa();
    else if (modalMode === 'gl') handleSaveGl();
    else if (modalMode === 'editGl') handleUpdateGl();
  };

  // Group accounts by type for tree view
  const accountGroups = {};
  const filteredAccounts = accounts.filter(a => (!selectedCoa || a.coa_id === selectedCoa) && (!typeFilter || a.account_type === typeFilter));
  filteredAccounts.forEach(a => {
    const group = a.account_group || 'Ungrouped';
    if (!accountGroups[group]) accountGroups[group] = [];
    accountGroups[group].push(a);
  });

  const types = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  const typeColors = { asset: 'text-blue-600', liability: 'text-rose-600', equity: 'text-purple-600', revenue: 'text-emerald-600', expense: 'text-amber-600' };

  const modalTitles = { coa: 'New Chart of Accounts', editCoa: 'Edit Chart of Accounts', gl: 'New GL Account', editGl: 'Edit GL Account' };

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Chart of Accounts</h1><p className="text-xs text-gray-400 mt-0.5">Manage COA structures and GL accounts for financial reporting</p></div>
        <div className="flex gap-2">
          <BulkImportExport entity="gl_accounts" onImported={loadData} />
          {tab === 'coa' && <><DownloadButton data={coas} filename="GLAccounts" /><button onClick={openCreateCoa} className="btn-primary flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> New COA</button></>}
          {tab === 'gl' && <button onClick={openCreateGl} className="btn-primary flex items-center gap-1.5 text-sm"><Plus className="w-4 h-4" /> New Account</button>}
        </div>
      </div>

      <Tabs tabs={[{ key: 'coa', label: 'Charts of Accounts', count: coas.length }, { key: 'gl', label: 'GL Accounts', count: accounts.length }]} active={tab} onChange={setTab} />

      {/* COA TAB */}
      {tab === 'coa' && (
        <div className="space-y-4">
          {coas.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center shadow-sm">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">No Chart of Accounts</h3>
              <p className="text-sm text-gray-400 mb-4">Create a Chart of Accounts to start adding GL accounts for financial transactions</p>
              <button onClick={openCreateCoa} className="btn-primary">Create Chart of Accounts</button>
            </div>
          ) : (
            <div className="grid gap-4">{coas.map(coa => (
              <div key={coa.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center"><FolderTree className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-600 dark:text-blue-400 font-bold text-sm">{coa.coa_code}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{coa.coa_name}</span>
                        {!coa.is_active && <StatusBadge status="inactive" />}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Company: {coa.company_code} — {coa.company_name} · {coa.account_count} accounts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setConfirmDelete({ ...coa, clearGl: true })} className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg hover:bg-rose-100 transition-all flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Clear Accounts</button>
                    <button onClick={() => openEditCoa(coa)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                    <button onClick={() => setConfirmDelete(coa)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
                    <button onClick={() => { setSelectedCoa(coa.id); setTab('gl'); }} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 transition-all flex items-center gap-1">View Accounts <ChevronRight className="w-3 h-3" /></button>
                  </div>
                </div>
                {/* Quick stats */}
                <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {types.map(t => {
                    const count = accounts.filter(a => a.coa_id === coa.id && a.account_type === t).length;
                    return <div key={t} className="text-center"><p className={`text-sm font-bold ${typeColors[t]}`}>{count}</p><p className="text-[10px] text-gray-400 capitalize">{t}</p></div>;
                  })}
                </div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* GL ACCOUNTS TAB */}
      {tab === 'gl' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {coas.length > 1 && <select value={selectedCoa} onChange={e => setSelectedCoa(e.target.value)} className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"><option value="">All COAs</option>{coas.map(c => <option key={c.id} value={c.id}>{c.coa_code} — {c.coa_name}</option>)}</select>}
            <div className="flex gap-1">{['', ...types].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} className={`px-3 py-1 text-xs rounded-full transition-all capitalize ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'}`}>{t || 'All'}</button>
            ))}</div>
            <div className="relative flex-1 max-w-xs"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name..." className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg w-full bg-white dark:bg-gray-900 focus:border-blue-400 outline-none" /></div>
          </div>

          {coas.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center shadow-sm">
              <p className="text-sm text-gray-400">Create a Chart of Accounts first, then add GL accounts</p>
              <button onClick={() => setTab('coa')} className="btn-primary mt-3">Go to Charts of Accounts</button>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <DataTable columns={[
                { key: 'account_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
                { key: 'account_name', label: 'Account Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{v}</span> },
                { key: 'account_type', label: 'Type', render: v => <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ${typeColors[v]} ${v === 'asset' ? 'bg-blue-50 dark:bg-blue-900/20' : v === 'liability' ? 'bg-rose-50 dark:bg-rose-900/20' : v === 'equity' ? 'bg-purple-50 dark:bg-purple-900/20' : v === 'revenue' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>{v}</span> },
                { key: 'account_group', label: 'Group', render: v => <span className="text-xs text-gray-500">{v || '—'}</span> },
                { key: 'balance_direction', label: 'Normal', render: v => <span className="text-xs capitalize text-gray-500">{v || '—'}</span> },
                { key: 'is_posting', label: 'Posting', render: v => v ? <span className="text-emerald-500 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
                { key: 'coa_code', label: 'COA', render: v => <span className="font-mono text-xs text-gray-400">{v}</span> },
                { key: 'id', label: '', render: (v, row) => (
                  <div className="flex gap-1">
                    <button onClick={() => openEditGl(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                    <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
                  </div>
                )},
              ]} data={filteredAccounts} loading={loading} emptyMessage="No GL accounts. Create a COA and seed a template to get started." />
            </div>
          )}
        </div>
      )}

      {/* CREATE/EDIT MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showModal} onClose={() => setShowModal(false)} title={modalTitles[modalMode] || 'Create'} size={modalMode === 'seed' ? 'sm' : 'md'}
        footer={<><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button><button onClick={handleModalSave} className="btn-primary">{modalMode.startsWith('edit') ? 'Update' : modalMode === 'seed' ? 'Seed Accounts' : 'Create'}</button></>}>
        <div className="space-y-4">
          {/* COA CREATE */}
          {modalMode === 'coa' && <>
            <FormField label="Company *"><select value={form.company_id || ''} onChange={e => setForm({...form, company_id: e.target.value})} className="select-field"><option value="">Select company...</option>{companies.map(c => <option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="COA Code *"><input value={form.coa_code || ''} onChange={e => setForm({...form, coa_code: e.target.value.toUpperCase()})} className="input-field font-mono" placeholder="e.g. IND01" maxLength={10} /></FormField>
              <FormField label="COA Name *"><input value={form.coa_name || ''} onChange={e => setForm({...form, coa_name: e.target.value})} className="input-field" placeholder="e.g. Indian Chart of Accounts" /></FormField>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
              After creating, use "Seed Template" to auto-populate with standard accounts (Indian or International).
            </div>
          </>}

          {/* COA EDIT */}
          {modalMode === 'editCoa' && <FormField label="COA Name"><input value={form.coa_name || ''} onChange={e => setForm({...form, coa_name: e.target.value})} className="input-field" /></FormField>}

          {/* GL CREATE */}
          {modalMode === 'gl' && <>
            {coas.length > 1 && <FormField label="Chart of Accounts *"><select value={form.coa_id || ''} onChange={e => setForm({...form, coa_id: e.target.value})} className="select-field"><option value="">Select...</option>{coas.map(c => <option key={c.id} value={c.id}>{c.coa_code} — {c.coa_name}</option>)}</select></FormField>}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Account Code *"><input value={form.account_code || ''} onChange={e => setForm({...form, account_code: e.target.value})} className="input-field font-mono" placeholder="e.g. 1010" /></FormField>
              <FormField label="Account Name *"><input value={form.account_name || ''} onChange={e => setForm({...form, account_name: e.target.value})} className="input-field" placeholder="e.g. Cash in Hand" /></FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Account Type *"><select value={form.account_type || 'asset'} onChange={e => setForm({...form, account_type: e.target.value})} className="select-field"><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option></select></FormField>
              <FormField label="Account Group"><input value={form.account_group || ''} onChange={e => setForm({...form, account_group: e.target.value})} className="input-field" placeholder="e.g. Current Assets" /></FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Currency"><input value={form.currency || ''} onChange={e => setForm({...form, currency: e.target.value})} className="input-field font-mono" placeholder="INR" maxLength={3} /></FormField>
              <FormField label="Allow Posting"><select value={form.is_posting ? 'true' : 'false'} onChange={e => setForm({...form, is_posting: e.target.value === 'true'})} className="select-field"><option value="true">Yes</option><option value="false">No (Header only)</option></select></FormField>
              <FormField label="Reconciliation"><select value={form.is_reconciliation ? 'true' : 'false'} onChange={e => setForm({...form, is_reconciliation: e.target.value === 'true'})} className="select-field"><option value="false">No</option><option value="true">Yes</option></select></FormField>
            </div>
          </>}

          {/* GL EDIT */}
          {modalMode === 'editGl' && <>
            <FormField label="Account Name"><input value={form.account_name || ''} onChange={e => setForm({...form, account_name: e.target.value})} className="input-field" /></FormField>
            <FormField label="Account Group"><input value={form.account_group || ''} onChange={e => setForm({...form, account_group: e.target.value})} className="input-field" /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Allow Posting"><select value={form.is_posting ? 'true' : 'false'} onChange={e => setForm({...form, is_posting: e.target.value === 'true'})} className="select-field"><option value="true">Yes</option><option value="false">No</option></select></FormField>
              <FormField label="Reconciliation"><select value={form.is_reconciliation ? 'true' : 'false'} onChange={e => setForm({...form, is_reconciliation: e.target.value === 'true'})} className="select-field"><option value="false">No</option><option value="true">Yes</option></select></FormField>
            </div>
          </>}
        </div>
      </Modal>

      {/* DELETE CONFIRM */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={confirmDelete?.clearGl ? 'Clear All GL Accounts' : 'Confirm Delete'} size="sm"
        footer={<><button onClick={() => setConfirmDelete(null)} className="btn-secondary">Cancel</button>
          <button onClick={() => {
            if (confirmDelete?.clearGl) handleClearGlAccounts(confirmDelete.id);
            else if (confirmDelete?.coa_code) handleDeleteCoa(confirmDelete.id);
            else handleDeleteGl(confirmDelete.id);
          }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm">{confirmDelete?.clearGl ? 'Clear All' : 'Delete'}</button></>}>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {confirmDelete?.clearGl ? (
            <>Are you sure you want to delete <strong>all GL accounts</strong> under <strong>{confirmDelete?.coa_code} — {confirmDelete?.coa_name}</strong>? This cannot be undone. Accounts with journal entries cannot be cleared.</>
          ) : (
            <>Are you sure you want to delete <strong>{confirmDelete?.coa_code || confirmDelete?.account_code} — {confirmDelete?.coa_name || confirmDelete?.account_name}</strong>?
            {confirmDelete?.account_count > 0 && <span className="block mt-2 text-rose-600">This COA has {confirmDelete.account_count} active accounts and cannot be deleted.</span>}</>
          )}
        </p>
      </Modal>
    </div>
  );
}
