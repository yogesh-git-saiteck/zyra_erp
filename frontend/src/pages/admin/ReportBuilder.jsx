import { useState } from 'react';
import { Play, Download, Trash2, Plus } from 'lucide-react';
import { DataTable, FormField, Alert , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';

const ENTITIES = {
  business_partners: { label: 'Business Partners', columns: ['bp_number', 'bp_type', 'display_name', 'company_name', 'email', 'phone', 'city', 'country', 'credit_limit', 'is_active', 'created_at'] },
  materials: { label: 'Materials', columns: ['material_code', 'material_name', 'description', 'standard_price', 'sales_price', 'is_batch_managed', 'is_active', 'created_at'] },
  sales_orders: { label: 'Sales Orders', columns: ['doc_number', 'order_date', 'delivery_date', 'currency', 'subtotal', 'tax_amount', 'total_amount', 'status', 'created_at'] },
  purchase_orders: { label: 'Purchase Orders', columns: ['doc_number', 'order_date', 'delivery_date', 'currency', 'subtotal', 'tax_amount', 'total_amount', 'status', 'created_at'] },
  journal_entries: { label: 'Journal Entries', columns: ['doc_number', 'posting_date', 'document_date', 'description', 'currency', 'total_debit', 'total_credit', 'status'] },
  ap_invoices: { label: 'AP Invoices', columns: ['doc_number', 'invoice_date', 'due_date', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount', 'status'] },
  ar_invoices: { label: 'AR Invoices', columns: ['doc_number', 'invoice_date', 'due_date', 'subtotal', 'tax_amount', 'total_amount', 'paid_amount', 'status'] },
  payments: { label: 'Payments', columns: ['doc_number', 'payment_type', 'payment_date', 'amount', 'payment_method', 'status'] },
  employees: { label: 'Employees', columns: ['employee_number', 'hire_date', 'employment_type', 'salary', 'status'] },
  assets: { label: 'Assets', columns: ['asset_code', 'asset_name', 'acquisition_date', 'acquisition_cost', 'accumulated_depreciation', 'net_book_value', 'status'] },
  stock: { label: 'Inventory Stock', columns: ['material_id', 'plant_id', 'quantity', 'reserved_qty', 'stock_type'] },
  opportunities: { label: 'CRM Opportunities', columns: ['opportunity_name', 'stage', 'probability', 'expected_value', 'expected_close', 'status'] },
  projects: { label: 'Projects', columns: ['project_code', 'project_name', 'start_date', 'end_date', 'budget', 'actual_cost', 'status'] },
};

const OPERATORS = [
  { value: 'eq', label: '= Equals' }, { value: 'like', label: '≈ Contains' },
  { value: 'gt', label: '> Greater than' }, { value: 'lt', label: '< Less than' },
  { value: 'gte', label: '≥ Greater or equal' }, { value: 'lte', label: '≤ Less or equal' },
];

export default function ReportBuilder() {
  const [entity, setEntity] = useState('');
  const [selectedCols, setSelectedCols] = useState([]);
  const [filters, setFilters] = useState([]);
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [limit, setLimit] = useState(100);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  const entityConfig = ENTITIES[entity];
  const availableCols = entityConfig?.columns || [];

  const handleEntityChange = (e) => {
    setEntity(e); setSelectedCols([]); setFilters([]); setSortBy(''); setResult(null);
  };

  const toggleCol = (col) => {
    setSelectedCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const addFilter = () => setFilters([...filters, { field: availableCols[0] || '', operator: 'eq', value: '' }]);
  const updateFilter = (idx, field, value) => { const f = [...filters]; f[idx] = { ...f[idx], [field]: value }; setFilters(f); };
  const removeFilter = (idx) => setFilters(filters.filter((_, i) => i !== idx));

  const runQuery = async () => {
    if (!entity) { setAlert({ type: 'error', message: 'Select an entity' }); return; }
    setLoading(true);
    try {
      const res = await api.post('/admin/report-query', {
        entity, columns: selectedCols.length ? selectedCols : undefined,
        filters: filters.filter(f => f.value), sort_by: sortBy || undefined, sort_dir: sortDir, limit
      });
      setResult(res?.data);
      setAlert({ type: 'success', message: `${res?.data?.rowCount || 0} rows returned` });
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  };

  const exportCSV = () => {
    if (!result?.rows?.length) return;
    const cols = selectedCols.length ? selectedCols : Object.keys(result.rows[0]);
    const csv = [cols.join(','), ...result.rows.map(r => cols.map(c => `"${(r[c] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `report_${entity}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const resultColumns = result?.rows?.[0]
    ? Object.keys(result.rows[0]).map(k => ({ key: k, label: k.replace(/_/g, ' '), render: v => <span className="text-sm">{v?.toString() ?? '—'}</span> }))
    : [];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Report Builder</h1><p className="text-sm text-gray-400 mt-1">Build custom queries across any module</p></div></div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 space-y-4">
        {/* Entity Selection */}
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Data Source" required>
            <select value={entity} onChange={e => handleEntityChange(e.target.value)} className="select-field">
              <option value="">Select entity...</option>
              {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </FormField>
          <FormField label="Sort By">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="select-field">
              <option value="">Default</option>
              {availableCols.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Direction">
              <select value={sortDir} onChange={e => setSortDir(e.target.value)} className="select-field">
                <option value="asc">Ascending</option><option value="desc">Descending</option>
              </select>
            </FormField>
            <FormField label="Limit">
              <input type="number" value={limit} onChange={e => setLimit(e.target.value)} className="input-field" min={1} max={500} />
            </FormField>
          </div>
        </div>

        {/* Column Selection */}
        {entity && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Columns <span className="text-xs text-gray-400">(leave empty for all)</span></p>
            <div className="flex flex-wrap gap-2">
              {availableCols.map(col => (
                <button key={col} onClick={() => toggleCol(col)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-all ${selectedCols.includes(col) ? 'bg-blue-50 border-blue-300 text-blue-600 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                  {col.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        {entity && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Filters</p>
              <button onClick={addFilter} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add Filter</button>
            </div>
            {filters.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-2">
                <select value={f.field} onChange={e => updateFilter(idx, 'field', e.target.value)} className="select-field py-1.5 text-sm flex-1">
                  {availableCols.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
                <select value={f.operator} onChange={e => updateFilter(idx, 'operator', e.target.value)} className="select-field py-1.5 text-sm w-40">
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input value={f.value} onChange={e => updateFilter(idx, 'value', e.target.value)} placeholder="Value" className="input-field py-1.5 text-sm flex-1" />
                <button onClick={() => removeFilter(idx)} className="p-1 text-gray-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}

        {/* Run */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
          <button onClick={runQuery} disabled={!entity || loading} className="btn-primary flex items-center gap-2">
            <Play className="w-4 h-4" /> {loading ? 'Running...' : 'Run Query'}
          </button>
          {result?.rows?.length > 0 && (
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" /> Export CSV</button>
          )}
          {result && <span className="text-sm text-gray-500">{result.rowCount} rows</span>}
        </div>
      </div>

      {/* Results */}
      {result?.rows?.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={resultColumns} data={result.rows} />
        </div>
      )}
    </div>
  );
}
