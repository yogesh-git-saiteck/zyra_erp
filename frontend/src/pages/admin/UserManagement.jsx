import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, KeyRound, Shield, Users, Lock, Unlock } from 'lucide-react';
import { DataTable, SearchInput, StatusBadge, Modal, FormField, Tabs, Alert , DownloadButton } from '../../components/common/index';
import { PAGE_REGISTRY, ALL_PAGES, CRUD_OPS, buildEmptyPermissions, buildFullPermissions } from '../../utils/permissions';
import api from '../../utils/api';
import { formatDate, formatDateTime } from '../../utils/formatters';

export default function UserManagement() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [saving, setSaving] = useState(false);

  // User modals
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showResetPw, setShowResetPw] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', first_name: '', last_name: '', phone: '', role_id: '', status: 'active' });

  // Role modals
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ role_code: '', role_name: '', description: '', permissions: buildEmptyPermissions() });
  const [confirmDeleteRole, setConfirmDeleteRole] = useState(null);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api.get('/auth/users').catch(()=>null), api.get('/auth/roles').catch(()=>null)]);
      setUsers(u?.data || []); setRoles(r?.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  // ========== USER HANDLERS ==========
  const openCreateUser = () => { setEditingUser(null); setUserForm({ username: '', email: '', password: '', first_name: '', last_name: '', phone: '', role_id: '', status: 'active' }); setShowCreateUser(true); };
  const openEditUser = (u) => { setEditingUser(u); setUserForm({ first_name: u.first_name, last_name: u.last_name, email: u.email, phone: u.phone || '', role_id: u.role_id, status: u.status }); setShowCreateUser(true); };

  const handleSaveUser = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        await api.put(`/auth/users/${editingUser.id}`, userForm);
        setAlert({ type: 'success', message: 'User updated' });
      } else {
        if (!userForm.username || !userForm.password) { setAlert({ type: 'error', message: 'Username and password required' }); setSaving(false); return; }
        await api.post('/auth/users', userForm);
        setAlert({ type: 'success', message: 'User created' });
      }
      setShowCreateUser(false); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setAlert({ type: 'error', message: 'Min 6 characters' }); return; }
    try { await api.post(`/auth/users/${showResetPw.id}/reset-password`, { newPassword }); setShowResetPw(null); setNewPassword(''); setAlert({ type: 'success', message: 'Password reset' }); }
    catch (err) { setModalError(err.message); }
  };

  const handleDeactivateUser = async (id) => {
    try { await api.delete(`/auth/users/${id}`); setAlert({ type: 'success', message: 'User deactivated' }); loadData(); }
    catch (err) { setModalError(err.message); }
  };

  // ========== ROLE HANDLERS ==========
  const openCreateRole = () => { setEditingRole(null); setRoleForm({ role_code: '', role_name: '', description: '', permissions: buildEmptyPermissions() }); setShowCreateRole(true); };
  const openEditRole = (r) => {
    const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions) : (r.permissions || {});
    // Convert old format if needed
    let pages = perms.pages || {};
    if (!perms.pages && perms.modules) {
      pages = {};
      PAGE_REGISTRY.forEach(g => {
        if (perms.modules.includes(g.module)) g.pages.forEach(p => { pages[p.key] = { view: true, create: true, edit: true, delete: true, approve: true }; });
      });
    }
    setEditingRole(r);
    setRoleForm({ role_code: r.role_code, role_name: r.role_name, description: r.description || '', permissions: { all: perms.all || false, pages } });
    setShowCreateRole(true);
  };

  const togglePageOp = (pageKey, op) => {
    const pages = { ...roleForm.permissions.pages };
    if (!pages[pageKey]) pages[pageKey] = { view: false, create: false, edit: false, delete: false, approve: false };
    pages[pageKey] = { ...pages[pageKey], [op]: !pages[pageKey][op] };
    // If any CRUD op is enabled, auto-enable view
    if (op !== 'view' && pages[pageKey][op]) pages[pageKey].view = true;
    // If view is disabled, disable all
    if (op === 'view' && !pages[pageKey].view) { pages[pageKey] = { view: false, create: false, edit: false, delete: false, approve: false }; }
    setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, pages } });
  };
  const toggleModuleAll = (moduleKey, enable) => {
    const pages = { ...roleForm.permissions.pages };
    const group = PAGE_REGISTRY.find(g => g.module === moduleKey);
    if (group) group.pages.forEach(p => { pages[p.key] = { view: enable, create: enable, edit: enable, delete: enable, approve: enable }; });
    setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, pages } });
  };
  const toggleAll = () => { setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, all: !roleForm.permissions.all } }); };
  const selectAllPages = () => {
    const pages = {};
    ALL_PAGES.forEach(p => { pages[p.key] = { view: true, create: true, edit: true, delete: true, approve: true }; });
    setRoleForm({ ...roleForm, permissions: { all: false, pages } });
  };
  const clearAllPages = () => { setRoleForm({ ...roleForm, permissions: buildEmptyPermissions() }); };

  const handleSaveRole = async () => {
    if (!roleForm.role_code || !roleForm.role_name) { setAlert({ type: 'error', message: 'Code and name required' }); return; }
    setSaving(true);
    try {
      if (editingRole) {
        await api.put(`/auth/roles/${editingRole.id}`, { role_name: roleForm.role_name, description: roleForm.description, permissions: roleForm.permissions });
        setAlert({ type: 'success', message: 'Role updated — users with this role will see updated modules on next login' });
      } else {
        await api.post('/auth/roles', roleForm);
        setAlert({ type: 'success', message: 'Role created' });
      }
      setShowCreateRole(false); loadData();
    } catch (err) { setModalError(err.message); } finally { setSaving(false); }
  };

  const handleDeleteRole = async () => {
    try { await api.delete(`/auth/roles/${confirmDeleteRole.id}`); setConfirmDeleteRole(null); setAlert({ type: 'success', message: 'Role deleted' }); loadData(); }
    catch (err) { setAlert({ type: 'error', message: err.message }); setConfirmDeleteRole(null); }
  };

  // ========== TABLE COLUMNS ==========
  const userColumns = [
    { key: 'username', label: 'Username', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'first_name', label: 'Name', render: (v, row) => <span className="font-medium text-gray-900">{v} {row.last_name}</span> },
    { key: 'email', label: 'Email', render: v => <span className="text-gray-600">{v}</span> },
    { key: 'role_name', label: 'Role', render: v => <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">{v}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'last_login', label: 'Last Login', render: v => v ? <span className="text-xs text-gray-400">{formatDateTime(v)}</span> : <span className="text-gray-400">Never</span> },
    { key: 'id', label: 'Actions', className: 'text-right', render: (v, row) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={e => { e.stopPropagation(); openEditUser(row); }} title="Edit" className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
        <button onClick={e => { e.stopPropagation(); setShowResetPw(row); setNewPassword(''); }} title="Reset Password" className="p-1.5 hover:bg-gray-100 rounded-lg"><KeyRound className="w-3.5 h-3.5 text-gray-400" /></button>
        {row.status === 'active' && (
          <button onClick={e => { e.stopPropagation(); handleDeactivateUser(v); }} title="Deactivate" className="p-1.5 hover:bg-rose-50 rounded-lg"><Lock className="w-3.5 h-3.5 text-gray-400" /></button>
        )}
      </div>
    )},
  ];

  const filteredUsers = search ? users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.first_name.toLowerCase().includes(search.toLowerCase()) ||
    u.last_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  ) : users;

  const roleColumns = [
    { key: 'role_code', label: 'Code', render: v => <span className="font-mono text-blue-600 font-medium">{v}</span> },
    { key: 'role_name', label: 'Name', render: v => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'description', label: 'Description', render: v => <span className="text-gray-500">{v || '—'}</span> },
    { key: 'permissions', label: 'Access', render: (v) => {
      if (v?.all) return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">Full Access</span>;
      if (v?.pages) { const count = Object.keys(v.pages).filter(k => v.pages[k]?.view).length; return <span className="text-xs text-gray-600">{count} page{count !== 1 ? 's' : ''}</span>; }
      if (v?.modules) return <span className="text-xs text-gray-600">{v.modules.length} module{v.modules.length !== 1 ? 's' : ''} (legacy)</span>;
      return <span className="text-xs text-gray-400">No access</span>;
    }},
    { key: 'user_count', label: 'Users', className: 'text-center', render: v => <span className="font-semibold">{v}</span> },
    { key: 'is_system', label: 'System', render: v => v ? <span className="text-xs text-gray-400">System</span> : <span className="text-xs text-emerald-600">Custom</span> },
    { key: 'id', label: 'Actions', className: 'text-right', render: (v, row) => (
      <div className="flex items-center justify-end gap-1">
        <button onClick={e => { e.stopPropagation(); openEditRole(row); }} title="Edit" className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
        {!row.is_system && (
          <button onClick={e => { e.stopPropagation(); setConfirmDeleteRole(row); }} title="Delete" className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-gray-400" /></button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">User & Role Management</h1><p className="text-sm text-gray-400 mt-1">Manage users, create roles, and assign module permissions</p></div>
        <div className="flex gap-2">
          {tab === 'users' && <><DownloadButton data={roles} filename="UserManagement" /><button onClick={openCreateUser} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New User</button></>}
          {tab === 'roles' && <button onClick={openCreateRole} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Role</button>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Tabs tabs={[
          { key: 'users', label: 'Users', count: users.length },
          { key: 'roles', label: 'Roles', count: roles.length },
        ]} active={tab} onChange={setTab} />
        {tab === 'users' && <SearchInput value={search} onChange={setSearch} placeholder="Search users..." className="w-64" />}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {tab === 'users' && <DataTable columns={userColumns} data={filteredUsers} loading={loading} />}
        {tab === 'roles' && <DataTable columns={roleColumns} data={roles} loading={loading} onRowClick={openEditRole} />}
      </div>

      {/* ========== CREATE/EDIT USER MODAL ========== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateUser} onClose={() => setShowCreateUser(false)}
        title={editingUser ? `Edit User — ${editingUser.username}` : 'Create User'} size="xl"
        footer={<><button onClick={() => setShowCreateUser(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSaveUser} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingUser ? 'Update' : 'Create User'}</button></>}>
        <div className="space-y-4">
          {!editingUser && (
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Username" required><input value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} className="input-field font-mono" placeholder="jdoe" /></FormField>
              <FormField label="Password" required><input type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="input-field" placeholder="Min 6 characters" /></FormField>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name" required><input value={userForm.first_name} onChange={e => setUserForm({...userForm, first_name: e.target.value})} className="input-field" /></FormField>
            <FormField label="Last Name" required><input value={userForm.last_name} onChange={e => setUserForm({...userForm, last_name: e.target.value})} className="input-field" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Email" required><input type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="input-field" /></FormField>
            <FormField label="Phone"><input value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} className="input-field" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Role" required>
              <select value={userForm.role_id} onChange={e => setUserForm({...userForm, role_id: e.target.value})} className="select-field">
                <option value="">Select role...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.role_name} ({r.role_code})
                    {r.permissions?.all ? ' — Full Access' : ` — ${r.permissions?.modules?.length || 0} modules`}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Status">
              <select value={userForm.status} onChange={e => setUserForm({...userForm, status: e.target.value})} className="select-field">
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="locked">Locked</option>
              </select>
            </FormField>
          </div>

          {/* Show what the selected role can access */}
          {userForm.role_id && (() => {
            const role = roles.find(r => r.id === userForm.role_id);
            if (!role) return null;
            const perms = role.permissions || {};
            return (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 mb-2">Role: {role.role_name} — Accessible Pages</p>
                {perms.all ? (
                  <p className="text-sm text-emerald-600 font-medium">Full access to all pages</p>
                ) : perms.pages ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(perms.pages).filter(k => perms.pages[k]?.view).map(k => {
                      const pg = ALL_PAGES.find(p => p.key === k);
                      const ops = perms.pages[k];
                      const opLabels = CRUD_OPS.filter(o => ops[o]).map(o => o[0].toUpperCase()).join('');
                      return <span key={k} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-full text-[10px] text-blue-600 dark:text-blue-400 font-medium">{pg?.label || k} <span className="text-gray-400">[{opLabels}]</span></span>;
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(perms.modules || []).map(m => <span key={m} className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-600 font-medium">{m}</span>)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </Modal>

      {/* ========== RESET PASSWORD MODAL ========== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!showResetPw} onClose={() => setShowResetPw(null)} title={`Reset Password — ${showResetPw?.username}`} size="sm"
        footer={<><button onClick={() => setShowResetPw(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleResetPassword} className="btn-primary">Reset Password</button></>}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Set a new password for <span className="font-medium">{showResetPw?.first_name} {showResetPw?.last_name}</span></p>
          <FormField label="New Password" required>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input-field" placeholder="Min 6 characters" />
          </FormField>
        </div>
      </Modal>

      {/* ========== CREATE/EDIT ROLE MODAL ========== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={showCreateRole} onClose={() => setShowCreateRole(false)}
        title={editingRole ? `Edit Role — ${editingRole.role_code}` : 'Create Role'} size="xl"
        footer={<><button onClick={() => setShowCreateRole(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSaveRole} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingRole ? 'Update Role' : 'Create Role'}</button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Role Code" required>
              <input value={roleForm.role_code} onChange={e => setRoleForm({...roleForm, role_code: e.target.value.toUpperCase().replace(/\s/g, '_')})}
                className="input-field font-mono" placeholder="e.g. SALES_REP" disabled={!!editingRole} maxLength={30} />
            </FormField>
            <FormField label="Role Name" required>
              <input value={roleForm.role_name} onChange={e => setRoleForm({...roleForm, role_name: e.target.value})} className="input-field" placeholder="e.g. Sales Representative" />
            </FormField>
            <FormField label="Description">
              <input value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})} className="input-field" placeholder="Brief description" />
            </FormField>
          </div>

          {/* Full Access Toggle */}
          <label className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer">
            <input type="checkbox" checked={roleForm.permissions.all} onChange={toggleAll} className="w-4 h-4 rounded border-gray-300 text-amber-600" />
            <div>
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Full Access (Superadmin)</span>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">Overrides all page-level permissions — grants everything</p>
            </div>
          </label>

          {/* Page-Level CRUD Matrix */}
          {!roleForm.permissions.all && (<>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Page & Action Permissions</p><p className="text-[10px] text-gray-400">Check which pages and CRUD operations this role can perform</p></div>
              <div className="flex gap-2"><button onClick={selectAllPages} className="text-xs text-blue-600 hover:underline">Grant All</button><span className="text-gray-300">|</span><button onClick={clearAllPages} className="text-xs text-gray-500 hover:underline">Revoke All</button></div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10"><tr className="bg-gray-100 dark:bg-gray-800 border-b">
                  <th className="px-3 py-2 text-left text-gray-500 font-semibold w-[220px]">Page</th>
                  {CRUD_OPS.map(op => <th key={op} className="px-2 py-2 text-center text-gray-500 font-semibold capitalize w-16">{op}</th>)}
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold w-14">All</th>
                </tr></thead>
                <tbody>
                  {PAGE_REGISTRY.map(group => {
                    const pgs = roleForm.permissions.pages || {};
                    const allInModule = group.pages.every(p => CRUD_OPS.every(op => pgs[p.key]?.[op]));
                    const noneInModule = group.pages.every(p => !pgs[p.key]?.view);
                    return [
                      <tr key={`mod-${group.module}`} className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                        <td className="px-3 py-1.5 font-semibold text-gray-700 dark:text-gray-300 text-[11px] uppercase tracking-wider">{group.label}</td>
                        {CRUD_OPS.map(op => <td key={op}></td>)}
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={allInModule} onChange={() => toggleModuleAll(group.module, !allInModule)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                        </td>
                      </tr>,
                      ...group.pages.map(page => {
                        const perms = pgs[page.key] || {};
                        const allChecked = CRUD_OPS.every(op => perms[op]);
                        return (
                          <tr key={page.key} className={`border-t border-gray-100 dark:border-gray-800 ${perms.view ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                            <td className="px-3 py-1.5 pl-6 text-gray-600 dark:text-gray-400">{page.label}</td>
                            {CRUD_OPS.map(op => (
                              <td key={op} className="px-2 py-1.5 text-center">
                                <input type="checkbox" checked={perms[op] || false} onChange={() => togglePageOp(page.key, op)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={allChecked} onChange={() => {
                                const pages2 = { ...roleForm.permissions.pages };
                                pages2[page.key] = { view: !allChecked, create: !allChecked, edit: !allChecked, delete: !allChecked, approve: !allChecked };
                                setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, pages: pages2 } });
                              }} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 cursor-pointer" />
                            </td>
                          </tr>
                        );
                      })
                    ];
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">
                {(() => { const pgs = roleForm.permissions.pages || {}; const viewable = Object.keys(pgs).filter(k => pgs[k]?.view).length; return `${viewable} of ${ALL_PAGES.length} pages accessible`; })()}
              </p>
            </div>
          </>)}
        </div>
      </Modal>

      {/* ========== DELETE ROLE CONFIRMATION ========== */}
      <Modal error={modalError} onClearError={() => setModalError(null)} isOpen={!!confirmDeleteRole} onClose={() => setConfirmDeleteRole(null)} title="Delete Role" size="sm"
        footer={<><button onClick={() => setConfirmDeleteRole(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDeleteRole} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg">Delete</button></>}>
        {confirmDeleteRole && (
          <div>
            <p className="text-sm text-gray-600 mb-3">Are you sure you want to delete the role <span className="font-semibold">{confirmDeleteRole.role_name}</span>?</p>
            {parseInt(confirmDeleteRole.user_count) > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                <p className="text-sm text-rose-700 font-medium">Cannot delete — {confirmDeleteRole.user_count} user(s) assigned</p>
                <p className="text-xs text-rose-600 mt-1">Reassign users to another role first.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
