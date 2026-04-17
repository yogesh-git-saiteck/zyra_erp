import { useState, useEffect } from 'react';
import { Warehouse as WarehouseIcon, Package, MapPin, Eye, Plus, Grid3X3, ClipboardCheck, CheckCircle ,Trash2} from 'lucide-react';
import { DataTable, Modal, FormField, Alert, Tabs, PageLoader, DeleteConfirm , DownloadButton } from '../../components/common/index';
import { ExportButton } from '../../components/common/SharedFeatures';
import api from '../../utils/api';
import { formatNumber, formatDate } from '../../utils/formatters';

export default function WarehousePage() {
  const [mainTab, setMainTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [locations, setLocations] = useState([]);
  const [bins, setBins] = useState([]);
  const [cycleCounts, setCycleCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStock, setShowStock] = useState(null);
  const [slocStock, setSlocStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [selectedBins, setSelectedBins] = useState([]);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Bin form
  const [showBinForm, setShowBinForm] = useState(false);
  const [showBinGen, setShowBinGen] = useState(false);
  const [binForm, setBinForm] = useState({ bin_code:'', sloc_id:'', bin_type:'storage', aisle:'', rack:'', level:'', max_capacity:'' });
  const [binGenForm, setBinGenForm] = useState({ sloc_id:'', aisles:3, racks_per_aisle:5, levels_per_rack:4 });

  // Cycle count
  const [showCCForm, setShowCCForm] = useState(false);
  const [showCCDetail, setShowCCDetail] = useState(null);
  const [ccForm, setCcForm] = useState({ plant_id:'', sloc_id:'', count_date:'', notes:'' });
  const [plants, setPlants] = useState([]);
  const [slocs, setSlocs] = useState([]);

  useEffect(() => { loadData(); loadLookups(); }, [mainTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (mainTab === 'overview') {
        const [ov, locs] = await Promise.all([api.get('/warehouse/overview').catch(()=>null), api.get('/warehouse/locations').catch(()=>null)]);
        setOverview(ov?.data); setLocations(locs?.data || []);
      } else if (mainTab === 'bins') {
        setBins((await api.get('/warehouse/bins').catch(()=>null))?.data || []);
      } else if (mainTab === 'cycle-count') {
        setCycleCounts((await api.get('/warehouse/cycle-counts').catch(()=>null))?.data || []);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [p, s] = await Promise.all([api.get('/master/plants').catch(()=>null), api.get('/org/storage-locations').catch(()=>null)]);
      setPlants(p?.data || []); setSlocs(s?.data || []);
    } catch {}
  };

  const loadSlocStock = async (sloc) => {
    setShowStock(sloc); setStockLoading(true);
    try { setSlocStock((await api.get(`/warehouse/location-stock/${sloc.id}`).catch(()=>null))?.data || []); }
    catch {} finally { setStockLoading(false); }
  };

  // Bin handlers
  const handleCreateBin = async () => {
    setSaving(true);
    try { await api.post('/warehouse/bins', binForm); setShowBinForm(false); setAlert({ type:'success', message:'Bin created' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleDeleteBin = async (id) => {
    try { await api.delete(`/warehouse/bins/${id}`); setAlert({ type: "success", message: "Bin deleted" }); setConfirmDelete(null); loadData(); }
    catch (e) { setAlert({ type: "error", message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    if (!selectedBins.length) return;
    try {
      const r = await api.post('/warehouse/bins/bulk-delete', { ids: selectedBins });
      setAlert({ type: 'success', message: `${r?.data?.deleted || selectedBins.length} bins deleted` });
      setSelectedBins([]); setConfirmDelete(null); loadData();
    } catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const toggleBinSelect = (id) => setSelectedBins(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAllBins = () => setSelectedBins(prev => prev.length === bins.length ? [] : bins.map(b => b.id));
  const handleGenerateBins = async () => {
    setSaving(true);
    try { const r = await api.post('/warehouse/bins/generate', binGenForm); setShowBinGen(false); setAlert({ type:'success', message: r?.message || 'Bins generated' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  // Cycle count handlers
  const handleCreateCC = async () => {
    setSaving(true);
    try { await api.post('/warehouse/cycle-counts', ccForm); setShowCCForm(false); setAlert({ type:'success', message:'Cycle count created with stock items' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const loadCCDetail = async (id) => {
    try { setShowCCDetail((await api.get(`/warehouse/cycle-counts/${id}`).catch(()=>null))?.data); }
    catch (err) { setModalError(err.message); }
  };
  const handleSubmitCount = async () => {
    setSaving(true);
    try { await api.put(`/warehouse/cycle-counts/${showCCDetail.id}/count`, { items: showCCDetail.items }); setAlert({ type:'success', message:'Count recorded' }); setShowCCDetail(null); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleApproveCC = async (id) => {
    try { await api.post(`/warehouse/cycle-counts/${id}/approve`); setAlert({ type:'success', message:'Approved — inventory adjusted' }); loadData(); }
    catch (err) { setModalError(err.message); }
  };
  const updateCCItem = (idx, field, val) => {
    const items = [...showCCDetail.items]; items[idx] = {...items[idx], [field]: val}; setShowCCDetail({...showCCDetail, items});
  };

  const slocCols = [
    { key: 'sloc_code', label: 'Code', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'sloc_name', label: 'Name', render: v => <span className="font-medium">{v}</span> },
    { key: 'plant_code', label: 'Plant' }, { key: 'sloc_type', label: 'Type', render: v => <span className="capitalize">{v||'general'}</span> },
    { key: 'material_count', label: 'Materials', className: 'text-right' },
    { key: 'total_qty', label: 'Total Qty', className: 'text-right', render: v => formatNumber(v) },
    { key: 'id', label: '', render: (v, row) => <button onClick={() => loadSlocStock(row)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Eye className="w-4 h-4"/></button> },
  ];
  const binCols = [
    { key: 'bin_code', label: 'Bin', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'sloc_code', label: 'Storage Location' }, { key: 'plant_code', label: 'Plant' },
    { key: 'aisle', label: 'Aisle' }, { key: 'rack', label: 'Rack' }, { key: 'level', label: 'Level' },
    { key: 'bin_type', label: 'Type', render: v => <span className="capitalize">{v}</span> },
    { key: 'max_capacity', label: 'Max Cap', className: 'text-right', render: v => v||'—' },
    { key: 'current_qty', label: 'Current', className: 'text-right', render: v => formatNumber(v) },
    { key: '_del', label: '', render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
  ];
  const ccCols = [
    { key: 'count_number', label: '#', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'sloc_name', label: 'Location' }, { key: 'plant_code', label: 'Plant' },
    { key: 'count_date', label: 'Date', render: v => formatDate(v) },
    { key: 'item_count', label: 'Items', className: 'text-right' },
    { key: 'variance_count', label: 'Variances', className: 'text-right', render: v => parseInt(v)>0 ? <span className="text-red-600 font-medium">{v}</span> : <span className="text-green-600">0</span> },
    { key: 'status', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v==='approved'?'bg-green-100 text-green-700':v==='counted'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{v}</span> },
    { key: 'id', label: '', render: (v, row) => <div className="flex gap-1">
      <button onClick={() => loadCCDetail(v)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Eye className="w-4 h-4"/></button>
      {row.status === 'counted' && <button onClick={() => handleApproveCC(v)} className="p-1 hover:bg-green-50 rounded text-green-600" title="Approve & adjust"><CheckCircle className="w-4 h-4"/></button>}
    </div> },
  ];

  if (loading && mainTab === 'overview' && !overview) return <PageLoader />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><WarehouseIcon className="w-6 h-6 text-blue-600"/><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Warehouse Management</h1><p className="text-sm text-gray-400 mt-1">Locations, bins, stock & cycle counts</p></div></div>
        <div className="flex gap-2">
          <ExportButton entity="warehouse_stock"/>
          {mainTab === 'bins' && <><button onClick={() => setShowBinGen(true)} className="btn-secondary flex items-center gap-2"><Grid3X3 className="w-4 h-4"/> Auto-Generate</button>
            <><DownloadButton data={locations} filename="WarehousePage" /><button onClick={() => setShowBinForm(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Bin</button></></>}
          {mainTab === 'cycle-count' && <button onClick={() => setShowCCForm(true)} className="btn-primary flex items-center gap-2"><ClipboardCheck className="w-4 h-4"/> New Count</button>}
        </div>
      </div>

      <Tabs tabs={[{key:'overview',label:'Stock Overview'},{key:'bins',label:'Bin Locations'},{key:'cycle-count',label:'Cycle Count'}]} active={mainTab} onChange={setMainTab}/>

      {mainTab === 'overview' && <div className="space-y-5">
        {overview && <div className="grid grid-cols-4 gap-4">{[
          { label:'Plants', value: overview.plants?.total || 0, icon: MapPin, color:'bg-blue-50 text-blue-700' },
          { label:'Storage Locations', value: overview.storageLocs?.total || overview.storage_locations?.total || 0, icon: Package, color:'bg-green-50 text-green-700' },
          { label:'Materials in Stock', value: overview.stockBySloc?.reduce((a,s) => a + parseInt(s.materials||0), 0) || 0, icon: Package, color:'bg-purple-50 text-purple-700' },
          { label:'Total Stock Qty', value: formatNumber(overview.stockBySloc?.reduce((a,s) => a + parseFloat(s.qty||0), 0) || 0), icon: WarehouseIcon, color:'bg-orange-50 text-orange-700' },
        ].map((c,i) => <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3"><div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.color}`}><c.icon className="w-5 h-5"/></div><div><p className="text-xs text-gray-500">{c.label}</p><p className="text-xl font-bold">{c.value}</p></div></div>)}</div>}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={slocCols} data={locations} loading={loading}/></div>
      </div>}

      {mainTab === 'bins' && <div className="space-y-3">
        {selectedBins.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
            <span className="text-sm font-medium text-rose-700 dark:text-rose-400">{selectedBins.length} bin{selectedBins.length > 1 ? 's' : ''} selected</span>
            <button onClick={() => setConfirmDelete({ bulk: true })} className="px-3 py-1 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete Selected</button>
            <button onClick={() => setSelectedBins([])} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Clear</button>
          </div>
        )}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          {!bins.length ? <div className="text-center py-12 text-gray-400 text-sm">No bins. Create bins or use Auto-Generate.</div> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left w-10"><input type="checkbox" checked={selectedBins.length === bins.length && bins.length > 0} onChange={toggleAllBins} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bin</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Storage Loc</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Plant</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Aisle</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Rack</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Max Cap</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Current</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr></thead>
              <tbody>{bins.map(row => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-3 py-2.5"><input type="checkbox" checked={selectedBins.includes(row.id)} onChange={() => toggleBinSelect(row.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /></td>
                  <td className="px-3 py-2.5 font-mono text-blue-600 dark:text-blue-400 font-medium text-sm">{row.bin_code}</td>
                  <td className="px-3 py-2.5 text-sm">{row.sloc_code}</td>
                  <td className="px-3 py-2.5 text-sm">{row.plant_code}</td>
                  <td className="px-3 py-2.5 text-sm">{row.aisle}</td>
                  <td className="px-3 py-2.5 text-sm">{row.rack}</td>
                  <td className="px-3 py-2.5 text-sm">{row.level}</td>
                  <td className="px-3 py-2.5 text-sm capitalize">{row.bin_type}</td>
                  <td className="px-3 py-2.5 text-sm text-right">{row.max_capacity || '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-right">{formatNumber(row.current_qty)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>}
      {mainTab === 'cycle-count' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={ccCols} data={cycleCounts} loading={loading} emptyMessage="No cycle counts yet."/></div>}

      {/* Stock detail modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showStock} onClose={() => setShowStock(null)} title={showStock ? `Stock at ${showStock.sloc_code} — ${showStock.sloc_name}` : ''} size="xl">
        {stockLoading ? <PageLoader/> : <DataTable columns={[
          { key:'material_code', label:'Code', render: v => <span className="font-mono">{v}</span> },
          { key:'material_name', label:'Material', render: v => <span className="font-medium">{v}</span> },
          { key:'quantity', label:'Qty', className:'text-right', render: v => <span className="font-semibold">{formatNumber(v)}</span> },
          { key:'uom_code', label:'UoM' },
        ]} data={slocStock}/>}
      </Modal>

      {/* Create Bin */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showBinForm} onClose={() => setShowBinForm(false)} title="Create Bin Location" size="xl"
        footer={<><button onClick={() => setShowBinForm(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateBin} disabled={saving} className="btn-primary">{saving?'Creating...':'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Bin Code" required><input value={binForm.bin_code} onChange={e=>setBinForm({...binForm,bin_code:e.target.value})} className="input-field" placeholder="e.g. A-01-03" required/></FormField>
            <FormField label="Storage Location" required><select value={binForm.sloc_id} onChange={e=>setBinForm({...binForm,sloc_id:e.target.value})} className="select-field" required><option value="">Select...</option>{slocs.map(s=><option key={s.id} value={s.id}>{s.sloc_code} — {s.sloc_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Aisle"><input value={binForm.aisle} onChange={e=>setBinForm({...binForm,aisle:e.target.value})} className="input-field" placeholder="A"/></FormField>
            <FormField label="Rack"><input value={binForm.rack} onChange={e=>setBinForm({...binForm,rack:e.target.value})} className="input-field" placeholder="01"/></FormField>
            <FormField label="Level"><input value={binForm.level} onChange={e=>setBinForm({...binForm,level:e.target.value})} className="input-field" placeholder="03"/></FormField>
            <FormField label="Max Capacity"><input type="number" value={binForm.max_capacity} onChange={e=>setBinForm({...binForm,max_capacity:e.target.value})} className="input-field"/></FormField>
          </div>
        </div>
      </Modal>

      {/* Auto-Generate Bins */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showBinGen} onClose={() => setShowBinGen(false)} title="Auto-Generate Bin Grid" size="sm"
        footer={<><button onClick={() => setShowBinGen(false)} className="btn-secondary">Cancel</button><button onClick={handleGenerateBins} disabled={saving} className="btn-primary">{saving?'Generating...':'Generate'}</button></>}>
        <div className="space-y-4">
          <FormField label="Storage Location" required><select value={binGenForm.sloc_id} onChange={e=>setBinGenForm({...binGenForm,sloc_id:e.target.value})} className="select-field" required><option value="">Select...</option>{slocs.map(s=><option key={s.id} value={s.id}>{s.sloc_code} — {s.sloc_name}</option>)}</select></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Aisles"><input type="number" min="1" max="26" value={binGenForm.aisles} onChange={e=>setBinGenForm({...binGenForm,aisles:parseInt(e.target.value)||1})} className="input-field"/></FormField>
            <FormField label="Racks/Aisle"><input type="number" min="1" max="50" value={binGenForm.racks_per_aisle} onChange={e=>setBinGenForm({...binGenForm,racks_per_aisle:parseInt(e.target.value)||1})} className="input-field"/></FormField>
            <FormField label="Levels/Rack"><input type="number" min="1" max="10" value={binGenForm.levels_per_rack} onChange={e=>setBinGenForm({...binGenForm,levels_per_rack:parseInt(e.target.value)||1})} className="input-field"/></FormField>
          </div>
          <p className="text-xs text-gray-500">Will generate <strong>{binGenForm.aisles * binGenForm.racks_per_aisle * binGenForm.levels_per_rack}</strong> bin locations (e.g. A-01-01, A-01-02...)</p>
        </div>
      </Modal>

      {/* Create Cycle Count */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCCForm} onClose={() => setShowCCForm(false)} title="Create Cycle Count" size="xl"
        footer={<><button onClick={() => setShowCCForm(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateCC} disabled={saving} className="btn-primary">{saving?'Creating...':'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Plant"><select value={ccForm.plant_id} onChange={e=>setCcForm({...ccForm,plant_id:e.target.value})} className="select-field"><option value="">Select...</option>{plants.map(p=><option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}</select></FormField>
            <FormField label="Storage Location" required><select value={ccForm.sloc_id} onChange={e=>setCcForm({...ccForm,sloc_id:e.target.value})} className="select-field" required><option value="">Select...</option>{slocs.map(s=><option key={s.id} value={s.id}>{s.sloc_code} — {s.sloc_name}</option>)}</select></FormField>
          </div>
          <FormField label="Count Date"><input type="date" value={ccForm.count_date} onChange={e=>setCcForm({...ccForm,count_date:e.target.value})} className="input-field"/></FormField>
          <FormField label="Notes"><textarea value={ccForm.notes} onChange={e=>setCcForm({...ccForm,notes:e.target.value})} className="input-field" rows={2}/></FormField>
          <p className="text-xs text-gray-500">Stock items at this location will be auto-populated for counting.</p>
        </div>
      </Modal>

      {/* Cycle Count Detail — Enter Counts */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showCCDetail} onClose={() => setShowCCDetail(null)} title={showCCDetail ? `Cycle Count — ${showCCDetail.count_number}` : ''} size="xl"
        footer={<>{showCCDetail?.status === 'planned' && <button onClick={handleSubmitCount} disabled={saving} className="btn-primary">{saving?'Saving...':'Submit Count'}</button>}
          {showCCDetail?.status === 'counted' && <button onClick={() => handleApproveCC(showCCDetail.id)} className="btn-primary flex items-center gap-2"><CheckCircle className="w-4 h-4"/>Approve & Adjust Inventory</button>}
          <button onClick={() => setShowCCDetail(null)} className="btn-secondary">Close</button></>}>
        {showCCDetail && <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Location</p><p className="font-medium">{showCCDetail.sloc_code} — {showCCDetail.sloc_name}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Date</p><p>{formatDate(showCCDetail.count_date)}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Items</p><p className="font-medium">{showCCDetail.items?.length||0}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Status</p><p className="capitalize font-medium">{showCCDetail.status}</p></div>
          </div>
          <table className="w-full text-sm border rounded overflow-hidden">
            <thead><tr className="bg-gray-50 text-xs text-gray-500"><th className="px-3 py-2 text-left" style={{maxWidth:'200px'}}>Material</th><th className="px-3 py-2 text-right">System Qty</th><th className="px-3 py-2 text-right">Counted Qty</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-left">Reason</th></tr></thead>
            <tbody>{(showCCDetail.items||[]).map((item, idx) => {
              const variance = (parseFloat(item.counted_qty)||0) - parseFloat(item.system_qty||0);
              return <tr key={item.id} className="border-t">
                <td className="px-3 py-2"><span className="font-mono text-xs text-blue-600">{item.material_code}</span> {item.material_name}</td>
                <td className="px-3 py-2 text-right font-medium">{formatNumber(item.system_qty)} {item.uom_code}</td>
                <td className="px-3 py-2 text-right">{showCCDetail.status === 'planned' ?
                  <input type="number" step="0.001" value={item.counted_qty||''} onChange={e=>updateCCItem(idx,'counted_qty',e.target.value)} className="w-24 px-2 py-1 text-right border rounded text-sm"/> :
                  <span className="font-medium">{formatNumber(item.counted_qty)}</span>}</td>
                <td className="px-3 py-2 text-right">{item.counted_qty != null && <span className={`font-medium ${variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-600' : ''}`}>{variance > 0 ? '+' : ''}{variance.toFixed(3)}</span>}</td>
                <td className="px-3 py-2">{showCCDetail.status === 'planned' ?
                  <input value={item.variance_reason||''} onChange={e=>updateCCItem(idx,'variance_reason',e.target.value)} className="w-full px-2 py-1 border rounded text-xs" placeholder="Reason if variance"/> :
                  <span className="text-xs">{item.variance_reason||'—'}</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={(id) => confirmDelete?.bulk ? handleBulkDelete() : handleDeleteBin(id)} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.bulk ? `${selectedBins.length} selected bins` : confirmDelete?.bin_code} />
    </div>
  );
}
