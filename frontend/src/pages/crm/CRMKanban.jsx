import { useState, useEffect } from 'react';
import { DollarSign, User, Calendar, GripVertical } from 'lucide-react';
import { Alert } from '../../components/common/index';
import api from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const STAGES = [
  { key: 'prospect', label: 'Prospect', color: '#94a3b8', bg: 'bg-gray-50 dark:bg-gray-900' },
  { key: 'qualification', label: 'Qualification', color: '#3b82f6', bg: 'bg-blue-50 dark:bg-blue-950' },
  { key: 'proposal', label: 'Proposal', color: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-950' },
  { key: 'negotiation', label: 'Negotiation', color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950' },
  { key: 'closed_won', label: 'Won', color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950' },
  { key: 'closed_lost', label: 'Lost', color: '#ef4444', bg: 'bg-rose-50 dark:bg-rose-950' },
];

export default function CRMKanban() {
  const [opps, setOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [dragging, setDragging] = useState(null);

  useEffect(() => { loadOpps(); }, []);

  const loadOpps = async () => {
    try { const r = await api.get('/crm/opportunities'); setOpps(r?.data || []); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const getByStage = (stage) => opps.filter(o => o.stage === stage);
  const stageTotal = (stage) => getByStage(stage).reduce((s, o) => s + parseFloat(o.expected_value || 0), 0);

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    if (!dragging || dragging.stage === targetStage) return;
    // Optimistic update
    setOpps(prev => prev.map(o => o.id === dragging.id ? { ...o, stage: targetStage } : o));
    try {
      await api.put(`/crm/opportunities/${dragging.id}`, { ...dragging, stage: targetStage });
      if (targetStage === 'closed_won') await api.post(`/crm/opportunities/${dragging.id}/won`);
      if (targetStage === 'closed_lost') await api.post(`/crm/opportunities/${dragging.id}/lost`, { lost_reason: 'Moved to lost' });
      setAlert({ type: 'success', message: `Moved to ${targetStage.replace('_', ' ')}` });
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
      loadOpps(); // Revert
    }
    setDragging(null);
  };

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
        {STAGES.map(stage => {
          const items = getByStage(stage.key);
          const total = stageTotal(stage.key);
          return (
            <div key={stage.key}
              className={`flex-shrink-0 w-72 rounded-xl border border-gray-200 dark:border-gray-800 ${stage.bg} flex flex-col`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, stage.key)}>

              {/* Column header */}
              <div className="p-3 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: stage.color }} />
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{stage.label}</span>
                  </div>
                  <span className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-400">{items.length}</span>
                </div>
                {total > 0 && <p className="text-xs text-gray-500 mt-1">{formatCurrency(total)}</p>}
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {items.map(opp => (
                  <div key={opp.id} draggable
                    onDragStart={() => setDragging(opp)}
                    onDragEnd={() => setDragging(null)}
                    className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700
                      p-3 cursor-grab active:cursor-grabbing shadow-soft hover:shadow-card transition-shadow
                      ${dragging?.id === opp.id ? 'opacity-50 scale-95' : ''}`}>

                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight flex-1">{opp.opportunity_name}</h4>
                      <GripVertical className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
                    </div>

                    {opp.customer_name && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <User className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-600 dark:text-gray-400">{opp.customer_name}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-gray-400" />
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(opp.expected_value)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">{opp.probability}%</span>
                        {opp.expected_close && (
                          <div className="flex items-center gap-0.5">
                            <Calendar className="w-3 h-3 text-gray-300" />
                            <span className="text-[10px] text-gray-400">{formatDate(opp.expected_close)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-400">Drop here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
