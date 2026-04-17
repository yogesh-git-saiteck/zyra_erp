import { useState, useEffect } from 'react';
import { Lock, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';
import { Alert, PageLoader } from '../../components/common/index';
import api from '../../utils/api';

export default function ModuleConfig() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [toggling, setToggling] = useState(null);

  useEffect(() => { loadModules(); }, []);

  const loadModules = async () => {
    try { const r = await api.get('/admin/modules'); setModules(r?.data || []); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const toggleModule = async (moduleKey, currentState) => {
    setToggling(moduleKey);
    try {
      await api.put(`/admin/modules/${moduleKey}/toggle`, { is_enabled: !currentState });
      setModules(prev => prev.map(m => m.module_key === moduleKey ? { ...m, is_enabled: !currentState } : m));
      setAlert({ type: 'success', message: `Module ${!currentState ? 'enabled' : 'disabled'}. Refresh the page to see changes in sidebar.` });
    } catch (err) {
      if (err.data?.blocking_data) {
        const details = err.data.blocking_data.map(d => `${d.entity}: ${d.count} record(s)`).join(', ');
        setAlert({ type: 'error', message: `Cannot disable — data exists: ${details}` });
      } else {
        setAlert({ type: 'error', message: err.message });
      }
    }
    finally { setToggling(null); }
  };

  if (loading) return <PageLoader />;

  const mandatory = modules.filter(m => m.is_mandatory);
  const optional = modules.filter(m => !m.is_mandatory);
  const enabledCount = modules.filter(m => m.is_enabled).length;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Module Configuration</h1>
          <p className="text-sm text-gray-400 mt-1">Enable or disable ERP modules. Mandatory modules cannot be turned off.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{enabledCount} of {modules.length} modules active</span>
          <button onClick={() => window.location.reload()} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Apply Changes
          </button>
        </div>
      </div>

      {/* Mandatory Modules */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-gray-400" /> Core Modules (Always Active)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {mandatory.map(m => (
            <div key={m.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 border-l-4 border-blue-500 opacity-90">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{m.icon}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.module_name}</h3>
                    <p className="text-xs text-gray-400">{m.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-full font-medium">Mandatory</span>
                  <Lock className="w-4 h-4 text-gray-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optional Modules */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
          Optional Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {optional.map(m => {
            const isToggling = toggling === m.module_key;
            return (
              <div key={m.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 transition-all cursor-pointer hover:shadow-card
                  ${m.is_enabled ? 'border-l-4 border-emerald-500' : 'border-l-4 border-gray-200 dark:border-gray-700 opacity-60'}`}
                onClick={() => !isToggling && toggleModule(m.module_key, m.is_enabled)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{m.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.module_name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                    </div>
                  </div>
                  <button className="shrink-0 ml-3"
                    onClick={e => { e.stopPropagation(); toggleModule(m.module_key, m.is_enabled); }}>
                    {isToggling ? (
                      <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                    ) : m.is_enabled ? (
                      <ToggleRight className="w-8 h-8 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                </div>
                {m.is_enabled && m.enabled_at && (
                  <p className="text-[10px] text-gray-400 mt-2">Enabled {new Date(m.enabled_at).toLocaleDateString()}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Disabling a module hides it from the sidebar and blocks access to its pages. Data is preserved — re-enabling a module restores full access. Click "Apply Changes" or refresh the page after toggling modules.
        </p>
      </div>
    </div>
  );
}
