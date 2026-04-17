import { useState, useEffect, useRef } from 'react';
import { X, Printer, FileText, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import api from '../../utils/api';

/**
 * PrintFormatModal
 * Props:
 *   entityType  — e.g. 'purchase_order'
 *   entityId    — UUID of the document
 *   docNumber   — display name like 'PO-10001'
 *   onClose     — callback to close the modal
 */
export default function PrintFormatModal({ entityType, entityId, docNumber, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);

  // Load templates for this entity type
  useEffect(() => {
    setLoading(true);
    api.get('/platform/print-templates')
      .then(r => {
        const list = (r?.data || []).filter(t => t.entity_type === entityType);
        setTemplates(list);
        // Auto-select default or first
        const def = list.find(t => t.is_default) || list[0];
        if (def) selectTemplate(def, true);
        else setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [entityType, entityId]);

  const selectTemplate = async (tpl, initial = false) => {
    if (!initial) setPreviewLoading(true);
    setSelected(tpl);
    try {
      const token = localStorage.getItem('nexus_token') || '';
      const res = await fetch(
        `/api/platform/print-templates/${tpl.id}/render${entityId ? `?entity_id=${entityId}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to render template');
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e) {
      setPreviewHtml(`<body style="font-family:sans-serif;padding:40px;color:#ef4444;"><h3>Preview error</h3><p>${e.message}</p></body>`);
    } finally {
      setLoading(false);
      setPreviewLoading(false);
    }
  };

  const handlePrint = () => {
    if (!iframeRef.current) return;
    const iframeWin = iframeRef.current.contentWindow;
    if (iframeWin) {
      iframeWin.focus();
      iframeWin.print();
    }
  };

  // Inject HTML into iframe via srcDoc
  useEffect(() => {
    if (iframeRef.current && previewHtml) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden transform transition-all animate-scale-in">
        {/* Enhanced Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-50 to-transparent dark:from-gray-800/50 dark:to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Print Document</h2>
              {docNumber && <p className="text-sm text-gray-500 dark:text-gray-400">{docNumber}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!previewHtml || previewLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Print
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Template list */}
          <div className="w-60 shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto bg-gray-50 dark:bg-gray-800/30 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Print Templates</p>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {loading && !templates.length ? (
                <div className="flex justify-center items-center py-12"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
              ) : error ? (
                <div className="px-4 py-6 flex flex-col items-center text-center">
                  <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
              ) : !templates.length ? (
                <div className="px-4 py-8 flex flex-col items-center text-center">
                  <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">No templates available</p>
                </div>
              ) : (
                <ul className="p-2 space-y-1">
                  {templates.map(tpl => (
                    <li key={tpl.id}>
                      <button
                        onClick={() => selectTemplate(tpl)}
                        className={`w-full text-left px-3 py-3 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-between gap-2 group
                          ${selected?.id === tpl.id
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/50'}`}
                      >
                        <span className="truncate">{tpl.template_name}</span>
                        {tpl.is_default && (
                          <span className={`text-[10px] px-2 py-1 rounded font-semibold shrink-0 ${selected?.id === tpl.id ? 'bg-blue-500 text-blue-100' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            Default
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Preview area */}
          <div className="flex-1 bg-gray-50 dark:bg-gray-950 overflow-hidden relative flex flex-col">
            {(loading || previewLoading) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-950/80 z-10 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">Loading preview...</p>
                </div>
              </div>
            )}
            {previewHtml ? (
              <iframe
                ref={iframeRef}
                title="print-preview"
                className="w-full h-full border-0"
                sandbox="allow-same-origin allow-scripts allow-modals"
              />
            ) : !loading && templates.length > 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Select a template to preview</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
