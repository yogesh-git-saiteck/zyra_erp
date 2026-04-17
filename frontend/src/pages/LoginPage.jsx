import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ZyraLogo } from '../components/ZyraLogo';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative overflow-hidden">
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.4]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <ZyraLogo size={64} className="mb-4 shadow-lg rounded-2xl" />
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Zyra</h1>
          <p className="text-gray-400 text-sm mt-1 tracking-widest uppercase">Enterprise Resource Planning</p>
        </div>

        {/* Login Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-elevated border border-gray-200/60 dark:border-gray-800 p-8 animate-slide-in">
          <h2 className="text-xl font-display font-semibold text-gray-900 dark:text-gray-100 mb-1">Welcome back</h2>
          <p className="text-gray-400 text-sm mb-6">Sign in to your account</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Username or Email</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="input-field" placeholder="admin" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="input-field pr-10" placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-2.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 text-center mb-3">Demo Credentials — each role sees different modules</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { u: 'admin', p: 'admin123', r: 'Admin', d: 'Full access' },
                { u: 'jsmith', p: 'demo123', r: 'Finance', d: 'Finance module' },
                { u: 'slee', p: 'demo123', r: 'Sales', d: 'Sales & CRM' },
                { u: 'mchen', p: 'demo123', r: 'Procurement', d: 'Purchasing & Inv' },
                { u: 'akumar', p: 'demo123', r: 'HR', d: 'HR module' },
                { u: 'rjones', p: 'demo123', r: 'Executive', d: 'All reports' },
              ].map(cred => (
                <button key={cred.u} onClick={() => { setUsername(cred.u); setPassword(cred.p); }}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg text-left transition-colors">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{cred.r}</p>
                  <p className="text-[10px] text-gray-400">{cred.d}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">Zyra ERP v2.0 · Role-based access</p>
      </div>
    </div>
  );
}
