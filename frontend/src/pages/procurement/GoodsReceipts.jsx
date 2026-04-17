import { useState, useEffect} from 'react';
import { Plus, Package, MapPin, CheckCircle, Eye, Truck } from 'lucide-react';
import { DataTable, SearchInput, Modal, FormField, Alert, StatusBadge ,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate } from '../../utils/formatters';

export default function GoodsReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);

  // Create GR states
  const [showCreate, setShowCreate] = useState(false);
  const [pos, setPOs] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [slocs, setSlocs] = useState([]);
  const [grItems, setGrItems] = useState([]);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => { loadReceipts(); }, [search]);

  const loadReceipts = async () => {
    try { const res = await api.get('/procurement/goods-receipts', { search }); setReceipts(res?.data || []); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const loadPOs = async () => {
    try {
      const res = await api.get('/procurement/orders/eligible-for-gr');
      setPOs(res?.data || []);
    } catch (err) { console.error('Failed to load POs:', err); }
  };

  const selectPO = async (poId) => {
    if (!poId) { setSelectedPO(null); setPendingItems([]); setSlocs([]); setGrItems([]); return; }
    try {
      const res = await api.get(`/procurement/orders/${poId}/pending-items`);
      const data = res?.data;
      const poData = data?.po;
      const itemsData = data?.items || [];
      // Detect service: from doc_type OR if all items have no material_id
      const isServicePO = poData?.doc_type === 'service' || (itemsData.length > 0 && itemsData.every(it => !it.material_id));
      if (isServicePO && !poData.doc_type) poData.doc_type = 'service';
      setSelectedPO(poData);
      setPendingItems(itemsData);
      setSlocs(data?.storage_locations || []);
      setGrItems(itemsData.map(item => ({
        po_item_id: item.id,
        material_id: item.material_id,
        material_code: item.material_code,
        material_name: item.material_name || item.description,
        description: item.description || item.material_name,
        uom_id: item.uom_id || item.base_uom_id,
        uom_code: item.uom_code,
        unit_price: parseFloat(item.unit_price || 0),
        hsn_code: item.hsn_code || '',
        gst_rate: parseFloat(item.gst_rate || 0),
        ordered_qty: parseFloat(item.quantity),
        received_qty: parseFloat(item.received_qty || 0),
        pending_qty: parseFloat(item.pending_qty),
        quantity: parseFloat(item.pending_qty),
        sloc_id: '',
        batch_number: '',
        is_batch_managed: item.is_batch_managed || false,
        gl_account_id: item.gl_account_id || '',
      })));
    } catch (err) { setModalError(err.message); }
  };

  const updateGrItem = (idx, field, val) => {
    const updated = [...grItems];
    if (field === 'quantity') {
      const qty = parseFloat(val) || 0;
      const maxQty = updated[idx].pending_qty || 0;
      updated[idx] = { ...updated[idx], quantity: Math.min(Math.max(0, qty), maxQty) };
    } else {
      updated[idx] = { ...updated[idx], [field]: val };
    }
    setGrItems(updated);
  };

  const handleCreateGR = async () => {
    if (!selectedPO) { setAlert({ type: 'error', message: 'Select a Purchase Order' }); return; }
    const validItems = grItems.filter(i => i.quantity > 0);
    if (!validItems.length) { setAlert({ type: 'error', message: 'At least one item with quantity > 0 required' }); return; }
    const isService = (selectedPO?.doc_type || 'goods') === 'service';
    if (!isService) {
      const missingSloc = validItems.find(i => !i.sloc_id);
      if (missingSloc) { setAlert({ type: 'error', message: `Storage location required for ${missingSloc.material_name}` }); return; }
    }
    const missingBatch = validItems.find(i => i.is_batch_managed && !i.batch_number);
    if (missingBatch) { setAlert({ type: 'error', message: `Batch number is mandatory for batch-managed material: ${missingBatch.material_name}` }); return; }

    setSaving(true);
    try {
      await api.post('/procurement/goods-receipts', {
        po_id: selectedPO.id,
        items: validItems.map(i => ({
          po_item_id: i.po_item_id,
          material_id: i.material_id,
          material_name: i.material_name,
          description: i.description || i.material_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          hsn_code: i.hsn_code,
          gst_rate: i.gst_rate,
          uom_id: i.uom_id,
          sloc_id: i.sloc_id,
          batch_number: i.batch_number,
        }))
      });
      setShowCreate(false); setSelectedPO(null); setGrItems([]);
      setAlert({ type: 'success', message: 'Goods receipt created — inventory updated!' });
      loadReceipts();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const loadDetail = async (id) => {
    try { const res = await api.get(`/procurement/goods-receipts/${id}`); setShowDetail(res?.data); }
    catch (err) { setModalError(err.message); }
  };

  const openCreate = () => { loadPOs(); setSelectedPO(null); setGrItems([]); setShowCreate(true); };

  const columns = [
    { key: 'doc_number', label: 'GR #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'doc_type', label: 'Type', render: v => <span className={`px-2 py-0.5 rounded text-xs font-medium ${v==='service'?'bg-violet-100 text-violet-700':'bg-blue-100 text-blue-700'}`}>{(v||'goods').charAt(0).toUpperCase()+(v||'goods').slice(1)}</span> },
    { key: 'po_number', label: 'PO #', render: v => <span className="font-mono text-gray-600">{v || '—'}</span> },
    { key: 'vendor_name', label: 'Vendor', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'plant_code', label: 'Plant', render: (v, row) => <span className="text-sm">{v} - {row.plant_name}</span> },
    { key: 'item_count', label: 'Items', className: 'text-center', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{v || 0}</span> },
    { key: 'total_qty', label: 'Total Qty', className: 'text-right', render: v => <span className="font-medium">{parseFloat(v||0).toFixed(0)}</span> },
    { key: 'receipt_date', label: 'Date', render: v => formatDate(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: v => <button onClick={() => loadDetail(v)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Eye className="w-4 h-4"/></button> },
  ];
  const handleBulkDelete = async () => {
    try { const r = await api.post('/procurement/bulk-delete', { entity: 'goods-receipts', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadReceipts(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Goods Receipts</h1>
          <p className="text-sm text-gray-400 mt-1">Receive goods from POs — updates inventory automatically</p>
        </div>
        <><DownloadButton data={receipts} filename="GoodsReceipts" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Goods Receipt</button></>
      </div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64" />
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={receipts} loading={loading} emptyMessage="No goods receipts. Create one from a confirmed Purchase Order." />
      </div>

      {/* CREATE GR MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => { setShowCreate(false); setModalError(null); }} title="Create Goods Receipt" size="xl"
        footer={<>
          <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreateGR} disabled={saving || !selectedPO || !grItems.some(i => i.quantity > 0)}
            className="btn-primary flex items-center gap-2">
            {saving ? 'Processing...' : <><CheckCircle className="w-4 h-4" /> Receive Goods</>}
          </button>
        </>}>
        <div className="space-y-5">
          {/* Step 1: Select PO */}
          <FormField label="Purchase Order" required>
            <select onChange={e => selectPO(e.target.value)} className="select-field" value={selectedPO?.id || ''}>
              <option value="">Select a confirmed PO...</option>
              {pos.map(po => (
                <option key={po.id} value={po.id}>
                  {po.doc_number} — {po.vendor_name || 'Unknown vendor'} — {po.item_count} item(s) — Received: {parseFloat(po.total_received||0).toFixed(0)}/{parseFloat(po.total_ordered||0).toFixed(0)}
                </option>
              ))}
            </select>
          </FormField>

          {selectedPO && (
            <>
              <div className="flex gap-4 text-sm">
                <div className="p-2 bg-blue-50 rounded flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800 font-medium">{selectedPO.doc_number}</span>
                </div>
                <div className="p-2 bg-gray-50 rounded text-gray-600">Vendor: <strong>{selectedPO.vendor_name || 'N/A'}</strong></div>
              </div>

              {/* Step 2: Items with Storage Location */}
              <div>
                {(() => { const isGRService = (selectedPO?.doc_type || 'goods') === 'service'; return (<>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" /> {isGRService ? 'Services to Receive' : 'Items to Receive'}
                </h3>
                <p className="text-xs text-gray-500 mb-3">{isGRService ? 'Set the quantity received for each service item.' : 'Set the quantity to receive and select a storage location for each item.'}</p>

                {grItems.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">All items have been fully received.</p>
                ) : (
                  <div className="space-y-3">
                    <div className={`grid ${isGRService ? 'grid-cols-8' : 'grid-cols-12'} gap-2 text-xs font-semibold text-gray-500 px-3`}>
                      <div className={isGRService ? 'col-span-3' : 'col-span-3'}>{isGRService ? 'Service' : 'Material'}</div>
                      <div className="col-span-1 text-right">Ordered</div>
                      <div className="col-span-1 text-right">Received</div>
                      <div className="col-span-1 text-right">Pending</div>
                      <div className="col-span-1">Receive Qty</div>
                      {!isGRService && <div className="col-span-3">Storage Location *</div>}
                      {!isGRService && <div className="col-span-2">Batch #</div>}
                      {isGRService && <div className="col-span-1"></div>}
                    </div>

                    {grItems.map((item, idx) => (
                      <div key={idx} className={`grid ${isGRService ? 'grid-cols-8' : 'grid-cols-12'} gap-2 items-center p-3 bg-gray-50 rounded-lg border`}>
                        <div className={isGRService ? 'col-span-3' : 'col-span-3'}>
                          {item.material_code && <span className="font-mono text-xs text-blue-600">{item.material_code}</span>}
                          <p className="text-sm font-medium text-gray-900 truncate">{item.description || item.material_name}</p>
                        </div>
                        <div className="col-span-1 text-right text-sm text-gray-600">{item.ordered_qty}</div>
                        <div className="col-span-1 text-right text-sm text-gray-400">{item.received_qty}</div>
                        <div className="col-span-1 text-right text-sm font-medium text-orange-600">{item.pending_qty}</div>
                        <div className="col-span-1">
                          <input type="number" value={item.quantity} min="0" max={item.pending_qty} step="1"
                            onChange={e => updateGrItem(idx, 'quantity', e.target.value)}
                            className="input-field text-sm text-center" />
                        </div>
                        {!isGRService && <div className="col-span-3">
                          <select value={item.sloc_id} onChange={e => updateGrItem(idx, 'sloc_id', e.target.value)}
                            className={`select-field text-sm ${!item.sloc_id ? 'border-red-300' : ''}`} required>
                            <option value="">Select location...</option>
                            {slocs.map(sl => (
                              <option key={sl.id} value={sl.id}>{sl.sloc_code} - {sl.sloc_name}</option>
                            ))}
                          </select>
                        </div>}
                        {!isGRService && <div className="col-span-2">
                          <input value={item.batch_number} onChange={e => updateGrItem(idx, 'batch_number', e.target.value)}
                            className={`input-field text-sm ${item.is_batch_managed && !item.batch_number ? 'border-red-300' : ''}`}
                            placeholder={item.is_batch_managed ? 'Required *' : 'Optional'}
                            required={item.is_batch_managed} />
                        </div>}
                      </div>
                    ))}
                  </div>
                )}
                </>); })()}
              </div>

              {/* Summary */}
              {grItems.some(i => i.quantity > 0) && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    <strong>Summary:</strong> Receiving {grItems.filter(i => i.quantity > 0).length} item(s),
                    total {grItems.reduce((s, i) => s + (i.quantity || 0), 0)} units.
                    Inventory will be updated automatically.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showDetail} onClose={() => setShowDetail(null)}
        title={showDetail ? `${(showDetail.doc_type||'goods')==='service' ? 'Service Receipt' : 'Goods Receipt'} ${showDetail.doc_number}` : ''} size="xl">
        {showDetail && (
          <div className="space-y-4">
            {(() => { const isDetailService = (showDetail.doc_type||'goods') === 'service'; return (<>
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-gray-50 rounded"><p className="text-xs text-gray-500">Type</p><p className="capitalize font-medium">{showDetail.doc_type||'goods'}</p></div>
              <div className="p-3 bg-gray-50 rounded"><p className="text-xs text-gray-500">PO</p><p className="font-mono font-medium">{showDetail.po_number}</p></div>
              <div className="p-3 bg-gray-50 rounded"><p className="text-xs text-gray-500">Vendor</p><p className="font-medium">{showDetail.vendor_name}</p></div>
              <div className="p-3 bg-gray-50 rounded"><p className="text-xs text-gray-500">Plant</p><p className="font-medium">{showDetail.plant_code} - {showDetail.plant_name}</p></div>
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mt-3">{isDetailService ? 'Received Services' : 'Received Items'}</h3>
            {showDetail.items?.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 border-b">
                  <th className="text-left py-2">{isDetailService ? 'Service' : 'Material'}</th>
                  {!isDetailService && <th className="text-left">Storage Location</th>}
                  <th className="text-right">Qty</th>
                  {!isDetailService && <th className="text-left">Batch</th>}
                </tr></thead>
                <tbody>{showDetail.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2">{item.material_code ? <span className="font-mono text-xs text-blue-600">{item.material_code}</span> : null} {item.material_name || item.po_item_description || '—'}</td>
                    {!isDetailService && <td><span className="text-gray-600">{item.sloc_code ? `${item.sloc_code} - ${item.sloc_name}` : '—'}</span></td>}
                    <td className="text-right font-medium text-green-700">{parseFloat(item.quantity).toFixed(0)}</td>
                    {!isDetailService && <td className="text-gray-500">{item.batch_number || '—'}</td>}
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="text-gray-400 text-sm">No items recorded</p>}
            </>); })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
