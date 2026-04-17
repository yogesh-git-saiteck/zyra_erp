import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Tabs } from '../components/common/index';
import api from '../utils/api';

export default function SettingsPage() {
  const { user, loadUser } = useAuth();
  const [tab, setTab]   = useState('profile');
  const tabs = [
    { key: 'profile',       label: 'Profile' },
    { key: 'security',      label: 'Security' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'system',        label: 'System' },
  ];

  // ── Profile ──────────────────────────────────────────────────
  const [profile, setProfile]   = useState({
    first_name: user?.firstName || user?.first_name || '',
    last_name:  user?.lastName  || user?.last_name  || '',
    email:      user?.email     || '',
    phone:      user?.phone     || '',
    language:   user?.language  || 'en',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState(null);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await api.put('/auth/profile', profile);
      setProfileMsg({ type: 'success', text: 'Profile saved successfully.' });
      // Refresh auth context so the header name updates immediately
      if (loadUser) await loadUser();
    } catch (e) {
      setProfileMsg({ type: 'error', text: e.message || 'Failed to save profile.' });
    } finally { setProfileSaving(false); }
  };

  // ── Security ─────────────────────────────────────────────────
  const [pwd, setPwd] = useState({ current: '', newPwd: '', confirm: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg,    setPwdMsg]    = useState(null);

  const changePassword = async () => {
    setPwdMsg(null);
    if (!pwd.current || !pwd.newPwd || !pwd.confirm) {
      return setPwdMsg({ type: 'error', text: 'All password fields are required.' });
    }
    if (pwd.newPwd !== pwd.confirm) {
      return setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
    }
    if (pwd.newPwd.length < 8) {
      return setPwdMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
    }
    setPwdSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pwd.current, newPassword: pwd.newPwd });
      setPwdMsg({ type: 'success', text: 'Password updated successfully.' });
      setPwd({ current: '', newPwd: '', confirm: '' });
    } catch (e) {
      setPwdMsg({ type: 'error', text: e.message || 'Failed to change password.' });
    } finally { setPwdSaving(false); }
  };

  // ── Notifications ─────────────────────────────────────────────
  const defaultNotifPrefs = {
    approval_requests:    true,
    order_status_changes: true,
    system_alerts:        true,
    ai_insights:          true,
    weekly_reports:       false,
    overdue_reminders:    true,
    low_stock_alerts:     false,
  };
  const notifLabels = {
    approval_requests:    'Approval requests',
    order_status_changes: 'Order status changes',
    system_alerts:        'System alerts',
    ai_insights:          'AI insights',
    weekly_reports:       'Weekly reports',
    overdue_reminders:    'Overdue invoice reminders',
    low_stock_alerts:     'Low stock alerts',
  };
  const [notifPrefs, setNotifPrefs] = useState(defaultNotifPrefs);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg,    setNotifMsg]    = useState(null);
  const [notifLoaded, setNotifLoaded] = useState(false);

  useEffect(() => {
    if (tab === 'notifications' && !notifLoaded) {
      api.get('/auth/me').then(res => {
        const prefs = res?.data?.preferences;
        if (prefs?.notifications) setNotifPrefs({ ...defaultNotifPrefs, ...prefs.notifications });
        setNotifLoaded(true);
      }).catch(() => setNotifLoaded(true));
    }
  }, [tab]);

  const saveNotifications = async () => {
    setNotifSaving(true);
    setNotifMsg(null);
    try {
      await api.put('/auth/profile', { preferences: { notifications: notifPrefs } });
      setNotifMsg({ type: 'success', text: 'Notification preferences saved.' });
    } catch (e) {
      setNotifMsg({ type: 'error', text: e.message || 'Failed to save preferences.' });
    } finally { setNotifSaving(false); }
  };

  // ── System Info ───────────────────────────────────────────────
  const [sysInfo, setSysInfo] = useState(null);

  useEffect(() => {
    if (tab === 'system') {
      Promise.all([
        api.get('/auth/me').catch(() => null),
        api.get('/auth/roles').catch(() => null),
        api.get('/auth/users').catch(() => null),
        api.get('/admin/modules').catch(() => null),
      ]).then(([me, roles, users, modules]) => {
        setSysInfo({
          version:       'Zyra ERP v2.0',
          database:      'PostgreSQL 16',
          api:           'REST / JSON',
          architecture:  'Microservices-ready',
          multiCompany:  'Enabled',
          multiCurrency: 'Enabled',
          aiFeatures:    'Enabled',
          roles:         `${roles?.data?.length || 0} roles configured`,
          users:         `${users?.data?.length || 0} users`,
          modules:       `${modules?.data?.filter(m => m.is_enabled)?.length || 0} modules enabled`,
          loggedInAs:    me?.data?.username || user?.username,
        });
      });
    }
  }, [tab]);

  // ── Helpers ───────────────────────────────────────────────────
  const Alert = ({ msg }) => {
    if (!msg) return null;
    const isSuccess = msg.type === 'success';
    return (
      <div className={`p-3 rounded-lg text-sm border ${isSuccess
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400'
        : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'}`}>
        {msg.text}
      </div>
    );
  };

  const fi = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
  const card = 'bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 max-w-2xl space-y-5';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your account and preferences</p>
        </div>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* ── PROFILE ─────────────────────────────────── */}
      {tab === 'profile' && (
        <div className={card}>
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-2xl font-bold text-white">
              {(profile.first_name || '?')[0]}{(profile.last_name || '?')[0]}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {profile.first_name} {profile.last_name}
              </h3>
              <p className="text-sm text-gray-500">{user?.roleName || user?.role_name} · {profile.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div>
              <label className={fi}>First Name</label>
              <input className="input-field" value={profile.first_name}
                onChange={e => setProfile({ ...profile, first_name: e.target.value })} />
            </div>
            <div>
              <label className={fi}>Last Name</label>
              <input className="input-field" value={profile.last_name}
                onChange={e => setProfile({ ...profile, last_name: e.target.value })} />
            </div>
            <div>
              <label className={fi}>Email</label>
              <input className="input-field" type="email" value={profile.email}
                onChange={e => setProfile({ ...profile, email: e.target.value })} />
            </div>
            <div>
              <label className={fi}>Phone</label>
              <input className="input-field" value={profile.phone}
                onChange={e => setProfile({ ...profile, phone: e.target.value })} />
            </div>
            <div>
              <label className={fi}>Language</label>
              <select className="select-field" value={profile.language}
                onChange={e => setProfile({ ...profile, language: e.target.value })}>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>
            <div>
              <label className={fi}>Username</label>
              <input className="input-field bg-gray-50 dark:bg-gray-800 cursor-not-allowed"
                value={user?.username || ''} disabled title="Username cannot be changed" />
            </div>
          </div>

          <Alert msg={profileMsg} />
          <div className="flex justify-end pt-2">
            <button onClick={saveProfile} disabled={profileSaving} className="btn-primary">
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* ── SECURITY ─────────────────────────────────── */}
      {tab === 'security' && (
        <div className={card}>
          <h3 className="section-title">Change Password</h3>
          <div className="space-y-4">
            <div>
              <label className={fi}>Current Password</label>
              <input type="password" className="input-field" placeholder="••••••••"
                value={pwd.current} onChange={e => setPwd({ ...pwd, current: e.target.value })} />
            </div>
            <div>
              <label className={fi}>New Password</label>
              <input type="password" className="input-field" placeholder="Min 8 chars"
                value={pwd.newPwd} onChange={e => setPwd({ ...pwd, newPwd: e.target.value })} />
            </div>
            <div>
              <label className={fi}>Confirm New Password</label>
              <input type="password" className="input-field" placeholder="••••••••"
                value={pwd.confirm} onChange={e => setPwd({ ...pwd, confirm: e.target.value })} />
            </div>
          </div>

          {/* Password strength indicator */}
          {pwd.newPwd && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Password strength:</p>
              <div className="grid grid-cols-4 gap-1">
                {[
                  pwd.newPwd.length >= 8,
                  /[A-Z]/.test(pwd.newPwd),
                  /[0-9]/.test(pwd.newPwd),
                  /[^a-zA-Z0-9]/.test(pwd.newPwd),
                ].map((ok, i) => (
                  <div key={i} className={`h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                ))}
              </div>
              <p className="text-[10px] text-gray-400">8+ chars · uppercase · number · special char</p>
            </div>
          )}

          <Alert msg={pwdMsg} />
          <div className="flex justify-end pt-2">
            <button onClick={changePassword} disabled={pwdSaving} className="btn-primary">
              {pwdSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Session Info</h4>
            <div className="space-y-1 text-sm text-gray-500">
              <p>Logged in as: <span className="font-medium text-gray-700 dark:text-gray-300">{user?.username}</span></p>
              <p>Role: <span className="font-medium text-gray-700 dark:text-gray-300">{user?.roleName || user?.role_name}</span></p>
              <p>Session expires: <span className="font-medium text-gray-700 dark:text-gray-300">24 hours after login</span></p>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ─────────────────────────────── */}
      {tab === 'notifications' && (
        <div className={card}>
          <h3 className="section-title">Notification Preferences</h3>
          <p className="text-sm text-gray-500">Choose which in-app notifications you receive.</p>

          <div className="space-y-1">
            {Object.entries(notifLabels).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
                </div>
                <button
                  onClick={() => setNotifPrefs(p => ({ ...p, [key]: !p[key] }))}
                  className="relative inline-flex items-center cursor-pointer focus:outline-none">
                  <div className={`w-10 h-5 rounded-full transition-colors duration-200 ${notifPrefs[key] ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${notifPrefs[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            ))}
          </div>

          <Alert msg={notifMsg} />
          <div className="flex justify-end pt-2">
            <button onClick={saveNotifications} disabled={notifSaving} className="btn-primary">
              {notifSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ── SYSTEM INFO ──────────────────────────────── */}
      {tab === 'system' && (
        <div className={card}>
          <h3 className="section-title">System Information</h3>
          {!sysInfo ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="space-y-0">
              {[
                ['Application',    sysInfo.version],
                ['Database',       sysInfo.database],
                ['API',            sysInfo.api],
                ['Architecture',   sysInfo.architecture],
                ['Multi-Company',  sysInfo.multiCompany],
                ['Multi-Currency', sysInfo.multiCurrency],
                ['AI Features',    sysInfo.aiFeatures],
                ['Active Roles',   sysInfo.roles],
                ['Users',          sysInfo.users],
                ['Modules',        sysInfo.modules],
                ['Logged in as',   sysInfo.loggedInAs],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <span className="text-sm text-gray-500">{label}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400">
              For advanced system configuration, go to{' '}
              <a href="/settings/config" className="text-blue-600 hover:underline">Settings → Configuration</a>.
              For user and role management, go to{' '}
              <a href="/settings/users" className="text-blue-600 hover:underline">Settings → Users &amp; Roles</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
