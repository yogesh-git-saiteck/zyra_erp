import { useState, useEffect } from 'react';
import { INDIAN_STATES } from '../utils/formatters';
import { Plus, Edit2, ToggleLeft, ToggleRight, Trash2, Building2, Factory, Warehouse, ShoppingBag, Target, TrendingUp } from 'lucide-react';
import { DataTable, StatusBadge, Modal, FormField, Tabs, Alert , DownloadButton } from '../components/common/index';
import { BulkImportExport } from '../components/common/SharedFeatures';
import api from '../utils/api';

const TABS = [
  { key:'companies', label:'Companies' }, { key:'plants', label:'Plants' },
  { key:'storage', label:'Storage Locations' }, { key:'salesorg', label:'Sales Organizations' },
  { key:'costcenter', label:'Cost Centers' }, { key:'profitcenter', label:'Profit Centers' },
];
const BULK = { plants:'plants', storage:'storage_locations', costcenter:'cost_centers', profitcenter:'profit_centers' };
const EP = { companies:'/org/companies', plants:'/org/plants', storage:'/org/storage-locations',
  salesorg:'/org/sales-organizations', costcenter:'/org/cost-centers', profitcenter:'/org/profit-centers' };

export default function OrganizationPage() {
  const [tab, setTab] = useState('companies');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [allPlants, setAllPlants] = useState([]);
  const [profitCenters, setProfitCenters] = useState([]);
  const [fCompany, setFCompany] = useState('');
  const [fPlant, setFPlant] = useState('');

  useEffect(() => { loadLookups(); }, []);
  useEffect(() => { loadData(); }, [tab, showInactive, fCompany, fPlant]);

  const loadLookups = async () => {
    try {
      const [c, p, pc] = await Promise.all([api.get('/org/companies').catch(()=>null), api.get('/org/plants').catch(()=>null), api.get('/org/profit-centers').catch(()=>null)]);
      setCompanies(c?.data||[]); setAllPlants(p?.data||[]); setProfitCenters(pc?.data||[]);
    } catch {}
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const p = { show_inactive: showInactive || undefined };
      if (fCompany) p.company_id = fCompany;
      if (fPlant && tab !== 'companies' && tab !== 'plants') p.plant_id = fPlant;
      setData((await api.get(EP[tab], p).catch(()=>null))?.data || []);
    } catch {} finally { setLoading(false); }
  };

  const s = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const openCreate = () => { setEditId(null); setForm({}); setModalError(null); setShowForm(true); };
  const openEdit = (row) => {
    setEditId(row.id); setModalError(null);
    // For storage locations, set _company_id from the plant's company
    const f = { ...row };
    if (tab === 'storage') {
      const plant = allPlants.find(p => p.id === row.plant_id);
      f._company_id = plant?.company_id || '';
    }
    setForm(f); setShowForm(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault(); setSaving(true); setModalError(null);
    try {
      const payload = { ...form };
      delete payload._company_id; // internal field, don't send
      if (editId) await api.put(`${EP[tab]}/${editId}`, payload);
      else await api.post(EP[tab], payload);
      setShowForm(false); loadData(); loadLookups();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleToggle = async (row) => {
    try { await api.put(`${EP[tab]}/${row.id}/toggle`); loadData(); }
    catch (err) { setModalError(err.message); }
  };

  const handleDelete = async (row) => {
    const code = row.company_code||row.plant_code||row.sloc_code||row.sales_org_code||row.cc_code||row.pc_code;
    if (!confirm(`Delete ${code}?`)) return;
    try { await api.delete(`${EP[tab]}/${row.id}`); loadData(); loadLookups(); }
    catch (err) { setModalError(err.message); }
  };

  // Cascading: plants filtered by selected company in form
  const formPlants = form.company_id ? allPlants.filter(p => p.company_id === form.company_id) : allPlants;
  // For storage: uses _company_id
  const formPlantsForSloc = form._company_id ? allPlants.filter(p => p.company_id === form._company_id) : allPlants;
  // For list filter
  const filterPlants = fCompany ? allPlants.filter(p => p.company_id === fCompany) : allPlants;

  const tabLabel = TABS.find(t => t.key === tab)?.label || '';
  const singularLabel = tabLabel.slice(0,-1).replace(/ie$/, 'y');

  // Action columns
  const actCols = [
    { key:'_e', label:'', render:(_,r)=><button onClick={()=>openEdit(r)} className="p-1 hover:bg-gray-100 rounded"><Edit2 className="w-3.5 h-3.5 text-gray-500"/></button> },
    { key:'_t', label:'', render:(_,r)=><button onClick={()=>handleToggle(r)} className="p-1 hover:bg-gray-100 rounded">{r.is_active?<ToggleRight className="w-3.5 h-3.5 text-green-500"/>:<ToggleLeft className="w-3.5 h-3.5 text-gray-400"/>}</button> },
    { key:'_d', label:'', render:(_,r)=><button onClick={()=>handleDelete(r)} className="p-1 hover:bg-gray-100 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button> },
  ];
  const stCol = { key:'is_active', label:'Status', render:v=><StatusBadge status={v?'Active':'Inactive'}/> };
  const codeCol = (k,l) => ({ key:k, label:l, render:v=><span className="font-mono text-blue-600 font-medium">{v}</span> });
  const compCol = { key:'company_code', label:'Company', render:(v,r)=><span className="text-sm">{v} — {r.company_name}</span> };
  const plantCol = { key:'plant_code', label:'Plant', render:(v,r)=>v?<span className="text-sm">{v} — {r.plant_name}</span>:<span className="text-gray-400 text-sm">All</span> };

  const getColumns = () => {
    switch(tab) {
      case 'companies': return [codeCol('company_code','Code'),{key:'company_name',label:'Company Name',className:'font-medium'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'country',label:'Country'},{key:'gstin',label:'GSTIN',render:v=>v?<span className="font-mono text-xs">{v}</span>:'—'},stCol,...actCols];
      case 'plants': return [codeCol('plant_code','Plant Code'),{key:'plant_name',label:'Plant Name',className:'font-medium'},compCol,{key:'city',label:'City'},{key:'state',label:'State'},stCol,...actCols];
      case 'storage': return [codeCol('sloc_code','SLoc'),{key:'sloc_name',label:'Name',className:'font-medium'},plantCol,compCol,{key:'sloc_type',label:'Type',render:v=><span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">{(v||'general').replace(/_/g,' ')}</span>},stCol,...actCols];
      case 'salesorg': return [codeCol('sales_org_code','Code'),{key:'sales_org_name',label:'Sales Org',className:'font-medium'},compCol,plantCol,{key:'currency',label:'Currency'},stCol,...actCols];
      case 'costcenter': return [codeCol('cc_code','Code'),{key:'cc_name',label:'Cost Center',className:'font-medium'},compCol,plantCol,{key:'category',label:'Category',render:v=><span className="capitalize">{v||'—'}</span>},{key:'profit_center_code',label:'Profit Center',render:(v,r)=>v?`${v} — ${r.profit_center_name}`:'—'},stCol,...actCols];
      case 'profitcenter': return [codeCol('pc_code','Code'),{key:'pc_name',label:'Profit Center',className:'font-medium'},compCol,plantCol,stCol,...actCols];
      default: return [];
    }
  };

  // Company+Plant dropdowns reusable
  const CompanyPlantDropdowns = ({ companyKey='company_id', plantKey='plant_id', plantRequired=false }) => (
    <div className="grid grid-cols-2 gap-4">
      <FormField label="Company *">
        <select value={form[companyKey]||''} onChange={e=>{s(companyKey,e.target.value);s(plantKey,'');}} className="select-field" required>
          <option value="">Select Company...</option>
          {companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}
        </select>
      </FormField>
      <FormField label={`Plant${plantRequired?' *':''}`}>
        <select value={form[plantKey]||''} onChange={e=>s(plantKey,e.target.value)} className="select-field" required={plantRequired}>
          <option value="">{plantRequired?'Select Plant...':'All Plants'}</option>
          {(companyKey==='_company_id'?formPlantsForSloc:formPlants).map(p=><option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}
        </select>
      </FormField>
    </div>
  );

  const renderForm = () => {
    switch(tab) {
      case 'companies': return (<>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Company Code *"><input value={form.company_code||''} onChange={e=>s('company_code',e.target.value)} className="input-field" required disabled={!!editId}/></FormField>
          <FormField label="Company Name *"><input value={form.company_name||''} onChange={e=>s('company_name',e.target.value)} className="input-field" required/></FormField>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <FormField label="GSTIN"><input value={form.gstin||''} onChange={e=>s('gstin',e.target.value)} className="input-field" placeholder="22AAAAA0000A1Z5" maxLength={15}/></FormField>
          <FormField label="PAN"><input value={form.pan||''} onChange={e=>s('pan',e.target.value)} className="input-field" placeholder="ABCDE1234F" maxLength={10}/></FormField>
        </div>
        <FormField label="Address" className="mt-3"><input value={form.address_line1||''} onChange={e=>s('address_line1',e.target.value)} className="input-field"/></FormField>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <FormField label="City"><input value={form.city||''} onChange={e=>s('city',e.target.value)} className="input-field"/></FormField>
          <FormField label="State"><select value={form.state||''} onChange={e=>s('state',e.target.value)} className="select-field"><option value="">Select state...</option>{INDIAN_STATES.map(st=><option key={st} value={st}>{st}</option>)}</select></FormField>
          <FormField label="Country (2-3 letters)"><input value={form.country||'IN'} onChange={e=>s('country',e.target.value)} className="input-field" maxLength={3}/></FormField>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <FormField label="Currency"><input value={form.currency||'INR'} onChange={e=>s('currency',e.target.value)} className="input-field"/></FormField>
          <FormField label="Phone"><input value={form.phone||''} onChange={e=>s('phone',e.target.value)} className="input-field"/></FormField>
          <FormField label="Email"><input value={form.email||''} onChange={e=>s('email',e.target.value)} className="input-field" type="email"/></FormField>
        </div>
      </>);

      case 'plants': return (<>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Plant Code *"><input value={form.plant_code||''} onChange={e=>s('plant_code',e.target.value)} className="input-field" required disabled={!!editId}/></FormField>
          <FormField label="Plant Name *"><input value={form.plant_name||''} onChange={e=>s('plant_name',e.target.value)} className="input-field" required/></FormField>
        </div>
        <FormField label="Company *" className="mt-3">
          <select value={form.company_id||''} onChange={e=>s('company_id',e.target.value)} className="select-field" required>
            <option value="">Select Company...</option>
            {companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}
          </select>
        </FormField>
        <FormField label="Address" className="mt-3"><input value={form.address_line1||''} onChange={e=>s('address_line1',e.target.value)} className="input-field"/></FormField>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <FormField label="City"><input value={form.city||''} onChange={e=>s('city',e.target.value)} className="input-field"/></FormField>
          <FormField label="State"><select value={form.state||''} onChange={e=>s('state',e.target.value)} className="select-field"><option value="">Select state...</option>{INDIAN_STATES.map(st=><option key={st} value={st}>{st}</option>)}</select></FormField>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <FormField label="Postal Code"><input value={form.postal_code||''} onChange={e=>s('postal_code',e.target.value)} className="input-field"/></FormField>
          <FormField label="Country"><input value={form.country||'IN'} onChange={e=>s('country',e.target.value)} className="input-field" maxLength={3}/></FormField>
          <FormField label="Phone"><input value={form.phone||''} onChange={e=>s('phone',e.target.value)} className="input-field"/></FormField>
        </div>
        <FormField label="Email" className="mt-3"><input value={form.email||''} onChange={e=>s('email',e.target.value)} className="input-field" type="email"/></FormField>
      </>);

      case 'storage': return (<>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="SLoc Code *"><input value={form.sloc_code||''} onChange={e=>s('sloc_code',e.target.value)} className="input-field" required disabled={!!editId}/></FormField>
          <FormField label="SLoc Name *"><input value={form.sloc_name||''} onChange={e=>s('sloc_name',e.target.value)} className="input-field" required/></FormField>
        </div>
        <CompanyPlantDropdowns companyKey="_company_id" plantKey="plant_id" plantRequired={true}/>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <FormField label="Type">
            <select value={form.sloc_type||'general'} onChange={e=>s('sloc_type',e.target.value)} className="select-field">
              {['general','raw_material','finished_goods','wip','quarantine','scrap','returns'].map(t=><option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
            </select>
          </FormField>
          <FormField label="Description"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field"/></FormField>
        </div>
      </>);

      case 'salesorg': return (<>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Sales Org Code *"><input value={form.sales_org_code||''} onChange={e=>s('sales_org_code',e.target.value)} className="input-field" required disabled={!!editId}/></FormField>
          <FormField label="Sales Org Name *"><input value={form.sales_org_name||''} onChange={e=>s('sales_org_name',e.target.value)} className="input-field" required/></FormField>
        </div>
        <CompanyPlantDropdowns plantRequired={true}/>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <FormField label="Currency"><input value={form.currency||'INR'} onChange={e=>s('currency',e.target.value)} className="input-field"/></FormField>
          <FormField label="Description"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field"/></FormField>
        </div>
      </>);

      case 'profitcenter': return (<>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="PC Code *"><input value={form.pc_code||''} onChange={e=>s('pc_code',e.target.value)} className="input-field" required disabled={!!editId}/></FormField>
          <FormField label="PC Name *"><input value={form.pc_name||''} onChange={e=>s('pc_name',e.target.value)} className="input-field" required/></FormField>
        </div>
        <CompanyPlantDropdowns/>
        <FormField label="Description" className="mt-3"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field"/></FormField>
      </>);

      case 'costcenter': return (<>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="CC Code *"><input value={form.cc_code||''} onChange={e=>s('cc_code',e.target.value)} className="input-field" required disabled={!!editId}/></FormField>
          <FormField label="CC Name *"><input value={form.cc_name||''} onChange={e=>s('cc_name',e.target.value)} className="input-field" required/></FormField>
        </div>
        <CompanyPlantDropdowns/>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <FormField label="Category">
            <select value={form.category||'operational'} onChange={e=>s('category',e.target.value)} className="select-field">
              {['operational','manufacturing','admin','sales','research','it','logistics'].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </FormField>
          <FormField label="Profit Center">
            <select value={form.profit_center_id||''} onChange={e=>s('profit_center_id',e.target.value)} className="select-field">
              <option value="">None</option>
              {profitCenters.filter(pc=>!form.company_id||pc.company_id===form.company_id).map(pc=><option key={pc.id} value={pc.id}>{pc.pc_code} — {pc.pc_name}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Description" className="mt-3"><input value={form.description||''} onChange={e=>s('description',e.target.value)} className="input-field"/></FormField>
      </>);
    }
  };

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={()=>setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Organization Structure</h1>
          <p className="text-sm text-gray-400 mt-1">Manage {tabLabel.toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} className="w-4 h-4 rounded"/> Show inactive
          </label>
          {BULK[tab] && <BulkImportExport entity={BULK[tab]} onImportComplete={()=>{loadData();loadLookups();}}/>}
          <><DownloadButton data={data} filename="OrganizationPage" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New {singularLabel}</button></>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={t=>{setTab(t);setFCompany('');setFPlant('');}}/>

      {/* Filters */}
      {tab !== 'companies' && (
        <div className="flex items-center gap-4 flex-wrap">
          <FormField label="Filter by Company">
            <select value={fCompany} onChange={e=>{setFCompany(e.target.value);setFPlant('');}} className="select-field text-sm w-52">
              <option value="">All Companies</option>
              {companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}
            </select>
          </FormField>
          {['storage','salesorg','costcenter','profitcenter'].includes(tab) && (
            <FormField label="Filter by Plant">
              <select value={fPlant} onChange={e=>setFPlant(e.target.value)} className="select-field text-sm w-52">
                <option value="">All Plants</option>
                {filterPlants.map(p=><option key={p.id} value={p.id}>{p.plant_code} — {p.plant_name}</option>)}
              </select>
            </FormField>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={getColumns()} data={data} loading={loading} emptyMessage={`No ${tabLabel.toLowerCase()} found`}/>
      </div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={()=>{setShowForm(false);setModalError(null);}}
        title={`${editId?'Edit':'Create'} ${singularLabel}`} size="xl"
        footer={<>
          <button onClick={()=>{setShowForm(false);setModalError(null);}} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving?'Saving...':editId?'Update':'Create'}</button>
        </>}>
        <form onSubmit={handleSave}>{renderForm()}</form>
      </Modal>
    </div>
  );
}
