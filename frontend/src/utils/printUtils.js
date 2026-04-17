// Print utility — opens a new window with a professional print-ready document

const COMPANY = {
  name: 'Zyra Global Corp',
  address: '100 Innovation Drive, San Francisco, CA 94105',
  phone: '+1-415-555-0100',
  email: 'info@zyra.io',
  tax_id: 'US-12345678',
};

function formatCurrency(v) {
  if (v == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function buildHTML(title, docNumber, content) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${title} - ${docNumber}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #1a6af5; }
  .company-name { font-size: 22px; font-weight: 700; color: #1a6af5; }
  .company-info { font-size: 11px; color: #64748b; margin-top: 4px; }
  .doc-title { font-size: 24px; font-weight: 700; text-align: right; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; }
  .doc-number { font-size: 14px; color: #64748b; text-align: right; margin-top: 2px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; }
  .meta-box h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 6px; }
  .meta-box p { font-size: 13px; color: #334155; }
  .meta-box .value { font-weight: 600; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .info-row .label { color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
  tbody td { border: 1px solid #e2e8f0; padding: 8px 12px; font-size: 12px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .text-right { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
  .totals .row.grand { border-top: 2px solid #1e293b; border-bottom: none; font-size: 16px; font-weight: 700; padding-top: 10px; margin-top: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; }
  .footer-col { width: 45%; }
  .footer-col h5 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px; }
  .signature-line { border-bottom: 1px solid #cbd5e1; height: 40px; margin-bottom: 4px; }
  .notes { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #92400e; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .print-only { display: none; }
  .no-print { padding: 10px 20px; background: #1a6af5; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; position: fixed; top: 16px; right: 16px; font-family: 'DM Sans', sans-serif; font-weight: 600; z-index: 100; }
  .no-print:hover { background: #1355e1; }
  @media print {
    body { padding: 20px; }
    .no-print { display: none !important; }
    .print-only { display: block; }
  }
</style></head><body>
<button class="no-print" onclick="window.print()">🖨️ Print</button>
${content}
</body></html>`;
}

function itemsTable(items, columns) {
  const thead = columns.map(c => `<th class="${c.align === 'right' ? 'text-right' : ''}">${c.label}</th>`).join('');
  const tbody = items.map((item, i) => {
    const cells = columns.map(c => `<td class="${c.align === 'right' ? 'text-right' : ''}">${c.render ? c.render(item) : (item[c.key] ?? '—')}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function totalsBlock(rows) {
  return `<div class="totals">${rows.map(r =>
    `<div class="row ${r.grand ? 'grand' : ''}"><span>${r.label}</span><span>${r.value}</span></div>`
  ).join('')}</div>`;
}

function partnerBlock(title, data) {
  return `<div class="meta-box"><h4>${title}</h4>
    <p class="value">${data.name || '—'}</p>
    ${data.address ? `<p>${data.address}</p>` : ''}
    ${data.city ? `<p>${data.city}${data.country ? ', ' + data.country : ''}</p>` : ''}
    ${data.email ? `<p>${data.email}</p>` : ''}
    ${data.number ? `<p>ID: ${data.number}</p>` : ''}</div>`;
}

function infoBlock(title, rows) {
  return `<div class="meta-box"><h4>${title}</h4>${rows.map(r => `<div class="info-row"><span class="label">${r[0]}</span><span class="value">${r[1]}</span></div>`).join('')}</div>`;
}

function signatureBlock() {
  return `<div class="footer">
    <div class="footer-col"><h5>Authorized Signature</h5><div class="signature-line"></div><p style="font-size:11px;color:#94a3b8">Name / Date</p></div>
    <div class="footer-col"><h5>Received By</h5><div class="signature-line"></div><p style="font-size:11px;color:#94a3b8">Name / Date</p></div>
  </div>`;
}

// ============================
// PUBLIC PRINT FUNCTIONS
// ============================

export function printPurchaseOrder(po) {
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}<br>${COMPANY.phone} · ${COMPANY.email}</div></div>
      <div><div class="doc-title">Purchase Order</div><div class="doc-number">${po.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock('Vendor', { name: po.vendor_name, number: po.bp_number, address: po.vendor_address, city: po.vendor_city, country: po.vendor_country, email: po.vendor_email })}
      ${infoBlock('Order Details', [
        ['Order Date', formatDate(po.order_date)],
        ['Delivery Date', formatDate(po.delivery_date)],
        ['Payment Terms', po.payment_term || '—'],
        ['Currency', po.currency || 'USD'],
        ['Status', po.status?.toUpperCase()],
      ])}
    </div>
    ${po.notes ? `<div class="notes"><strong>Notes:</strong> ${po.notes}</div>` : ''}
    ${itemsTable(po.items || [], [
      { key: 'line_number', label: '#' },
      { label: 'Material', render: i => `${i.material_code || ''} ${i.material_name || i.description || ''}` },
      { label: 'Qty', align: 'right', render: i => `${i.quantity} ${i.uom_code || ''}` },
      { label: 'Unit Price', align: 'right', render: i => formatCurrency(i.unit_price) },
      { label: 'Tax', align: 'right', render: i => formatCurrency(i.tax_amount) },
      { label: 'Total', align: 'right', render: i => formatCurrency(i.total_amount) },
    ])}
    ${totalsBlock([
      { label: 'Subtotal', value: formatCurrency(po.subtotal) },
      { label: 'Tax', value: formatCurrency(po.tax_amount) },
      { label: 'Total Amount', value: formatCurrency(po.total_amount), grand: true },
    ])}
    ${signatureBlock()}`;
  openPrintWindow(buildHTML('Purchase Order', po.doc_number, content));
}

export function printSalesOrder(so) {
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}<br>${COMPANY.phone} · ${COMPANY.email}</div></div>
      <div><div class="doc-title">Sales Order</div><div class="doc-number">${so.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock('Bill To', { name: so.customer_name, number: so.bp_number })}
      ${infoBlock('Order Details', [
        ['Order Date', formatDate(so.order_date)],
        ['Delivery Date', formatDate(so.delivery_date)],
        ['Currency', so.currency || 'USD'],
        ['Status', so.status?.toUpperCase()],
      ])}
    </div>
    ${itemsTable(so.items || [], [
      { key: 'line_number', label: '#' },
      { label: 'Material', render: i => `${i.material_code || ''} ${i.material_name || i.description || ''}` },
      { label: 'Qty', align: 'right', render: i => `${i.quantity} ${i.uom_code || ''}` },
      { label: 'Unit Price', align: 'right', render: i => formatCurrency(i.unit_price) },
      { label: 'Total', align: 'right', render: i => formatCurrency(i.total_amount) },
    ])}
    ${totalsBlock([
      { label: 'Subtotal', value: formatCurrency(so.subtotal) },
      { label: 'Tax', value: formatCurrency(so.tax_amount) },
      { label: 'Total', value: formatCurrency(so.total_amount), grand: true },
    ])}
    ${signatureBlock()}`;
  openPrintWindow(buildHTML('Sales Order', so.doc_number, content));
}

export function printQuotation(qt) {
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}<br>${COMPANY.phone} · ${COMPANY.email}</div></div>
      <div><div class="doc-title">Quotation</div><div class="doc-number">${qt.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock('Customer', { name: qt.customer_name, number: qt.bp_number, email: qt.customer_email })}
      ${infoBlock('Quotation Details', [
        ['Date', formatDate(qt.quotation_date)],
        ['Valid Until', formatDate(qt.valid_until)],
        ['Currency', qt.currency || 'USD'],
      ])}
    </div>
    ${itemsTable(qt.items || [], [
      { key: 'line_number', label: '#' },
      { label: 'Material', render: i => `${i.material_code || ''} ${i.material_name || i.description || ''}` },
      { label: 'Qty', align: 'right', render: i => `${i.quantity} ${i.uom_code || ''}` },
      { label: 'Price', align: 'right', render: i => formatCurrency(i.unit_price) },
      { label: 'Total', align: 'right', render: i => formatCurrency(i.total_amount) },
    ])}
    ${totalsBlock([
      { label: 'Subtotal', value: formatCurrency(qt.subtotal) },
      { label: 'Tax', value: formatCurrency(qt.tax_amount) },
      { label: 'Total', value: formatCurrency(qt.total_amount), grand: true },
    ])}
    <div style="margin-top:30px;font-size:11px;color:#64748b;">
      <p>This quotation is valid until ${formatDate(qt.valid_until) || 'further notice'}. Prices are in ${qt.currency || 'USD'}.</p>
      <p style="margin-top:8px;">Thank you for your business.</p>
    </div>`;
  openPrintWindow(buildHTML('Quotation', qt.doc_number, content));
}

export function printInvoice(inv, type = 'AP') {
  const isAR = type === 'AR';
  const partnerLabel = isAR ? 'Bill To' : 'Vendor';
  const partnerName = isAR ? inv.customer_name : inv.vendor_name;
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}<br>${COMPANY.phone} · ${COMPANY.email}<br>Tax ID: ${COMPANY.tax_id}</div></div>
      <div><div class="doc-title">${isAR ? 'Invoice' : 'Vendor Invoice'}</div><div class="doc-number">${inv.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock(partnerLabel, { name: partnerName, number: inv.bp_number })}
      ${infoBlock('Invoice Details', [
        ['Invoice Date', formatDate(inv.invoice_date)],
        ['Due Date', formatDate(inv.due_date)],
        ['Reference', inv.reference || '—'],
        ['Currency', inv.currency || 'USD'],
        ['Status', inv.status?.toUpperCase()],
      ])}
    </div>
    ${inv.description ? `<div class="notes"><strong>Description:</strong> ${inv.description}</div>` : ''}
    ${totalsBlock([
      { label: 'Subtotal', value: formatCurrency(inv.subtotal) },
      { label: 'Tax', value: formatCurrency(inv.tax_amount) },
      { label: 'Total Amount', value: formatCurrency(inv.total_amount), grand: true },
      { label: 'Amount Paid', value: formatCurrency(inv.paid_amount) },
      { label: 'Balance Due', value: formatCurrency(parseFloat(inv.total_amount || 0) - parseFloat(inv.paid_amount || 0)), grand: true },
    ])}
    ${signatureBlock()}`;
  openPrintWindow(buildHTML(isAR ? 'Invoice' : 'Vendor Invoice', inv.doc_number, content));
}

export function printPayment(pay) {
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}<br>${COMPANY.phone} · ${COMPANY.email}</div></div>
      <div><div class="doc-title">Payment ${pay.payment_type === 'incoming' ? 'Receipt' : 'Voucher'}</div><div class="doc-number">${pay.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock(pay.payment_type === 'incoming' ? 'Received From' : 'Paid To', { name: pay.bp_name, number: pay.bp_number })}
      ${infoBlock('Payment Details', [
        ['Payment Date', formatDate(pay.payment_date)],
        ['Method', (pay.payment_method || '').replace('_', ' ')],
        ['Reference', pay.reference || '—'],
        ['Status', pay.status?.toUpperCase()],
      ])}
    </div>
    <div style="text-align:center;margin:30px 0;padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
      <p style="font-size:12px;color:#64748b;margin-bottom:4px;">Amount</p>
      <p style="font-size:32px;font-weight:700;color:#1e293b;">${formatCurrency(pay.amount)}</p>
    </div>
    ${pay.description ? `<div class="notes"><strong>Description:</strong> ${pay.description}</div>` : ''}
    ${signatureBlock()}`;
  openPrintWindow(buildHTML('Payment', pay.doc_number, content));
}

export function printDelivery(del) {
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}</div></div>
      <div><div class="doc-title">Delivery Note</div><div class="doc-number">${del.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock('Ship To', { name: del.customer_name, address: del.ship_to_address })}
      ${infoBlock('Delivery Details', [
        ['Delivery Date', formatDate(del.delivery_date)],
        ['Sales Order', del.so_number || '—'],
        ['Shipping Method', del.shipping_method || '—'],
        ['Tracking #', del.tracking_number || '—'],
        ['Status', del.status?.toUpperCase()],
      ])}
    </div>
    ${signatureBlock()}`;
  openPrintWindow(buildHTML('Delivery Note', del.doc_number, content));
}

export function printJournalEntry(je) {
  const lines = (je.lines || []).map((l, i) => `<tr>
    <td>${l.line_number}</td>
    <td>${l.account_code} — ${l.account_name}</td>
    <td>${l.description || '—'}</td>
    <td class="text-right">${parseFloat(l.debit_amount) > 0 ? formatCurrency(l.debit_amount) : ''}</td>
    <td class="text-right">${parseFloat(l.credit_amount) > 0 ? formatCurrency(l.credit_amount) : ''}</td>
  </tr>`).join('');

  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}</div></div>
      <div><div class="doc-title">Journal Entry</div><div class="doc-number">${je.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${infoBlock('Entry Details', [
        ['Posting Date', formatDate(je.posting_date)],
        ['Document Date', formatDate(je.document_date)],
        ['Reference', je.reference || '—'],
        ['Status', je.status?.toUpperCase()],
      ])}
      ${infoBlock('Description', [[je.description || 'No description', '']])}
    </div>
    <table><thead><tr><th>#</th><th>Account</th><th>Description</th><th class="text-right">Debit</th><th class="text-right">Credit</th></tr></thead>
    <tbody>${lines}</tbody>
    <tfoot><tr style="background:#f1f5f9;font-weight:600;"><td colspan="3" style="text-align:right;border:1px solid #e2e8f0;padding:8px 12px;">Total</td>
    <td class="text-right" style="border:1px solid #e2e8f0;padding:8px 12px;">${formatCurrency(je.total_debit)}</td>
    <td class="text-right" style="border:1px solid #e2e8f0;padding:8px 12px;">${formatCurrency(je.total_credit)}</td></tr></tfoot></table>`;
  openPrintWindow(buildHTML('Journal Entry', je.doc_number, content));
}

export function printBilling(bill) {
  const content = `
    <div class="header">
      <div><div class="company-name">${COMPANY.name}</div><div class="company-info">${COMPANY.address}<br>${COMPANY.phone} · ${COMPANY.email}<br>Tax ID: ${COMPANY.tax_id}</div></div>
      <div><div class="doc-title">Invoice</div><div class="doc-number">${bill.doc_number}</div></div>
    </div>
    <div class="meta-grid">
      ${partnerBlock('Bill To', { name: bill.customer_name })}
      ${infoBlock('Billing Details', [
        ['Billing Date', formatDate(bill.billing_date)],
        ['Due Date', formatDate(bill.due_date)],
        ['Sales Order', bill.so_number || '—'],
        ['Currency', bill.currency || 'USD'],
      ])}
    </div>
    ${totalsBlock([
      { label: 'Subtotal', value: formatCurrency(bill.subtotal) },
      { label: 'Tax', value: formatCurrency(bill.tax_amount) },
      { label: 'Total', value: formatCurrency(bill.total_amount), grand: true },
      { label: 'Paid', value: formatCurrency(bill.paid_amount) },
      { label: 'Balance Due', value: formatCurrency(parseFloat(bill.total_amount || 0) - parseFloat(bill.paid_amount || 0)), grand: true },
    ])}
    ${signatureBlock()}`;
  openPrintWindow(buildHTML('Invoice', bill.doc_number, content));
}

function openPrintWindow(html) {
  const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(html);
  w.document.close();
}
