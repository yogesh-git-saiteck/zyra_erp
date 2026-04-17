import { useState, useEffect } from 'react';
import { Lock, Unlock, Mail, Hash, Shield, FileText, Building2, Send, Eye, Download, Bell, BellOff } from 'lucide-react';
import { DataTable, Modal, FormField, Alert, Tabs , DownloadButton } from '../../components/common/index';
import api from '../../utils/api';
import { formatDate, formatCurrency } from '../../utils/formatters';

export default function GoLiveSettings() {
  const [tab, setTab] = useState('fiscal');
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Fiscal periods
  const [periods, setPeriods] = useState([]);
  // Email config
  const [emailConfig, setEmailConfig] = useState({ smtp_host:'', smtp_port:587, smtp_user:'', smtp_password:'', smtp_secure:true, from_name:'', from_email:'' });
  const [emailLog, setEmailLog] = useState([]);
  // Number ranges
  const [numberRanges, setNumberRanges] = useState([]);
  const [editRange, setEditRange] = useState(null);
  // GST Returns
  const [gstMonth, setGstMonth] = useState(new Date().getMonth()+1);
  const [gstYear, setGstYear] = useState(new Date().getFullYear());
  const [gstr1, setGstr1] = useState(null);
  const [gstr3b, setGstr3b] = useState(null);
  // Validation rules
  const [valRules, setValRules] = useState([]);
  // Company config
  const [company, setCompany] = useState({});
  // Notification settings
  const [notifSettings, setNotifSettings] = useState([]);
  const [togglingKey, setTogglingKey] = useState(null);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'fiscal') setPeriods((await api.get('/system/fiscal-periods'))?.data || []);
      else if (tab === 'email') { setEmailConfig((await api.get('/system/email-config'))?.data || emailConfig); setEmailLog((await api.get('/system/email-log'))?.data || []); }
      else if (tab === 'numbering') setNumberRanges((await api.get('/system/number-ranges'))?.data || []);
      else if (tab === 'gst') {}
      else if (tab === 'validation') setValRules((await api.get('/system/validation-rules'))?.data || []);
      else if (tab === 'company') setCompany((await api.get('/system/current-company'))?.data || {});
      else if (tab === 'notifications') setNotifSettings((await api.get('/system/notification-settings'))?.data || []);
    } catch {} finally { setLoading(false); }
  };

  const closePeriod = async (id) => { try { await api.post(`/system/fiscal-periods/${id}/close`); setAlert({ type:'success', message:'Period closed' }); loadData(); } catch (e) { setModalError(e.message); } };
  const reopenPeriod = async (id) => { try { await api.post(`/system/fiscal-periods/${id}/reopen`); setAlert({ type:'success', message:'Period reopened' }); loadData(); } catch (e) { setModalError(e.message); } };

  const saveEmailConfig = async () => {
    setSaving(true);
    try { await api.post('/system/email-config', emailConfig); setAlert({ type:'success', message:'SMTP config saved' }); }
    catch (e) { setModalError(e.message); } finally { setSaving(false); }
  };

  const testEmail = async () => {
    try { await api.post('/system/send-email', { to_email: emailConfig.from_email || emailConfig.smtp_user, subject: 'Zyra Test Email', body: '<h2>Test email from Zyra</h2><p>If you received this, SMTP is configured correctly.</p>' }); setAlert({ type:'success', message:'Test email sent!' }); loadData(); }
    catch (e) { setModalError(e.message); }
  };

  const saveNumberRange = async () => {
    if (!editRange) return;
    try { await api.put(`/system/number-ranges/${editRange.id}`, editRange); setEditRange(null); setAlert({ type:'success', message:'Updated' }); loadData(); }
    catch (e) { setModalError(e.message); }
  };

  const loadGST = async (type) => {
    try {
      if (type === 'gstr1') setGstr1((await api.get('/system/gst/gstr1', { month: gstMonth, year: gstYear }))?.data);
      else setGstr3b((await api.get('/system/gst/gstr3b', { month: gstMonth, year: gstYear }))?.data);
    } catch (e) { setModalError(e.message); }
  };

  const fc = formatCurrency;

  const toggleNotif = async (key) => {
    setTogglingKey(key);
    try {
      await api.post(`/system/notification-settings/${key}/toggle`);
      setNotifSettings(prev => prev.map(s => s.event_key === key ? { ...s, is_enabled: !s.is_enabled } : s));
    } catch (e) { setAlert({ type: 'error', message: e.message }); }
    finally { setTogglingKey(null); }
  };

  const tabs = [
    { key:'fiscal', label:'Fiscal Periods' }, { key:'email', label:'Email / SMTP' },
    { key:'notifications', label:'Notifications' },
    { key:'numbering', label:'Doc Numbering' }, { key:'gst', label:'GST Returns' },
    { key:'validation', label:'Validation Rules' }, { key:'company', label:'Company Setup' },
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)}/>}
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Go-Live Settings</h1><p className="text-sm text-gray-400 mt-1">Fiscal periods, email, numbering, GST, validation</p></div>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab}/>

      {/* FISCAL PERIODS */}
      {tab === 'fiscal' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[
          { key:'period_name', label:'Period', render: v => <span className="font-medium">{v}</span> },
          { key:'period_year', label:'Year' },
          { key:'start_date', label:'From', render: v => formatDate(v) },
          { key:'end_date', label:'To', render: v => formatDate(v) },
          { key:'status', label:'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v==='closed'?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`}>{v}</span> },
          { key:'closed_by_name', label:'Closed By', render: v => v || '—' },
          { key:'id', label:'Action', render: (v, row) => row.status === 'open'
            ? <button onClick={() => closePeriod(v)} className="text-xs text-red-600 hover:underline flex items-center gap-1"><Lock className="w-3 h-3"/> Close</button>
            : <button onClick={() => reopenPeriod(v)} className="text-xs text-green-600 hover:underline flex items-center gap-1"><Unlock className="w-3 h-3"/> Reopen</button>
          },
        ]} data={periods} loading={loading}/>
        <div className="p-3 bg-yellow-50 text-xs text-yellow-700">Closing a period prevents any new postings (journal entries, invoices, payments) with dates in that period.</div>
      </div>}

      {/* EMAIL / SMTP */}
      {tab === 'email' && <div className="space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Mail className="w-4 h-4"/> SMTP Configuration</h3>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="SMTP Host"><input value={emailConfig.smtp_host||''} onChange={e=>setEmailConfig({...emailConfig,smtp_host:e.target.value})} className="input-field" placeholder="smtp.gmail.com"/></FormField>
            <FormField label="Port"><input type="number" value={emailConfig.smtp_port||587} onChange={e=>setEmailConfig({...emailConfig,smtp_port:parseInt(e.target.value)})} className="input-field"/></FormField>
            <FormField label="Secure (TLS)"><select value={emailConfig.smtp_secure?'true':'false'} onChange={e=>setEmailConfig({...emailConfig,smtp_secure:e.target.value==='true'})} className="select-field"><option value="true">Yes (TLS)</option><option value="false">No</option></select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Username / Email"><input value={emailConfig.smtp_user||''} onChange={e=>setEmailConfig({...emailConfig,smtp_user:e.target.value})} className="input-field"/></FormField>
            <FormField label="Password">
              <input type="password" value={emailConfig.smtp_password||''} onChange={e=>setEmailConfig({...emailConfig,smtp_password:e.target.value})} className="input-field" placeholder={emailConfig.id ? '••••••••  (leave blank to keep existing)' : 'Enter password'}/>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From Name"><input value={emailConfig.from_name||''} onChange={e=>setEmailConfig({...emailConfig,from_name:e.target.value})} className="input-field" placeholder="Zyra"/></FormField>
            <FormField label="From Email"><input value={emailConfig.from_email||''} onChange={e=>setEmailConfig({...emailConfig,from_email:e.target.value})} className="input-field" placeholder="erp@company.com"/></FormField>
          </div>
          <div className="flex gap-2">
            <button onClick={saveEmailConfig} disabled={saving} className="btn-primary">{saving?'Saving...':'Save Config'}</button>
            <button onClick={testEmail} className="btn-secondary flex items-center gap-1"><Send className="w-3.5 h-3.5"/>Send Test Email</button>
          </div>
        </div>
        {emailLog.length > 0 && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <h3 className="px-4 py-2 text-sm font-semibold text-gray-700">Recent Emails</h3>
          <DataTable columns={[
            { key:'to_email', label:'To' }, { key:'subject', label:'Subject' },
            { key:'status', label:'Status', render: v => <span className={v==='sent'?'text-green-600':'text-red-600'}>{v}</span> },
            { key:'sent_at', label:'Sent', render: v => v ? formatDate(v) : '—' },
            { key:'error_message', label:'Error', render: v => v ? <span className="text-xs text-red-500 truncate max-w-[200px] block">{v}</span> : '—' },
          ]} data={emailLog}/>
        </div>}
      </div>}

      {/* NOTIFICATIONS */}
      {tab === 'notifications' && <div className="space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-blue-600"/>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Email Notification Settings</h3>
          </div>
          <p className="text-xs text-gray-400 mb-5">Control which events trigger automatic emails. Requires SMTP to be configured.</p>

          {(() => {
            const categories = [...new Set(notifSettings.map(s => s.category))];
            const categoryLabels = { approvals: 'Approval Workflow', procurement: 'Procurement', finance: 'Finance', general: 'General' };
            return categories.map(cat => (
              <div key={cat} className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 pb-1 border-b border-gray-100 dark:border-gray-800">
                  {categoryLabels[cat] || cat}
                </h4>
                <div className="space-y-2">
                  {notifSettings.filter(s => s.category === cat).map(setting => (
                    <div key={setting.event_key}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-1.5 rounded-md ${setting.is_enabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                          {setting.is_enabled ? <Bell className="w-3.5 h-3.5"/> : <BellOff className="w-3.5 h-3.5"/>}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{setting.event_label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{setting.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleNotif(setting.event_key)}
                        disabled={togglingKey === setting.event_key}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ml-4
                          ${setting.is_enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}
                          ${togglingKey === setting.event_key ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                          ${setting.is_enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}

          {notifSettings.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-400 text-sm">No notification settings found. Restart the server to initialize defaults.</div>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 p-4">
          <div className="flex items-start gap-3">
            <Mail className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0"/>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">How email notifications work</p>
              <ul className="space-y-1 text-xs text-blue-600 dark:text-blue-400 list-disc list-inside">
                <li>Emails are sent immediately when the triggering event occurs</li>
                <li>Recipients are the approver(s) or the document requester depending on the event</li>
                <li>All sent emails are logged in the Email / SMTP tab under Recent Emails</li>
                <li>Make sure SMTP is configured and tested before enabling notifications</li>
              </ul>
            </div>
          </div>
        </div>
      </div>}

      {/* DOC NUMBERING */}
      {tab === 'numbering' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[
          { key:'object_type', label:'Type', render: v => <span className="font-mono font-medium text-blue-600">{v}</span> },
          { key:'prefix', label:'Prefix', render: v => <span className="font-mono">{v}</span> },
          { key:'current_number', label:'Current #', className:'text-right', render: v => <span className="font-mono">{v}</span> },
          { key:'include_fy', label:'FY Prefix', render: v => v ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
          { key:'pad_length', label:'Padding', render: v => v || 5 },
          { key:'id', label:'', render: (v,row) => <button onClick={() => setEditRange({...row})} className="text-xs text-blue-600 hover:underline">Edit</button> },
        ]} data={numberRanges} loading={loading}/>
        <div className="p-3 bg-blue-50 text-xs text-blue-700">Enable "FY Prefix" to get numbers like INV/2526/00001. Padding controls zero-fill length.</div>
      </div>}

      {/* GST RETURNS */}
      {tab === 'gst' && <div className="space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
          <div className="flex items-center gap-4 flex-wrap">
            <FormField label="Month"><select value={gstMonth} onChange={e=>setGstMonth(parseInt(e.target.value))} className="select-field w-32">{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{new Date(2026,i).toLocaleString('default',{month:'long'})}</option>)}</select></FormField>
            <FormField label="Year"><input type="number" value={gstYear} onChange={e=>setGstYear(parseInt(e.target.value))} className="input-field w-24"/></FormField>
            <div className="flex gap-2 mt-5">
              <><DownloadButton data={periods} filename="GoLiveSettings" /><button onClick={() => loadGST('gstr1')} className="btn-primary text-sm">Generate GSTR-1</button></>
              <button onClick={() => loadGST('gstr3b')} className="btn-secondary text-sm">Generate GSTR-3B</button>
            </div>
          </div>
        </div>

        {gstr1 && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">GSTR-1 — Outward Supplies ({gstr1.period})</h3>
          <div className="grid grid-cols-5 gap-3 text-center text-sm">
            <div className="p-2 bg-blue-50 rounded"><p className="text-xs text-blue-600">Invoices</p><p className="font-bold text-blue-700">{gstr1.summary?.invoices}</p></div>
            <div className="p-2 bg-gray-50 rounded"><p className="text-xs text-gray-500">Taxable</p><p className="font-bold">{fc(gstr1.summary?.taxable)}</p></div>
            <div className="p-2 bg-green-50 rounded"><p className="text-xs text-green-600">CGST</p><p className="font-bold text-green-700">{fc(gstr1.summary?.cgst)}</p></div>
            <div className="p-2 bg-green-50 rounded"><p className="text-xs text-green-600">SGST</p><p className="font-bold text-green-700">{fc(gstr1.summary?.sgst)}</p></div>
            <div className="p-2 bg-violet-50 rounded"><p className="text-xs text-violet-600">IGST</p><p className="font-bold text-violet-700">{fc(gstr1.summary?.igst)}</p></div>
          </div>
          {gstr1.b2b?.length > 0 && <><h4 className="text-xs font-semibold text-gray-500 mt-2">B2B Invoices (with GSTIN)</h4>
            <DataTable columns={[
              { key:'doc_number', label:'Invoice #', render: v => <span className="font-mono text-xs">{v}</span> },
              { key:'invoice_date', label:'Date', render: v => formatDate(v) },
              { key:'customer_name', label:'Customer' },
              { key:'customer_gstin', label:'GSTIN', render: v => <span className="font-mono text-xs">{v}</span> },
              { key:'subtotal', label:'Taxable', className:'text-right', render: v => fc(v) },
              { key:'total_amount', label:'Total', className:'text-right', render: v => <span className="font-semibold">{fc(v)}</span> },
            ]} data={gstr1.b2b}/></>}
        </div>}

        {gstr3b && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">GSTR-3B — Summary Return ({gstr3b.period})</h3>
          <div className="space-y-3">
            {[
              { label:'3.1 Outward Supplies (Sales)', data: gstr3b.section_3_1, color:'blue' },
              { label:'4. Input Tax Credit (Purchases)', data: gstr3b.section_4, color:'green' },
              { label:'6. Net Tax Payable', data: gstr3b.section_6, color:'red' },
            ].map((s,i) => (
              <div key={i} className="border rounded-lg p-3">
                <h4 className="text-xs font-semibold text-gray-600 mb-2">{s.label}</h4>
                <div className="grid grid-cols-4 gap-3 text-sm text-right">
                  <div><span className="text-xs text-gray-500">Taxable:</span> <span className="font-medium">{fc(s.data?.taxable||0)}</span></div>
                  <div><span className="text-xs text-gray-500">CGST:</span> <span className={`font-medium text-${s.color}-700`}>{fc(s.data?.cgst||0)}</span></div>
                  <div><span className="text-xs text-gray-500">SGST:</span> <span className={`font-medium text-${s.color}-700`}>{fc(s.data?.sgst||0)}</span></div>
                  <div><span className="text-xs text-gray-500">IGST:</span> <span className={`font-medium text-${s.color}-700`}>{fc(s.data?.igst||0)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>}

      {/* VALIDATION RULES */}
      {tab === 'validation' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[
          { key:'entity_type', label:'Entity', render: v => <span className="capitalize font-medium">{v?.replace(/_/g,' ')}</span> },
          { key:'field_name', label:'Field', render: v => <span className="font-mono text-xs">{v}</span> },
          { key:'rule_type', label:'Rule', render: v => <span className={`px-2 py-0.5 rounded text-xs ${v==='regex'?'bg-blue-100 text-blue-700':v==='unique'?'bg-purple-100 text-purple-700':'bg-gray-100'}`}>{v}</span> },
          { key:'error_message', label:'Error Message', render: v => <span className="text-sm">{v}</span> },
          { key:'is_active', label:'Active', render: v => v ? <span className="text-green-600 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span> },
        ]} data={valRules} loading={loading}/>
        <div className="p-3 bg-blue-50 text-xs text-blue-700">Validation rules are checked when creating/updating records. Regex rules validate format; unique rules check for duplicates.</div>
      </div>}

      {/* COMPANY SETUP */}
      {tab === 'company' && <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Building2 className="w-4 h-4"/>Company Letterhead & Config</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Company Name"><input value={company.company_name||''} className="input-field bg-gray-50" disabled/></FormField>
          <FormField label="GSTIN"><input value={company.gstin||''} onChange={e=>setCompany({...company,gstin:e.target.value})} className="input-field" placeholder="22AAAAA0000A1Z5"/></FormField>
          <FormField label="PAN"><input value={company.pan||''} onChange={e=>setCompany({...company,pan:e.target.value})} className="input-field" placeholder="ABCDE1234F"/></FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="CIN"><input value={company.cin||''} onChange={e=>setCompany({...company,cin:e.target.value})} className="input-field"/></FormField>
          <FormField label="Fiscal Year Start (Month)"><select value={company.fiscal_year_start||4} onChange={e=>setCompany({...company,fiscal_year_start:parseInt(e.target.value)})} className="select-field"><option value="1">January</option><option value="4">April (India)</option><option value="7">July</option><option value="10">October</option></select></FormField>
          <FormField label="Logo URL"><input value={company.logo_url||''} onChange={e=>setCompany({...company,logo_url:e.target.value})} className="input-field" placeholder="https://..."/></FormField>
        </div>
        <FormField label="Bank Details (printed on invoices)"><textarea value={company.bank_details||''} onChange={e=>setCompany({...company,bank_details:e.target.value})} className="input-field" rows={2} placeholder="Bank Name, A/C No, IFSC, Branch"/></FormField>
        <FormField label="Terms & Conditions (printed on invoices)"><textarea value={company.terms_and_conditions||''} onChange={e=>setCompany({...company,terms_and_conditions:e.target.value})} className="input-field" rows={3}/></FormField>
        <FormField label="Digital Signature URL"><input value={company.digital_signature_url||''} onChange={e=>setCompany({...company,digital_signature_url:e.target.value})} className="input-field" placeholder="https://... (image URL)"/></FormField>
        <button onClick={async () => {
          try { await api.put(`/org/companies/${company.id}`, company); setAlert({ type:'success', message:'Company config saved' }); }
          catch (e) { setModalError(e.message); }
        }} className="btn-primary">Save Company Config</button>
      </div>}

      {/* Edit Number Range Modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!editRange} onClose={() => setEditRange(null)} title={`Edit Number Range — ${editRange?.object_type}`} size="xl"
        footer={<><button onClick={() => setEditRange(null)} className="btn-secondary">Cancel</button><button onClick={saveNumberRange} className="btn-primary">Save</button></>}>
        {editRange && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Prefix"><input value={editRange.prefix||''} onChange={e=>setEditRange({...editRange,prefix:e.target.value})} className="input-field font-mono" placeholder="INV-"/></FormField>
            <FormField label="Zero-Padding Length"><input type="number" min="3" max="10" value={editRange.pad_length||5} onChange={e=>setEditRange({...editRange,pad_length:parseInt(e.target.value)})} className="input-field"/></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Include FY Prefix"><select value={editRange.include_fy?'true':'false'} onChange={e=>setEditRange({...editRange,include_fy:e.target.value==='true'})} className="select-field"><option value="false">No</option><option value="true">Yes (e.g. INV/2526/00001)</option></select></FormField>
            <FormField label="Reset Yearly"><select value={editRange.reset_yearly?'true':'false'} onChange={e=>setEditRange({...editRange,reset_yearly:e.target.value==='true'})} className="select-field"><option value="false">No — continuous</option><option value="true">Yes — restart at 1 each FY</option></select></FormField>
          </div>
          <div className="p-3 bg-gray-50 rounded text-xs text-gray-600">
            <p className="font-medium mb-1">Preview:</p>
            <p className="font-mono text-sm">{editRange.include_fy ? `${editRange.prefix}2526/${String(editRange.current_number+1).padStart(editRange.pad_length||5,'0')}` : `${editRange.prefix}${String(editRange.current_number+1).padStart(editRange.pad_length||5,'0')}`}</p>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
