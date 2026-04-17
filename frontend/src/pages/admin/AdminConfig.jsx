import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { DataTable, Modal, FormField, Tabs, Alert, DownloadButton } from '../../components/common/index';
import api from '../../utils/api';

// Generic CRUD section used by all 4 master data tabs
function MasterDataSection({ title, columns, data, loading, form, setForm, emptyForm, onSave, onDelete, onDeleteAll, onEdit, editItem, setEditItem, saving, modalError, setModalError, children }) {
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
        {onDeleteAll && (
          <>
            {confirmDeleteAll ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-700 font-medium">Delete all {data.length} records?</span>
                <button onClick={() => { onDeleteAll(); setConfirmDeleteAll(false); }} className="text-xs bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-700">Yes, Delete All</button>
                <button onClick={() => setConfirmDeleteAll(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteAll(true)} className="btn-secondary flex items-center gap-1.5 text-sm text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> Delete All
              </button>
            )}
          </>
        )}
        <button onClick={() => { setForm(emptyForm); setModalError(null); setShowCreate(true); }} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Add {title}
        </button>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <DataTable columns={[...columns, {
          key: 'id', label: '', render: (v, row) => (
            <div className="flex gap-1">
              <button onClick={() => { onEdit(row); setModalError(null); }} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"><Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500" /></button>
              <button onClick={() => onDelete(v)} className="p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"><Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-rose-500" /></button>
            </div>
          )
        }]} data={data} loading={loading} emptyMessage={`No ${title.toLowerCase()}s found. Click "Add ${title}" to create one.`} />
      </div>

      {/* Create Modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreate} onClose={() => setShowCreate(false)} title={`Add ${title}`} size="md"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button><button onClick={async () => { await onSave(form); setShowCreate(false); }} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Create'}</button></>}>
        {children(form, setForm, false)}
      </Modal>

      {/* Edit Modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!editItem} onClose={() => setEditItem(null)} title={`Edit ${title}`} size="md"
        footer={<><button onClick={() => setEditItem(null)} className="btn-secondary">Cancel</button><button onClick={async () => { await onSave(form, editItem?.id); setEditItem(null); }} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button></>}>
        {children(form, setForm, true)}
      </Modal>
    </div>
  );
}

export default function AdminConfig() {
  const [tab, setTab] = useState('custom-fields');
  const [customFields, setCustomFields] = useState([]);
  const [numberRanges, setNumberRanges] = useState([]);
  const [sysConfig, setSysConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Custom Fields
  const [showCreateField, setShowCreateField] = useState(false);
  const [fieldForm, setFieldForm] = useState({ entity_type: '', field_name: '', field_label: '', field_type: 'text', is_required: false, default_value: '', sort_order: 0 });

  // Master data states
  const [incoterms, setIncoterms] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [taxCodes, setTaxCodes] = useState([]);

  const [incotermForm, setIncotermForm] = useState({ code: '', name: '', description: '' });
  const [ptForm, setPtForm] = useState({ term_code: '', term_name: '', days_net: 30, days_discount: '', discount_percent: '' });
  const [uomForm, setUomForm] = useState({ uom_code: '', uom_name: '', uom_type: '', decimal_places: 0 });
  const [taxForm, setTaxForm] = useState({ tax_code: '', tax_name: '', description: '', tax_rate: '', tax_type: 'input' });

  const [editIncoterm, setEditIncoterm] = useState(null);
  const [editPt, setEditPt] = useState(null);
  const [editUom, setEditUom] = useState(null);
  const [editTax, setEditTax] = useState(null);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'custom-fields') setCustomFields((await api.get('/admin/custom-fields').catch(()=>null))?.data || []);
      else if (tab === 'number-ranges') setNumberRanges((await api.get('/admin/number-ranges').catch(()=>null))?.data || []);
      else if (tab === 'system-config') setSysConfig((await api.get('/admin/config').catch(()=>null))?.data || []);
      else if (tab === 'incoterms') setIncoterms((await api.get('/master/incoterms').catch(()=>null))?.data || []);
      else if (tab === 'payment-terms') setPaymentTerms((await api.get('/master/payment-terms').catch(()=>null))?.data || []);
      else if (tab === 'uom') setUoms((await api.get('/master/uom').catch(()=>null))?.data || []);
      else if (tab === 'tax-codes') setTaxCodes((await api.get('/master/tax-codes').catch(()=>null))?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleCreateField = async () => {
    if (!fieldForm.entity_type || !fieldForm.field_name || !fieldForm.field_label) { setAlert({ type: 'error', message: 'All fields required' }); return; }
    setSaving(true);
    try { await api.post('/admin/custom-fields', fieldForm); setShowCreateField(false); setAlert({ type: 'success', message: 'Custom field created' }); loadData(); }
    catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };
  const deleteField = async (id) => {
    try { await api.delete(`/admin/custom-fields/${id}`); setAlert({ type: 'success', message: 'Deleted' }); loadData(); }
    catch (err) { setAlert({ type: 'error', message: err.message }); }
  };
  const updateConfig = async (id, value) => {
    try { await api.put(`/admin/config/${id}`, { config_value: value }); setAlert({ type: 'success', message: 'Saved' }); }
    catch (err) { setAlert({ type: 'error', message: err.message }); }
  };

  // Generic save for master data
  const makeSave = (endpoint, reload, emptyForm, setForm) => async (form, id) => {
    setSaving(true); setModalError(null);
    try {
      if (id) await api.put(`${endpoint}/${id}`, form);
      else await api.post(endpoint, form);
      setAlert({ type: 'success', message: id ? 'Updated successfully' : 'Created successfully' });
      setForm(emptyForm);
      reload();
    } catch (err) { setModalError(err.message); setSaving(false); throw err; }
    setSaving(false);
  };
  const makeDelete = (endpoint, reload) => async (id) => {
    if (!confirm('Deactivate / delete this record?')) return;
    try { await api.delete(`${endpoint}/${id}`); setAlert({ type: 'success', message: 'Deleted' }); reload(); }
    catch (err) { setAlert({ type: 'error', message: err.message }); }
  };
  const makeEdit = (setEditItem, setForm) => (row) => { setEditItem(row); setForm({ ...row }); };

  const emptyIncoterm = { code: '', name: '', description: '' };
  const emptyPt = { term_code: '', term_name: '', days_net: 30, days_discount: '', discount_percent: '' };
  const emptyUom = { uom_code: '', uom_name: '', uom_type: '', decimal_places: 0 };
  const emptyTax = { tax_code: '', tax_name: '', description: '', tax_rate: '', tax_type: 'input' };

  const entityTypes = ['business_partner', 'material', 'sales_order', 'purchase_order', 'employee', 'asset', 'project'];
  const fieldTypes = ['text', 'number', 'date', 'boolean', 'select', 'textarea', 'email', 'url'];

  const tabs = [
    { key: 'custom-fields', label: 'Custom Fields' },
    { key: 'number-ranges', label: 'Number Ranges' },
    { key: 'system-config', label: 'System Config' },
    { key: 'incoterms', label: 'Incoterms' },
    { key: 'payment-terms', label: 'Payment Terms' },
    { key: 'uom', label: 'Units of Measure' },
    { key: 'tax-codes', label: 'Tax Codes' },
  ];

  const inp = 'w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:border-blue-400 outline-none';

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">System Configuration</h1>
          <p className="text-sm text-gray-400 mt-1">Custom fields, number ranges, system settings, and master data</p>
        </div>
        {tab === 'custom-fields' && <button onClick={() => { setShowCreateField(true); setModalError(null); }} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Field</button>}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ── CUSTOM FIELDS ── */}
      {tab === 'custom-fields' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'entity_type', label: 'Entity', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 capitalize">{(v || '').replace(/_/g, ' ')}</span> },
            { key: 'field_name', label: 'Field Name', render: v => <span className="font-mono text-blue-600">{v}</span> },
            { key: 'field_label', label: 'Label', render: v => <span className="font-medium">{v}</span> },
            { key: 'field_type', label: 'Type', render: v => <span className="capitalize text-gray-600">{v}</span> },
            { key: 'is_required', label: 'Required', render: v => v ? <span className="text-emerald-600">Yes</span> : <span className="text-gray-400">No</span> },
            { key: 'id', label: '', render: v => <button onClick={() => deleteField(v)} className="p-1 hover:bg-rose-50 rounded"><Trash2 className="w-3.5 h-3.5 text-rose-400" /></button> },
          ]} data={customFields} loading={loading} emptyMessage="No custom fields." />
        </div>
      )}

      {/* ── NUMBER RANGES ── */}
      {tab === 'number-ranges' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
          <DataTable columns={[
            { key: 'object_type', label: 'Object', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
            { key: 'prefix', label: 'Prefix', render: v => <span className="font-mono">{v}</span> },
            { key: 'current_number', label: 'Current #', render: v => <span className="font-mono">{v}</span> },
            { key: 'min_number', label: 'Min', render: v => <span className="text-gray-500">{v}</span> },
            { key: 'max_number', label: 'Max', render: v => <span className="text-gray-500">{v}</span> },
          ]} data={numberRanges} loading={loading} />
        </div>
      )}

      {/* ── SYSTEM CONFIG ── */}
      {tab === 'system-config' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 space-y-4">
          {Object.entries((sysConfig || []).reduce((acc, c) => { (acc[c.config_group || 'general'] = acc[c.config_group || 'general'] || []).push(c); return acc; }, {})).map(([group, items]) => (
            <div key={group}>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2 capitalize">{group}</h3>
              <div className="space-y-2">
                {items.map(cfg => (
                  <div key={cfg.id} className="flex items-center gap-4 py-2 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-gray-700 dark:text-gray-300">{cfg.config_key}</p>
                      {cfg.description && <p className="text-xs text-gray-400">{cfg.description}</p>}
                    </div>
                    <input defaultValue={cfg.config_value} className="input-field w-48 py-1.5 text-sm"
                      onBlur={e => { if (e.target.value !== cfg.config_value) updateConfig(cfg.id, e.target.value); }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── INCOTERMS ── */}
      {tab === 'incoterms' && (
        <MasterDataSection title="Incoterm" columns={[
          { key: 'code', label: 'Code', render: v => <span className="font-mono font-bold text-blue-600">{v}</span> },
          { key: 'name', label: 'Name', render: v => <span className="font-medium">{v}</span> },
          { key: 'description', label: 'Description', render: v => <span className="text-xs text-gray-500">{v || '—'}</span> },
          { key: 'is_active', label: 'Status', render: v => v ? <span className="text-emerald-600 text-xs">Active</span> : <span className="text-gray-400 text-xs">Inactive</span> },
        ]} data={incoterms} loading={loading}
          form={incotermForm} setForm={setIncotermForm} emptyForm={emptyIncoterm}
          onSave={makeSave('/master/incoterms', loadData, emptyIncoterm, setIncotermForm)}
          onDelete={makeDelete('/master/incoterms', loadData)}
          onEdit={makeEdit(setEditIncoterm, setIncotermForm)}
          editItem={editIncoterm} setEditItem={setEditIncoterm}
          saving={saving} modalError={modalError} setModalError={setModalError}>
          {(form, setForm, isEdit) => (
            <div className="space-y-3">
              {!isEdit && <FormField label="Code *"><input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inp} placeholder="e.g. FOB" maxLength={10} /></FormField>}
              <FormField label="Name *"><input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inp} placeholder="e.g. Free on Board" /></FormField>
              <FormField label="Description"><textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} className={`${inp} resize-none`} rows={2} placeholder="Short description..." /></FormField>
            </div>
          )}
        </MasterDataSection>
      )}

      {/* ── PAYMENT TERMS ── */}
      {tab === 'payment-terms' && (
        <MasterDataSection title="Payment Term" columns={[
          { key: 'term_code', label: 'Code', render: v => <span className="font-mono font-bold text-blue-600">{v}</span> },
          { key: 'term_name', label: 'Name', render: v => <span className="font-medium">{v}</span> },
          { key: 'days_net', label: 'Net Days', render: v => <span className="text-sm">{v}</span> },
          { key: 'days_discount', label: 'Discount Days', render: v => <span className="text-sm text-gray-500">{v || '—'}</span> },
          { key: 'discount_percent', label: 'Discount %', render: v => v ? <span className="text-sm text-emerald-600">{v}%</span> : <span className="text-gray-400">—</span> },
        ]} data={paymentTerms} loading={loading}
          form={ptForm} setForm={setPtForm} emptyForm={emptyPt}
          onSave={makeSave('/master/payment-terms', loadData, emptyPt, setPtForm)}
          onDelete={makeDelete('/master/payment-terms', loadData)}
          onEdit={makeEdit(setEditPt, setPtForm)}
          editItem={editPt} setEditItem={setEditPt}
          saving={saving} modalError={modalError} setModalError={setModalError}>
          {(form, setForm, isEdit) => (
            <div className="space-y-3">
              {!isEdit && <FormField label="Term Code *"><input value={form.term_code || ''} onChange={e => setForm({ ...form, term_code: e.target.value.toUpperCase() })} className={inp} placeholder="e.g. NET30" maxLength={10} /></FormField>}
              <FormField label="Term Name *"><input value={form.term_name || ''} onChange={e => setForm({ ...form, term_name: e.target.value })} className={inp} placeholder="e.g. Net 30 Days" /></FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Net Days *"><input type="number" min="0" value={form.days_net ?? 30} onChange={e => setForm({ ...form, days_net: e.target.value })} className={inp} /></FormField>
                <FormField label="Discount Days"><input type="number" min="0" value={form.days_discount || ''} onChange={e => setForm({ ...form, days_discount: e.target.value })} className={inp} /></FormField>
                <FormField label="Discount %"><input type="number" min="0" max="100" step="0.01" value={form.discount_percent || ''} onChange={e => setForm({ ...form, discount_percent: e.target.value })} className={inp} /></FormField>
              </div>
            </div>
          )}
        </MasterDataSection>
      )}

      {/* ── UOM ── */}
      {tab === 'uom' && (
        <MasterDataSection title="Unit of Measure" columns={[
          { key: 'uom_code', label: 'Code', render: v => <span className="font-mono font-bold text-blue-600">{v}</span> },
          { key: 'uom_name', label: 'Name', render: v => <span className="font-medium">{v}</span> },
          { key: 'uom_type', label: 'Type', render: v => <span className="text-sm text-gray-500 capitalize">{v || '—'}</span> },
          { key: 'decimal_places', label: 'Decimals', render: v => <span className="text-sm">{v ?? 0}</span> },
        ]} data={uoms} loading={loading}
          form={uomForm} setForm={setUomForm} emptyForm={emptyUom}
          onSave={makeSave('/master/uom', loadData, emptyUom, setUomForm)}
          onDelete={makeDelete('/master/uom', loadData)}
          onEdit={makeEdit(setEditUom, setUomForm)}
          editItem={editUom} setEditItem={setEditUom}
          saving={saving} modalError={modalError} setModalError={setModalError}>
          {(form, setForm, isEdit) => (
            <div className="space-y-3">
              {!isEdit && <FormField label="UOM Code *"><input value={form.uom_code || ''} onChange={e => setForm({ ...form, uom_code: e.target.value.toUpperCase() })} className={inp} placeholder="e.g. KG, PCS, MTR" maxLength={10} /></FormField>}
              <FormField label="UOM Name *"><input value={form.uom_name || ''} onChange={e => setForm({ ...form, uom_name: e.target.value })} className={inp} placeholder="e.g. Kilogram" /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Type"><select value={form.uom_type || ''} onChange={e => setForm({ ...form, uom_type: e.target.value })} className={inp}>
                  <option value="">Select...</option>
                  {['weight', 'volume', 'length', 'area', 'time', 'quantity', 'service'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select></FormField>
                <FormField label="Decimal Places"><input type="number" min="0" max="6" value={form.decimal_places ?? 0} onChange={e => setForm({ ...form, decimal_places: e.target.value })} className={inp} /></FormField>
              </div>
            </div>
          )}
        </MasterDataSection>
      )}

      {/* ── TAX CODES ── */}
      {tab === 'tax-codes' && (
        <div className="space-y-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
            Tax codes are used in sales and purchase line items. When selected, the GST% is applied as: <strong>IGST = full rate</strong> (inter-state) or <strong>CGST + SGST = rate ÷ 2 each</strong> (intra-state).
          </div>
          <MasterDataSection title="Tax Code" columns={[
            { key: 'tax_code', label: 'Code', render: v => <span className="font-mono font-bold text-blue-600">{v}</span> },
            { key: 'tax_name', label: 'Name', render: v => <span className="font-medium">{v}</span> },
            { key: 'description', label: 'Description', render: v => <span className="text-xs text-gray-500">{v || '—'}</span> },
            { key: 'tax_rate', label: 'Rate %', render: v => <span className="font-semibold text-orange-600">{parseFloat(v || 0).toFixed(2)}%</span> },
            { key: 'tax_type', label: 'Type', render: v => <span className="text-xs text-gray-500 capitalize">{v || 'input'}</span> },
          ]} data={taxCodes} loading={loading}
            form={taxForm} setForm={setTaxForm} emptyForm={emptyTax}
            onSave={makeSave('/master/tax-codes', loadData, emptyTax, setTaxForm)}
            onDelete={makeDelete('/master/tax-codes', loadData)}
            onDeleteAll={async () => { try { await api.delete('/master/tax-codes/all'); loadData(); } catch (e) { setAlert({ type: 'error', message: e.message }); } }}
            onEdit={makeEdit(setEditTax, setTaxForm)}
            editItem={editTax} setEditItem={setEditTax}
            saving={saving} modalError={modalError} setModalError={setModalError}>
            {(form, setForm, isEdit) => (
              <div className="space-y-3">
                {!isEdit && <FormField label="Tax Code *"><input value={form.tax_code || ''} onChange={e => setForm({ ...form, tax_code: e.target.value.toUpperCase() })} className={inp} placeholder="e.g. GST18, GST5, GST12" maxLength={10} /></FormField>}
                <FormField label="Tax Name *"><input value={form.tax_name || ''} onChange={e => setForm({ ...form, tax_name: e.target.value })} className={inp} placeholder="e.g. GST 18%" /></FormField>
                <FormField label="Description"><input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} className={inp} placeholder="e.g. Standard GST rate for goods" /></FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Tax Rate % *"><input type="number" min="0" max="100" step="0.01" value={form.tax_rate ?? ''} onChange={e => setForm({ ...form, tax_rate: e.target.value })} className={inp} placeholder="e.g. 18" /></FormField>
                  <FormField label="Tax Type"><select value={form.tax_type || 'input'} onChange={e => setForm({ ...form, tax_type: e.target.value })} className={inp}>
                    <option value="input">Input</option>
                    <option value="output">Output</option>
                  </select></FormField>
                </div>
              </div>
            )}
          </MasterDataSection>
        </div>
      )}

      {/* Custom Field Create Modal */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateField} onClose={() => setShowCreateField(false)} title="Create Custom Field" size="xl"
        footer={<><button onClick={() => setShowCreateField(false)} className="btn-secondary">Cancel</button><button onClick={handleCreateField} disabled={saving} className="btn-primary">{saving ? 'Creating...' : 'Create'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Entity Type" required><select value={fieldForm.entity_type} onChange={e => setFieldForm({ ...fieldForm, entity_type: e.target.value })} className="select-field"><option value="">Select...</option>{entityTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></FormField>
            <FormField label="Field Type" required><select value={fieldForm.field_type} onChange={e => setFieldForm({ ...fieldForm, field_type: e.target.value })} className="select-field">{fieldTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Field Name" required><input value={fieldForm.field_name} onChange={e => setFieldForm({ ...fieldForm, field_name: e.target.value.replace(/\s/g, '_').toLowerCase() })} className="input-field font-mono" placeholder="e.g. custom_region" /></FormField>
            <FormField label="Field Label" required><input value={fieldForm.field_label} onChange={e => setFieldForm({ ...fieldForm, field_label: e.target.value })} className="input-field" placeholder="e.g. Region" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Default Value"><input value={fieldForm.default_value} onChange={e => setFieldForm({ ...fieldForm, default_value: e.target.value })} className="input-field" /></FormField>
            <FormField label="Sort Order"><input type="number" value={fieldForm.sort_order} onChange={e => setFieldForm({ ...fieldForm, sort_order: parseInt(e.target.value) })} className="input-field" /></FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={fieldForm.is_required} onChange={e => setFieldForm({ ...fieldForm, is_required: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600" /> Required field
          </label>
        </div>
      </Modal>
    </div>
  );
}
