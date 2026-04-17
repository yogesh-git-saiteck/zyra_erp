import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Eye, Code2, Printer, ChevronDown, ChevronRight,
  Plus, Upload, RefreshCw, Copy, Type, Layout, Table2
} from 'lucide-react';
import api from '../../utils/api';

// ── Entity field definitions ─────────────────────────────────────────────────
const ENTITY_FIELDS = {
  purchase_order: { label: 'Purchase Order', groups: [
    { label: 'Document', fields: ['doc_number','date','status','currency','description','notes'] },
    { label: 'Vendor',   fields: ['vendor_name','vendor_address','vendor_gstin','vendor_pan','payment_terms','place_of_supply'] },
    { label: 'Amounts',  fields: ['subtotal','tax_amount','total_amount','amount_in_words'] },
    { label: 'Items',    fields: ['items_table','tax_table'] },
  ]},
  purchase_requisition: { label: 'Purchase Requisition', groups: [
    { label: 'Document',   fields: ['doc_number','date','status','description','notes'] },
    { label: 'Requester',  fields: ['requester_name'] },
    { label: 'Amounts',    fields: ['total_amount','amount_in_words'] },
    { label: 'Items',      fields: ['items_table'] },
  ]},
  sales_order: { label: 'Sales Order', groups: [
    { label: 'Document',  fields: ['doc_number','date','status','currency','delivery_date','shipping_method','delivery_terms'] },
    { label: 'Customer',  fields: ['customer_name','customer_address','customer_gstin','customer_pan','customer_po_number','place_of_supply'] },
    { label: 'Amounts',   fields: ['subtotal','tax_amount','total_amount','amount_in_words'] },
    { label: 'Items',     fields: ['items_table','tax_table'] },
  ]},
  quotation: { label: 'Quotation', groups: [
    { label: 'Document',  fields: ['doc_number','date','status','valid_until','currency'] },
    { label: 'Customer',  fields: ['customer_name','customer_address','customer_gstin','place_of_supply'] },
    { label: 'Amounts',   fields: ['subtotal','tax_amount','total_amount','amount_in_words'] },
    { label: 'Items',     fields: ['items_table','tax_table'] },
  ]},
  ap_invoice: { label: 'AP Invoice', groups: [
    { label: 'Document',  fields: ['doc_number','date','due_date','status','currency'] },
    { label: 'Vendor',    fields: ['vendor_name','vendor_address','vendor_gstin','vendor_pan','place_of_supply'] },
    { label: 'Amounts',   fields: ['subtotal','tax_amount','total_amount','amount_in_words'] },
    { label: 'Items',     fields: ['items_table','tax_table'] },
  ]},
  payment: { label: 'Payment', groups: [
    { label: 'Document',  fields: ['doc_number','date','status','currency','payment_method','reference_number'] },
    { label: 'Party',     fields: ['party_name'] },
    { label: 'Amounts',   fields: ['amount','amount_in_words'] },
  ]},
  ar_invoice: { label: 'AR Invoice', groups: [
    { label: 'Document',  fields: ['doc_number','date','due_date','status','currency'] },
    { label: 'Customer',  fields: ['customer_name','customer_address','customer_gstin','customer_pan','place_of_supply'] },
    { label: 'Amounts',   fields: ['subtotal','tax_amount','total_amount','amount_in_words'] },
    { label: 'Items',     fields: ['items_table','tax_table'] },
  ]},
};

const COMPANY_FIELDS = ['company_name','company_logo','company_address','company_phone','company_email','company_tax_id'];

// ── Sample data ───────────────────────────────────────────────────────────────
const SAMPLE_DATA = {
  purchase_order:       { doc_number:'PO-10001', date:'Mar 27, 2026', status:'APPROVED', vendor_name:'Sample Vendor Pvt Ltd', vendor_address:'123 Vendor Street, Chennai, Tamil Nadu 600001', vendor_gstin:'33ABCDE1234F1Z5', vendor_pan:'ABCDE1234F', payment_terms:'Net 30', place_of_supply:'Tamil Nadu', subtotal:'₹10,000.00', tax_amount:'₹1,800.00', total_amount:'₹11,800.00', amount_in_words:'INR Eleven Thousand Eight Hundred Rupees Only', currency:'INR', description:'Office Supplies', notes:'Deliver to main warehouse.' },
  purchase_requisition: { doc_number:'PR-10001', date:'Mar 27, 2026', status:'SUBMITTED', requester_name:'John Doe', description:'Stationery', notes:'Urgent requirement', total_amount:'₹5,000.00', amount_in_words:'INR Five Thousand Rupees Only' },
  sales_order:          { doc_number:'SO-10001', date:'Mar 27, 2026', status:'CONFIRMED', customer_name:'ABC Corporation', customer_address:'456 Customer Road, Mumbai, Maharashtra 400001', customer_gstin:'27FGHIJ5678K1Z2', customer_pan:'FGHIJ5678K', customer_po_number:'PO-456', delivery_date:'Apr 10, 2026', shipping_method:'Road', delivery_terms:'CIF', place_of_supply:'Maharashtra', subtotal:'₹20,000.00', tax_amount:'₹3,600.00', total_amount:'₹23,600.00', amount_in_words:'INR Twenty Three Thousand Six Hundred Rupees Only', currency:'INR' },
  quotation:            { doc_number:'QT-10001', date:'Mar 27, 2026', valid_until:'Apr 10, 2026', status:'OPEN', customer_name:'XYZ Ltd', customer_address:'789 Buyer Lane, Bangalore, Karnataka 560001', customer_gstin:'29KLMNO9012P1Z3', place_of_supply:'Karnataka', subtotal:'₹15,000.00', tax_amount:'₹2,700.00', total_amount:'₹17,700.00', amount_in_words:'INR Seventeen Thousand Seven Hundred Rupees Only', currency:'INR' },
  ap_invoice:           { doc_number:'INV-10001', date:'Mar 27, 2026', due_date:'Apr 27, 2026', status:'OPEN', vendor_name:'Supplier Co', vendor_address:'321 Supplier Ave, Hyderabad, Telangana 500001', vendor_gstin:'36PQRST3456Q1Z4', vendor_pan:'PQRST3456Q', place_of_supply:'Telangana', subtotal:'₹8,000.00', tax_amount:'₹1,440.00', total_amount:'₹9,440.00', amount_in_words:'INR Nine Thousand Four Hundred Forty Rupees Only', currency:'INR' },
  payment:              { doc_number:'PAY-10001', date:'Mar 27, 2026', status:'COMPLETED', party_name:'Supplier Co', amount:'₹9,440.00', amount_in_words:'INR Nine Thousand Four Hundred Forty Rupees Only', payment_method:'Bank Transfer', reference_number:'TXN-789', currency:'INR' },
  ar_invoice:           { doc_number:'ARI-10001', date:'Mar 27, 2026', due_date:'Apr 27, 2026', status:'OPEN', customer_name:'ABC Corporation', customer_address:'456 Customer Road, Mumbai, Maharashtra 400001', customer_gstin:'27FGHIJ5678K1Z2', customer_pan:'FGHIJ5678K', place_of_supply:'Maharashtra', subtotal:'₹10,000.00', tax_amount:'₹1,800.00', total_amount:'₹11,800.00', amount_in_words:'INR Eleven Thousand Eight Hundred Rupees Only', currency:'INR' },
};

const SAMPLE_ITEMS_TABLE = `<table>
  <thead><tr class="gray bold center">
    <th style="width:5%;">S.No</th>
    <th style="width:38%;">Description</th>
    <th style="width:15%;">Unit Rate</th>
    <th style="width:15%;">Qty</th>
    <th style="width:10%;">Disc%</th>
    <th style="width:17%;">Total (INR)</th>
  </tr></thead>
  <tbody>
    <tr class="unruled-items">
      <td class="center">1</td>
      <td><b>Sample Item A</b><br><small style="color:#555;">MAT-001</small></td>
      <td class="right">₹3,000.00</td>
      <td class="center">2.000 EA</td>
      <td class="center">0.0%</td>
      <td class="right">₹6,000.00</td>
    </tr>
    <tr class="unruled-items">
      <td class="center">2</td>
      <td><b>Sample Item B</b><br><small style="color:#555;">MAT-002</small></td>
      <td class="right">₹4,000.00</td>
      <td class="center">1.000 PCS</td>
      <td class="center">0.0%</td>
      <td class="right">₹4,000.00</td>
    </tr>
    <tr class="spacer-row"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="footer-row bold"><td colspan="5" class="right">Sub-Total</td><td class="right">₹10,000.00</td></tr>
  </tbody>
</table>`;

const SAMPLE_TAX_TABLE = `<table>
  <thead><tr class="gray bold center" style="font-size:8pt;">
    <th style="width:5%;">S.No</th>
    <th>Taxable Value</th>
    <th colspan="2">CGST</th>
    <th colspan="2">SGST</th>
    <th>Total Tax</th>
  </tr></thead>
  <tbody>
    <tr class="center">
      <td>1</td>
      <td class="right">₹8,474.00</td>
      <td>9.0%</td><td class="right">₹900.00</td>
      <td>9.0%</td><td class="right">₹900.00</td>
      <td class="right">₹1,800.00</td>
    </tr>
    <tr class="bold"><td colspan="6" class="right">Grand Total (INR)</td><td class="right" style="font-size:9pt;">₹11,800.00</td></tr>
  </tbody>
</table>`;

// ── Block library ─────────────────────────────────────────────────────────────
const BLOCKS = [
  { id: 'company_header', label: 'Company Header', html: `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #1e40af;margin-bottom:24px;">
  <div>
    <img src="{{company_logo}}" style="max-height:70px;max-width:180px;object-fit:contain;" onerror="this.style.display='none'" alt="Logo" />
    <div style="margin-top:8px;">
      <div style="font-size:18px;font-weight:700;color:#1e40af;">{{company_name}}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">{{company_address}}</div>
      <div style="font-size:11px;color:#6b7280;">Tel: {{company_phone}} | {{company_email}}</div>
      <div style="font-size:11px;color:#6b7280;">GSTIN: {{company_tax_id}}</div>
    </div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:28px;font-weight:800;color:#1e40af;letter-spacing:1px;">PURCHASE ORDER</div>
    <div style="font-size:16px;font-weight:600;margin-top:6px;color:#374151;">{{doc_number}}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:2px;">Date: {{date}}</div>
    <div style="margin-top:4px;display:inline-block;padding:2px 10px;background:#dcfce7;color:#16a34a;border-radius:9999px;font-size:11px;font-weight:600;">{{status}}</div>
  </div>
</div>` },
  { id: 'vendor_party', label: 'Vendor / Party Info', html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Bill To</div>
    <div style="font-weight:600;font-size:14px;color:#1e293b;">{{vendor_name}}</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Payment Terms</div>
    <div style="font-size:13px;color:#374151;">{{payment_terms}}</div>
  </div>
</div>` },
  { id: 'customer_party', label: 'Customer Info', html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Customer</div>
    <div style="font-weight:600;font-size:14px;color:#1e293b;">{{customer_name}}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px;">PO#: {{customer_po_number}}</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Delivery</div>
    <div style="font-size:12px;color:#374151;">Date: {{delivery_date}}</div>
    <div style="font-size:12px;color:#374151;">Method: {{shipping_method}}</div>
    <div style="font-size:12px;color:#374151;">Terms: {{delivery_terms}}</div>
  </div>
</div>` },
  { id: 'items_section', label: 'Items Table', html: `<div style="margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Line Items</div>
  {{items_table}}
</div>` },
  { id: 'totals', label: 'Totals Block', html: `<div style="display:flex;justify-content:flex-end;margin-top:20px;margin-bottom:24px;">
  <div style="min-width:280px;">
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;"><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;"><span>Tax</span><span>{{tax_amount}}</span></div>
    <div style="display:flex;justify-content:space-between;padding:10px 0;font-size:17px;font-weight:700;color:#1e40af;"><span>TOTAL</span><span>{{total_amount}}</span></div>
  </div>
</div>` },
  { id: 'notes_terms', label: 'Notes & Terms', html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
  <div>
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Notes</div>
    <div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:10px;border:1px solid #e2e8f0;min-height:60px;">{{notes}}</div>
  </div>
  <div>
    <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Terms &amp; Conditions</div>
    <div style="font-size:12px;color:#374151;background:#f8fafc;border-radius:6px;padding:10px;border:1px solid #e2e8f0;min-height:60px;">Payment as per agreed terms. All disputes subject to local jurisdiction.</div>
  </div>
</div>` },
  { id: 'signatures', label: 'Signature Block', html: `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:60px;">
  <div style="text-align:center;"><div style="border-top:1px solid #9ca3af;padding-top:10px;"><div style="font-size:11px;color:#6b7280;">Prepared By</div></div></div>
  <div style="text-align:center;"><div style="border-top:1px solid #9ca3af;padding-top:10px;"><div style="font-size:11px;color:#6b7280;">Approved By</div></div></div>
  <div style="text-align:center;"><div style="border-top:1px solid #9ca3af;padding-top:10px;"><div style="font-size:11px;color:#6b7280;">Received By</div></div></div>
</div>` },
  { id: 'divider',    label: 'Divider Line',  html: `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />` },
  { id: 'spacer',     label: 'Spacer',         html: `<div style="height:24px;"></div>` },
  { id: 'text_block', label: 'Text Block',     html: `<div style="margin-bottom:16px;font-size:12px;color:#374151;line-height:1.6;">Your custom text here. Edit the HTML to customize.</div>` },
  { id: 'two_col',    label: 'Two Column',     html: `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
    <div style="font-weight:600;margin-bottom:6px;">Column 1</div>
    <div style="font-size:12px;color:#6b7280;">Content here</div>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
    <div style="font-weight:600;margin-bottom:6px;">Column 2</div>
    <div style="font-size:12px;color:#6b7280;">Content here</div>
  </div>
</div>` },
];

// ── Accordion helper ──────────────────────────────────────────────────────────
function Accordion({ open, onToggle, title, icon: Icon, children }) {
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-700 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-blue-400" />}
          <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">{title}</span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PrintBuilder() {
  const { id: templateId } = useParams();
  const navigate = useNavigate();

  const [html, setHtml] = useState('');
  const [meta, setMeta] = useState({
    template_name: '',
    entity_type: 'purchase_order',
    logo_url: '',
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    company_tax_id: '',
    is_default: false,
  });
  const [mode, setMode] = useState('code');
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({ company: true, fields: true, blocks: false });
  const [previewEntityId, setPreviewEntityId] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [liveLoading, setLiveLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const textareaRef = useRef(null);
  const logoInputRef = useRef(null);

  // Load companies from master + existing template
  useEffect(() => {
    api.get('/org/companies').then(r => {
      const list = r?.data || [];
      setCompanies(list);
      // Auto-select first company if no template loaded yet
      if (list.length && templateId === 'new') applyCompany(list[0]);
    }).catch(() => {});
    if (templateId && templateId !== 'new') loadTemplate();
  }, [templateId]);

  // Auto-dismiss alerts
  useEffect(() => {
    if (alert) {
      const t = setTimeout(() => setAlert(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alert]);

  const applyCompany = (co) => {
    if (!co) return;
    setSelectedCompanyId(co.id);
    const addr = [co.address_line1, co.city, co.state, co.postal_code].filter(Boolean).join(', ');
    setMeta(m => ({
      ...m,
      company_name: co.company_name || '',
      company_address: addr,
      company_phone: co.phone || '',
      company_email: co.email || '',
      company_tax_id: co.gstin || co.tax_id || '',
      logo_url: m.logo_url || co.logo_url || '',
    }));
  };

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/platform/print-templates/${templateId}`, { params: { _t: Date.now() } });
      const tpl = r.data;
      setHtml(tpl.body_html || '');
      setMeta({
        template_name: tpl.template_name || '',
        entity_type: tpl.entity_type || 'purchase_order',
        logo_url: tpl.logo_url || '',
        company_name: tpl.company_name || '',
        company_address: tpl.company_address || '',
        company_phone: tpl.company_phone || '',
        company_email: tpl.company_email || '',
        company_tax_id: tpl.company_tax_id || '',
        is_default: tpl.is_default || false,
      });
      // Try to match loaded company name to a company in master for the dropdown
      setCompanies(prev => {
        const match = prev.find(c => c.company_name === tpl.company_name);
        if (match) setSelectedCompanyId(match.id);
        return prev;
      });
    } catch (err) {
      setAlert({ type: 'error', message: 'Failed to load template: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── Insert at cursor ────────────────────────────────────────────────────────
  const insertAtCursor = (text) => {
    const ta = textareaRef.current;
    if (!ta) { setHtml(h => h + text); return; }
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = html.slice(0, start), after = html.slice(end);
    const newHtml = before + text + after;
    setHtml(newHtml);
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length; }, 0);
  };

  const handleFieldDragStart = (e, field) => {
    e.dataTransfer.setData('text/plain', `{{${field}}}`);
  };

  const handleFieldClick = (field) => {
    insertAtCursor(`{{${field}}}`);
  };

  const handleBlockInsert = (block) => {
    setHtml(h => h + '\n' + block.html);
  };

  // ── Logo upload ─────────────────────────────────────────────────────────────
  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setMeta(m => ({ ...m, logo_url: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // ── Preview generation ──────────────────────────────────────────────────────
  const generatePreview = () => {
    const isFullDoc = /^\s*<!DOCTYPE\s/i.test(html) || /^\s*<html[\s>]/i.test(html);
    const data = {
      ...(SAMPLE_DATA[meta.entity_type] || {}),
      company_name:    meta.company_name    || 'Your Company Name',
      company_logo:    meta.logo_url        || '',
      company_address: meta.company_address || 'Company Address, City - 000000',
      company_phone:   meta.company_phone   || '+91 00000 00000',
      company_email:   meta.company_email   || 'info@company.com',
      company_tax_id:  meta.company_tax_id  || '00AAAAA0000A0Z0',
    };
    let result = html
      .replace(/\{\{items_table\}\}/g, SAMPLE_ITEMS_TABLE)
      .replace(/\{\{tax_table\}\}/g, SAMPLE_TAX_TABLE)
      .replace(/\{\{company_logo\}\}/g, meta.logo_url ? `<img src="${meta.logo_url}" style="max-height:70px;max-width:180px;object-fit:contain;" alt="logo">` : '');
    Object.entries(data).forEach(([k, v]) => {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || '');
    });
    result = result.replace(/\{\{[^}]+\}\}/g, '<span style="background:#fef9c3;color:#854d0e;padding:0 2px;border-radius:2px;font-size:10px">&#9888; ?</span>');
    // If the template is already a full HTML document, return it as-is (don't double-wrap)
    if (isFullDoc) return result;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:13px;color:#1f2937;padding:32px;background:white;max-width:850px;margin:0 auto}img{max-width:100%}table{border-collapse:collapse}@media print{body{padding:0}@page{size:A4;margin:15mm}}</style></head><body>${result}</body></html>`;
  };

  // ── Live preview from backend ───────────────────────────────────────────────
  const loadLivePreview = async () => {
    if (!previewEntityId || !templateId || templateId === 'new') {
      setAlert({ type: 'error', message: 'Save the template first, then enter a document ID.' });
      return;
    }
    setLiveLoading(true);
    try {
      const r = await api.get(`/platform/print-templates/${templateId}/render?entity_id=${previewEntityId}`, { responseType: 'text' });
      setPreviewHtml(typeof r.data === 'string' ? r.data : generatePreview());
    } catch (err) {
      setAlert({ type: 'error', message: 'Live preview failed: ' + err.message });
      setPreviewHtml(generatePreview());
    } finally {
      setLiveLoading(false);
    }
  };

  // ── Print ───────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(generatePreview());
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!meta.template_name.trim()) { setAlert({ type: 'error', message: 'Template name is required.' }); return; }
    setSaving(true);
    try {
      const payload = { ...meta, body_html: html, header_html: null, footer_html: null };
      if (templateId && templateId !== 'new') {
        await api.put(`/platform/print-templates/${templateId}`, payload);
        setAlert({ type: 'success', message: 'Template saved successfully.' });
      } else {
        const r = await api.post('/platform/print-templates', payload);
        setAlert({ type: 'success', message: 'Template created successfully.' });
        if (r.data?.id) {
          navigate(`/settings/print-builder/${r.data.id}`, { replace: true });
        }
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Toggle accordion ────────────────────────────────────────────────────────
  const toggleGroup = (key) => setExpandedGroups(g => ({ ...g, [key]: !g[key] }));

  const entityConfig = ENTITY_FIELDS[meta.entity_type];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-gray-400 text-sm animate-pulse">Loading template...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0 flex-wrap">
        <button
          onClick={() => navigate('/settings/platform')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

        <input
          value={meta.template_name}
          onChange={e => setMeta(m => ({ ...m, template_name: e.target.value }))}
          placeholder="Template name…"
          className="text-sm font-medium border border-gray-200 dark:border-gray-700 rounded px-2 py-1 w-48 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={meta.entity_type}
          onChange={e => setMeta(m => ({ ...m, entity_type: e.target.value }))}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(ENTITY_FIELDS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={meta.is_default}
            onChange={e => setMeta(m => ({ ...m, is_default: e.target.checked }))}
            className="w-3.5 h-3.5 rounded"
          />
          Set as Default
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handlePrint}
            title="Print preview"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* ── Alert ── */}
      {alert && (
        <div className={`px-4 py-2 text-xs font-medium flex items-center justify-between shrink-0 ${
          alert.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-b border-rose-200 dark:border-rose-800'
        }`}>
          <span>{alert.message}</span>
          <button onClick={() => setAlert(null)} className="text-lg leading-none opacity-60 hover:opacity-100 ml-4">&times;</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar ── */}
        <div className="w-72 bg-gray-900 text-gray-100 flex flex-col overflow-hidden border-r border-gray-700 shrink-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-2">

            {/* Company Settings */}
            <Accordion
              open={expandedGroups.company}
              onToggle={() => toggleGroup('company')}
              title="Company Settings"
              icon={Type}
            >
              <div className="space-y-2 mt-1">

                {/* Company selector from master */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Select Company</label>
                  <div className="flex gap-1">
                    <select
                      value={selectedCompanyId}
                      onChange={e => {
                        const co = companies.find(c => c.id === e.target.value);
                        if (co) applyCompany(co);
                      }}
                      className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-gray-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">— select —</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.company_name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => { const co = companies.find(c => c.id === selectedCompanyId); if (co) applyCompany(co); }}
                      title="Reload from company master"
                      className="px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-[10px] shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                  {selectedCompanyId && <p className="text-[9px] text-emerald-400 mt-1">✓ Loaded from Company Master</p>}
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Logo</label>
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-gray-300 transition-colors"
                    >
                      <Upload className="w-3 h-3" /> Upload
                    </button>
                    <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
                    {meta.logo_url && (
                      <img src={meta.logo_url} alt="logo" className="h-7 w-auto rounded border border-gray-600 object-contain bg-white px-1" />
                    )}
                  </div>
                  <input
                    value={meta.logo_url}
                    onChange={e => setMeta(m => ({ ...m, logo_url: e.target.value }))}
                    placeholder="https://… or upload above"
                    className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Read-only company info display (from master) */}
                {[
                  { key: 'company_name', label: 'Company Name' },
                  { key: 'company_address', label: 'Address' },
                  { key: 'company_phone', label: 'Phone' },
                  { key: 'company_email', label: 'Email' },
                  { key: 'company_tax_id', label: 'Tax / GSTIN' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[10px] text-gray-400 mb-0.5">{f.label}</label>
                    <div className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-300 min-h-[28px] leading-relaxed">
                      {meta[f.key] || <span className="text-gray-600 italic">—</span>}
                    </div>
                  </div>
                ))}

                <div className="pt-1">
                  <p className="text-[10px] text-gray-500 mb-1">Company field chips (click to insert):</p>
                  <div className="flex flex-wrap gap-1">
                    {COMPANY_FIELDS.map(f => (
                      <button
                        key={f}
                        onClick={() => handleFieldClick(f)}
                        draggable
                        onDragStart={e => handleFieldDragStart(e, f)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700/50 hover:bg-blue-800/60 transition-colors cursor-pointer"
                      >
                        {`{{${f}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Accordion>

            {/* Available Fields */}
            <Accordion
              open={expandedGroups.fields}
              onToggle={() => toggleGroup('fields')}
              title="Available Fields"
              icon={Table2}
            >
              <p className="text-[10px] text-gray-500 mb-2 mt-1">Drag to editor or click to insert</p>
              {entityConfig && entityConfig.groups.map(group => (
                <div key={group.label} className="mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {group.fields.map(field => (
                      <button
                        key={field}
                        onClick={() => handleFieldClick(field)}
                        draggable
                        onDragStart={e => handleFieldDragStart(e, field)}
                        title={`Click or drag to insert {{${field}}}`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-800/60 transition-colors cursor-grab active:cursor-grabbing select-none"
                      >
                        {`{{${field}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Accordion>

            {/* Block Library */}
            <Accordion
              open={expandedGroups.blocks}
              onToggle={() => toggleGroup('blocks')}
              title="Block Library"
              icon={Layout}
            >
              <p className="text-[10px] text-gray-500 mb-2 mt-1">Click a block to append it to your template</p>
              <div className="space-y-1.5">
                {BLOCKS.map(block => (
                  <button
                    key={block.id}
                    onClick={() => handleBlockInsert(block)}
                    className="w-full text-left px-2.5 py-2 rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-gray-500 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="w-3 h-3 text-gray-400 group-hover:text-green-400 transition-colors shrink-0" />
                      <span className="text-xs text-gray-300 group-hover:text-white">{block.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </Accordion>

          </div>
        </div>

        {/* ── Center Editor / Preview ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Mode tabs */}
          <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <button
              onClick={() => setMode('code')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
                mode === 'code'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" /> Code
            </button>
            <button
              onClick={() => { setMode('preview'); setPreviewHtml(generatePreview()); }}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
                mode === 'preview'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>

            {mode === 'preview' && (
              <button
                onClick={() => setPreviewHtml(generatePreview())}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            )}

            {mode === 'preview' && (
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  value={previewEntityId}
                  onChange={e => setPreviewEntityId(e.target.value)}
                  placeholder="Doc ID for live data"
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 w-40 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                />
                <button
                  onClick={loadLivePreview}
                  disabled={liveLoading}
                  className="flex items-center gap-1 text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  {liveLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  Load
                </button>
              </div>
            )}

            {mode === 'code' && (
              <div className="ml-auto flex items-center gap-3 text-[10px] text-gray-400">
                <span>{html.length} chars</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(html); setAlert({ type: 'success', message: 'HTML copied to clipboard' }); }}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-500"
                >
                  <Copy className="w-3 h-3" /> Copy HTML
                </button>
              </div>
            )}
          </div>

          {/* Editor */}
          {mode === 'code' && (
            <textarea
              ref={textareaRef}
              value={html}
              onChange={e => setHtml(e.target.value)}
              onDrop={e => { e.preventDefault(); insertAtCursor(e.dataTransfer.getData('text/plain')); }}
              onDragOver={e => e.preventDefault()}
              className="flex-1 font-mono text-xs p-4 resize-none outline-none leading-relaxed"
              style={{ background: '#1e1e2e', color: '#cdd6f4', lineHeight: 1.6 }}
              placeholder="Start typing HTML or add blocks from the left panel… You can also drag field chips directly here."
              spellCheck={false}
            />
          )}

          {/* Preview */}
          {mode === 'preview' && (
            <div className="flex-1 bg-gray-200 dark:bg-gray-800 overflow-auto flex items-start justify-center p-8">
              <div className="w-full max-w-3xl bg-white shadow-2xl rounded-sm">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full border-0"
                  style={{ height: '1120px' }}
                  title="print-preview"
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
