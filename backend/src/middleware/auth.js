import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/database.js';

// ============================================
// REQUEST ID — trace every request
// ============================================
export const requestId = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

// ============================================
// SECURITY HEADERS — beyond helmet defaults
// ============================================
export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
};

// ============================================
// INPUT SANITIZER — strip dangerous characters
// ============================================
function sanitize(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+\s*=/gi, '');
  }
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      clean[k] = sanitize(v);
    }
    return clean;
  }
  return obj;
}

export const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body);
  }
  next();
};

// ============================================
// AUTHENTICATE — verify JWT + active user
// ============================================
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = header.split(' ')[1];
    if (!token || token.length > 2000) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
        maxAge: '24h', // Fixed: Match JWT_EXPIRES_IN (no extra hour bypass)
      });
      
      // BUG #4 FIX: Verify token creation time is recent (within 24h + 5min grace)
      const tokenIssuedAt = decoded.iat || Math.floor(Date.now() / 1000);
      const tokenAgeSeconds = Math.floor(Date.now() / 1000) - tokenIssuedAt;
      const maxTokenAgeSeconds = (24 * 60 * 60) + (5 * 60); // 24h + 5min grace for clock skew
      
      if (tokenAgeSeconds > maxTokenAgeSeconds) {
        return res.status(401).json({ error: 'Token age exceeded safe window', code: 'TOKEN_AGED_OUT' });
      }
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      if (jwtErr.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
      return res.status(401).json({ error: 'Authentication failed' });
    }

    if (!decoded.userId) {
      return res.status(401).json({ error: 'Malformed token' });
    }

    const result = await query(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.status,
              r.role_code, r.role_name, r.permissions
       FROM sys_users u
       JOIN sys_roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'User not found' });

    const user = result.rows[0];

    // Check user status
    if (user.status === 'locked') return res.status(403).json({ error: 'Account locked. Contact administrator.', code: 'ACCOUNT_LOCKED' });
    if (user.status === 'inactive') return res.status(403).json({ error: 'Account deactivated', code: 'ACCOUNT_INACTIVE' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account not active' });

    // Parse permissions
    user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || { all: false, modules: [] });

    req.user = user;
    next();
  } catch (err) {
    console.error(`Auth error [${req.requestId}]:`, err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// ============================================
// AUTHORIZE — role-based access check
// ============================================
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const userRole = req.user.role_code;
    if (userRole === 'ADMIN') return next();
    if (req.user.permissions?.all) return next();
    if (allowedRoles.includes(userRole)) return next();

    return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
  };
};

// ============================================
// MODULE GUARD — check if user has access to specific module
// ============================================
export const moduleGuard = (moduleKey) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const perms = req.user.permissions || {};
    if (perms.all) return next();
    if ((perms.modules || []).includes(moduleKey)) return next();

    return res.status(403).json({ error: `Access denied to module: ${moduleKey}`, code: 'MODULE_FORBIDDEN' });
  };
};

// ============================================
// ADMIN ONLY — restrict to admin users
// ============================================
export const adminOnly = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role_code === 'ADMIN' || req.user.permissions?.all) return next();
  return res.status(403).json({ error: 'Admin access required', code: 'ADMIN_ONLY' });
};

// ============================================
// ACCOUNT LOCKOUT — auto-lock after failed attempts
// ============================================
export const checkAccountLockout = async (username) => {
  const result = await query(
    `SELECT id, failed_attempts, locked_until, status FROM sys_users WHERE (username = $1 OR email = $1)`, [username]);
  if (!result.rows.length) return { locked: false };

  const user = result.rows[0];

  // Check if currently locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minsLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return { locked: true, minutesLeft: minsLeft, message: `Account locked. Try again in ${minsLeft} minute(s).` };
  }

  // If lock expired, reset
  if (user.locked_until && new Date(user.locked_until) <= new Date()) {
    await query(`UPDATE sys_users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`, [user.id]);
    return { locked: false };
  }

  // Check if should be locked
  if (user.failed_attempts >= MAX_FAILED_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60000);
    await query(`UPDATE sys_users SET status = 'locked', locked_until = $1 WHERE id = $2`, [lockUntil, user.id]);
    return { locked: true, minutesLeft: LOCKOUT_DURATION_MINUTES, message: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_DURATION_MINUTES} minutes.` };
  }

  return { locked: false, attemptsLeft: MAX_FAILED_ATTEMPTS - user.failed_attempts };
};

export const recordFailedLogin = async (username, ip) => {
  await query(
    `UPDATE sys_users SET failed_attempts = failed_attempts + 1 WHERE (username = $1 OR email = $1)`, [username]);
  // Log failed attempt
  const user = await query(`SELECT id FROM sys_users WHERE (username = $1 OR email = $1)`, [username]);
  if (user.rows[0]) {
    await query(
      `INSERT INTO sys_audit_log (user_id, action, entity_type, ip_address, description, module)
       VALUES ($1, 'LOGIN_FAILED', 'auth', $2, 'Failed login attempt', 'auth')`,
      [user.rows[0].id, ip]);
  }
};

// ============================================
// AUDIT LOG — enhanced with request tracking
// ============================================
export const auditLog = async (userId, action, entityType, entityId, oldValues, newValues, req) => {
  try {
    const ip = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || req?.connection?.remoteAddress || 'unknown';
    const ua = req?.headers?.['user-agent']?.substring(0, 200) || 'unknown';
    await query(
      `INSERT INTO sys_audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, module, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [userId, action, entityType, entityId,
       oldValues ? JSON.stringify(oldValues) : null,
       newValues ? JSON.stringify(newValues) : null,
       ip, entityType?.split('_')[0],
       `${action} ${entityType} [${req?.requestId || 'no-id'}] UA: ${ua.substring(0, 50)}`]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

// ============================================
// LOGIN RATE LIMITER — separate from general rate limit
// ============================================
import rateLimit from 'express-rate-limit';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 min per IP
  message: { error: 'Too many login attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip + ':login',
});

// ============================================
// PASSWORD VALIDATION
// ============================================
export const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('At least one number');
  return { valid: errors.length === 0, errors };
};
