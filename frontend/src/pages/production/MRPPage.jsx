import { useState, useEffect } from 'react';
import { Play, Eye, ShoppingCart, Factory, AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import { DataTable, FormField, Alert, StatusBadge, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate, formatNumber } from '../../utils/formatters';

export default function MRPPage() {
  const [runs, setRuns] = useState([]);
  const [results, setResults] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [alert, setAlert] = useState(null);
  const [horizon, setHorizon] = useState(30);
  const [planningStrategy, setPlanningStrategy] = useState('MTS');
  const [lotSizeProcedure, setLotSizeProcedure] = useState('EX');

  useEffect(() => { loadRuns(); }, []);

  const loadRuns = async () => {
    setLoading(true);
    try { setRuns((await api.get('/production/mrp-runs'))?.data || []); }
    catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  };

  const loadResults = async (runId, runsData) => {
    setResultsLoading(true);
    setResults([]);
    try {
      const r = await api.get(`/production/mrp-runs/${runId}/results`);
      setResults(r?.data || []);
      const source = runsData || runs;
      setSelectedRun(source.find(run => run.id === runId) || { id: runId });
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
    finally { setResultsLoading(false); }
  };

  const runMRP = async () => {
    setRunning(true);
    try {
      const res = await api.post('/production/mrp/run', {
        planning_horizon_days: horizon,
        planning_strategy: planningStrategy,
        lot_size_procedure: lotSizeProcedure,
      });
      setAlert({ type: 'success', message: res.message || 'MRP run complete' });
      const freshRuns = (await api.get('/production/mrp-runs'))?.data || [];
      setRuns(freshRuns);
      const targetId = res.data?.run_id || freshRuns[0]?.id;
      if (targetId) loadResults(targetId, freshRuns);
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
    finally { setRunning(false); }
  };

  const createPR = async (resultId) => {
    try {
      const res = await api.post(`/production/mrp-results/${resultId}/create-pr`);
      setAlert({ type: 'success', message: res.message || 'PR created' });
      if (selectedRun) loadResults(selectedRun.id);
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const createOrder = async (resultId) => {
    try {
      const res = await api.post(`/production/mrp-results/${resultId}/create-order`);
      setAlert({ type: 'success', message: res.message || 'Production order created' });
      if (selectedRun) loadResults(selectedRun.id);
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  const actionColor = (v) => {
    if (v === 'purchase') return 'bg-red-100 text-red-700';
    if (v === 'reorder') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-500';
  };
  const actionLabel = (v) => {
    if (v === 'purchase') return 'Shortage';
    if (v === 'reorder') return 'Reorder';
    if (v === 'sufficient') return 'OK';
    return v || '—';
  };

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">MRP — Material Requirements Planning</h1>
          <p className="text-sm text-gray-400 mt-1">Analyze demand vs supply, generate planned orders with BOM explosion</p>
        </div>
      </div>

      {/* RUN MRP */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">MRP Run Parameters <span className="font-mono text-xs text-gray-400 ml-2">MD01</span></p>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          <FormField label="Planning Strategy">
            <select value={planningStrategy} onChange={e => setPlanningStrategy(e.target.value)} className="select-field w-44">
              <option value="MTS">MTS — Make to Stock</option>
              <option value="MTO">MTO — Make to Order</option>
              <option value="MIXED">MIXED — Per Material</option>
            </select>
          </FormField>
          <FormField label="Lot Size Procedure">
            <select value={lotSizeProcedure} onChange={e => setLotSizeProcedure(e.target.value)} className="select-field w-44">
              <option value="EX">EX — Exact (lot-for-lot)</option>
              <option value="FX">FX — Fixed Lot Size</option>
              <option value="WB">WB — Weekly Batches</option>
              <option value="MB">MB — Monthly Batches</option>
            </select>
          </FormField>
          <FormField label="Planning Horizon (days)">
            <input type="number" value={horizon} onChange={e => setHorizon(parseInt(e.target.value) || 30)}
              className="input-field w-32" min="7" max="365" />
          </FormField>
          <div className="flex gap-2">
            <DownloadButton data={runs} filename="MRP_Runs" />
            <button onClick={runMRP} disabled={running} className="btn-primary flex items-center gap-2 h-10">
              <Play className="w-4 h-4" /> {running ? 'Running MRP...' : 'Run MRP'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          MRP explodes BOMs to calculate net component requirements from open sales orders and reorder points, then generates shortage/reorder action items.
          <span className="ml-2 text-gray-300">|</span>
          <span className="ml-2 text-blue-500">Process flow: Work Centers → BOM → Routing → Orders → <strong>MRP ✓</strong></span>
        </p>
      </div>

      {/* PAST RUNS */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <h3 className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">MRP Runs</h3>
        <DataTable columns={[
          { key: 'run_date', label: 'Run Date', render: v => formatDate(v) },
          { key: 'planning_horizon_days', label: 'Horizon', render: v => `${v} days` },
          { key: 'total_requirements', label: 'Materials', render: v => v || 0 },
          { key: 'planned_orders_created', label: 'Action Items', render: v => <span className={v > 0 ? 'text-amber-600 font-medium' : ''}>{v || 0}</span> },
          { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
          { key: 'run_by', label: 'Run By', render: v => v || '—' },
          {
            key: 'id', label: '', render: v => (
              <button onClick={() => loadResults(v)} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1">
                <Eye className="w-3 h-3" /> View
              </button>
            )
          },
        ]} data={runs} loading={loading} />
      </div>

      {/* RESULTS */}
      {selectedRun && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              MRP Results {selectedRun.run_date && <span className="font-normal text-gray-400">— {formatDate(selectedRun.run_date)}</span>}
            </h3>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> Shortage: {results.filter(r => r.action_type === 'purchase').length}</span>
              <span className="flex items-center gap-1"><Package className="w-3 h-3 text-amber-500" /> Reorder: {results.filter(r => r.action_type === 'reorder').length}</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> OK: {results.filter(r => r.action_type === 'sufficient').length}</span>
            </div>
          </div>
          {resultsLoading && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Loading results...</div>
          )}
          {!resultsLoading && results.length === 0 && (
            <div className="px-4 py-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No action items required</p>
              <p className="text-xs text-gray-400 mt-1">All materials have sufficient stock for the planning horizon, or there are no open sales orders within this period.</p>
            </div>
          )}
          {!resultsLoading && results.length > 0 && <DataTable columns={[
            {
              key: 'material_code', label: 'Material',
              render: (v, r) => <span><span className="font-mono text-blue-600">{v}</span> — {r.material_name}</span>
            },
            { key: 'requirement_qty', label: 'Required', className: 'text-right', render: v => formatNumber(v, 0) },
            { key: 'available_stock', label: 'In Stock', className: 'text-right', render: v => formatNumber(v, 0) },
            { key: 'on_order_qty', label: 'On Order', className: 'text-right', render: v => formatNumber(v, 0) },
            {
              key: 'shortage_qty', label: 'Shortage', className: 'text-right',
              render: v => <span className={parseFloat(v) > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>{formatNumber(v, 0)}</span>
            },
            {
              key: 'suggested_order_qty', label: 'Suggest Qty', className: 'text-right',
              render: v => v > 0 ? <span className="font-semibold text-amber-600">{formatNumber(v, 0)}</span> : '—'
            },
            { key: 'suggested_date', label: 'By Date', render: v => formatDate(v) || '—' },
            {
              key: 'action_type', label: 'Action',
              render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColor(v)}`}>{actionLabel(v)}</span>
            },
            {
              key: 'id', label: '', render: (v, r) => {
                if (r.is_processed) return <span className="text-xs text-green-600">Done</span>;
                if (r.action_type === 'sufficient') return null;
                return (
                  <div className="flex gap-1">
                    <button onClick={() => createPR(v)} className="px-2 py-0.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 flex items-center gap-1" title="Create Purchase Requisition">
                      <ShoppingCart className="w-3 h-3" /> PR
                    </button>
                    <button onClick={() => createOrder(v)} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 flex items-center gap-1" title="Create Production Order">
                      <Factory className="w-3 h-3" /> Prod
                    </button>
                  </div>
                );
              }
            },
          ]} data={results} />}
        </div>
      )}
    </div>
  );
}
