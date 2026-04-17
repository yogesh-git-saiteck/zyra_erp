import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Loader2, AlertCircle, CheckCircle2, Info, ChevronUp, ChevronDown, ChevronsUpDown, Trash2 } from 'lucide-react';

export function Spinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' };
  return <Loader2 className={`${sizes[size]} animate-spin text-blue-600 ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-12 h-12 border-2 border-gray-200 rounded-full" />
          <div className="w-12 h-12 border-2 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0" />
        </div>
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    submitted: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    confirmed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    completed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    rejected: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    cancelled: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
    active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    inactive: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
    posted: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    in_process: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    processing: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    delivered: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    partially_received: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    partially_delivered: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    invoiced: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    open: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    customer: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
    vendor: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    employee: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    partner: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  const display = (status || '').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${colors[status] || colors.draft}`}>
      {display}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none transition-all" />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <X className="w-3 h-3 text-gray-400" />
        </button>
      )}
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children, size = 'md', footer, error, onClearError, icon: Icon }) {
  const overlayRef = useRef(null);
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);
  if (!isOpen) return null;
  const sizes = { 
    sm: 'max-w-sm', 
    md: 'max-w-2xl', 
    lg: 'max-w-4xl', 
    xl: 'max-w-6xl', 
    full: 'max-w-full' 
  };
  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${sizes[size]} w-full bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-2xl/50 flex flex-col max-h-[90vh] overflow-hidden transform transition-all animate-scale-in`}>
        {/* Enhanced Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-transparent dark:from-gray-800/50 dark:to-transparent">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="px-6 py-5 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {error && (
            <div className="mb-5 p-4 bg-gradient-to-r from-rose-50 to-rose-50/50 dark:from-rose-900/20 dark:to-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-3 animate-slide-in">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</p>
              </div>
              {onClearError && (
                <button 
                  onClick={onClearError} 
                  className="text-rose-400 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 p-1 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Alert({ type = 'info', message, onClose }) {
  const config = {
    success: { icon: CheckCircle2, bgColor: 'bg-emerald-50 dark:bg-emerald-900/20', borderColor: 'border-emerald-200 dark:border-emerald-800', textColor: 'text-emerald-800 dark:text-emerald-300', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    error: { icon: AlertCircle, bgColor: 'bg-rose-50 dark:bg-rose-900/20', borderColor: 'border-rose-200 dark:border-rose-800', textColor: 'text-rose-800 dark:text-rose-300', iconColor: 'text-rose-600 dark:text-rose-400' },
    warning: { icon: AlertCircle, bgColor: 'bg-amber-50 dark:bg-amber-900/20', borderColor: 'border-amber-200 dark:border-amber-800', textColor: 'text-amber-800 dark:text-amber-300', iconColor: 'text-amber-600 dark:text-amber-400' },
    info: { icon: Info, bgColor: 'bg-blue-50 dark:bg-blue-900/20', borderColor: 'border-blue-200 dark:border-blue-800', textColor: 'text-blue-800 dark:text-blue-300', iconColor: 'text-blue-600 dark:text-blue-400' },
  };
  const { icon: Icon, bgColor, borderColor, textColor, iconColor } = config[type];
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${bgColor} ${borderColor} animate-slide-in`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
      <p className={`text-sm flex-1 font-medium ${textColor}`}>{message}</p>
      {onClose && <button onClick={onClose} className={`p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors shrink-0 ${iconColor}`}><X className="w-4 h-4" /></button>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="w-12 h-12 text-gray-300 mb-4" />}
      <h3 className="text-lg font-medium text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4 max-w-md">{description}</p>}
      {action}
    </div>
  );
}

export function DataTable({ columns, data, loading, onRowClick, emptyMessage = 'No data found', selectable, selectedIds, onSelectionChange, compact }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  if (loading) return <PageLoader />;
  if (!data?.length) return <div className="text-center py-12 text-gray-400 text-sm">{emptyMessage}</div>;

  const handleSort = (key) => {
    if (!key) return;
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedData = sortKey ? [...data].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  }) : data;

  const allSelected = selectable && data.length > 0 && data.every(r => selectedIds?.includes(r.id));
  const someSelected = selectable && data.some(r => selectedIds?.includes(r.id));
  const toggleAll = () => { if (!onSelectionChange) return; onSelectionChange(allSelected ? [] : data.map(r => r.id)); };
  const toggleOne = (id) => { if (!onSelectionChange) return; onSelectionChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]); };
  const px = compact ? 'px-2' : 'px-3';
  const py = compact ? 'py-1.5' : 'py-2';
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
            {selectable && <th className={`${px} ${py} w-8`}><input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={toggleAll} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5" /></th>}
            {columns.map(col => {
              const sortable = col.label && col.key;
              const isActive = sortKey === col.key;
              return (
                <th key={col.key}
                  onClick={() => sortable && handleSort(col.key)}
                  className={`${px} ${py} text-left text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap ${col.className || ''} ${sortable ? 'cursor-pointer select-none hover:text-blue-500 dark:hover:text-blue-400 group' : ''}`}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortable && (
                      <span className={`inline-flex ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-300 dark:text-gray-600 group-hover:text-blue-400'}`}>
                        {isActive ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3" />}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, i) => (
            <tr key={row.id || i} className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-blue-50/40 dark:hover:bg-gray-800/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${selectable && selectedIds?.includes(row.id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : i % 2 === 1 ? 'bg-gray-50/30 dark:bg-gray-900/30' : ''}`}
              onClick={() => onRowClick?.(row)}>
              {selectable && <td className={`${px} ${py}`} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds?.includes(row.id) || false} onChange={() => toggleOne(row.id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-3.5 h-3.5" /></td>}
              {columns.map(col => (
                <td key={col.key} className={`${px} ${py} text-[13px] text-gray-700 dark:text-gray-300 whitespace-nowrap ${col.className || ''}`}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 0 && <div className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">{sortedData.length} record{sortedData.length !== 1 ? 's' : ''}{sortKey ? ` · sorted by ${sortKey.replace(/_/g,' ')} ${sortDir}` : ''}</div>}
    </div>
  );
}

export function BulkActionBar({ count, onDelete, onClear }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
      <span className="text-sm font-medium text-rose-700 dark:text-rose-400">{count} selected</span>
      <button onClick={onDelete} className="px-3 py-1 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all">Delete Selected</button>
      <button onClick={onClear} className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Clear</button>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map(tab => (
        <button key={tab.key} onClick={() => onChange(tab.key)}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200
            ${active === tab.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
          {tab.label}
          {tab.count != null && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${active === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function FormField({ label, required, error, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {label} {required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

export function DeleteConfirm({ item, onConfirm, onCancel, label }) {
  if (!item) return null;
  return (
    <Modal 
      isOpen={!!item} 
      onClose={onCancel} 
      title="Delete Item" 
      size="sm"
      icon={Trash2}
      footer={
        <div className="flex items-center gap-3">
          <button 
            onClick={onCancel} 
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200">
            Keep It
          </button>
          <button 
            onClick={() => onConfirm(item.id)} 
            className="px-4 py-2 text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      }>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Are you sure you want to delete <strong className="text-gray-900 dark:text-gray-100">{label || item.doc_number || item.display_name || item.name || item.id}</strong>?
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">This action cannot be undone and will permanently remove this item from the system.</p>
    </Modal>
  );
}


export function SearchableSelect({ value, onChange, options = [], placeholder = 'Select...', className = '', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 });

  const selected = options.find(o => String(o.value) === String(value));
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  const openMenu = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const menuH = Math.min(260, filtered.length * 30 + 60);
      const above = (window.innerHeight - rect.bottom) < menuH && rect.top > menuH;
      setPos({ top: above ? rect.top - menuH : rect.bottom, left: rect.left, width: Math.max(rect.width, 220) });
    }
    setOpen(v => !v);
    setSearch('');
  };

  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 10); }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!triggerRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (val) => { onChange(val); setOpen(false); setSearch(''); };

  return (
    <>
      <button type="button" ref={triggerRef} onClick={openMenu} disabled={disabled}
        className={`${className} inline-flex items-center justify-between gap-1 text-left ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
        <span className={`flex-1 truncate ${!selected ? 'text-gray-400 dark:text-gray-500' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-1.5 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-800 focus:outline-none focus:border-blue-400 text-gray-900 dark:text-gray-100" />
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
            {value && <button type="button" onClick={() => pick('')} className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800">— Clear —</button>}
            {filtered.length === 0
              ? <div className="px-3 py-4 text-xs text-center text-gray-400">No results</div>
              : filtered.map(o => (
                <button type="button" key={o.value} onClick={() => pick(o.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 ${String(o.value) === String(value) ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                  {o.label}
                </button>
              ))}
          </div>
          <div className="px-3 py-1 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            {filtered.length} of {options.length} options
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function DownloadButton({ data, columns, filename = 'export', label = 'Download' }) {
  const handleClick = () => {
    if (!data?.length) return;
    const cols = columns || Object.keys(data[0]).filter(k => !k.match(/^id$|_id$|password|token|secret/i)).map(k => ({ key: k, label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }));
    const header = cols.map(c => `"${(c.label || c.key || '').replace(/"/g, '""')}"`).join(',');
    const rows = data.map(row => cols.map(c => {
      let val = c.exportRender ? c.exportRender(row[c.key], row) : (row[c.key] ?? '');
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(','));
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };
  return (
    <button onClick={handleClick} className="btn-secondary flex items-center gap-1.5 text-xs" disabled={!data?.length} title="Download as Excel/CSV">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      {label}
    </button>
  );
}
