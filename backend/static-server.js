import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 8080;

// Import all middleware
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requestId, securityHeaders, sanitizeBody } from './src/middleware/auth.js';

// Import all routes
import authRoutes from './src/routes/auth.js';
import masterDataRoutes from './src/routes/masterData.js';
import dashboardRoutes from './src/routes/dashboard.js';
import financeRoutes from './src/routes/finance.js';
import salesRoutes from './src/routes/sales.js';
import crmRoutes from './src/routes/crm.js';
import procurementRoutes from './src/routes/procurement.js';
import inventoryRoutes from './src/routes/inventory.js';
import productionRoutes, { initProductionSchema } from './src/routes/production.js';
import hrRoutes from './src/routes/hr.js';
import assetRoutes from './src/routes/assets.js';
import projectRoutes from './src/routes/projects.js';
import maintenanceRoutes from './src/routes/maintenance.js';
import workflowRoutes from './src/routes/workflow.js';
import adminRoutes from './src/routes/admin.js';
import sharedRoutes from './src/routes/shared.js';
import qualityRoutes from './src/routes/quality.js';
import warehouseRoutes from './src/routes/warehouse.js';
import integrationRoutes from './src/routes/integrations.js';
import transportRoutes from './src/routes/transport.js';
import platformRoutes from './src/routes/platform.js';
import barcodeRoutes from './src/routes/barcode.js';
import enhancedRoutes from './src/routes/enhanced.js';
import organizationRoutes from './src/routes/organization.js';
import bulkImportRoutes from './src/routes/bulkImport.js';
import goLiveRoutes from './src/routes/goLive.js';
import phaseBRoutes from './src/routes/phaseB.js';
import gatePassRoutes from './src/routes/gatePass.js';

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(requestId);
app.use(securityHeaders);
app.use(sanitizeBody);

const apiLimiter = rateLimit({ windowMs: 60000, max: 500 });
app.use('/api/', apiLimiter);

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
app.use('/api/gate-passes', gatePassRoutes);

// Serve frontend static files
const frontendDist = resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// SPA fallback — all non-API routes serve index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(frontendDist, 'index.html'));
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 NexusERP running on http://0.0.0.0:${PORT}`);
  await initProductionSchema();
});
