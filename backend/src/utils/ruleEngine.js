/**
 * Rule Engine — makes Admin Platform settings actually control the system.
 * Called from transaction routes to enforce business rules, fire notifications,
 * trigger approval workflows, and run validation rules.
 */
import { query } from '../config/database.js';

// ─────────────────────────────────────────────────────────────────
// 1. BUSINESS RULES — block or warn before saving a transaction
// ─────────────────────────────────────────────────────────────────
export async function checkBusinessRules(entityType, data, triggerPoint = 'before_save') {
  try {
    const rules = await query(
      `SELECT * FROM sys_business_rules
       WHERE entity_type = $1 AND trigger_point = $2 AND is_active = true
       ORDER BY priority ASC`,
      [entityType, triggerPoint]
    );
    for (const rule of rules.rows) {
      const conditions = typeof rule.conditions === 'string'
        ? JSON.parse(rule.conditions) : (rule.conditions || []);
      let violated = false;
      for (const cond of conditions) {
        const val = data[cond.field];
        const cv  = cond.value;
        const op  = cond.operator || 'gt'; // default to 'gt' if operator missing
        if (op === 'gt'        && parseFloat(val) > parseFloat(cv))  violated = true;
        if (op === 'lt'        && parseFloat(val) < parseFloat(cv))  violated = true;
        if (op === 'gte'       && parseFloat(val) >= parseFloat(cv)) violated = true;
        if (op === 'lte'       && parseFloat(val) <= parseFloat(cv)) violated = true;
        if (op === 'eq'        && String(val) === String(cv))        violated = true;
        if (op === 'neq'       && String(val) !== String(cv))        violated = true;
        if (op === 'empty'     && (!val || val === ''))              violated = true;
        if (op === 'not_empty' && val && val !== '')                 violated = true;
        if (op === 'contains'  && String(val||'').includes(cv))      violated = true;
      }
      if (violated) {
        if (rule.action_type === 'block') {
          return { blocked: true, message: rule.error_message || `Business rule violated: ${rule.rule_name}` };
        }
        if (rule.action_type === 'warn') {
          return { blocked: false, warning: rule.error_message || `Warning: ${rule.rule_name}` };
        }
      }
    }
    return { blocked: false };
  } catch (e) {
    console.error('Business rule check error:', e.message);
    return { blocked: false }; // Never block a transaction due to rule engine errors
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. VALIDATION RULES — check field formats before saving
// ─────────────────────────────────────────────────────────────────
export async function checkValidationRules(entityType, data) {
  try {
    const rules = await query(
      `SELECT * FROM sys_validation_rules WHERE entity_type = $1 AND is_active = true`,
      [entityType]
    );
    const errors = [];
    for (const rule of rules.rows) {
      const value = data[rule.field_name];
      if (value === undefined || value === null || value === '') continue;
      if (rule.rule_type === 'regex' && rule.rule_value) {
        try { if (!new RegExp(rule.rule_value).test(String(value))) errors.push({ field: rule.field_name, message: rule.error_message }); } catch {}
      }
      if (rule.rule_type === 'min_length' && String(value).length < parseInt(rule.rule_value)) errors.push({ field: rule.field_name, message: rule.error_message });
      if (rule.rule_type === 'max_length' && String(value).length > parseInt(rule.rule_value)) errors.push({ field: rule.field_name, message: rule.error_message });
      if (rule.rule_type === 'min_value'  && parseFloat(value) < parseFloat(rule.rule_value)) errors.push({ field: rule.field_name, message: rule.error_message });
      if (rule.rule_type === 'max_value'  && parseFloat(value) > parseFloat(rule.rule_value)) errors.push({ field: rule.field_name, message: rule.error_message });
      if (rule.rule_type === 'email'      && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push({ field: rule.field_name, message: rule.error_message });
    }
    return { valid: errors.length === 0, errors };
  } catch (e) {
    return { valid: true, errors: [] };
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. NOTIFICATION RULES — fire in-app + email notifications
// ─────────────────────────────────────────────────────────────────
export async function fireNotificationRules(entityType, entityId, triggerEvent, data, actingUserId) {
  try {
    const rules = await query(
      `SELECT * FROM sys_notification_rules WHERE entity_type = $1 AND trigger_event = $2 AND is_active = true`,
      [entityType, triggerEvent]
    );
    for (const rule of rules.rows) {
      const notifyRoles = typeof rule.notify_roles === 'string' ? JSON.parse(rule.notify_roles) : (rule.notify_roles || []);
      const notifyUsers = typeof rule.notify_users === 'string' ? JSON.parse(rule.notify_users) : (rule.notify_users || []);

      // Build message from template
      let message = rule.message_template || `${triggerEvent.replace(/_/g, ' ')} on ${entityType.replace(/_/g, ' ')}`;
      message = message
        .replace(/\{\{doc_number\}\}/g, data.doc_number || data.id || '')
        .replace(/\{\{amount\}\}/g, data.total_amount || data.amount || '')
        .replace(/\{\{status\}\}/g, data.status || '')
        .replace(/\{\{entity\}\}/g, entityType.replace(/_/g, ' '));

      const title = `${entityType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${triggerEvent.replace(/_/g, ' ')}`;

      const recipientIds = new Set();

      // Collect users by role
      if (notifyRoles.length) {
        const usersInRoles = await query(
          `SELECT u.id FROM sys_users u JOIN sys_roles r ON u.role_id = r.id
           WHERE r.role_code = ANY($1) AND u.status = 'active' AND u.id != $2`,
          [notifyRoles, actingUserId]
        );
        usersInRoles.rows.forEach(u => recipientIds.add(u.id));
      }

      // Collect explicit user IDs
      notifyUsers.filter(Boolean).forEach(id => {
        if (id !== actingUserId) recipientIds.add(id);
      });

      const actionUrl = `/${entityType.replace(/_/g, '-')}s`;

      for (const uid of recipientIds) {
        await query(
          `INSERT INTO sys_notifications (user_id, title, message, type, link)
           VALUES ($1, $2, $3, 'info', $4)`,
          [uid, title, message, actionUrl]
        ).catch(() => {});
      }

      // Queue email if channel is email or both
      if ((rule.channel === 'email' || rule.channel === 'both') && recipientIds.size > 0) {
        const emails = await query(
          `SELECT email FROM sys_users WHERE id = ANY($1) AND status = 'active'`,
          [Array.from(recipientIds)]
        );
        for (const row of emails.rows) {
          await query(
            `INSERT INTO sys_email_queue (to_email, subject, body_html, template_key)
             VALUES ($1, $2, $3, 'notification')`,
            [row.email, title, `<p>${message}</p><p><small>Document: ${data.doc_number || entityId}</small></p>`]
          ).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('Notification rule error:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. APPROVAL RULES — auto-create wf_instances when rules match
// ─────────────────────────────────────────────────────────────────
export async function triggerApprovalRules(entityType, entityId, data, actingUserId, depth = 0) {
  try {
    // BUG #8 FIX: Add recursion guard to prevent infinite approval rule loops
    const MAX_APPROVAL_DEPTH = 3;
    if (depth > MAX_APPROVAL_DEPTH) {
      console.warn(`⚠️ Approval rule recursion limit (${MAX_APPROVAL_DEPTH}) exceeded for ${entityType}:${entityId}. Breaking chain.`);
      return; // Stop recursion
    }
    
    const rules = await query(
      `SELECT * FROM sys_approval_rules WHERE entity_type = $1 AND is_active = true ORDER BY priority ASC`,
      [entityType]
    );
    for (const rule of rules.rows) {
      // Check condition
      let matches = true;
      if (rule.condition_field && rule.condition_value !== null && rule.condition_value !== undefined) {
        const val = data[rule.condition_field];
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

      // Check if a workflow instance already exists for this entity
      const existing = await query(
        `SELECT id FROM wf_instances WHERE entity_type = $1 AND entity_id = $2 AND status = 'pending'`,
        [entityType, entityId]
      );
      if (existing.rows.length) continue; // Already has a pending approval

      // Create workflow instance
      const instResult = await query(
        `INSERT INTO wf_instances (entity_type, entity_id, status, initiated_by)
         VALUES ($1, $2, 'pending', $3) RETURNING id`,
        [entityType, entityId, actingUserId]
      );
      const instanceId = instResult.rows[0]?.id;
      if (!instanceId) continue;

      // Set entity status to pending_approval / submitted
      await setPendingApprovalStatus(entityType, entityId).catch(() => {});

      const entityUrl = `${ENTITY_URLS[entityType] || '/settings/workflows'}?open=${entityId}`;

      // Build approval steps (multi-level) from approver_steps, fallback to single-level
      const ruleSteps = (() => {
        const s = rule.approver_steps;
        if (Array.isArray(s) && s.length) return s;
        if (typeof s === 'string') { try { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; } catch {} }
        return [];
      })();

      let approvalSteps = []; // [{step, approverIds[]}]
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
        // Single-level fallback
        const ids = [];
        if (rule.approver_user_id) ids.push(rule.approver_user_id);
        else if (rule.approver_role) {
          const ru = await query(`SELECT u.id FROM sys_users u JOIN sys_roles r ON u.role_id=r.id WHERE r.role_code=$1 AND u.status='active'`, [rule.approver_role]);
          ru.rows.forEach(u => ids.push(u.id));
        }
        if (ids.length) approvalSteps.push({ step: 1, approverIds: ids });
      }

      if (!approvalSteps.length) {
        // No approvers found — clean up the instance and skip
        await query(`DELETE FROM wf_instances WHERE id=$1`, [instanceId]).catch(() => {});
        continue;
      }

      // Create all wf_approvals upfront, notify only step 1
      for (const stepDef of approvalSteps) {
        for (const approverId of stepDef.approverIds) {
          await query(
            `INSERT INTO wf_approvals (instance_id, step_number, approver_id, status) VALUES ($1,$2,$3,'pending')`,
            [instanceId, stepDef.step, approverId]
          ).catch(() => {});
          if (stepDef.step === approvalSteps[0].step) {
            await query(
              `INSERT INTO sys_notifications (user_id, title, message, type, link) VALUES ($1,$2,$3,'warning',$4)`,
              [approverId,
               `Approval Required: ${entityType.replace(/_/g,' ')} ${data.doc_number || ''}`,
               `${entityType.replace(/_/g,' ')} ${data.doc_number || ''} requires your approval (${rule.rule_name}). Click to review.`,
               entityUrl]
            ).catch(() => {});
          }
        }
      }

      break; // Only first matching rule triggers; chain handled by workflow engine
    }
  } catch (e) {
    console.error('Approval rule trigger error:', e.message);
  }
}

// Entity URL map for in-app notification links
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

// Set entity status to "pending_approval" / "submitted" when workflow triggers
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

// ─────────────────────────────────────────────────────────────────
// 5. FISCAL PERIOD CHECK — call before posting any financial document
// ─────────────────────────────────────────────────────────────────
export async function checkFiscalPeriod(postingDate, companyId) {
  try {
    const d = new Date(postingDate);
    const result = await query(
      `SELECT * FROM fi_fiscal_periods
       WHERE period_month = $1 AND period_year = $2
       ${companyId ? 'AND company_id = $3' : ''}`,
      companyId ? [d.getMonth() + 1, d.getFullYear(), companyId] : [d.getMonth() + 1, d.getFullYear()]
    );
    if (!result.rows.length) return { allowed: true }; // No period defined = open
    const period = result.rows[0];
    if (!period.is_open || period.status === 'closed') {
      return { allowed: false, message: `Fiscal period ${period.period_name} is closed. Reopen it in Settings → Go-Live → Fiscal Periods.` };
    }
    return { allowed: true };
  } catch (e) {
    return { allowed: true }; // Don't block on period check errors
  }
}
