import { useState, useEffect } from 'react';
import { Download, MessageSquare, Send, Clock, Star, StarOff } from 'lucide-react';
import api from '../../utils/api';
import { formatDateTime, timeAgo } from '../../utils/formatters';

// ============================
// EXPORT CSV BUTTON
// ============================
export function ExportButton({ entity, label = 'Export CSV', className = '' }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/shared/export/${entity}`);
      const rows = res?.data || [];
      if (!rows.length) { alert('No data to export'); return; }
      const cols = Object.keys(rows[0]);
      const csv = [cols.join(','), ...rows.map(r => cols.map(c => `"${(r[c] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${entity}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <button onClick={handleExport} disabled={loading}
      className={`btn-secondary flex items-center gap-2 text-sm ${className}`}>
      <Download className="w-4 h-4" /> {loading ? 'Exporting...' : label}
    </button>
  );
}

// ============================
// COMMENTS / NOTES PANEL
// ============================
export function CommentsPanel({ entityType, entityId }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (entityId) loadComments(); }, [entityId]);

  const loadComments = async () => {
    try { const r = await api.get(`/shared/comments/${entityType}/${entityId}`); setComments(r?.data || []); }
    catch {} finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!text.trim()) return;
    try {
      await api.post('/shared/comments', { entity_type: entityType, entity_id: entityId, comment_text: text });
      setText(''); loadComments();
    } catch {}
  };

  if (!entityId) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes ({comments.length})</span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
        {comments.map(c => (
          <div key={c.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.author_name}</span>
              <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{c.comment_text}</p>
          </div>
        ))}
        {!loading && comments.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No notes yet</p>}
      </div>

      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="input-field text-sm flex-1" placeholder="Add a note..." />
        <button onClick={handleAdd} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ============================
// STATUS TIMELINE
// ============================
export function StatusTimeline({ entityType, entityId }) {
  const [timeline, setTimeline] = useState([]);

  useEffect(() => { if (entityId) loadTimeline(); }, [entityId]);

  const loadTimeline = async () => {
    try { const r = await api.get(`/shared/timeline/${entityType}/${entityId}`); setTimeline(r?.data || []); }
    catch {}
  };

  if (!entityId || !timeline.length) return null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status History</span>
      </div>
      <div className="relative pl-6">
        <div className="absolute left-2 top-1 bottom-1 w-0.5 bg-gray-200 dark:bg-gray-700" />
        {timeline.map((t, i) => (
          <div key={i} className="relative mb-3 last:mb-0">
            <div className={`absolute -left-4 top-1 w-3 h-3 rounded-full border-2 
              ${i === timeline.length - 1 ? 'bg-blue-500 border-blue-300' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`} />
            <div className="ml-2">
              <div className="flex items-center gap-2">
                {t.old_status && <span className="text-xs text-gray-400 line-through capitalize">{t.old_status}</span>}
                {t.old_status && <span className="text-xs text-gray-400">→</span>}
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">{t.new_status}</span>
              </div>
              <p className="text-[10px] text-gray-400">{t.changed_by_name} · {formatDateTime(t.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================
// FAVORITE / BOOKMARK BUTTON
// ============================
export function FavButton({ path, label }) {
  const [favorites, setFavorites] = useState([]);
  const [isFav, setIsFav] = useState(false);
  const [favId, setFavId] = useState(null);

  useEffect(() => { loadFavorites(); }, []);

  const loadFavorites = async () => {
    try {
      const r = await api.get('/shared/favorites');
      const favs = r?.data || [];
      setFavorites(favs);
      const match = favs.find(f => f.path === path);
      setIsFav(!!match); setFavId(match?.id);
    } catch {}
  };

  const toggle = async () => {
    try {
      if (isFav && favId) { await api.delete(`/shared/favorites/${favId}`); setIsFav(false); }
      else { const r = await api.post('/shared/favorites', { path, label }); setIsFav(true); setFavId(r?.data?.id); }
    } catch {}
  };

  return (
    <button onClick={toggle} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title={isFav ? 'Remove bookmark' : 'Bookmark'}>
      {isFav ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : <StarOff className="w-4 h-4 text-gray-400" />}
    </button>
  );
}

// ============================
// BULK IMPORT/EXPORT (Excel)
// ============================
export function BulkImportExport({ entity, label, onImportComplete }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const downloadTemplate = () => {
    const token = localStorage.getItem('nexus_token');
    const a = document.createElement('a');
    a.href = `/api/bulk/template/${entity}`;
    // Use fetch to include auth header
    fetch(`/api/bulk/template/${entity}`, { headers: { 'Authorization': `Bearer ${token}` }})
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `Zyra_${entity}_template.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setResult({ created: 0, errors: [{ row: 0, error: 'Please upload an .xlsx file' }] });
      setShowResult(true);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('nexus_token');
      const res = await fetch(`/api/bulk/import/${entity}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
      setResult(data.data);
      setShowResult(true);
      if (data.data?.created > 0 && onImportComplete) onImportComplete();
    } catch (err) {
      setResult({ created: 0, errors: [{ row: 0, error: err.message }] });
      setShowResult(true);
    } finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-1.5 text-sm" title="Download Excel template">
          <Download className="w-3.5 h-3.5" /> Template
        </button>
        <label className={`btn-secondary flex items-center gap-1.5 text-sm cursor-pointer ${uploading ? 'opacity-50' : ''}`} title="Upload filled Excel">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          {uploading ? 'Uploading...' : 'Import Excel'}
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {showResult && result && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowResult(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">Import Results</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-700">{result.created || 0}</p>
                <p className="text-xs text-green-600">Created</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-500">{result.skipped || 0}</p>
                <p className="text-xs text-gray-500">Skipped</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-700">{result.errors?.length || 0}</p>
                <p className="text-xs text-red-600">Errors</p>
              </div>
            </div>
            {result.errors?.length > 0 && (
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0"><tr><th className="px-2 py-1 text-left">Row</th><th className="px-2 py-1 text-left">Error</th></tr></thead>
                  <tbody>{result.errors.map((e, i) => (
                    <tr key={i} className="border-t"><td className="px-2 py-1 font-mono">{e.row}</td><td className="px-2 py-1 text-red-600">{e.name ? `${e.name}: ` : ''}{e.error}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <button onClick={() => setShowResult(false)} className="btn-primary w-full mt-4">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
