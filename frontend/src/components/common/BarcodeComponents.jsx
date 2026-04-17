import { useState, useEffect, useRef } from 'react';
import { Printer, Download, QrCode, Barcode as BarcodeIcon, Copy } from 'lucide-react';
import api from '../../utils/api';

// ============================================
// CODE128 BARCODE RENDERER (SVG-based)
// ============================================
const CODE128_MAP = (() => {
  const START_B = 104; const STOP = 106;
  const patterns = [
    '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100',
    '10011001000','10011000100','10001100100','11001001000','11001000100','11000100100',
    '10110011100','10011011100','10011001110','10111001100','10011101100','10011100110',
    '11001110010','11001011100','11001001110','11011100100','11001110100','11100110100',
    '11100100110','11101100100','11100100110','11100010110','11011011000','11011000110',
    '11000110110','10100011000','10001011000','10001000110','10110001000','10001101000',
    '10001100010','11010001000','11000101000','11000100010','10110111000','10110001110',
    '10001101110','10111011000','10111000110','10001110110','11101011000','11101000110',
    '11100010110','11101101000','11101100010','11100011010','11101111010','11001000010',
    '11110001010','10100110000','10100001100','10010110000','10010000110','10000101100',
    '10000100110','10110010000','10110000100','10011010000','10011000010','10000110100',
    '10000110010','11000010010','11001010000','11110111010','11000010100','10001111010',
    '10100111100','10010111100','10010011110','10111100100','10011110100','10011110010',
    '11110100100','11110010100','11110010010','11011011110','11011110110','11110110110',
    '10101111000','10100011110','10001011110','10111101000','10111100010','11110101000',
    '11110100010','10111011110','10111101110','11101011110','11110101110','11010000100',
    '11010010000','11010011100','1100011101011',
  ];
  return { START_B, STOP, patterns };
})();

function encodeCode128(text) {
  const { START_B, STOP, patterns } = CODE128_MAP;
  let checksum = START_B;
  let encoded = patterns[START_B];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    if (code >= 0 && code < 95) {
      encoded += patterns[code];
      checksum += code * (i + 1);
    }
  }
  encoded += patterns[checksum % 103];
  encoded += patterns[STOP];
  return encoded;
}

function Code128SVG({ data, width = 250, height = 80 }) {
  const bits = encodeCode128(data);
  const barWidth = width / bits.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {bits.split('').map((bit, i) => bit === '1' ? (
        <rect key={i} x={i * barWidth} y={0} width={barWidth + 0.5} height={height - 18} fill="black" />
      ) : null)}
      <text x={width / 2} y={height - 3} textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#333">{data}</text>
    </svg>
  );
}

// ============================================
// QR CODE RENDERER (simple matrix generator)
// ============================================
function simpleQRMatrix(data) {
  // Uses a simplified visual representation for display
  // In production, use a library like qrcode.js
  const size = Math.max(21, Math.min(41, 21 + Math.floor(data.length / 20) * 4));
  const matrix = Array(size).fill(null).map(() => Array(size).fill(false));

  // Finder patterns (corners)
  const addFinder = (r, c) => {
    for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
      const ri = r + i, ci = c + j;
      if (ri < 0 || ci < 0 || ri >= size || ci >= size) continue;
      if (i === -1 || i === 7 || j === -1 || j === 7) matrix[ri][ci] = false;
      else if (i === 0 || i === 6 || j === 0 || j === 6) matrix[ri][ci] = true;
      else if (i >= 2 && i <= 4 && j >= 2 && j <= 4) matrix[ri][ci] = true;
      else matrix[ri][ci] = false;
    }
  };
  addFinder(0, 0); addFinder(0, size - 7); addFinder(size - 7, 0);

  // Data encoding (simplified visual)
  let bitIdx = 0;
  const dataBits = data.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('');
  for (let c = size - 1; c >= 0; c -= 2) {
    if (c === 6) c = 5;
    for (let r = 0; r < size; r++) {
      for (let dc = 0; dc < 2; dc++) {
        const col = c - dc;
        if (col < 0 || col >= size) continue;
        if (r < 9 && col < 9) continue;
        if (r < 9 && col > size - 9) continue;
        if (r > size - 9 && col < 9) continue;
        if (bitIdx < dataBits.length) {
          matrix[r][col] = dataBits[bitIdx] === '1';
          bitIdx++;
        }
      }
    }
  }
  return { matrix, size };
}

function QRCodeSVG({ data, width = 150 }) {
  const { matrix, size } = simpleQRMatrix(data);
  const cellSize = width / size;
  return (
    <svg width={width} height={width} viewBox={`0 0 ${width} ${width}`}>
      <rect width={width} height={width} fill="white" />
      {matrix.map((row, r) => row.map((cell, c) => cell ? (
        <rect key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} width={cellSize + 0.3} height={cellSize + 0.3} fill="black" />
      ) : null))}
    </svg>
  );
}

// ============================================
// BARCODE DISPLAY COMPONENT
// ============================================
export function BarcodeDisplay({ entity, id, type, data, code, showLabel = true, size = 'md' }) {
  const ref = useRef(null);
  const sizes = { sm: { w: 150, h: 50, qr: 80 }, md: { w: 250, h: 80, qr: 150 }, lg: { w: 350, h: 100, qr: 200 } };
  const s = sizes[size] || sizes.md;

  const handlePrint = () => {
    const svgEl = ref.current?.querySelector('svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const win = window.open('', '_blank', 'width=400,height=300');
    win.document.write(`<!DOCTYPE html><html><head><title>Barcode - ${code}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;font-family:sans-serif;margin:0}
      .label{text-align:center;margin-top:8px;font-size:11px;color:#333}@media print{body{margin:0;padding:10mm}}</style></head>
      <body>${svgData}${showLabel ? `<div class="label"><strong>${code}</strong></div>` : ''}
      <script>setTimeout(()=>window.print(),300)</script></body></html>`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(data || code);
  };

  return (
    <div className="inline-flex flex-col items-center gap-1" ref={ref}>
      {(type === 'qrcode') ? (
        <QRCodeSVG data={data || code} width={s.qr} />
      ) : (
        <Code128SVG data={data || code} width={s.w} height={s.h} />
      )}
      {showLabel && <p className="text-[10px] font-mono text-gray-500">{code}</p>}
      <div className="flex gap-1 mt-1">
        <button onClick={handlePrint} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Print label"><Printer className="w-3.5 h-3.5 text-gray-400" /></button>
        <button onClick={handleCopy} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded" title="Copy data"><Copy className="w-3.5 h-3.5 text-gray-400" /></button>
      </div>
    </div>
  );
}

// ============================================
// BARCODE BUTTON — fetches data and shows barcode in modal
// ============================================
export function BarcodeButton({ entity, id, size = 'sm' }) {
  const [show, setShow] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadBarcode = async () => {
    setLoading(true); setShow(true);
    try { const r = await api.get(`/barcode/generate/${entity}/${id}`); setData(r?.data); }
    catch {} finally { setLoading(false); }
  };

  return (
    <>
      <button onClick={e => { e.stopPropagation(); loadBarcode(); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Barcode">
        <QrCode className="w-4 h-4 text-gray-400" />
      </button>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setShow(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-elevated p-6 min-w-[300px] text-center" onClick={e => e.stopPropagation()}>
            {loading ? <p className="text-gray-400 py-8">Generating...</p> : data ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{data.name}</p>
                <BarcodeDisplay entity={entity} id={id} type={data.barcode_type} data={data.barcode_data} code={data.code} size="md" />
                <div className="text-xs text-gray-400 space-y-0.5">
                  {Object.entries(data.fields || {}).map(([k, v]) => v ? <p key={k}><span className="capitalize">{k.replace(/_/g, ' ')}</span>: {String(v)}</p> : null)}
                </div>
              </div>
            ) : <p className="text-gray-400 py-8">Failed to generate</p>}
            <button onClick={() => setShow(false)} className="mt-4 text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// BULK BARCODE PRINT
// ============================================
export function BulkBarcodePrint({ entity, ids, onClose }) {
  const [barcodes, setBarcodes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await api.post(`/barcode/generate-bulk/${entity}`, { ids }); setBarcodes(r?.data || []); }
      catch {} finally { setLoading(false); }
    })();
  }, [entity, ids]);

  const handlePrintAll = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    const labels = barcodes.map(b => {
      const isQR = b.barcode_type === 'qrcode';
      return `<div class="label"><div class="code">${b.code}</div><div class="name">${b.name}</div></div>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Barcode Labels</title>
      <style>body{font-family:sans-serif;margin:20px}.label{display:inline-block;width:200px;padding:15px;margin:5px;border:1px solid #ddd;text-align:center;page-break-inside:avoid}
      .code{font-family:monospace;font-size:14px;font-weight:bold;margin-bottom:4px}.name{font-size:10px;color:#666}
      @media print{body{margin:0}.label{border:1px solid #eee}}</style></head>
      <body>${labels}<script>setTimeout(()=>window.print(),300)</script></body></html>`);
  };

  if (loading) return <p className="text-center text-gray-400 py-4">Generating {ids.length} barcodes...</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{barcodes.length} barcode(s) ready</p>
        <button onClick={handlePrintAll} className="btn-primary flex items-center gap-2"><Printer className="w-4 h-4" /> Print All Labels</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {barcodes.map(b => (
          <div key={b.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
            <BarcodeDisplay type={b.barcode_type} data={b.barcode_data} code={b.code} size="sm" showLabel={true} />
            <p className="text-xs text-gray-500 mt-1">{b.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
