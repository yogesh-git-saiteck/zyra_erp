import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticate, auditLog, adminOnly, loginRateLimiter, checkAccountLockout, recordFailedLogin, validatePassword } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

const router = Router();

// ============================================
// AUTH
// ============================================
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return errorResponse(res, 'Username and password required', 400);

    // Check account lockout
    const lockStatus = await checkAccountLockout(username);
    if (lockStatus.locked) return errorResponse(res, lockStatus.message, 423);

    const result = await query(
      `SELECT u.*, r.role_code, r.role_name, r.permissions
       FROM sys_users u JOIN sys_roles r ON u.role_id = r.id
       WHERE (u.username = $1 OR u.email = $1)`, [username]);

    if (!result.rows.length) {
      // Don't reveal whether username exists — same error for missing user and wrong password
      return errorResponse(res, 'Invalid credentials', 401);
    }
    const user = result.rows[0];
    if (user.status === 'locked') return errorResponse(res, 'Account locked. Contact administrator.', 423);
    if (user.status !== 'active') return errorResponse(res, 'Account not active', 403);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordFailedLogin(username, req.ip);
      // Check if this attempt triggered lockout
      const newLock = await checkAccountLockout(username);
      if (newLock.locked) return errorResponse(res, newLock.message, 423);
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Success — reset failed attempts
    await query(`UPDATE sys_users SET last_login = NOW(), failed_attempts = 0, locked_until = NULL, status = 'active' WHERE id = $1`, [user.id]);

    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role_code, iat: Math.floor(Date.now() / 1000) },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h', algorithm: 'HS256' });

    // Audit successful login
    await auditLog(user.id, 'LOGIN', 'auth', user.id, null, { ip: req.ip }, req);

    successResponse(res, {
      token,
      user: {
        id: user.id, username: user.username, email: user.email,
        firstName: user.first_name, lastName: user.last_name,
        role: user.role_code, roleName: user.role_name,
        permissions: perms, language: user.language,
      }
    }, 'Login successful');
  } catch (err) { console.error('Login error:', err); errorResponse(res, 'Server error'); }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.phone,
              u.avatar_url, u.language, u.timezone, u.preferences, u.last_login,
              r.role_code, r.role_name, r.permissions,
              c.company_code, c.company_name
       FROM sys_users u JOIN sys_roles r ON u.role_id = r.id
       LEFT JOIN org_companies c ON c.id = u.default_company_id
       WHERE u.id = $1`, [req.user.id]);
    const row = result.rows[0];
    if (row) row.permissions = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    successResponse(res, row);
  } catch (err) { errorResponse(res, 'Server error'); }
});

// Update own profile (name, email, phone, language, preferences)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, language, preferences } = req.body;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse(res, 'Invalid email format', 400);
    // Check email uniqueness (excluding self)
    if (email) {
      const exists = await query(`SELECT id FROM sys_users WHERE email = $1 AND id != $2`, [email, req.user.id]);
      if (exists.rows.length) return errorResponse(res, 'Email already in use by another account', 400);
    }
    await query(
      `UPDATE sys_users SET
         first_name  = COALESCE($1, first_name),
         last_name   = COALESCE($2, last_name),
         email       = COALESCE($3, email),
         phone       = COALESCE($4, phone),
         language    = COALESCE($5, language),
         preferences = COALESCE($6::jsonb, preferences),
         updated_at  = NOW()
       WHERE id = $7`,
      [first_name || null, last_name || null, email || null, phone || null,
       language || null, preferences ? JSON.stringify(preferences) : null, req.user.id]
    );
    await auditLog(req.user.id, 'UPDATE', 'user_profile', req.user.id, null, { fields: Object.keys(req.body) }, req);
    // Return updated profile
    const updated = await query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.phone, u.language, u.preferences,
              r.role_code, r.role_name, r.permissions
       FROM sys_users u JOIN sys_roles r ON u.role_id = r.id WHERE u.id = $1`, [req.user.id]);
    const row = updated.rows[0];
    if (row) row.permissions = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    successResponse(res, row, 'Profile updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await query(`SELECT password_hash FROM sys_users WHERE id = $1`, [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return errorResponse(res, 'Current password incorrect', 400);
    const hash = await bcrypt.hash(newPassword, 12);
    await query(`UPDATE sys_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hash, req.user.id]);
    successResponse(res, null, 'Password changed');
  } catch (err) { errorResponse(res, 'Server error'); }
});

// ============================================
// USER MANAGEMENT
// ============================================
router.get('/users', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.phone,
              u.status, u.last_login, u.created_at, u.role_id,
              r.role_code, r.role_name
       FROM sys_users u JOIN sys_roles r ON u.role_id = r.id ORDER BY u.first_name`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, 'Server error'); }
});

router.post('/users', authenticate, adminOnly, async (req, res) => {
  try {
    const { username, email, password, first_name, last_name, phone, role_id, status } = req.body;
    if (!username || !email || !password || !first_name || !last_name || !role_id) {
      return errorResponse(res, 'Username, email, password, name, and role are required', 400);
    }
    // Validate password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) return errorResponse(res, `Weak password: ${pwCheck.errors.join(', ')}`, 400);
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse(res, 'Invalid email format', 400);
    // Validate username (alphanumeric + underscore, 3-30 chars)
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return errorResponse(res, 'Username must be 3-30 alphanumeric characters', 400);

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO sys_users (username, email, password_hash, first_name, last_name, phone, role_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, username, email, first_name, last_name, status`,
      [username, email, hash, first_name, last_name, phone, role_id, status || 'active']);
    await auditLog(req.user.id, 'CREATE', 'user', result.rows[0].id, null, { username, email }, req);
    successResponse(res, result.rows[0], 'User created', 201);
  } catch (err) {
    if (err.message.includes('duplicate')) return errorResponse(res, 'Username or email already exists', 400);
    errorResponse(res, err.message);
  }
});

router.put('/users/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, role_id, status } = req.body;
    const result = await query(
      `UPDATE sys_users SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
       email=COALESCE($3,email), phone=COALESCE($4,phone), role_id=COALESCE($5,role_id),
       status=COALESCE($6,status), updated_at=NOW()
       WHERE id=$7 RETURNING id, username, email, first_name, last_name, status`,
      [first_name, last_name, email, phone, role_id, status, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'User not found', 404);
    await auditLog(req.user.id, 'UPDATE', 'user', req.params.id, null, req.body, req);
    successResponse(res, result.rows[0], 'User updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/users/:id/reset-password', authenticate, adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) return errorResponse(res, `Weak password: ${pwCheck.errors.join(', ')}`, 400);
    const hash = await bcrypt.hash(newPassword, 12);
    await query(`UPDATE sys_users SET password_hash=$1, failed_attempts=0, locked_until=NULL, updated_at=NOW() WHERE id=$2`, [hash, req.params.id]);
    await auditLog(req.user.id, 'RESET_PASSWORD', 'user', req.params.id, null, null, req);
    successResponse(res, null, 'Password reset');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/users/:id', authenticate, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return errorResponse(res, 'Cannot delete yourself', 400);
    await query(`UPDATE sys_users SET status='inactive' WHERE id=$1`, [req.params.id]);
    await auditLog(req.user.id, 'DEACTIVATE', 'user', req.params.id, null, null, req);
    successResponse(res, null, 'User deactivated');
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// ROLE MANAGEMENT
// ============================================
router.get('/roles', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, (SELECT COUNT(*) FROM sys_users u WHERE u.role_id = r.id) as user_count
       FROM sys_roles r ORDER BY r.role_name`);
    // Parse permissions JSON
    const rows = result.rows.map(r => ({
      ...r,
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions,
    }));
    successResponse(res, rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/roles', authenticate, adminOnly, async (req, res) => {
  try {
    const { role_code, role_name, description, permissions } = req.body;
    if (!role_code || !role_name) return errorResponse(res, 'Role code and name required', 400);

    // permissions = { modules: ['dashboard','finance','sales',...], all: false }
    const perms = permissions || { modules: ['dashboard', 'settings'], all: false };
    const result = await query(
      `INSERT INTO sys_roles (role_code, role_name, description, permissions, is_system)
       VALUES ($1,$2,$3,$4,false) RETURNING *`,
      [role_code.toUpperCase(), role_name, description, JSON.stringify(perms)]);
    await auditLog(req.user.id, 'CREATE', 'role', result.rows[0].id, null, { role_code, role_name }, req);
    const row = result.rows[0];
    row.permissions = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    successResponse(res, row, 'Role created', 201);
  } catch (err) {
    if (err.message.includes('duplicate')) return errorResponse(res, 'Role code already exists', 400);
    errorResponse(res, err.message);
  }
});

router.put('/roles/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { role_name, description, permissions } = req.body;
    const result = await query(
      `UPDATE sys_roles SET role_name=COALESCE($1,role_name), description=COALESCE($2,description),
       permissions=COALESCE($3,permissions)
       WHERE id=$4 RETURNING *`,
      [role_name, description, permissions ? JSON.stringify(permissions) : null, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Role not found', 404);
    await auditLog(req.user.id, 'UPDATE', 'role', req.params.id, null, req.body, req);
    const row = result.rows[0];
    row.permissions = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    successResponse(res, row, 'Role updated');
  } catch (err) { errorResponse(res, err.message); }
});

router.delete('/roles/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const usage = await query(`SELECT COUNT(*) FROM sys_users WHERE role_id = $1`, [req.params.id]);
    if (parseInt(usage.rows[0].count) > 0) return errorResponse(res, `Cannot delete — ${usage.rows[0].count} user(s) assigned to this role`, 400);
    const role = await query(`SELECT is_system FROM sys_roles WHERE id = $1`, [req.params.id]);
    if (role.rows[0]?.is_system) return errorResponse(res, 'Cannot delete system role', 400);
    await query(`DELETE FROM sys_roles WHERE id = $1`, [req.params.id]);
    await auditLog(req.user.id, 'DELETE', 'role', req.params.id, null, null, req);
    successResponse(res, null, 'Role deleted');
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
