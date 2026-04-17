import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/helpers.js';

const router = Router();

// ============================================
// MAIN KPIs — all live from DB
// ============================================
router.get('/kpis', authenticate, async (req, res) => {
  try {
    const [
      salesThis, salesLast, poThis, poLast, openAP, openAR,
      inventory, stockValue, employees, opportunities,
      recentActivity, pendingApprovals, overdueAP, overdueAR,
      journalsToday, paymentsMonth, productionActive, leavesPending
    ] = await Promise.all([
      // Sales this month vs last month for trend
      query(`SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as amount
             FROM sd_sales_orders WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled'`),
      query(`SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as amount
             FROM sd_sales_orders WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
             AND order_date < DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled'`),
      // PO this month vs last
      query(`SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as amount,
             COUNT(*) FILTER(WHERE status='draft') as pending
             FROM pur_purchase_orders WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE)`),
      query(`SELECT COALESCE(SUM(total_amount),0) as amount
             FROM pur_purchase_orders WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
             AND order_date < DATE_TRUNC('month', CURRENT_DATE)`),
      // Open AP/AR
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount),0) as balance
             FROM fi_ap_invoices WHERE status != 'cancelled' AND total_amount > paid_amount`),
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount),0) as balance
             FROM fi_ar_invoices WHERE status != 'cancelled' AND total_amount > paid_amount`),
      // Inventory
      query(`SELECT COUNT(DISTINCT material_id) as materials, COALESCE(SUM(quantity),0) as total_qty FROM inv_stock WHERE quantity > 0`),
      query(`SELECT COALESCE(SUM(s.quantity * COALESCE(m.standard_price,0)),0) as value FROM inv_stock s JOIN mm_materials m ON s.material_id = m.id WHERE s.quantity > 0`),
      // Employees
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='active') as active FROM hr_employees`),
      // CRM
      query(`SELECT COUNT(*) as total, COALESCE(SUM(expected_value),0) as pipeline,
             COUNT(*) FILTER(WHERE stage='negotiation') as hot_leads
             FROM crm_opportunities WHERE status = 'open'`),
      // Recent activity
      query(`SELECT a.action, a.entity_type, a.description, a.created_at,
             u.first_name || ' ' || u.last_name as user_name
             FROM sys_audit_log a LEFT JOIN sys_users u ON a.user_id = u.id
             ORDER BY a.created_at DESC LIMIT 15`),
      // Pending approvals for this user
      query(`SELECT COUNT(*) as count FROM wf_approvals WHERE approver_id = $1 AND status = 'pending'`, [req.user.id]),
      // Overdue
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount),0) as amount
             FROM fi_ap_invoices WHERE due_date < CURRENT_DATE AND total_amount > paid_amount AND status != 'cancelled'`),
      query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount),0) as amount
             FROM fi_ar_invoices WHERE due_date < CURRENT_DATE AND total_amount > paid_amount AND status != 'cancelled'`),
      // Today's journal entries
      query(`SELECT COUNT(*) as count FROM fi_journal_headers WHERE posting_date = CURRENT_DATE`),
      // Payments this month
      query(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM fi_payments
             WHERE payment_date >= DATE_TRUNC('month', CURRENT_DATE) AND status != 'cancelled'`),
      // Active production
      query(`SELECT COUNT(*) as count FROM pp_production_orders WHERE status IN ('confirmed','in_process')`),
      // Pending leaves
      query(`SELECT COUNT(*) as count FROM hr_leave_requests WHERE status = 'pending'`),
    ]);

    // Compute trends
    const salesAmt = parseFloat(salesThis.rows[0].amount);
    const salesLastAmt = parseFloat(salesLast.rows[0].amount);
    const salesTrend = salesLastAmt > 0 ? (((salesAmt - salesLastAmt) / salesLastAmt) * 100).toFixed(1) : salesAmt > 0 ? 100 : 0;

    const poAmt = parseFloat(poThis.rows[0].amount);
    const poLastAmt = parseFloat(poLast.rows[0].amount);
    const poTrend = poLastAmt > 0 ? (((poAmt - poLastAmt) / poLastAmt) * 100).toFixed(1) : poAmt > 0 ? 100 : 0;

    successResponse(res, {
      salesOrders: { ...salesThis.rows[0], trend: parseFloat(salesTrend), trendUp: parseFloat(salesTrend) >= 0 },
      purchaseOrders: { ...poThis.rows[0], trend: parseFloat(poTrend), trendUp: parseFloat(poTrend) >= 0 },
      accountsPayable: { ...openAP.rows[0], overdue_count: parseInt(overdueAP.rows[0].count), overdue_amount: overdueAP.rows[0].amount },
      accountsReceivable: { ...openAR.rows[0], overdue_count: parseInt(overdueAR.rows[0].count), overdue_amount: overdueAR.rows[0].amount },
      inventory: { ...inventory.rows[0], stock_value: stockValue.rows[0].value },
      employees: employees.rows[0],
      opportunities: opportunities.rows[0],
      pendingApprovals: parseInt(pendingApprovals.rows[0].count),
      journalsToday: parseInt(journalsToday.rows[0].count),
      paymentsMonth: paymentsMonth.rows[0],
      productionActive: parseInt(productionActive.rows[0].count),
      leavesPending: parseInt(leavesPending.rows[0].count),
      recentActivity: recentActivity.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// AI INSIGHTS — computed from real data
// ============================================
router.get('/ai-insights', authenticate, async (req, res) => {
  try {
    const insights = [];

    // 1. Sales trend analysis
    const salesTrend = await query(
      `SELECT DATE_TRUNC('month', order_date)::DATE as month, COALESCE(SUM(total_amount),0) as revenue
       FROM sd_sales_orders WHERE order_date >= CURRENT_DATE - INTERVAL '3 months' AND status != 'cancelled'
       GROUP BY 1 ORDER BY 1`);
    if (salesTrend.rows.length >= 2) {
      const recent = parseFloat(salesTrend.rows[salesTrend.rows.length - 1]?.revenue || 0);
      const prev = parseFloat(salesTrend.rows[salesTrend.rows.length - 2]?.revenue || 0);
      if (prev > 0) {
        const pct = (((recent - prev) / prev) * 100).toFixed(1);
        insights.push({ type: parseFloat(pct) >= 0 ? 'positive' : 'warning', category: 'Sales',
          message: `Sales revenue ${parseFloat(pct) >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% compared to previous month ($${(recent/1000).toFixed(1)}k vs $${(prev/1000).toFixed(1)}k)` });
      }
    }
    if (salesTrend.rows.length === 0) {
      insights.push({ type: 'info', category: 'Sales', message: 'No sales orders recorded yet. Create your first quotation or sales order to start tracking revenue.' });
    }

    // 2. Overdue AP invoices
    const overdueAP = await query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount),0) as amount
      FROM fi_ap_invoices WHERE due_date < CURRENT_DATE AND total_amount > paid_amount AND status != 'cancelled'`);
    if (parseInt(overdueAP.rows[0].count) > 0) {
      insights.push({ type: 'danger', category: 'Finance',
        message: `${overdueAP.rows[0].count} overdue vendor invoice(s) totaling $${parseFloat(overdueAP.rows[0].amount).toLocaleString('en-US', {minimumFractionDigits: 2})}. Consider scheduling payments to avoid penalties.` });
    }

    // 3. Overdue AR invoices
    const overdueAR = await query(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount),0) as amount
      FROM fi_ar_invoices WHERE due_date < CURRENT_DATE AND total_amount > paid_amount AND status != 'cancelled'`);
    if (parseInt(overdueAR.rows[0].count) > 0) {
      insights.push({ type: 'warning', category: 'Finance',
        message: `${overdueAR.rows[0].count} overdue customer invoice(s) with $${parseFloat(overdueAR.rows[0].amount).toLocaleString('en-US', {minimumFractionDigits: 2})} outstanding. Follow up on collections.` });
    }

    // 4. Low stock materials
    const lowStock = await query(
      `SELECT m.material_code, m.material_name, s.quantity, mpd.reorder_point
       FROM inv_stock s
       JOIN mm_materials m ON s.material_id = m.id
       JOIN mm_material_plant_data mpd ON s.material_id = mpd.material_id AND s.plant_id = mpd.plant_id
       WHERE s.quantity <= mpd.reorder_point AND s.quantity > 0 LIMIT 5`);
    if (lowStock.rows.length > 0) {
      insights.push({ type: 'warning', category: 'Inventory',
        message: `${lowStock.rows.length} material(s) below reorder point: ${lowStock.rows.map(r => r.material_code).join(', ')}. Consider creating purchase requisitions.` });
    }

    // 5. Pending approvals
    const pending = await query(`SELECT COUNT(*) as count FROM wf_approvals WHERE status = 'pending'`);
    if (parseInt(pending.rows[0].count) > 0) {
      insights.push({ type: 'info', category: 'Workflow',
        message: `${pending.rows[0].count} approval(s) pending across the organization. Timely approvals keep operations flowing.` });
    }

    // 6. CRM pipeline health
    const pipeline = await query(`SELECT stage, COUNT(*) as count, COALESCE(SUM(expected_value),0) as value FROM crm_opportunities WHERE status='open' GROUP BY stage`);
    if (pipeline.rows.length > 0) {
      const totalVal = pipeline.rows.reduce((s, r) => s + parseFloat(r.value), 0);
      const negotiation = pipeline.rows.find(r => r.stage === 'negotiation');
      if (negotiation) {
        insights.push({ type: 'positive', category: 'CRM',
          message: `${negotiation.count} opportunity(s) worth $${parseFloat(negotiation.value).toLocaleString('en-US', {minimumFractionDigits: 0})} in negotiation stage. Pipeline total: $${totalVal.toLocaleString('en-US', {minimumFractionDigits: 0})}.` });
      } else {
        insights.push({ type: 'info', category: 'CRM',
          message: `CRM pipeline has $${totalVal.toLocaleString('en-US', {minimumFractionDigits: 0})} across ${pipeline.rows.reduce((s, r) => s + parseInt(r.count), 0)} active opportunities.` });
      }
    }

    // 7. Production orders
    const prodActive = await query(`SELECT COUNT(*) as count, COALESCE(SUM(planned_qty - completed_qty),0) as remaining
      FROM pp_production_orders WHERE status IN ('confirmed','in_process')`);
    if (parseInt(prodActive.rows[0].count) > 0) {
      insights.push({ type: 'info', category: 'Production',
        message: `${prodActive.rows[0].count} active production order(s) with ${parseFloat(prodActive.rows[0].remaining).toFixed(0)} units remaining to produce.` });
    }

    // 8. Unposted journal entries
    const draftJE = await query(`SELECT COUNT(*) as count FROM fi_journal_headers WHERE status = 'draft'`);
    if (parseInt(draftJE.rows[0].count) > 0) {
      insights.push({ type: 'info', category: 'Finance',
        message: `${draftJE.rows[0].count} draft journal entry(s) awaiting posting. Review and post to keep books current.` });
    }

    // 9. Leave requests pending
    const pendingLeave = await query(`SELECT COUNT(*) as count FROM hr_leave_requests WHERE status = 'pending'`);
    if (parseInt(pendingLeave.rows[0].count) > 0) {
      insights.push({ type: 'info', category: 'HR',
        message: `${pendingLeave.rows[0].count} leave request(s) awaiting approval.` });
    }

    // 10. Stock valuation insight
    const stockVal = await query(`SELECT COALESCE(SUM(s.quantity * COALESCE(m.standard_price,0)),0) as value
      FROM inv_stock s JOIN mm_materials m ON s.material_id = m.id WHERE s.quantity > 0`);
    const val = parseFloat(stockVal.rows[0].value);
    if (val > 0) {
      insights.push({ type: 'positive', category: 'Inventory',
        message: `Total inventory valuation: $${val.toLocaleString('en-US', {minimumFractionDigits: 2})}. Stock is tracked across ${(await query(`SELECT COUNT(DISTINCT plant_id) as c FROM inv_stock WHERE quantity > 0`)).rows[0].c} plant(s).` });
    }

    // If no insights, add a welcome one
    if (insights.length === 0) {
      insights.push({ type: 'info', category: 'System', message: 'Welcome to Zyra! Start creating master data, orders, and transactions to see real-time AI insights here.' });
    }

    successResponse(res, { insights, generated_at: new Date().toISOString() });
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// SALES TREND — live data
// ============================================
router.get('/sales-trend', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT TO_CHAR(DATE_TRUNC('month', order_date), 'Mon') as month,
              DATE_TRUNC('month', order_date)::DATE as month_date,
              COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue
       FROM sd_sales_orders
       WHERE order_date >= CURRENT_DATE - INTERVAL '12 months' AND status != 'cancelled'
       GROUP BY 1, 2 ORDER BY 2`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// MODULE ACTIVITY — live from audit log
// ============================================
router.get('/module-activity', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT module, COUNT(*) as count FROM sys_audit_log
       WHERE module IS NOT NULL AND created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY module ORDER BY count DESC LIMIT 8`);
    const colors = { fi: '#1a6af5', sd: '#059669', mm: '#7c3aed', hr: '#d97706', pur: '#e11d48', crm: '#0891b2', inv: '#6366f1', pp: '#ea580c' };
    const labeled = result.rows.map(r => {
      const labels = { fi: 'Finance', sd: 'Sales', mm: 'Materials', hr: 'HR', pur: 'Procurement', crm: 'CRM', inv: 'Inventory', pp: 'Production', am: 'Assets', ps: 'Projects' };
      return { name: labels[r.module] || r.module, value: parseInt(r.count), color: colors[r.module] || '#94a3b8' };
    });
    successResponse(res, labeled);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// TOP CUSTOMERS — live
// ============================================
router.get('/top-customers', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT bp.display_name, COUNT(so.id) as orders, COALESCE(SUM(so.total_amount),0) as revenue
       FROM sd_sales_orders so JOIN bp_business_partners bp ON so.customer_id = bp.id
       WHERE so.status != 'cancelled' GROUP BY bp.id, bp.display_name ORDER BY revenue DESC LIMIT 10`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Pending approvals
router.get('/pending-approvals', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT wi.id, wi.entity_type, wi.entity_id, wi.status, wi.initiated_at,
              wt.template_name, u.first_name || ' ' || u.last_name as requester
       FROM wf_instances wi JOIN wf_templates wt ON wi.template_id = wt.id
       JOIN sys_users u ON wi.initiated_by = u.id JOIN wf_approvals wa ON wa.instance_id = wi.id
       WHERE wa.approver_id = $1 AND wa.status = 'pending' ORDER BY wi.initiated_at DESC`, [req.user.id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Notifications
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM sys_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [req.user.id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/notifications/:id/read', authenticate, async (req, res) => {
  try { await query(`UPDATE sys_notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]); successResponse(res, null, 'Marked as read'); }
  catch (err) { errorResponse(res, err.message); }
});

// Global search
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return successResponse(res, []);
    const t = `%${q}%`;
    const results = await Promise.all([
      query(`SELECT 'customer' as type, id, bp_number as code, display_name as name FROM bp_business_partners WHERE bp_type='customer' AND (display_name ILIKE $1 OR bp_number ILIKE $1) LIMIT 5`, [t]),
      query(`SELECT 'vendor' as type, id, bp_number as code, display_name as name FROM bp_business_partners WHERE bp_type='vendor' AND (display_name ILIKE $1 OR bp_number ILIKE $1) LIMIT 5`, [t]),
      query(`SELECT 'material' as type, id, material_code as code, material_name as name FROM mm_materials WHERE (material_name ILIKE $1 OR material_code ILIKE $1) LIMIT 5`, [t]),
      query(`SELECT 'sales_order' as type, id, doc_number as code, doc_number as name FROM sd_sales_orders WHERE doc_number ILIKE $1 LIMIT 5`, [t]),
      query(`SELECT 'purchase_order' as type, id, doc_number as code, doc_number as name FROM pur_purchase_orders WHERE doc_number ILIKE $1 LIMIT 5`, [t]),
    ]);
    successResponse(res, results.flatMap(r => r.rows));
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
