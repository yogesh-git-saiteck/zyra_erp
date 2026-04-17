import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AccessDeniedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const path = location.pathname.split('/').filter(Boolean);
  const moduleName = path.map(p => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')).join(' / ');

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-20 h-20 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mb-6">
        <ShieldOff className="w-10 h-10 text-rose-400" />
      </div>
      <h2 className="text-2xl font-display font-semibold text-gray-900 mb-2">Access Denied</h2>
      <p className="text-gray-400 max-w-md mb-2">
        Your role <span className="font-semibold text-gray-600">({user?.role_name || user?.roleName})</span> does not have access to <span className="font-semibold text-gray-600">{moduleName || 'this module'}</span>.
      </p>
      <p className="text-sm text-gray-400 mb-6">Contact your administrator to request access.</p>
      <button onClick={() => navigate('/')} className="btn-primary">Back to Dashboard</button>
    </div>
  );
}
