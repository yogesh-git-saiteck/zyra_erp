import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { setCompanyCurrency } from '../utils/formatters.js';

const AuthContext = createContext(null);

// Load company currency once
async function loadCompanyCurrency() {
  try {
    const res = await api.get('/org/companies');
    const company = (res?.data || [])[0];
    if (company?.currency) setCompanyCurrency(company.currency);
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('nexus_token');
    if (!token) { setLoading(false); return; }
    api.setToken(token);
    try {
      const res = await api.get('/auth/me');
      if (res?.data) { setUser(res.data); loadCompanyCurrency(); }
      else { api.setToken(null); setUser(null); }
    } catch {
      api.setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    if (res?.data?.token) {
      api.setToken(res.data.token);
      setUser(res.data.user);
      loadCompanyCurrency();
      return res.data.user;
    }
    throw new Error(res?.message || 'Login failed');
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
