import { useState, useEffect, useRef } from 'react';
import { QrCode, Barcode as BarcodeIcon, Search, Camera, Zap, ArrowRight } from 'lucide-react';
import { DataTable, Alert, PageLoader, FormField , DownloadButton } from '../../components/common/index';
import { BarcodeDisplay } from '../../components/common/BarcodeComponents';
import api from '../../utils/api';

export default function BarcodeHub() {
  const [tab, setTab] = useState('scanner');
  const [entityConfig, setEntityConfig] = useState([]);
  const [barcodeTypes, setBarcodeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  // Scanner state
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef(null);

  useEffect(() => { loadConfig(); }, []);
  useEffect(() => { if (tab === 'scanner') setTimeout(() => scanRef.current?.focus(), 200); }, [tab]);

  const loadConfig = async () => {
    try {
      const [cfg, types] = await Promise.all([api.get('/barcode/config').catch(()=>null), api.get('/barcode/types').catch(()=>null)]);
      setEntityConfig(cfg?.data || []); setBarcodeTypes(types?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleScan = async () => {
    if (!scanInput.trim()) return;
    setScanning(true); setScanResult(null);
    try {
      const r = await api.post('/barcode/scan', { scanned_data: scanInput.trim() });
      setScanResult(r?.data);
      if (!r?.data?.found) setAlert({ type: 'warning', message: 'No matching record found for scanned data' });
    } catch (err) { setAlert({ type: 'error', message: err.message }); }
    finally { setScanning(false); }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleScan(); };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Barcode & QR Code</h1><p className="text-sm text-gray-400 mt-1">Scan, generate, and print barcodes across all modules</p></div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ key: 'scanner', label: 'Scanner', icon: Camera }, { key: 'entities', label: 'Supported Entities', icon: QrCode }, { key: 'types', label: 'Barcode Types', icon: BarcodeIcon }]
          .map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
      </div>

      {/* SCANNER */}
      {tab === 'scanner' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Camera className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Barcode Scanner</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Scan a barcode using a USB/Bluetooth scanner, or paste/type the code manually. The system will look up the record across all modules.
            </p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-11 pr-4 py-3 text-lg font-mono bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600
                    rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-gray-100"
                  placeholder="Scan or type barcode..." autoFocus />
              </div>
              <button onClick={handleScan} disabled={scanning}
                className="btn-primary px-6 flex items-center gap-2 text-lg">
                <Zap className="w-5 h-5" /> {scanning ? 'Looking up...' : 'Lookup'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Supports: Code128, EAN-13, QR Code JSON, plain text codes</p>
          </div>

          {/* Scan Result */}
          {scanResult && (
            <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 ${scanResult.found ? 'border-l-4 border-emerald-500' : 'border-l-4 border-amber-500'}`}>
              {scanResult.found ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                      <QrCode className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{scanResult.entity_label}</p>
                      <p className="text-xs text-gray-400">Code: <span className="font-mono font-medium">{scanResult.code}</span></p>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(scanResult.record || {}).filter(([k]) => !['id', 'password_hash', 'created_at', 'updated_at'].includes(k)).map(([k, v]) => (
                          <tr key={k} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="py-1.5 pr-4 text-xs text-gray-500 capitalize font-medium w-40">{k.replace(/_/g, ' ')}</td>
                            <td className="py-1.5 text-sm text-gray-900 dark:text-gray-100 font-mono">{v !== null ? String(v) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                    <Search className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No Record Found</p>
                    <p className="text-xs text-gray-400">Scanned: <span className="font-mono">{scanResult.scanned_data}</span></p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUPPORTED ENTITIES */}
      {tab === 'entities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entityConfig.map(e => (
            <div key={e.entity_key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {e.barcode_type === 'qrcode' ? <QrCode className="w-5 h-5 text-blue-600" /> : <BarcodeIcon className="w-5 h-5 text-blue-600" />}
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{e.label}</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full uppercase font-medium">{e.barcode_type}</span>
              </div>
              <div className="space-y-2">
                <div><span className="text-xs text-gray-500">Code Field:</span> <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{e.code_field}</span></div>
                <div><span className="text-xs text-gray-500">Encoded Fields:</span> <span className="text-xs text-gray-700 dark:text-gray-300">{e.fields.join(', ')}</span></div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {e.use_cases.map((uc, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500">{uc}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* BARCODE TYPES */}
      {tab === 'types' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {barcodeTypes.map(t => (
            <div key={t.key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                {t.key === 'qrcode' || t.key === 'datamatrix' ? <QrCode className="w-6 h-6 text-blue-600" /> : <BarcodeIcon className="w-6 h-6 text-blue-600" />}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.label}</h3>
                  <span className="text-[10px] font-mono text-gray-400">{t.key}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t.description}</p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                {t.key === 'qrcode' ? (
                  <BarcodeDisplay type="qrcode" data={`{"demo":"${t.label}"}`} code={t.key} size="sm" showLabel={false} />
                ) : (
                  <BarcodeDisplay type="code128" data={t.key.toUpperCase()} code={t.key} size="sm" showLabel={false} />
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Max capacity: {t.maxLength.toLocaleString()} characters</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
