export function printDocument(title, contentHtml) {
  const win = window.open('', '_blank', 'width=800,height=600');
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #333; font-size: 12px; }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
  .header h1 { font-size: 18px; color: #1e40af; margin: 0; }
  .header p { margin: 2px 0; color: #666; font-size: 11px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 15px; }
  .info-box { border: 1px solid #e5e7eb; padding: 6px 8px; border-radius: 4px; }
  .info-box .label { font-size: 9px; color: #999; text-transform: uppercase; }
  .info-box .value { font-weight: 600; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #f8fafc; border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; }
  td { border: 1px solid #e5e7eb; padding: 5px 8px; font-size: 11px; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .totals { margin-top: 10px; text-align: right; font-size: 12px; }
  .totals .row { display: flex; justify-content: flex-end; gap: 20px; padding: 3px 0; }
  .totals .grand { font-size: 14px; font-weight: 700; border-top: 2px solid #333; padding-top: 5px; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; }
  .footer .sig { text-align: center; border-top: 1px solid #999; padding-top: 5px; width: 150px; font-size: 10px; color: #666; }
  @media print { body { margin: 0; } }
</style></head><body>${contentHtml}
<script>window.onload=function(){window.print();}</script>
</body></html>`);
  win.document.close();
}

export function buildPrintHTML(doc, items, type = 'Invoice') {
  const sub = items.reduce((s, it) => s + parseFloat(it.quantity||0) * parseFloat(it.unit_price||0) * (1 - parseFloat(it.discount_percent||0)/100), 0);
  const cgst = parseFloat(doc.cgst_amount || 0);
  const sgst = parseFloat(doc.sgst_amount || 0);
  const igst = parseFloat(doc.igst_amount || 0);
  const total = parseFloat(doc.total_amount || sub + cgst + sgst + igst);

  let itemRows = items.map((it, i) => {
    const lineAmt = parseFloat(it.quantity||0) * parseFloat(it.unit_price||0) * (1 - parseFloat(it.discount_percent||0)/100);
    const itCgst = lineAmt * parseFloat(it.cgst_rate||0) / 100;
    const itSgst = lineAmt * parseFloat(it.sgst_rate||0) / 100;
    const itIgst = lineAmt * parseFloat(it.igst_rate||0) / 100;
    return `<tr>
      <td class="text-center">${i+1}</td>
      <td>${it.material_code ? it.material_code + ' — ' : ''}${it.material_name || it.description || ''}</td>
      <td class="text-center">${it.hsn_code || ''}</td>
      <td class="text-right">${parseFloat(it.quantity||0).toFixed(3)}</td>
      <td class="text-right">${parseFloat(it.unit_price||0).toFixed(2)}</td>
      ${igst > 0 ? `<td class="text-right">${itIgst.toFixed(2)}</td>` : `<td class="text-right">${itCgst.toFixed(2)}</td><td class="text-right">${itSgst.toFixed(2)}</td>`}
      <td class="text-right">${lineAmt.toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="header">
      <h1>${type} — ${doc.doc_number || ''}</h1>
      <p>${doc.company_name || 'Zyra ERP'}</p>
    </div>
    <div class="info-grid">
      <div class="info-box"><div class="label">${type.includes('Purchase') || type.includes('AP') ? 'Vendor' : 'Customer'}</div><div class="value">${doc.customer_name || doc.vendor_name || ''}</div></div>
      <div class="info-box"><div class="label">Date</div><div class="value">${doc.order_date || doc.billing_date || doc.invoice_date || doc.quotation_date || ''}</div></div>
      <div class="info-box"><div class="label">Place of Supply</div><div class="value">${doc.place_of_supply || '—'}</div></div>
      <div class="info-box"><div class="label">GSTIN</div><div class="value">${doc.customer_gstin || doc.vendor_gstin || '—'}</div></div>
    </div>
    <table>
      <thead><tr><th class="text-center">#</th><th>Material / Description</th><th class="text-center">HSN</th><th class="text-right">Qty</th><th class="text-right">Price</th>
      ${igst > 0 ? '<th class="text-right">IGST</th>' : '<th class="text-right">CGST</th><th class="text-right">SGST</th>'}
      <th class="text-right">Amount</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal:</span><strong>₹${sub.toFixed(2)}</strong></div>
      ${cgst > 0 ? `<div class="row"><span>CGST:</span><strong>₹${cgst.toFixed(2)}</strong></div>` : ''}
      ${sgst > 0 ? `<div class="row"><span>SGST:</span><strong>₹${sgst.toFixed(2)}</strong></div>` : ''}
      ${igst > 0 ? `<div class="row"><span>IGST:</span><strong>₹${igst.toFixed(2)}</strong></div>` : ''}
      <div class="row grand"><span>Total:</span><strong>₹${total.toFixed(2)}</strong></div>
    </div>
    <div class="footer">
      <div class="sig">Prepared By</div>
      <div class="sig">Authorized Signatory</div>
    </div>`;
}
