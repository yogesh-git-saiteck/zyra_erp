/**
 * ApprovalPanel — shows the approval status of a document and allows the
 * assigned approver to approve/reject directly from the entity detail modal.
 */
import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, User, ChevronRight, Loader2 } from 'lucide-react';
import api from '../../utils/api';
import { StatusBadge } from './index';

export default function ApprovalPanel({ entityType, entityId, currentUserId, onDecision }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(null); // { approvalId, action }
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (entityType && entityId) load();
  }, [entityType, entityId]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/workflow/entity-approval', { entity_type: entityType, entity_id: entityId }).catch(() => null);
      setApprovals(r?.data || []);
    } finally { setLoading(false); }
  };

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await api.post(`/workflow/approvals/${showModal.approvalId}/${showModal.action}`, { comments });
      setShowModal(null); setComments('');
      await load();
      if (onDecision) onDecision();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  // Group by step
  const steps = [...new Set(approvals.map(a => a.step_number))].sort((a, b) => a - b);
  const totalPending = approvals.filter(a => a.status === 'pending').length;

  // Current active step = lowest step that still has pending approvals
  // (all prior steps must be fully approved for it to be active)
  const pendingSteps = [...new Set(approvals.filter(a => a.status === 'pending').map(a => a.step_number))].sort((a, b) => a - b);
  const currentActiveStep = pendingSteps[0] || null;

  const pendingForMe = approvals.filter(a => a.status === 'pending' && a.approver_id === currentUserId && a.step_number === currentActiveStep);

  return (
    <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Pending Approval</span>
        {!loading && totalPending > 0 && (
          <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
            {totalPending} waiting
          </span>
        )}
        {pendingForMe.length > 0 && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium ml-1">
            Your action required
          </span>
        )}
      </div>

      {loading && (
        <div className="text-xs text-amber-600 dark:text-amber-400 py-1">Loading approvers...</div>
      )}

      {!loading && approvals.length === 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400 py-1">
          No approval records found for this document. Check approval rule configuration.
        </div>
      )}

      {!loading && steps.map(step => {
        const stepApprovals = approvals.filter(a => a.step_number === step);
        const stepPending = stepApprovals.filter(a => a.status === 'pending').length;
        const stepDone = stepApprovals.every(a => a.status !== 'pending');
        const isActive = step === currentActiveStep;
        const isWaiting = !stepDone && !isActive; // future step — blocked by prior level
        return (
          <div key={step} className={`mb-2 ${isWaiting ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                stepDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                : isActive ? 'bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                LEVEL {step}
              </span>
              {isActive && stepPending > 0 && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">{stepPending} pending</span>
              )}
              {isWaiting && <span className="text-[10px] text-gray-400">waiting for Level {currentActiveStep}</span>}
              {stepDone && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Approved</span>}
            </div>
            <div className="space-y-1">
              {stepApprovals.map(appr => (
                <div key={appr.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-md px-3 py-2 border border-amber-100 dark:border-amber-800/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 block truncate">
                        {appr.approver_name || '—'}
                      </span>
                      {appr.approver_role_name && (
                        <span className="text-[10px] text-gray-400">{appr.approver_role_name}</span>
                      )}
                    </div>
                    {appr.comments && (
                      <span className="text-xs text-gray-400 italic ml-2 truncate">"{appr.comments}"</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <StatusBadge status={appr.status} />
                    {appr.status === 'pending' && appr.approver_id === currentUserId && appr.step_number === currentActiveStep && (
                      <div className="flex gap-1 ml-1">
                        <button
                          onClick={() => { setShowModal({ approvalId: appr.id, action: 'approve' }); setComments(''); setError(null); }}
                          className="flex items-center gap-1 px-2 py-0.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium">
                          <CheckCircle className="w-3 h-3" /> Approve
                        </button>
                        <button
                          onClick={() => { setShowModal({ approvalId: appr.id, action: 'reject' }); setComments(''); setError(null); }}
                          className="flex items-center gap-1 px-2 py-0.5 text-xs bg-rose-600 text-white rounded hover:bg-rose-700 font-medium">
                          <XCircle className="w-3 h-3" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Approve/Reject confirm dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md transform transition-all animate-scale-in">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                showModal.action === 'approve' 
                  ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                  : 'bg-rose-100 dark:bg-rose-900/30'
              }`}>
                {showModal.action === 'approve' 
                  ? <CheckCircle className={`w-5 h-5 text-emerald-600 dark:text-emerald-400`} />
                  : <XCircle className={`w-5 h-5 text-rose-600 dark:text-rose-400`} />
                }
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {showModal.action === 'approve' ? 'Approve Document' : 'Reject Document'}
                </h3>
                <p className={`text-xs mt-1 ${showModal.action === 'approve' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {showModal.action === 'approve'
                    ? 'Confirm and allow further processing'
                    : 'Send back to rejected status'}
                </p>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg flex items-start gap-2 animate-slide-in">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-300 font-medium">{error}</p>
              </div>
            )}

            {/* Comments textarea */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Comments {showModal.action === 'approve' ? '(optional)' : '(required)'}
              </label>
              <textarea 
                value={comments} 
                onChange={e => setComments(e.target.value)} 
                rows={3}
                placeholder={showModal.action === 'approve' ? 'Add approval notes...' : 'Explain the reason for rejection...'}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900/50 outline-none resize-none transition-all" 
              />
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button 
                onClick={() => setShowModal(null)} 
                disabled={saving}
                className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={submit} 
                disabled={saving}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-all duration-200 flex items-center gap-2 ${
                  showModal.action === 'approve' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400' 
                    : 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400'
                } disabled:opacity-60 shadow-sm hover:shadow-md`}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? 'Processing...' : showModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
