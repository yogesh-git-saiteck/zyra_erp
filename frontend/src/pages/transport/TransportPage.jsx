import { useState, useEffect} from 'react';
import { Plus, Edit2, Truck, MapPin, Send, CheckCircle, Package ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert, PageLoader ,BulkActionBar, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../utils/formatters';

export default function TransportPage() {
  const [tab, setTab] = useState('shipments');
  const [selectedIds, setSelectedIds] = useState([]);
  const [overview, setOverview] = useState(null);
  const [shipments, setShipments] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateShipment, setShowCreateShipment] = useState(false);
  const [showCreateCarrier, setShowCreateCarrier] = useState(false);
  const [showCreateVehicle, setShowCreateVehicle] = useState(false);
  const [editCarrierId, setEditCarrierId] = useState(null);
  const [editVehicleId, setEditVehicleId] = useState(null);
  const [editShipmentId, setEditShipmentId] = useState(null);
  const [shipForm, setShipForm] = useState({ shipment_type: 'outbound', carrier_id: '', vehicle_id: '', origin_plant_id: '', customer_id: '', destination_address: '', destination_city: '', planned_date: '', weight_kg: '', freight_cost: '', tracking_number: '', notes: '' });
  const [carrierForm, setCarrierForm] = useState({ carrier_code: '', carrier_name: '', carrier_type: 'road', contact_name: '', phone: '', email: '' });
  const [vehicleForm, setVehicleForm] = useState({ carrier_id: '', vehicle_number: '', vehicle_type: 'truck', capacity_kg: '', fuel_type: '' });

  useEffect(() => { loadData(); }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ov, sh, ca, ve, cu, pl] = await Promise.all([
        api.get('/transport/overview').catch(()=>null), api.get('/transport/shipments', { status: statusFilter }).catch(()=>null),
        api.get('/transport/carriers').catch(()=>null), api.get('/transport/vehicles').catch(()=>null),
        api.get('/master/business-partners', { type: 'customer', all: true }).catch(()=>null), api.get('/master/plants').catch(()=>null),
      ]);
      setOverview(ov?.data); setShipments(sh?.data || []); setCarriers(ca?.data || []);
      setVehicles(ve?.data || []); setCustomers(cu?.data?.rows || cu?.data || []); setPlants(pl?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const openEditCarrier = (row) => { setEditCarrierId(row.id); setCarrierForm({ carrier_name:row.carrier_name, carrier_type:row.carrier_type, contact_person:row.contact_person||"", phone:row.phone||"", email:row.email||"", license_number:row.license_number||"" }); setShowCreateCarrier(true); };
  const openEditVehicle = (row) => { setEditVehicleId(row.id); setVehicleForm({ carrier_id:row.carrier_id||"", vehicle_number:row.vehicle_number, vehicle_type:row.vehicle_type||"truck", capacity_kg:row.capacity_kg||"", capacity_volume:row.capacity_volume||"", fuel_type:row.fuel_type||"" }); setShowCreateVehicle(true); };
  const openEditShipment = (row) => { setEditShipmentId(row.id); setShipForm({ carrier_id:row.carrier_id||"", vehicle_id:row.vehicle_id||"", destination_address:row.destination_address||"", destination_city:row.destination_city||"", planned_date:row.planned_date?.split("T")[0]||"", weight_kg:row.weight_kg||"", freight_cost:row.freight_cost||"", tracking_number:row.tracking_number||"", notes:row.notes||"" }); setShowCreateShipment(true); };
  const handleCreateShipment = async () => {
    setSaving(true);
    try { if (editShipmentId) { await api.put(`/transport/shipments/${editShipmentId}`, shipForm); } else { await api.post('/transport/shipments', shipForm); } setShowCreateShipment(false); setEditShipmentId(null); setAlert({ type: 'success', message: 'Shipment created' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleCreateCarrier = async () => {
    setSaving(true);
    try { if (editCarrierId) { await api.put(`/transport/carriers/${editCarrierId}`, carrierForm); } else { await api.post('/transport/carriers', carrierForm); } setShowCreateCarrier(false); setEditCarrierId(null); setAlert({ type: 'success', message: 'Carrier created' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleCreateVehicle = async () => {
    setSaving(true);
    try { if (editVehicleId) { await api.put(`/transport/vehicles/${editVehicleId}`, vehicleForm); } else { await api.post('/transport/vehicles', vehicleForm); } setShowCreateVehicle(false); setEditVehicleId(null); setAlert({ type: 'success', message: 'Vehicle added' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const handleDispatch = async (id) => { try { await api.post(`/transport/shipments/${id}/dispatch`); setAlert({ type: 'success', message: 'Dispatched' }); loadData(); } catch (err) { setModalError(err.message); } };
  const handleDeliver = async (id) => { try { await api.post(`/transport/shipments/${id}/deliver`); setAlert({ type: 'success', message: 'Delivered' }); loadData(); } catch (err) { setModalError(err.message); } };

  const shipCols = [
    { key: 'doc_number', label: 'Shipment #', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'shipment_type', label: 'Type', render: v => <span className={`badge ${v === 'inbound' ? 'badge-info' : 'badge-success'} capitalize`}>{v}</span> },
    { key: 'carrier_name', label: 'Carrier', render: v => v || '—' },
    { key: 'vehicle_number', label: 'Vehicle', render: v => v || '—' },
    { key: 'customer_name', label: 'Customer', render: v => v || '—' },
    { key: 'destination_city', label: 'Destination', render: v => v || '—' },
    { key: 'planned_date', label: 'Planned', render: v => formatDate(v) },
    { key: 'tracking_number', label: 'Tracking', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'freight_cost', label: 'Cost', className: 'text-right', render: v => v ? formatCurrency(v) : '—' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (v, row) => (
      <div className="flex gap-1">
        {row.status === 'planned' && <button onClick={e => { e.stopPropagation(); openEditShipment(row); }} title="Edit" className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-500" /></button>}
        {row.status === 'planned' && <button onClick={e => { e.stopPropagation(); handleDispatch(v); }} title="Dispatch" className="p-1 hover:bg-blue-50 dark:hover:bg-blue-950 rounded"><Send className="w-3.5 h-3.5 text-blue-500" /></button>}
        {row.status === 'in_transit' && <button onClick={e => { e.stopPropagation(); handleDeliver(v); }} title="Mark Delivered" className="p-1 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /></button>}
      </div>
    )},
  ];

  const carrierCols = [
    { key: 'carrier_code', label: 'Code', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'carrier_name', label: 'Name', render: v => <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span> },
    { key: 'carrier_type', label: 'Type', render: v => <span className="capitalize">{v}</span> },
    { key: 'contact_name', label: 'Contact', render: v => v || '—' },
    { key: 'phone', label: 'Phone', render: v => v || '—' },
    { key: 'vehicle_count', label: 'Vehicles', className: 'text-right', render: v => formatNumber(v) },
    { key: 'shipment_count', label: 'Shipments', className: 'text-right', render: v => formatNumber(v) },
    { key: 'id', label: '', render: (v, row) => <button onClick={() => openEditCarrier(row)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Edit2 className="w-4 h-4"/></button> },
  ];

  const vehicleCols = [
    { key: 'vehicle_number', label: 'Number', render: v => <span className="font-mono text-blue-600 dark:text-blue-400 font-medium text-xs">{v}</span> },
    { key: 'carrier_name', label: 'Carrier', render: v => v || '—' },
    { key: 'vehicle_type', label: 'Type', render: v => <span className="capitalize">{v}</span> },
    { key: 'capacity_kg', label: 'Capacity (kg)', className: 'text-right', render: v => v ? formatNumber(v) : '—' },
    { key: 'current_status', label: 'Status', render: v => <span className={`badge ${v === 'available' ? 'badge-success' : v === 'in_transit' ? 'badge-warning' : 'badge-neutral'} capitalize`}>{v}</span> },
    { key: 'id', label: '', render: (v, row) => <button onClick={() => openEditVehicle(row)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Edit2 className="w-4 h-4"/></button> },
  ];
  const handleBulkDelete = async () => {
    try { const r = await api.post('/transport/bulk-delete', { entity: 'shipments', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadData(); }
    catch (e) { setModalError(e.message); }
  };


  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Transport Management</h1><p className="text-sm text-gray-400 mt-1">Carriers, vehicles, and shipment tracking</p></div>
        <div className="flex gap-2">
          {tab === 'shipments' && <><DownloadButton data={shipments} filename="TransportPage" /><button onClick={() => setShowCreateShipment(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Shipment</button></>}
          {tab === 'carriers' && <button onClick={() => { setCarrierForm({ carrier_code: '', carrier_name: '', carrier_type: 'road', contact_name: '', phone: '', email: '' }); setShowCreateCarrier(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Carrier</button>}
          {tab === 'vehicles' && <button onClick={() => { setVehicleForm({ carrier_id: '', vehicle_number: '', vehicle_type: 'truck', capacity_kg: '', fuel_type: '' }); setShowCreateVehicle(true); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Vehicle</button>}
        </div>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Carriers', value: overview.carriers?.active, icon: Truck, color: 'from-blue-500 to-blue-600' },
            { label: 'Vehicles Available', value: overview.vehicles?.available, icon: Truck, color: 'from-emerald-500 to-emerald-600' },
            { label: 'In Transit', value: overview.shipments?.in_transit, icon: MapPin, color: 'from-amber-500 to-amber-600' },
            { label: 'Total Freight Cost', value: formatCurrency(overview.shipments?.total_cost || 0), icon: Package, color: 'from-violet-500 to-violet-600' },
          ].map((c, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}><c.icon className="w-5 h-5 text-white" /></div>
              <div><p className="text-lg font-display font-bold text-gray-900 dark:text-gray-100">{c.value || 0}</p><p className="text-xs text-gray-400">{c.label}</p></div>
            </div>
          ))}
        </div>
      )}

      <Tabs tabs={[
        { key: 'shipments', label: 'Shipments', count: shipments.length },
        { key: 'carriers', label: 'Carriers', count: carriers.length },
        { key: 'vehicles', label: 'Vehicles', count: vehicles.length },
      ]} active={tab} onChange={setTab} />

      {tab === 'shipments' && (
        <>
          <Tabs tabs={[{ key: '', label: 'All' }, { key: 'planned', label: 'Planned' }, { key: 'in_transit', label: 'In Transit' }, { key: 'delivered', label: 'Delivered' }]} active={statusFilter} onChange={setStatusFilter} />
          <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={shipCols} data={shipments} loading={loading} /></div>
        </>
      )}
      {tab === 'carriers' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={carrierCols} data={carriers} loading={loading} /></div>}
      {tab === 'vehicles' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable columns={vehicleCols} data={vehicles} loading={loading} /></div>}

      {/* Create Shipment */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateShipment} onClose={() => setShowCreateShipment(false)} title={editShipmentId ? "Edit Shipment" : "Create Shipment"} size="xl"
        footer={<><button onClick={() => setShowCreateShipment(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateShipment} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type"><select value={shipForm.shipment_type} onChange={e => setShipForm({...shipForm, shipment_type: e.target.value})} className="select-field"><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></FormField>
            <FormField label="Carrier"><select value={shipForm.carrier_id} onChange={e => setShipForm({...shipForm, carrier_id: e.target.value})} className="select-field"><option value="">Select...</option>{carriers.map(c => <option key={c.id} value={c.id}>{c.carrier_code} - {c.carrier_name}</option>)}</select></FormField>
            <FormField label="Vehicle"><select value={shipForm.vehicle_id} onChange={e => setShipForm({...shipForm, vehicle_id: e.target.value})} className="select-field"><option value="">Select...</option>{vehicles.filter(v => !shipForm.carrier_id || v.carrier_id === shipForm.carrier_id).map(v => <option key={v.id} value={v.id}>{v.vehicle_number} ({v.vehicle_type})</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Origin Plant"><select value={shipForm.origin_plant_id} onChange={e => setShipForm({...shipForm, origin_plant_id: e.target.value})} className="select-field"><option value="">Select...</option>{plants.map(p => <option key={p.id} value={p.id}>{p.plant_code} - {p.plant_name}</option>)}</select></FormField>
            <FormField label="Customer"><select value={shipForm.customer_id} onChange={e => setShipForm({...shipForm, customer_id: e.target.value})} className="select-field"><option value="">Select...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Destination Address"><input value={shipForm.destination_address} onChange={e => setShipForm({...shipForm, destination_address: e.target.value})} className="input-field" /></FormField>
            <FormField label="Destination City"><input value={shipForm.destination_city} onChange={e => setShipForm({...shipForm, destination_city: e.target.value})} className="input-field" /></FormField>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Planned Date"><input type="date" value={shipForm.planned_date} onChange={e => setShipForm({...shipForm, planned_date: e.target.value})} className="input-field" /></FormField>
            <FormField label="Weight (kg)"><input type="number" value={shipForm.weight_kg} onChange={e => setShipForm({...shipForm, weight_kg: e.target.value})} className="input-field" /></FormField>
            <FormField label="Freight Cost"><input type="number" step="0.01" value={shipForm.freight_cost} onChange={e => setShipForm({...shipForm, freight_cost: e.target.value})} className="input-field" /></FormField>
            <FormField label="Tracking #"><input value={shipForm.tracking_number} onChange={e => setShipForm({...shipForm, tracking_number: e.target.value})} className="input-field" /></FormField>
          </div>
        </div>
      </Modal>

      {/* Create Carrier */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateCarrier} onClose={() => setShowCreateCarrier(false)} title={editCarrierId ? "Edit Carrier" : "New Carrier"} size="xl"
        footer={<><button onClick={() => setShowCreateCarrier(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateCarrier} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Code" required><input value={carrierForm.carrier_code} onChange={e => setCarrierForm({...carrierForm, carrier_code: e.target.value})} className="input-field font-mono" /></FormField>
            <FormField label="Name" required><input value={carrierForm.carrier_name} onChange={e => setCarrierForm({...carrierForm, carrier_name: e.target.value})} className="input-field" /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type"><select value={carrierForm.carrier_type} onChange={e => setCarrierForm({...carrierForm, carrier_type: e.target.value})} className="select-field"><option value="road">Road</option><option value="rail">Rail</option><option value="air">Air</option><option value="sea">Sea</option><option value="courier">Courier</option></select></FormField>
            <FormField label="Contact"><input value={carrierForm.contact_name} onChange={e => setCarrierForm({...carrierForm, contact_name: e.target.value})} className="input-field" /></FormField>
            <FormField label="Phone"><input value={carrierForm.phone} onChange={e => setCarrierForm({...carrierForm, phone: e.target.value})} className="input-field" /></FormField>
          </div>
        </div>
      </Modal>

      {/* Create Vehicle */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateVehicle} onClose={() => setShowCreateVehicle(false)} title={editVehicleId ? "Edit Vehicle" : "New Vehicle"} size="xl"
        footer={<><button onClick={() => setShowCreateVehicle(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateVehicle} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Add'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Vehicle Number" required><input value={vehicleForm.vehicle_number} onChange={e => setVehicleForm({...vehicleForm, vehicle_number: e.target.value})} className="input-field font-mono" /></FormField>
            <FormField label="Carrier"><select value={vehicleForm.carrier_id} onChange={e => setVehicleForm({...vehicleForm, carrier_id: e.target.value})} className="select-field"><option value="">Select...</option>{carriers.map(c => <option key={c.id} value={c.id}>{c.carrier_name}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type"><select value={vehicleForm.vehicle_type} onChange={e => setVehicleForm({...vehicleForm, vehicle_type: e.target.value})} className="select-field"><option value="truck">Truck</option><option value="van">Van</option><option value="trailer">Trailer</option><option value="container">Container</option></select></FormField>
            <FormField label="Capacity (kg)"><input type="number" value={vehicleForm.capacity_kg} onChange={e => setVehicleForm({...vehicleForm, capacity_kg: e.target.value})} className="input-field" /></FormField>
            <FormField label="Fuel Type"><select value={vehicleForm.fuel_type} onChange={e => setVehicleForm({...vehicleForm, fuel_type: e.target.value})} className="select-field"><option value="">-</option><option value="diesel">Diesel</option><option value="petrol">Petrol</option><option value="electric">Electric</option><option value="cng">CNG</option></select></FormField>
          </div>
        </div>
      </Modal>
    </div>
  );
}
