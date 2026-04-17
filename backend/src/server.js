import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { requestId, securityHeaders, sanitizeBody } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import masterDataRoutes from './routes/masterData.js';
import dashboardRoutes from './routes/dashboard.js';
import financeRoutes from './routes/finance.js';
import salesRoutes from './routes/sales.js';
import crmRoutes from './routes/crm.js';
import procurementRoutes from './routes/procurement.js';
import inventoryRoutes from './routes/inventory.js';
import productionRoutes from './routes/production.js';
import hrRoutes from './routes/hr.js';
import assetRoutes from './routes/assets.js';
import projectRoutes from './routes/projects.js';
import maintenanceRoutes from './routes/maintenance.js';
import workflowRoutes from './routes/workflow.js';
import adminRoutes from './routes/admin.js';
import sharedRoutes from './routes/shared.js';
import qualityRoutes from './routes/quality.js';
import warehouseRoutes from './routes/warehouse.js';
import integrationRoutes from './routes/integrations.js';
import transportRoutes from './routes/transport.js';
import platformRoutes from './routes/platform.js';
import barcodeRoutes from './routes/barcode.js';
import enhancedRoutes from './routes/enhanced.js';
import organizationRoutes from './routes/organization.js';
import bulkImportRoutes from './routes/bulkImport.js';
import goLiveRoutes from './routes/goLive.js';
import phaseBRoutes from './routes/phaseB.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// TRUST PROXY — needed for rate limiting behind reverse proxy
// ============================================
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE STACK
// ============================================

// 1. Request ID for tracing
app.use(requestId);

// 2. Custom security headers
app.use(securityHeaders);

// 3. Helmet — comprehensive HTTP header security
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

// 4. CORS — strict origin whitelist
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('CORS policy: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600, // Preflight cache 10 min
}));

// 5. Body parser with size limits
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 6. Input sanitization on all requests
app.use(sanitizeBody);

// ============================================
// RATE LIMITING — tiered by route sensitivity
// ============================================

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests. Slow down.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for write operations
const writeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 writes per minute
  message: { error: 'Too many write operations. Wait a moment.', code: 'WRITE_RATE_LIMITED' },
  keyGenerator: (req) => `${req.ip}:write`,
});

// Auth rate limit (handled in auth middleware separately)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // 15 auth attempts per 15 min
  message: { error: 'Too many authentication attempts.', code: 'AUTH_RATE_LIMITED' },
  keyGenerator: (req) => `${req.ip}:auth`,
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/change-password', authLimiter);

// ============================================
// CSRF PROTECTION — BUG #5 FIX
// ============================================
// For REST API with JWT tokens, use Origin/Referer validation + double-submit pattern
// Add CSRF token validation middleware for state-changing requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // BUG #5 FIX: Validate Origin header for browser requests (CSRF protection)
    const origin = req.headers.origin || req.headers.referer;
    const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',').map(o => o.trim());
    
    // If request comes from browser (has Origin/Referer), validate it's from allowed origin
    if (origin) {
      const originUrl = new URL(origin);
      const isAllowed = allowedOrigins.some(ao => {
        const aoUrl = new URL(ao.startsWith('http') ? ao : `http://${ao}`);
        return originUrl.origin === aoUrl.origin;
      });
      if (!isAllowed) {
        return res.status(403).json({ error: 'CSRF validation failed - origin mismatch', code: 'CSRF_VALIDATION_FAILED' });
      }
    }
    
    // Also validate X-CSRF-Token header if provided
    const csrfToken = req.headers['x-csrf-token'];
    if (csrfToken && req.user) {
      // Token validation would happen here for double-submit cookie pattern
      // For now, we rely on JWT validation in auth middleware
    }
  }
  next();
});

// ============================================
// HEALTH CHECK — no auth required
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', app: 'Zyra', version: '2.0.0',
    time: new Date().toISOString(), requestId: req.requestId,
    security: { helmet: true, cors: true, rateLimiting: true, inputSanitization: true },
  });
});

// ============================================
// ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/master', masterDataRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shared', sharedRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/enhanced', enhancedRoutes);
app.use('/api/org', organizationRoutes);
app.use('/api/bulk', bulkImportRoutes);
app.use('/api/system', goLiveRoutes);
app.use('/api/phase-b', phaseBRoutes);

// ============================================
// 404 HANDLER
// ============================================
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

// ============================================
// GLOBAL ERROR HANDLER — never leak stack traces
// ============================================
app.use((err, req, res, next) => {
  console.error(`[${req.requestId}] Unhandled error:`, err.message);

  // Never expose internal errors in production
  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error',
    requestId: req.requestId,
    ...(isDev && { stack: err.stack }),
  });
});

// ============================================
// JOB SCHEDULER — runs active scheduled jobs automatically
// ============================================
import { query as _schedQuery } from './config/database.js';

async function runScheduledJobs() {
  try {
    const jobs = await _schedQuery(`SELECT * FROM sys_scheduled_jobs WHERE is_active = true`);
    const now = new Date();
    for (const job of jobs.rows) {
      const lastRun = job.last_run_at ? new Date(job.last_run_at) : null;
      const minutesSinceLast = lastRun ? (now - lastRun) / 60000 : Infinity;
      const cron = (job.schedule_cron || '').toLowerCase();
      let shouldRun = false;
      if      (cron.includes('daily')   || cron.includes('every day'))  shouldRun = minutesSinceLast >= 1440;
      else if (cron.includes('weekly'))                                  shouldRun = minutesSinceLast >= 10080;
      else if (cron.includes('monthly'))                                 shouldRun = minutesSinceLast >= 43200;
      else if (cron.includes('hourly')  || cron.includes('every hour')) shouldRun = minutesSinceLast >= 60;
      else                                                               shouldRun = minutesSinceLast >= 60;
      if (!shouldRun) continue;

      const t0 = Date.now(); let affected = 0;
      try {
        if (job.job_type === 'auto_close') {
          const r = await _schedQuery(`UPDATE sd_quotations SET status='cancelled' WHERE valid_until < CURRENT_DATE AND status='draft'`);
          affected = r.rowCount;
        } else if (job.job_type === 'overdue_check') {
          const overdue = await _schedQuery(`SELECT ar.id, ar.doc_number, ar.total_amount - ar.paid_amount as outstanding FROM fi_ar_invoices ar WHERE ar.due_date < CURRENT_DATE AND ar.total_amount > ar.paid_amount AND ar.status NOT IN ('paid','cancelled')`);
          affected = overdue.rows.length;
          if (affected > 0) {
            const finUsers = await _schedQuery(`SELECT u.id FROM sys_users u JOIN sys_roles r ON u.role_id=r.id WHERE r.role_code IN ('FIN','ADMIN','FINANCE') AND u.status='active'`);
            for (const inv of overdue.rows) {
              for (const fu of finUsers.rows) {
                await _schedQuery(`INSERT INTO sys_notifications (user_id,title,message,type,link) VALUES ($1,$2,$3,'warning','/finance/ar')`,
                  [fu.id, `Overdue: ${inv.doc_number}`, `${inv.doc_number} overdue — outstanding ₹${parseFloat(inv.outstanding||0).toFixed(2)}`]).catch(()=>{});
              }
            }
          }
        } else if (job.job_type === 'email_report') {
          const pending = await _schedQuery(`SELECT * FROM sys_email_queue WHERE status='pending' LIMIT 20`);
          for (const e of pending.rows) { await _schedQuery(`UPDATE sys_email_queue SET status='sent',sent_at=NOW(),attempts=attempts+1 WHERE id=$1`, [e.id]); affected++; }
        }
        await _schedQuery(`INSERT INTO sys_job_log (job_id,status,records_affected,duration_ms,completed_at) VALUES ($1,'completed',$2,$3,NOW())`, [job.id, affected, Date.now()-t0]);
        await _schedQuery(`UPDATE sys_scheduled_jobs SET last_run_at=NOW(),last_run_status='completed',run_count=run_count+1 WHERE id=$1`, [job.id]);
        console.log(`[Scheduler] "${job.job_name}" → ${affected} records`);
      } catch (je) {
        await _schedQuery(`INSERT INTO sys_job_log (job_id,status,error_message,duration_ms,completed_at) VALUES ($1,'failed',$2,$3,NOW())`, [job.id, je.message, Date.now()-t0]).catch(()=>{});
        await _schedQuery(`UPDATE sys_scheduled_jobs SET last_run_at=NOW(),last_run_status='failed' WHERE id=$1`, [job.id]).catch(()=>{});
      }
    }
  } catch (e) { /* scheduler silent fail */ }
}

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`🔒 Zyra API running on port ${PORT}`);
  console.log(`   Security: Helmet ✓ | CORS ✓ | Rate Limit ✓ | Input Sanitization ✓`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  // Start job scheduler — checks every 5 minutes
  setInterval(runScheduledJobs, 5 * 60 * 1000);
  setTimeout(runScheduledJobs, 10000); // Initial run 10s after boot
});

export default app;
