import { useState, useEffect } from 'react';
import { Save, Wand2, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { Alert, Modal } from '../../components/common/index';
import api from '../../utils/api';

const CATEGORIES = { sales: 'Sales & AR', procurement: 'Procurement & AP', payments: 'Payments & Banking', tax_input: 'Input Tax (Purchase)', tax_output: 'Output Tax (Sales)', tax_other: 'Other Tax', tax: 'Tax & GST', payroll: 'Payroll', assets: 'Assets', equity: 'Equity' };

export default function GLMapping() {
  const [mappings, setMappings] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [changes, setChanges] = useState({});

  useEffect(() => { loadMappings(); }, []);

  const loadMappings = async () => {
    setLoading(true);
    try {
      const r = await api.get('/finance/gl-mapping');
      setMappings(r?.data?.mappings || []);
      setAccounts(r?.data?.accounts || []);
      setChanges({});
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  };

  const handleAutoDetect = async () => {
    setSaving(true);
    try {
      const r = await api.post('/finance/gl-mapping/auto-detect');
      setAlert({ type: 'success', message: `Auto-detected ${r?.data?.detected} of ${r?.data?.total} mappings from your GL accounts` });
      loadMappings();
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setSaving(false); }
  };

  const handleSave = async () => {
    const toSave = Object.entries(changes).map(([key, gl_account_id]) => ({ mapping_key: key, gl_account_id: gl_account_id || null }));
    if (!toSave.length) { setAlert({ type: 'info', message: 'No changes to save' }); return; }
    setSaving(true);
    try {
      const r = await api.post('/finance/gl-mapping', { mappings: toSave });
      setAlert({ type: 'success', message: `${r?.data?.saved} mappings saved` });
      setChanges({});
      loadMappings();
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setSaving(false); }
  };

  const updateMapping = (key, glId) => {
    setChanges(prev => ({ ...prev, [key]: glId }));
  };

  const getMappedId = (m) => changes[m.key] !== undefined ? changes[m.key] : (m.gl_account_id || m.suggested_id || '');
  const getMappedName = (m) => {
    const id = getMappedId(m);
    if (!id) return null;
    const acct = accounts.find(a => a.id === id);
    return acct ? `${acct.account_code} — ${acct.account_name}` : m.account_code ? `${m.account_code} — ${m.account_name}` : null;
  };

  const grouped = {};
  mappings.forEach(m => {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  });

  const mappedCount = mappings.filter(m => m.gl_account_id || m.suggested_id).length;
  const totalCount = mappings.length;
  const changesCount = Object.keys(changes).length;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">GL Account Mapping</h1>
          <p className="text-xs text-gray-400 mt-0.5">Map your GL accounts to transaction types for automatic journal entry creation</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAutoDetect} disabled={saving} className="btn-secondary flex items-center gap-1.5 text-sm"><Wand2 className="w-4 h-4" /> Auto-Detect All</button>
          <button onClick={handleSave} disabled={saving || !changesCount} className="btn-primary flex items-center gap-1.5 text-sm"><Save className="w-4 h-4" /> Save{changesCount > 0 ? ` (${changesCount})` : ''}</button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{mappedCount} / {totalCount} mapped</span>
        </div>
        {totalCount - mappedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{totalCount - mappedCount} unmapped — auto-JE may fail for these</span>
          </div>
        )}
        {changesCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <Settings className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{changesCount} unsaved changes</span>
          </div>
        )}
      </div>

      {/* Mapping groups */}
      {Object.entries(CATEGORIES).map(([catKey, catLabel]) => {
        const items = grouped[catKey];
        if (!items?.length) return null;
        return (
          <div key={catKey} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{catLabel}</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(m => {
                const currentId = getMappedId(m);
                const isMapped = !!currentId;
                const isChanged = changes[m.key] !== undefined;
                return (
                  <div key={m.key} className={`px-4 py-3 flex items-center gap-4 ${isChanged ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isMapped ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 ml-4">{m.description}</p>
                    </div>
                    <div className="w-96">
                      <select
                        value={currentId}
                        onChange={e => updateMapping(m.key, e.target.value)}
                        className={`w-full px-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition-all ${isMapped ? 'border-emerald-300 dark:border-emerald-700' : 'border-rose-300 dark:border-rose-700'}`}
                      >
                        <option value="">— Not mapped —</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.account_code} — {a.account_name} [{a.account_type}]</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-6">
                      {isMapped ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-gray-300" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4">
        <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">How GL Mapping Works</h3>
        <p className="text-xs text-blue-700 dark:text-blue-400">
          When Zyra creates automatic journal entries (from sales invoices, purchase invoices, goods receipts, payments, etc.), 
          it uses these mappings to determine which GL accounts to debit and credit. 
          <strong> Auto-Detect</strong> matches your GL accounts by name patterns (e.g. "Debtors" → Accounts Receivable, "Stock In Hand" → Inventory). 
          You can override any mapping manually. Unmapped entries will prevent auto-JE creation for those transaction types.
        </p>
      </div>
    </div>
  );
}
