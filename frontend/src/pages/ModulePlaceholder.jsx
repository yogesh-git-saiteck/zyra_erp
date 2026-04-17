import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function ModulePlaceholder() {
  const location = useLocation();
  const path = location.pathname.split('/').filter(Boolean);
  const moduleName = path.map(p => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')).join(' / ');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-6">
        <Construction className="w-10 h-10 text-gray-400" />
      </div>
      <h2 className="text-2xl font-display font-semibold text-gray-900 mb-2">{moduleName}</h2>
      <p className="text-gray-400 max-w-md mb-6">
        This module is part of the Zyra platform and will be available in the next development phase.
      </p>
      <div className="flex items-center gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 text-sm">
          <span className="text-gray-500">Database tables:</span>{' '}<span className="text-emerald-600 font-semibold">Ready</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 text-sm">
          <span className="text-gray-500">API endpoints:</span>{' '}<span className="text-emerald-600 font-semibold">Ready</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm px-4 py-3 text-sm">
          <span className="text-gray-500">UI:</span>{' '}<span className="text-amber-600 font-semibold">Phase 2+</span>
        </div>
      </div>
    </div>
  );
}
