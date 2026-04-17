import { useState, useEffect} from 'react';
import { Plus, Building2, User, Truck, Edit2 ,Trash2} from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert ,DeleteConfirm,BulkActionBar, DownloadButton } from '../components/common/index';
import api from '../utils/api';
import { formatCurrency, INDIAN_STATES } from '../utils/formatters';
import { ExportButton, BulkImportExport } from '../components/common/SharedFeatures';

const COUNTRIES = [
  {code:'IN',name:'India'},{code:'US',name:'United States'},{code:'GB',name:'United Kingdom'},{code:'AE',name:'UAE'},
  {code:'SG',name:'Singapore'},{code:'DE',name:'Germany'},{code:'FR',name:'France'},{code:'JP',name:'Japan'},
  {code:'CN',name:'China'},{code:'AU',name:'Australia'},{code:'CA',name:'Canada'},{code:'SA',name:'Saudi Arabia'},
  {code:'MY',name:'Malaysia'},{code:'BD',name:'Bangladesh'},{code:'LK',name:'Sri Lanka'},{code:'NP',name:'Nepal'},
  {code:'KR',name:'South Korea'},{code:'IT',name:'Italy'},{code:'BR',name:'Brazil'},{code:'ZA',name:'South Africa'},
  {code:'NL',name:'Netherlands'},{code:'CH',name:'Switzerland'},{code:'TH',name:'Thailand'},{code:'ID',name:'Indonesia'},
  {code:'HK',name:'Hong Kong'},{code:'QA',name:'Qatar'},{code:'KW',name:'Kuwait'},{code:'OM',name:'Oman'},
  {code:'BH',name:'Bahrain'},{code:'PH',name:'Philippines'},{code:'VN',name:'Vietnam'},{code:'MX',name:'Mexico'}
].sort((a,b) => a.name.localeCompare(b.name));

const CURRENCIES = ['INR','USD','EUR','GBP','AED','SGD','JPY','CNY','AUD','CAD','SAR','MYR','BDT','LKR','NPR','KRW','CHF','THB','IDR','HKD','QAR','KWD','OMR','BHD','PHP','VND','MXN','BRL','ZAR','NZD'];

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export default function BusinessPartnersPage() {
  const [partners, setPartners] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bpType, setBpType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [companies, setCompanies] = useState([]);

  const emptyForm = {
    company_id:'', bp_type:'customer', display_name:'', company_name:'', email:'', phone:'',
    address_line1:'', city:'', state:'', postal_code:'', country:'IN', currency:'INR',
    credit_limit:'', payment_term_id:'', credit_days:'30', tax_id:'',
    gstin:'', pan:'', tds_category:'',
    bank_name:'', bank_account_number:'', bank_ifsc:'',
    billing_address:'', shipping_address:'', contact_person:''
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { loadPartners(); loadLookups(); }, [bpType, search]);
  const loadPartners = async () => {
    try { setPartners((await api.get('/master/business-partners', { type: bpType, search, all: true }).catch(()=>null))?.data?.rows || []); }
    catch {} finally { setLoading(false); }
  };
  const loadLookups = async () => {
    try {
      const [pt, c] = await Promise.all([api.get('/master/payment-terms').catch(()=>null), api.get('/org/companies').catch(()=>null)]);
      setPaymentTerms(pt?.data||[]); setCompanies(c?.data||[]);
    } catch {}
  };

  const s = (k,v) => setForm(p => ({...p, [k]:v}));
  const isIndia = form.country === 'IN';

  const getStatesForCountry = () => {
    if (form.country === 'IN') return INDIAN_STATES;
    if (form.country === 'US') return US_STATES.map(s => s);
    return [];
  };
  const statesAvailable = getStatesForCountry();

  const openCreate = () => { setEditId(null); setForm(emptyForm); setModalError(null); setShowForm(true); };
  const openEdit = (row) => {
    setEditId(row.id);
    setForm({ company_id: row.company_id||'', bp_type: row.bp_type, display_name: row.display_name, company_name: row.company_name||'',
      email: row.email||'', phone: row.phone||'', address_line1: row.address_line1||'', city: row.city||'',
      state: row.state||'', postal_code: row.postal_code||'', country: row.country||'IN', currency: row.currency||'INR',
      credit_limit: row.credit_limit||'', payment_term_id: row.payment_term_id||'', credit_days: row.credit_days||'30',
      tax_id: row.tax_id||'', gstin: row.gstin||'', pan: row.pan||'', tds_category: row.tds_category||'',
      bank_name: row.bank_name||'', bank_account_number: row.bank_account_number||'', bank_ifsc: row.bank_ifsc||'',
      billing_address: row.billing_address||'', shipping_address: row.shipping_address||'', contact_person: row.contact_person||''
    });
    setModalError(null); setShowForm(true);
  };

  const handleSave = async (e) => {
    e?.preventDefault(); setSaving(true); setModalError(null);
    try {
      // Mandatory validations
      if (!form.company_id) throw new Error('Company is mandatory');
      if (!form.display_name) throw new Error('Display name is mandatory');
      if (!form.company_name) throw new Error('Company name is mandatory');
      if (!form.email) throw new Error('Email is mandatory');
      if (!form.phone) throw new Error('Phone is mandatory');
      if (!form.address_line1) throw new Error('Address is mandatory');
      if (!form.city) throw new Error('City is mandatory');
      if (!form.state) throw new Error('State is mandatory');
      if (!form.postal_code) throw new Error('Postal code is mandatory');
      if (!form.country) throw new Error('Country is mandatory');
      if (!form.currency) throw new Error('Currency is mandatory');
      if (!form.payment_term_id) throw new Error('Payment terms is mandatory');
      if (!form.credit_days) throw new Error('Credit days is mandatory');
      if (!form.bank_name) throw new Error('Bank name is mandatory');
      if (!form.bank_account_number) throw new Error('Bank account number is mandatory');
      if (!form.bank_ifsc) throw new Error('IFSC/Swift code is mandatory');
      if (!form.billing_address) throw new Error('Billing address is mandatory');
      if (!form.shipping_address) throw new Error('Shipping address is mandatory');
      if (!form.contact_person) throw new Error('Contact person is mandatory');

      // India-specific validations
      if (isIndia) {
        if (!form.gstin) throw new Error('GSTIN is mandatory for Indian business partners');
        if (!GSTIN_REGEX.test(form.gstin)) throw new Error('Invalid GSTIN format. Expected: 22AAAAA0000A1Z5 (15 characters)');
        if (!form.pan) throw new Error('PAN is mandatory for Indian business partners');
        if (!PAN_REGEX.test(form.pan)) throw new Error('Invalid PAN format. Expected: ABCDE1234F (10 characters)');
      }

      // Number validations
      if (form.credit_limit && parseFloat(form.credit_limit) < 0) throw new Error('Credit limit cannot be negative');
      if (form.credit_days && parseInt(form.credit_days) < 0) throw new Error('Credit days cannot be negative');

      if (editId) { await api.put(`/master/business-partners/${editId}`, form); setAlert({type:'success',message:'Business partner updated'}); }
      else { await api.post('/master/business-partners', form); setAlert({type:'success',message:'Business partner created'}); }
      setShowForm(false); setForm(emptyForm); setEditId(null); loadPartners();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const columns = [
    { key:'bp_number', label:'BP #', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key:'display_name', label:'Name', render:(_,r) => <div className="flex items-center gap-2">
      {r.bp_type==='customer'?<User className="w-4 h-4 text-blue-500"/>:r.bp_type==='vendor'?<Truck className="w-4 h-4 text-violet-500"/>:<Building2 className="w-4 h-4 text-gray-400"/>}
      <span className="font-medium">{r.display_name}</span></div> },
    { key:'bp_type', label:'Type', render: v => <StatusBadge status={v}/> },
    { key:'city', label:'City/State', render:(_,r) => r.city ? `${r.city}, ${r.state||r.country}` : '—' },
    { key:'email', label:'Email', render: v => <span className="text-gray-500 text-xs">{v||'—'}</span> },
    { key:'phone', label:'Phone', render: v => v||'—' },
    { key:'gstin', label:'GSTIN', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key:'credit_limit', label:'Credit Limit', className:'text-right', render: v => v ? formatCurrency(v) : '—' },
    { key:'id', label:'', render:(_,r) => <button onClick={()=>openEdit(r)} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Edit2 className="w-4 h-4"/></button> },
      { key: '_del', label: '', render: (v, row) => <button onClick={() => setConfirmDelete(row)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button> },
  ];
  const handleDelete = async (id) => {
    try { await api.delete(`/master/business-partners/${id}`); setAlert({ type: 'success', message: 'Deleted successfully' }); setConfirmDelete(null); loadPartners(); }
    catch (e) { setAlert({ type: 'error', message: e.message }); setConfirmDelete(null); }
  };
  const handleBulkDelete = async () => {
    try { const r = await api.post('/master/bulk-delete', { entity: 'business-partners', ids: selectedIds }); setAlert({ type: 'success', message: `${r?.data?.deleted || selectedIds.length} deleted` }); setSelectedIds([]); loadPartners(); }
    catch (e) { setModalError(e.message); }
  };



  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={()=>setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Business Partners</h1><p className="text-sm text-gray-400 mt-1">Customers, vendors & partners — company based</p></div>
        <div className="flex items-center gap-2"><BulkImportExport entity="business_partners" onImportComplete={loadPartners}/><ExportButton entity="business_partners"/><><DownloadButton data={partners} filename="BusinessPartnersPage" /><button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/> New Partner</button></></div>
      </div>
      <div className="flex items-center gap-4"><Tabs tabs={[{key:'',label:'All'},{key:'customer',label:'Customers'},{key:'vendor',label:'Vendors'}]} active={bpType} onChange={setBpType}/><SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-64"/></div>
      <BulkActionBar count={selectedIds.length} onDelete={handleBulkDelete} onClear={() => setSelectedIds([])} />
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm"><DataTable selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds}
            columns={columns} data={partners} loading={loading}/></div>

      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showForm} onClose={()=>{setShowForm(false);setEditId(null);}} title={editId?'Edit Business Partner':'Create Business Partner'} size="xl"
        footer={<><button onClick={()=>setShowForm(false)} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?'Saving...':editId?'Update':'Create'}</button></>}>
        <form onSubmit={handleSave} className="space-y-4">
          {/* COMPANY & TYPE */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Company *"><select value={form.company_id} onChange={e=>s('company_id',e.target.value)} className="select-field" required><option value="">Select company...</option>{companies.map(c=><option key={c.id} value={c.id}>{c.company_code} — {c.company_name}</option>)}</select></FormField>
            {!editId && <FormField label="Type *"><select value={form.bp_type} onChange={e=>s('bp_type',e.target.value)} className="select-field"><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="both">Both</option></select></FormField>}
            {editId && <FormField label="Type"><input value={form.bp_type} className="input-field bg-gray-100" disabled/></FormField>}
          </div>

          {/* BASIC INFO */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Display Name *"><input value={form.display_name} onChange={e=>s('display_name',e.target.value)} className="input-field" required/></FormField>
            <FormField label="Company Name *"><input value={form.company_name} onChange={e=>s('company_name',e.target.value)} className="input-field" required/></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Email *"><input type="email" value={form.email} onChange={e=>s('email',e.target.value)} className="input-field" required/></FormField>
            <FormField label="Phone *"><input value={form.phone} onChange={e=>s('phone',e.target.value)} className="input-field" required/></FormField>
            <FormField label="Contact Person *"><input value={form.contact_person} onChange={e=>s('contact_person',e.target.value)} className="input-field" required/></FormField>
          </div>

          {/* ADDRESS */}
          <FormField label="Address *"><input value={form.address_line1} onChange={e=>s('address_line1',e.target.value)} className="input-field" required/></FormField>
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Country *"><select value={form.country} onChange={e=>{s('country',e.target.value); setForm(p=>({...p,country:e.target.value,state:'',currency:e.target.value==='IN'?'INR':p.currency}));}} className="select-field" required><option value="">Select...</option>{COUNTRIES.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></FormField>
            <FormField label="State *">{statesAvailable.length ? <select value={form.state} onChange={e=>s('state',e.target.value)} className="select-field" required><option value="">Select...</option>{statesAvailable.map(st=><option key={st} value={st}>{st}</option>)}</select> : <input value={form.state} onChange={e=>s('state',e.target.value)} className="input-field" required/>}</FormField>
            <FormField label="City *"><input value={form.city} onChange={e=>s('city',e.target.value)} className="input-field" required/></FormField>
            <FormField label="Postal Code *"><input value={form.postal_code} onChange={e=>s('postal_code',e.target.value)} className="input-field" required/></FormField>
          </div>

          {/* FINANCIAL */}
          <div className="grid grid-cols-4 gap-4">
            <FormField label="Currency *"><select value={form.currency} onChange={e=>s('currency',e.target.value)} className="select-field" required><option value="">Select...</option>{CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}</select></FormField>
            <FormField label="Payment Terms *"><select value={form.payment_term_id} onChange={e=>s('payment_term_id',e.target.value)} className="select-field" required><option value="">Select...</option>{paymentTerms.map(pt=><option key={pt.id} value={pt.id}>{pt.term_code} — {pt.term_name}</option>)}</select></FormField>
            <FormField label="Credit Days *"><input type="number" min="0" value={form.credit_days} onChange={e=>s('credit_days',e.target.value)} className="input-field" required/></FormField>
            <FormField label="Credit Limit"><input type="number" step="0.01" min="0" value={form.credit_limit} onChange={e=>s('credit_limit',e.target.value)} className="input-field" placeholder="Optional"/></FormField>
          </div>

          {/* STATUTORY */}
          <div className="border-t pt-3"><p className="text-xs font-semibold text-gray-500 mb-2">STATUTORY & COMPLIANCE {isIndia && <span className="text-red-500">(India — GSTIN & PAN mandatory)</span>}</p></div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label={`GSTIN ${isIndia?'*':''}`}><input value={form.gstin||''} onChange={e=>s('gstin',e.target.value.toUpperCase())} className={`input-field ${isIndia && form.gstin && !GSTIN_REGEX.test(form.gstin) ? 'border-red-300' : ''}`} placeholder="22AAAAA0000A1Z5" maxLength={15} required={isIndia}/>{form.gstin && !GSTIN_REGEX.test(form.gstin) && isIndia && <p className="text-xs text-red-500 mt-1">Invalid format</p>}</FormField>
            <FormField label={`PAN ${isIndia?'*':''}`}><input value={form.pan||''} onChange={e=>s('pan',e.target.value.toUpperCase())} className={`input-field ${isIndia && form.pan && !PAN_REGEX.test(form.pan) ? 'border-red-300' : ''}`} placeholder="ABCDE1234F" maxLength={10} required={isIndia}/>{form.pan && !PAN_REGEX.test(form.pan) && isIndia && <p className="text-xs text-red-500 mt-1">Invalid format</p>}</FormField>
            <FormField label="TDS Category"><select value={form.tds_category||''} onChange={e=>s('tds_category',e.target.value)} className="select-field"><option value="">None</option><option value="194C">194C — Contractor</option><option value="194J">194J — Professional</option><option value="194H">194H — Commission</option><option value="194I">194I — Rent</option></select></FormField>
          </div>

          {/* BANK */}
          <div className="border-t pt-3"><p className="text-xs font-semibold text-gray-500 mb-2">BANK DETAILS</p></div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Bank Name *"><input value={form.bank_name||''} onChange={e=>s('bank_name',e.target.value)} className="input-field" required/></FormField>
            <FormField label="Account Number *"><input value={form.bank_account_number||''} onChange={e=>s('bank_account_number',e.target.value)} className="input-field" required/></FormField>
            <FormField label="IFSC / Swift Code *"><input value={form.bank_ifsc||''} onChange={e=>s('bank_ifsc',e.target.value.toUpperCase())} className="input-field" placeholder="SBIN0001234" required/></FormField>
          </div>

          {/* ADDRESSES */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Billing Address *"><textarea value={form.billing_address||''} onChange={e=>s('billing_address',e.target.value)} className="input-field" rows={2} required/></FormField>
            <FormField label="Shipping Address *"><textarea value={form.shipping_address||''} onChange={e=>s('shipping_address',e.target.value)} className="input-field" rows={2} required/></FormField>
          </div>
        </form>
      </Modal>
    
      <DeleteConfirm item={confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} label={confirmDelete?.display_name} />
    </div>
  );
}
