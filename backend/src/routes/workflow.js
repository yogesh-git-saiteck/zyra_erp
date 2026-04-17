import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { successResponse, errorResponse, paginate } from '../utils/helpers.js';
import { sendEmail, isNotificationEnabled, emailTemplate } from '../utils/emailService.js';

const router = Router();

// Entity URL map for notification links
const ENTITY_URLS = {
  purchase_order: '/procurement/orders',
  purchase_requisition: '/procurement/requisitions',
  sales_order: '/sales/orders',
  ap_invoice: '/finance/ap',
  payment: '/finance/payments',
  journal_entry: '/finance/journals',
  leave_request: '/hr/leave',
  expense_claim: '/hr/expenses',
  gate_pass: '/logistics/gate-passes',
};

// ========= WORKFLOW TEMPLATES =========
router.get('/templates', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM wf_templates ORDER BY template_name`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/templates', authenticate, async (req, res) => {
  try {
    const { template_name, entity_type, description, steps, conditions } = req.body;
    if (!template_name || !entity_type || !steps?.length) return errorResponse(res, 'Name, entity type, and steps required', 400);
    const result = await query(
      `INSERT INTO wf_templates (template_name, entity_type, description, steps, conditions)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [template_name, entity_type, description, JSON.stringify(steps), JSON.stringify(conditions || {})]);
    successResponse(res, result.rows[0], 'Template created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.put('/templates/:id', authenticate, async (req, res) => {
  try {
    const { template_name, description, steps, conditions, is_active } = req.body;
    const result = await query(
      `UPDATE wf_templates SET template_name=COALESCE($1,template_name), description=COALESCE($2,description),
       steps=COALESCE($3,steps), conditions=COALESCE($4,conditions), is_active=COALESCE($5,is_active)
       WHERE id=$6 RETURNING *`,
      [template_name, description, steps ? JSON.stringify(steps) : null, conditions ? JSON.stringify(conditions) : null, is_active, req.params.id]);
    successResponse(res, result.rows[0], 'Updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= WORKFLOW INSTANCES =========
router.get('/instances', authenticate, async (req, res) => {
  try {
    const { status, entity_type, page = 1 } = req.query;
    let sql = `SELECT wi.*, COALESCE(wt.template_name, 'Approval Rule') as template_name,
               u.first_name || ' ' || u.last_name as initiated_by_name,
               COALESCE(po.doc_number, pr.doc_number, so.doc_number, ap.doc_number) as doc_number
               FROM wf_instances wi
               LEFT JOIN pur_purchase_orders po ON wi.entity_type='purchase_order' AND wi.entity_id=po.id
               LEFT JOIN pur_requisitions pr ON wi.entity_type='purchase_requisition' AND wi.entity_id=pr.id
               LEFT JOIN sd_sales_orders so ON wi.entity_type='sales_order' AND wi.entity_id=so.id
               LEFT JOIN fi_ap_invoices ap ON wi.entity_type='ap_invoice' AND wi.entity_id=ap.id
               LEFT JOIN wf_templates wt ON wi.template_id = wt.id
               LEFT JOIN sys_users u ON wi.initiated_by = u.id
               WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND wi.status = $${idx++}`; params.push(status); }
    if (entity_type) { sql += ` AND wi.entity_type = $${idx++}`; params.push(entity_type); }
    sql += ` ORDER BY wi.initiated_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Submit entity for approval (via template)
router.post('/submit', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.body;
    if (!entity_type || !entity_id) return errorResponse(res, 'Entity type and ID required', 400);

    // Block if already pending
    const existing = await query(
      `SELECT id FROM wf_instances WHERE entity_type=$1 AND entity_id=$2 AND status='pending'`,
      [entity_type, entity_id]);
    if (existing.rows.length) return errorResponse(res, 'This document already has a pending approval', 400);

    const baseUrl = ENTITY_URLS[entity_type] || '/settings/workflows';
    const entityUrl = `${baseUrl}?open=${entity_id}`;

    // Fetch entity data to evaluate conditions
    const ENTITY_TABLES = {
      purchase_order: 'pur_purchase_orders',
      purchase_requisition: 'pur_requisitions',
      sales_order: 'sd_sales_orders',
      ap_invoice: 'fi_ap_invoices',
      payment: 'fi_payments',
      journal_entry: 'fi_journal_entries',
      gate_pass: 'lo_gate_passes',
    };
    const entityTable = ENTITY_TABLES[entity_type];
    let entityData = {};
    if (entityTable) {
      const ed = await query(`SELECT * FROM ${entityTable} WHERE id=$1`, [entity_id]);
      entityData = ed.rows[0] || {};
    }

    // Try approval rules first (same logic as ruleEngine.triggerApprovalRules)
    const rules = await query(
      `SELECT * FROM sys_approval_rules WHERE entity_type=$1 AND is_active=true ORDER BY priority ASC`,
      [entity_type]);

    // approvalSteps: array of {step, approverIds[]}
    let approvalSteps = [];
    let matchedRule = null;
    let templateId = null;

    for (const rule of rules.rows) {
      let matches = true;
      if (rule.condition_field && rule.condition_value !== null && rule.condition_value !== undefined) {
        const val = entityData[rule.condition_field];
        const cv  = rule.condition_value;
        const op  = rule.condition_operator || '>=';
        if (op === '>='  && !(parseFloat(val) >= parseFloat(cv))) matches = false;
        if (op === '>'   && !(parseFloat(val) >  parseFloat(cv))) matches = false;
        if (op === '<='  && !(parseFloat(val) <= parseFloat(cv))) matches = false;
        if (op === '<'   && !(parseFloat(val) <  parseFloat(cv))) matches = false;
        if (op === '='   && String(val) !== String(cv))           matches = false;
        if (op === '!='  && String(val) === String(cv))           matches = false;
      }
      if (!matches) continue;
      matchedRule = rule;

      // Build steps from approver_steps array (multi-level) or fallback to single approver
      const ruleSteps = Array.isArray(rule.approver_steps) && rule.approver_steps.length
        ? rule.approver_steps
        : (typeof rule.approver_steps === 'string' ? JSON.parse(rule.approver_steps || '[]') : []);

      if (ruleSteps.length > 0) {
        for (const s of ruleSteps) {
          const ids = [];
          if (s.approver_user_id) {
            ids.push(s.approver_user_id);
          } else if (s.approver_role) {
            const ru = await query(`SELECT u.id FROM sys_users u JOIN sys_roles r ON u.role_id=r.id WHERE r.role_code=$1 AND u.status='active'`, [s.approver_role]);
            ru.rows.forEach(u => ids.push(u.id));
          }
          if (ids.length) approvalSteps.push({ step: s.step || (approvalSteps.length + 1), approverIds: ids });
        }
      } else {
        // Single-level fallback (old rules without approver_steps)
        const ids = [];
        if (rule.approver_user_id) ids.push(rule.approver_user_id);
        else if (rule.approver_role) {
          const ru = await query(`SELECT u.id FROM sys_users u JOIN sys_roles r ON u.role_id=r.id WHERE r.role_code=$1 AND u.status='active'`, [rule.approver_role]);
          ru.rows.forEach(u => ids.push(u.id));
        }
        if (ids.length) approvalSteps.push({ step: 1, approverIds: ids });
      }
      break; // First matching rule wins
    }

    // Fall back to wf_templates if no approval rule matched
    if (!matchedRule) {
      const tpl = await query(`SELECT * FROM wf_templates WHERE entity_type=$1 AND is_active=true LIMIT 1`, [entity_type]);
      if (!tpl.rows.length) return errorResponse(res, `No approval rule or workflow template configured for ${entity_type.replace(/_/g,' ')}`, 400);
      const template = tpl.rows[0];
      templateId = template.id;
      const steps = typeof template.steps === 'string' ? JSON.parse(template.steps) : (template.steps || []);
      for (const step of steps) {
        const approverRes = await query(`SELECT u.id FROM sys_users u JOIN sys_roles r ON u.role_id=r.id WHERE r.role_code=$1 AND u.status='active' LIMIT 1`, [step.role]);
        if (approverRes.rows[0]?.id) approvalSteps.push({ step: step.step || (approvalSteps.length + 1), approverIds: [approverRes.rows[0].id] });
      }
    }

    if (!approvalSteps.length) return errorResponse(res, 'No approver found for this document. Check your approval rules.', 400);

    const result = await transaction(async (client) => {
      const inst = await client.query(
        `INSERT INTO wf_instances (template_id, entity_type, entity_id, current_step, status, initiated_by)
         VALUES ($1,$2,$3,1,'pending',$4) RETURNING *`,
        [templateId, entity_type, entity_id, req.user.id]);

      // Create wf_approvals for ALL steps upfront, notify ONLY step 1
      for (const stepDef of approvalSteps) {
        for (const approverId of stepDef.approverIds) {
          await client.query(
            `INSERT INTO wf_approvals (instance_id, step_number, approver_id, status) VALUES ($1,$2,$3,'pending')`,
            [inst.rows[0].id, stepDef.step, approverId]);

          // Only notify step 1 initially
          if (stepDef.step === approvalSteps[0].step) {
            await client.query(
              `INSERT INTO sys_notifications (user_id, title, message, type, link) VALUES ($1,$2,$3,'warning',$4)`,
              [approverId,
               `Approval Required (Level ${stepDef.step}): ${entity_type.replace(/_/g,' ')} ${entityData.doc_number || ''}`,
               `${entity_type.replace(/_/g,' ')} ${entityData.doc_number || ''} requires your approval${matchedRule ? ` (${matchedRule.rule_name})` : ''}. Click to review.`,
               entityUrl]).catch(() => {});
          }
        }
      }
      return inst.rows[0];
    });

    await setPendingApprovalStatus(entity_type, entity_id).catch(() => {});

    // Send email to step-1 approvers
    if (approvalSteps[0]?.approverIds?.length && await isNotificationEnabled('approval_requested')) {
      const approverRows = await query(
        `SELECT email, first_name FROM sys_users WHERE id = ANY($1::uuid[]) AND status='active' AND email IS NOT NULL`,
        [approvalSteps[0].approverIds]
      );
      const entityName = entity_type.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
      const docNum = entityData.doc_number || '';
      const amtLine = entityData.total_amount
        ? `<p><strong>Amount:</strong> ₹${parseFloat(entityData.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>` : '';
      for (const approver of approverRows.rows) {
        await sendEmail({
          to: approver.email,
          subject: `Action Required: ${entityName} ${docNum} needs your approval`,
          html: emailTemplate({
            headerColor: '#0d3d8f',
            headerText: '📋 Approval Required',
            bodyHtml: `<p>Hi <strong>${approver.first_name || 'Approver'}</strong>,</p>
              <p><strong>${entityName} ${docNum}</strong> has been submitted and requires your approval.</p>
              ${amtLine}
              <p style="margin-top:20px;">
                <a href="${process.env.APP_URL || ''}${entityUrl}"
                   style="background:#1e88e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
                  Review &amp; Approve
                </a>
              </p>`,
          }),
          entity_type,
          entity_id,
        }).catch(() => {});
      }
    }

    successResponse(res, result, 'Submitted for approval', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= APPROVALS =========
router.get('/my-approvals', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT wa.*, wi.entity_type, wi.entity_id, wi.current_step, wi.initiated_by,
              COALESCE(wt.template_name, 'Approval Rule') as template_name,
              u.first_name || ' ' || u.last_name as requester_name,
              wi.initiated_at,
              COALESCE(
                po.doc_number, pr.doc_number, so.doc_number,
                ap.doc_number, pay.doc_number
              ) as doc_number,
              COALESCE(
                po.total_amount, pr.total_amount, so.total_amount,
                ap.total_amount, pay.amount
              ) as doc_amount
       FROM wf_approvals wa
       JOIN wf_instances wi ON wa.instance_id = wi.id
       LEFT JOIN wf_templates wt ON wi.template_id = wt.id
       JOIN sys_users u ON wi.initiated_by = u.id
       LEFT JOIN pur_purchase_orders po ON wi.entity_type='purchase_order' AND wi.entity_id=po.id
       LEFT JOIN pur_requisitions pr ON wi.entity_type='purchase_requisition' AND wi.entity_id=pr.id
       LEFT JOIN sd_sales_orders so ON wi.entity_type='sales_order' AND wi.entity_id=so.id
       LEFT JOIN fi_ap_invoices ap ON wi.entity_type='ap_invoice' AND wi.entity_id=ap.id
       LEFT JOIN fi_payments pay ON wi.entity_type='payment' AND wi.entity_id=pay.id
       WHERE wa.approver_id = $1
       ORDER BY wa.created_at DESC`, [req.user.id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// Get pending approvals for a specific entity (used in entity detail pages)
router.get('/entity-approval', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    if (!entity_type || !entity_id) return successResponse(res, null);
    // Only show the most recent pending instance; if none, show latest completed
    const inst = await query(
      `SELECT id FROM wf_instances WHERE entity_type=$1 AND entity_id=$2
       ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, initiated_at DESC LIMIT 1`,
      [entity_type, entity_id]);
    if (!inst.rows.length) return successResponse(res, []);
    const result = await query(
      `SELECT wa.*, wi.status as instance_status,
              u.first_name || ' ' || u.last_name as approver_name,
              u.email as approver_email,
              r.role_name as approver_role_name
       FROM wf_approvals wa
       JOIN wf_instances wi ON wa.instance_id = wi.id
       LEFT JOIN sys_users u ON wa.approver_id = u.id
       LEFT JOIN sys_roles r ON u.role_id = r.id
       WHERE wa.instance_id = $1
       ORDER BY wa.step_number ASC, wa.created_at ASC`,
      [inst.rows[0].id]);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/approvals/:id/approve', authenticate, async (req, res) => {
  try {
    const { comments } = req.body;
    const approval = await query(`SELECT * FROM wf_approvals WHERE id = $1`, [req.params.id]);
    if (!approval.rows.length) return errorResponse(res, 'Not found', 404);
    if (approval.rows[0].approver_id !== req.user.id) return errorResponse(res, 'Not your approval to decide', 403);
    if (approval.rows[0].status !== 'pending') return errorResponse(res, 'This approval has already been decided', 400);

    // Enforce sequential levels: all previous steps must be fully approved first
    const prevPending = await query(
      `SELECT COUNT(*) FROM wf_approvals WHERE instance_id=$1 AND step_number < $2 AND status='pending'`,
      [approval.rows[0].instance_id, approval.rows[0].step_number]);
    if (parseInt(prevPending.rows[0].count) > 0) {
      return errorResponse(res, 'Previous approval level must be completed before this level can approve', 400);
    }

    await query(`UPDATE wf_approvals SET status='approved', comments=$1, decided_at=NOW() WHERE id=$2`, [comments, req.params.id]);

    const inst = await query(`SELECT * FROM wf_instances WHERE id = $1`, [approval.rows[0].instance_id]);
    const entity = inst.rows[0];
    const currentStep = approval.rows[0].step_number;

    // Check if any other approvers at the SAME step are still pending
    const sameLevelPending = await query(
      `SELECT COUNT(*) FROM wf_approvals WHERE instance_id=$1 AND step_number=$2 AND status='pending'`,
      [approval.rows[0].instance_id, currentStep]);

    if (parseInt(sameLevelPending.rows[0].count) > 0) {
      // Others at same level still pending — wait for them
      return successResponse(res, null, 'Approved. Waiting for other approvers at this level.');
    }

    // Current level fully approved — find the next level
    const nextLevelApprovals = await query(
      `SELECT * FROM wf_approvals WHERE instance_id=$1 AND step_number > $2 AND status='pending' ORDER BY step_number ASC`,
      [approval.rows[0].instance_id, currentStep]);

    if (nextLevelApprovals.rows.length > 0) {
      // Notify the next level approvers
      const nextStep = nextLevelApprovals.rows[0].step_number;
      const nextApprovers = nextLevelApprovals.rows.filter(a => a.step_number === nextStep);
      const base = ENTITY_URLS[entity.entity_type] || '/settings/workflows';
      const entityUrl = `${base}?open=${entity.entity_id}`;
      for (const na of nextApprovers) {
        await query(
          `INSERT INTO sys_notifications (user_id, title, message, type, link) VALUES ($1,$2,$3,'warning',$4)`,
          [na.approver_id,
           `Approval Required (Level ${nextStep}): ${entity.entity_type.replace(/_/g,' ')}`,
           `Level ${nextStep} approval required for ${entity.entity_type.replace(/_/g,' ')}. Previous level approved. Click to review.`,
           entityUrl]).catch(() => {});
      }
      await query(`UPDATE wf_instances SET current_step=$1 WHERE id=$2`, [nextStep, approval.rows[0].instance_id]);

      // Email next-level approvers
      if (await isNotificationEnabled('next_level_approval')) {
        const nextEmails = await query(
          `SELECT email, first_name FROM sys_users WHERE id = ANY($1::uuid[]) AND status='active' AND email IS NOT NULL`,
          [nextApprovers.map(a => a.approver_id)]
        );
        const entityName = entity.entity_type.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
        for (const approver of nextEmails.rows) {
          await sendEmail({
            to: approver.email,
            subject: `Action Required (Level ${nextStep}): ${entityName} needs your approval`,
            html: emailTemplate({
              headerColor: '#1558b0',
              headerText: `📋 Level ${nextStep} Approval Required`,
              bodyHtml: `<p>Hi <strong>${approver.first_name || 'Approver'}</strong>,</p>
                <p>The previous approval level has been completed. <strong>${entityName}</strong> now requires your approval at level ${nextStep}.</p>
                <p style="margin-top:20px;">
                  <a href="${process.env.APP_URL || ''}${entityUrl}"
                     style="background:#1e88e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
                    Review &amp; Approve
                  </a>
                </p>`,
            }),
            entity_type: entity.entity_type,
            entity_id: entity.entity_id,
          }).catch(() => {});
        }
      }
    } else {
      // All levels approved — complete workflow
      await query(`UPDATE wf_instances SET status='approved', completed_at=NOW() WHERE id=$1`, [approval.rows[0].instance_id]);
      await updateEntityStatus(entity.entity_type, entity.entity_id, 'approved', req.user.id);
      await notifyRequester(entity, 'approved', req.user.id, comments).catch(() => {});
    }

    successResponse(res, null, 'Approved successfully');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/approvals/:id/reject', authenticate, async (req, res) => {
  try {
    const { comments } = req.body;
    const approval = await query(`SELECT * FROM wf_approvals WHERE id = $1`, [req.params.id]);
    if (!approval.rows.length) return errorResponse(res, 'Not found', 404);
    if (approval.rows[0].approver_id !== req.user.id) return errorResponse(res, 'Not your approval to decide', 403);
    if (approval.rows[0].status !== 'pending') return errorResponse(res, 'This approval has already been decided', 400);

    // Enforce sequential levels
    const prevPending = await query(
      `SELECT COUNT(*) FROM wf_approvals WHERE instance_id=$1 AND step_number < $2 AND status='pending'`,
      [approval.rows[0].instance_id, approval.rows[0].step_number]);
    if (parseInt(prevPending.rows[0].count) > 0) {
      return errorResponse(res, 'Previous approval level must be completed before this level can act', 400);
    }

    await query(`UPDATE wf_approvals SET status='rejected', comments=$1, decided_at=NOW() WHERE id=$2`, [comments, req.params.id]);
    const inst = await query(`SELECT * FROM wf_instances WHERE id = $1`, [approval.rows[0].instance_id]);
    await query(`UPDATE wf_instances SET status='rejected', completed_at=NOW() WHERE id=$1`, [approval.rows[0].instance_id]);
    const entity = inst.rows[0];
    await updateEntityStatus(entity.entity_type, entity.entity_id, 'rejected', req.user.id);
    await notifyRequester(entity, 'rejected', req.user.id, comments).catch(() => {});

    successResponse(res, null, 'Rejected');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= HELPERS =========

async function updateEntityStatus(entityType, entityId, wfStatus, userId) {
  const statusMap = {
    approved: {
      purchase_order:       { table: 'pur_purchase_orders', status: 'confirmed' },
      purchase_requisition: { table: 'pur_requisitions',    status: 'approved' },
      ap_invoice:           { table: 'fi_ap_invoices',      status: 'approved' },
      payment:              { table: 'fi_payments',          status: 'approved' },
      sales_order:          { table: 'sd_sales_orders',     status: 'confirmed' },
      gate_pass:            { table: 'lo_gate_passes',      status: 'approved' },
    },
    rejected: {
      purchase_order:       { table: 'pur_purchase_orders', status: 'rejected' },
      purchase_requisition: { table: 'pur_requisitions',    status: 'rejected' },
      ap_invoice:           { table: 'fi_ap_invoices',      status: 'rejected' },
      payment:              { table: 'fi_payments',          status: 'rejected' },
      sales_order:          { table: 'sd_sales_orders',     status: 'rejected' },
      gate_pass:            { table: 'lo_gate_passes',      status: 'cancelled' },
    },
  };
  const mapping = statusMap[wfStatus]?.[entityType];
  if (mapping) {
    try {
      await query(`UPDATE ${mapping.table} SET status=$1 WHERE id=$2`, [mapping.status, entityId]);
      if (wfStatus === 'approved' && (entityType === 'purchase_order' || entityType === 'sales_order')) {
        await query(`UPDATE ${mapping.table} SET approved_by=$1, approved_at=NOW() WHERE id=$2`, [userId, entityId]);
      }
    } catch (e) { console.error('updateEntityStatus error:', e.message); }
  }
}

async function setPendingApprovalStatus(entityType, entityId) {
  const pendingMap = {
    purchase_order:       { table: 'pur_purchase_orders', status: 'pending_approval' },
    sales_order:          { table: 'sd_sales_orders',     status: 'pending_approval' },
    purchase_requisition: { table: 'pur_requisitions',    status: 'submitted' },
    ap_invoice:           { table: 'fi_ap_invoices',      status: 'submitted' },
    payment:              { table: 'fi_payments',          status: 'submitted' },
    gate_pass:            { table: 'lo_gate_passes',      status: 'pending_approval' },
  };
  const m = pendingMap[entityType];
  if (m) await query(`UPDATE ${m.table} SET status=$1 WHERE id=$2`, [m.status, entityId]);
}

async function notifyRequester(entity, decision, decidedByUserId, comments) {
  const requesterId = entity.initiated_by;
  if (!requesterId || requesterId === decidedByUserId) return;

  const base = ENTITY_URLS[entity.entity_type] || '/settings/workflows';
  const entityUrl = `${base}?open=${entity.entity_id}`;
  const icon = decision === 'approved' ? '✓' : '✗';
  const entityName = entity.entity_type.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
  const title = `${icon} ${entityName} ${decision}`;
  const msg = decision === 'approved'
    ? `Your ${entityName} has been approved and confirmed.`
    : `Your ${entityName} was rejected.${comments ? ' Reason: ' + comments : ''}`;

  // In-app notification
  await query(
    `INSERT INTO sys_notifications (user_id, title, message, type, link)
     VALUES ($1,$2,$3,$4,$5)`,
    [requesterId, title, msg, decision === 'approved' ? 'info' : 'warning', entityUrl]
  ).catch(() => {});

  // Email notification
  const eventKey = decision === 'approved' ? 'document_approved' : 'document_rejected';
  if (await isNotificationEnabled(eventKey)) {
    const requester = await query(
      `SELECT email, first_name FROM sys_users WHERE id = $1`,
      [requesterId]
    );
    if (requester.rows[0]?.email) {
      const headerColor = decision === 'approved' ? '#16a34a' : '#dc2626';
      const headerText = decision === 'approved' ? `✓ ${entityName} Approved` : `✗ ${entityName} Rejected`;
      await sendEmail({
        to: requester.rows[0].email,
        subject: title,
        html: emailTemplate({
          headerColor,
          headerText,
          bodyHtml: `<p>Hi <strong>${requester.rows[0].first_name || ''}</strong>,</p>
            <p>${msg}</p>
            ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
            <p style="margin-top:20px;">
              <a href="${process.env.APP_URL || ''}${entityUrl}"
                 style="background:#1e88e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
                View Document
              </a>
            </p>`,
        }),
        entity_type: entity.entity_type,
        entity_id: entity.entity_id,
      }).catch(() => {});
    }
  }
}

// Get pending approval count for dashboard / nav badge
router.get('/pending-count', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM wf_approvals WHERE approver_id = $1 AND status = 'pending'`, [req.user.id]);
    successResponse(res, { count: parseInt(result.rows[0].count) });
  } catch (err) { errorResponse(res, err.message); }
});

export default router;
