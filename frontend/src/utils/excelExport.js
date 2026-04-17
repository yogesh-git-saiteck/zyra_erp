// Excel export utility — generates .xlsx-compatible XML spreadsheet
// No external library needed

export function exportToExcel(data, columns, filename = 'export') {
  if (!data?.length) { alert('No data to export'); return; }

  // Build column headers from columns config or data keys
  const cols = columns || Object.keys(data[0]).map(k => ({ key: k, label: k }));
  
  // Build CSV with BOM for Excel UTF-8 compatibility
  const header = cols.map(c => `"${(c.label || c.key || '').replace(/"/g, '""')}"`).join(',');
  const rows = data.map(row => 
    cols.map(c => {
      let val = row[c.key] ?? '';
      // Use exportRender if provided, else raw value
      if (c.exportRender) val = c.exportRender(row[c.key], row);
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  
  const csv = '\uFEFF' + [header, ...rows].join('\n'); // BOM + CSV
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Quick export from any array — auto-detects columns
export function quickExport(data, filename = 'export') {
  if (!data?.length) { alert('No data to export'); return; }
  const keys = Object.keys(data[0]).filter(k => !k.match(/^id$|_id$|password|token|secret/i));
  const cols = keys.map(k => ({ key: k, label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
  exportToExcel(data, cols, filename);
}
