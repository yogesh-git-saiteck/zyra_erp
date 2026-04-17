import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/auth.js';
import { successResponse, errorResponse, getNextNumber, paginate } from '../utils/helpers.js';

const router = Router();

// ========= OVERVIEW =========
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [emps, depts, leave, attendance] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='active') as active FROM hr_employees`),
      query(`SELECT COUNT(*) as total FROM hr_departments`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='pending') as pending,
             COUNT(*) FILTER(WHERE status='approved') as approved FROM hr_leave_requests`),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='present') as present
             FROM hr_attendance WHERE attendance_date = CURRENT_DATE`),
    ]);
    successResponse(res, { employees: emps.rows[0], departments: depts.rows[0], leave: leave.rows[0], attendance: attendance.rows[0] });
  } catch (err) { errorResponse(res, err.message); }
});

// ========= EMPLOYEES =========
router.get('/employees', authenticate, async (req, res) => {
  try {
    const { status, department_id, search, page = 1 } = req.query;
    let sql = `SELECT e.*, d.dept_name, p.position_name, bp.email, bp.phone, bp.display_name,
               u.username
               FROM hr_employees e
               LEFT JOIN hr_departments d ON e.department_id = d.id
               LEFT JOIN hr_positions p ON e.position_id = p.id
               LEFT JOIN bp_business_partners bp ON e.bp_id = bp.id
               LEFT JOIN sys_users u ON e.user_id = u.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND e.status = $${idx++}`; params.push(status); }
    if (department_id) { sql += ` AND e.department_id = $${idx++}`; params.push(department_id); }
    if (search) { sql += ` AND (e.employee_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY e.employee_number`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/employees', authenticate, async (req, res) => {
  try {
    const e = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const empNumber = await getNextNumber('EMP');
    const compRes = await query(`SELECT c.id FROM org_companies c JOIN sys_users u ON u.default_company_id = c.id WHERE u.id = $1`, [req.user.id]); // fallback

    // Create BP entry
    const bpNumber = await getNextNumber('BP');
    const bp = await query(
      `INSERT INTO bp_business_partners (bp_number, bp_type, first_name, last_name, display_name, email, phone)
       VALUES ($1,'employee',$2,$3,$4,$5,$6) RETURNING id`,
      [bpNumber, e.first_name, e.last_name, `${e.first_name} ${e.last_name}`, e.email, e.phone]);

    const result = await query(
      `INSERT INTO hr_employees (employee_number, bp_id, company_id, department_id, position_id,
        hire_date, employment_type, salary, currency, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active') RETURNING *`,
      [empNumber, bp.rows[0].id, compRes.rows[0]?.id, uuid(e.department_id), uuid(e.position_id),
       e.hire_date || null, e.employment_type || 'full_time', num(e.salary), e.currency || 'INR']);

    await auditLog(req.user.id, 'CREATE', 'employee', result.rows[0].id, null, { employee_number: empNumber }, req);
    successResponse(res, result.rows[0], 'Employee created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// UPDATE employee
router.put('/employees/:id', authenticate, async (req, res) => {
  try {
    const e = req.body;
    const num = (v) => (v === '' || v === null || v === undefined) ? null : parseFloat(v);
    const uuid = (v) => (v === '' || v === null || v === undefined) ? null : v;
    const result = await query(
      `UPDATE hr_employees SET department_id=$1, position_id=$2, employment_type=$3, salary=$4,
       currency=$5, status=$6, pan_number=$7, aadhaar_number=$8, pf_number=$9, uan_number=$10,
       esi_number=$11, bank_account_number=$12, bank_ifsc=$13, bank_name=$14, date_of_birth=$15,
       gender=$16, grade=$17, reporting_manager_id=$18, notice_period_days=$19,
       emergency_contact_name=$20, emergency_contact_phone=$21 WHERE id=$22 RETURNING *`,
      [uuid(e.department_id), uuid(e.position_id), e.employment_type, num(e.salary), e.currency || 'INR', e.status || 'active',
       e.pan_number, e.aadhaar_number, e.pf_number, e.uan_number, e.esi_number,
       e.bank_account_number, e.bank_ifsc, e.bank_name, e.date_of_birth || null,
       e.gender, e.grade, uuid(e.reporting_manager_id), num(e.notice_period_days),
       e.emergency_contact_name, e.emergency_contact_phone, req.params.id]);
    if (!result.rows.length) return errorResponse(res, 'Not found', 404);
    // Also update BP display_name, email, phone
    if (e.display_name || e.email || e.phone) {
      const emp = result.rows[0];
      await query(`UPDATE bp_business_partners SET display_name=COALESCE($1,display_name), email=COALESCE($2,email), phone=COALESCE($3,phone), updated_at=NOW() WHERE id=$4`,
        [e.display_name, e.email, e.phone, emp.bp_id]);
    }
    await auditLog(req.user.id, 'UPDATE', 'employee', req.params.id, null, e, req);
    successResponse(res, result.rows[0], 'Employee updated');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= DEPARTMENTS =========
router.get('/departments', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT d.*, (SELECT COUNT(*) FROM hr_employees e WHERE e.department_id = d.id AND e.status='active') as employee_count FROM hr_departments d ORDER BY d.dept_code`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= POSITIONS =========
router.get('/positions', authenticate, async (req, res) => {
  try {
    const result = await query(`SELECT p.*, d.dept_name FROM hr_positions p LEFT JOIN hr_departments d ON p.department_id = d.id WHERE p.is_active = true ORDER BY p.position_name`);
    successResponse(res, result.rows);
  } catch (err) { errorResponse(res, err.message); }
});

// ========= LEAVE =========
router.get('/leave', authenticate, async (req, res) => {
  try {
    const { status, search, page = 1 } = req.query;
    let sql = `SELECT lr.*, lt.type_name, lt.type_code, e.employee_number,
               bp.display_name as employee_name, d.dept_name
               FROM hr_leave_requests lr
               LEFT JOIN hr_leave_types lt ON lr.leave_type_id = lt.id
               LEFT JOIN hr_employees e ON lr.employee_id = e.id
               LEFT JOIN bp_business_partners bp ON e.bp_id = bp.id
               LEFT JOIN hr_departments d ON e.department_id = d.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (status) { sql += ` AND lr.status = $${idx++}`; params.push(status); }
    if (search) { sql += ` AND (e.employee_number ILIKE $${idx} OR bp.display_name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    sql += ` ORDER BY lr.created_at DESC`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/leave', authenticate, async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason } = req.body;
    if (!employee_id || !leave_type_id || !start_date || !end_date) return errorResponse(res, 'Employee, type, and dates required', 400);
    const days = Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)) + 1;
    const result = await query(
      `INSERT INTO hr_leave_requests (employee_id, leave_type_id, start_date, end_date, days, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [employee_id, leave_type_id, start_date, end_date, days, reason]);
    successResponse(res, result.rows[0], 'Leave request created', 201);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/leave/:id/approve', authenticate, async (req, res) => {
  try {
    await query(`UPDATE hr_leave_requests SET status='approved', approved_by=$1, approved_at=NOW() WHERE id=$2 AND status='pending'`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Leave approved');
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/leave/:id/reject', authenticate, async (req, res) => {
  try {
    await query(`UPDATE hr_leave_requests SET status='rejected', approved_by=$1, approved_at=NOW() WHERE id=$2 AND status='pending'`, [req.user.id, req.params.id]);
    successResponse(res, null, 'Leave rejected');
  } catch (err) { errorResponse(res, err.message); }
});

// ========= LEAVE TYPES =========
router.get('/leave-types', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT * FROM hr_leave_types WHERE is_active = true ORDER BY type_code`)).rows); }
  catch (err) { errorResponse(res, err.message); }
});

// ========= ATTENDANCE =========
router.get('/attendance', authenticate, async (req, res) => {
  try {
    const { date, employee_id, page = 1 } = req.query;
    let sql = `SELECT a.*, e.employee_number, bp.display_name as employee_name, d.dept_name
               FROM hr_attendance a
               LEFT JOIN hr_employees e ON a.employee_id = e.id
               LEFT JOIN bp_business_partners bp ON e.bp_id = bp.id
               LEFT JOIN hr_departments d ON e.department_id = d.id WHERE 1=1`;
    const params = []; let idx = 1;
    if (date) { sql += ` AND a.attendance_date = $${idx++}`; params.push(date); }
    if (employee_id) { sql += ` AND a.employee_id = $${idx++}`; params.push(employee_id); }
    sql += ` ORDER BY a.attendance_date DESC, e.employee_number`;
    sql = paginate(sql, parseInt(page), 50);
    successResponse(res, (await query(sql, params)).rows);
  } catch (err) { errorResponse(res, err.message); }
});

router.post('/attendance', authenticate, async (req, res) => {
  try {
    const { employee_id, attendance_date, check_in, check_out, status } = req.body;
    let hours = null;
    if (check_in && check_out) hours = ((new Date(check_out) - new Date(check_in)) / 3600000).toFixed(1);
    const result = await query(
      `INSERT INTO hr_attendance (employee_id, attendance_date, check_in, check_out, hours_worked, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (employee_id, attendance_date) DO UPDATE SET check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out, hours_worked=EXCLUDED.hours_worked, status=EXCLUDED.status
       RETURNING *`,
      [employee_id, attendance_date || new Date().toISOString().split('T')[0], check_in, check_out, hours, status || 'present']);
    successResponse(res, result.rows[0], 'Attendance recorded', 201);
  } catch (err) { errorResponse(res, err.message); }
});

// ============================================
// PAYROLL
// ============================================
router.get('/payroll', authenticate, async (req, res) => {
  try { successResponse(res, (await query(`SELECT pr.*, u.first_name || ' ' || u.last_name as created_by_name FROM hr_payroll_runs pr LEFT JOIN sys_users u ON pr.created_by = u.id ORDER BY pr.period_year DESC, pr.period_month DESC`)).rows); } catch(e) { errorResponse(res, e.message); }
});

router.post('/payroll/run', authenticate, async (req, res) => {
  try {
    const { period_month, period_year } = req.body;
    const exists = await query(`SELECT id FROM hr_payroll_runs WHERE period_month = $1 AND period_year = $2`, [period_month, period_year]);
    if (exists.rows.length) return errorResponse(res, 'Payroll already exists for this period', 400);

    const employees = await query(`SELECT * FROM hr_employees WHERE status = 'active' AND (salary > 0 OR basic_salary > 0)`);
    if (!employees.rows.length) return errorResponse(res, 'No active employees with salary found', 400);

    const run = await query(`INSERT INTO hr_payroll_runs (run_date, period_month, period_year, created_by) VALUES (CURRENT_DATE, $1, $2, $3) RETURNING *`, [period_month, period_year, req.user.id]);

    let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerPF = 0, totalEmployerESI = 0;

    for (const emp of employees.rows) {
      // --- EARNINGS ---
      const basic = parseFloat(emp.basic_salary || emp.salary || 0);
      const hraPercent = parseFloat(emp.hra_percent || 40);
      const daPercent = parseFloat(emp.da_percent || 0);
      const hra = basic * (hraPercent / 100);
      const da = basic * (daPercent / 100);
      const specialAllow = parseFloat(emp.special_allowance || 0);
      const conveyance = parseFloat(emp.conveyance_allowance || 1600);
      const medical = parseFloat(emp.medical_allowance || 1250);
      const otherEarnings = 0;
      const gross = basic + hra + da + specialAllow + conveyance + medical + otherEarnings;

      // --- DEDUCTIONS ---
      // PF: 12% of (Basic + DA), capped at base of 15000
      const pfBase = Math.min(basic + da, 15000);
      const pfEmployee = emp.pf_applicable !== false ? pfBase * 0.12 : 0;
      const pfEmployer = emp.pf_applicable !== false ? pfBase * 0.12 : 0;

      // ESI: Employee 0.75% + Employer 3.25% (if gross <= 21000)
      const esiApplicable = emp.esi_applicable === true || gross <= 21000;
      const esiEmployee = esiApplicable ? gross * 0.0075 : 0;
      const esiEmployer = esiApplicable ? gross * 0.0325 : 0;

      // Professional Tax (Tamil Nadu / Karnataka slab)
      let professionalTax = 0;
      if (emp.pt_applicable !== false) {
        if (gross > 15000) professionalTax = 200;
        else if (gross > 10000) professionalTax = 150;
        else if (gross > 5000) professionalTax = 60;
      }

      // TDS (simplified monthly calculation based on annual income under new regime)
      const annualGross = gross * 12;
      let annualTax = 0;
      if (emp.tax_regime === 'old') {
        // Old regime with standard deduction 50000
        const taxableIncome = Math.max(0, annualGross - 50000 - (pfEmployee * 12) - 150000);
        if (taxableIncome > 1500000) annualTax = 187500 + (taxableIncome - 1500000) * 0.30;
        else if (taxableIncome > 1250000) annualTax = 125000 + (taxableIncome - 1250000) * 0.25;
        else if (taxableIncome > 1000000) annualTax = 75000 + (taxableIncome - 1000000) * 0.20;
        else if (taxableIncome > 750000) annualTax = 25000 + (taxableIncome - 750000) * 0.20;
        else if (taxableIncome > 500000) annualTax = (taxableIncome - 500000) * 0.10;
        else if (taxableIncome > 250000) annualTax = (taxableIncome - 250000) * 0.05;
      } else {
        // New regime FY2024-25 (default)
        const taxableIncome = Math.max(0, annualGross - 75000);
        if (taxableIncome > 1500000) annualTax = 150000 + (taxableIncome - 1500000) * 0.30;
        else if (taxableIncome > 1200000) annualTax = 90000 + (taxableIncome - 1200000) * 0.20;
        else if (taxableIncome > 900000) annualTax = 45000 + (taxableIncome - 900000) * 0.15;
        else if (taxableIncome > 600000) annualTax = 15000 + (taxableIncome - 600000) * 0.10;
        else if (taxableIncome > 300000) annualTax = (taxableIncome - 300000) * 0.05;
        // Section 87A rebate for income <= 7 lakh
        if (taxableIncome <= 700000) annualTax = 0;
      }
      annualTax = annualTax * 1.04; // 4% Health & Education Cess
      const tds = Math.round(annualTax / 12);

      const totalDed = pfEmployee + esiEmployee + professionalTax + tds;
      const net = gross - totalDed;
      const ctc = gross + pfEmployer + esiEmployer;

      // Leave days
      const periodStart = `${period_year}-${String(period_month).padStart(2,'0')}-01`;
      const periodEnd = `${period_year}-${String(period_month).padStart(2,'0')}-28`;
      let leaveDays = 0;
      try {
        const leaves = await query(
          `SELECT COALESCE(SUM(CASE WHEN start_date <= $2::date AND end_date >= $1::date THEN LEAST(end_date, $2::date) - GREATEST(start_date, $1::date) + 1 ELSE 0 END), 0) as days
           FROM hr_leave_requests WHERE employee_id = $3 AND status = 'approved'`,
          [periodStart, periodEnd, emp.id]);
        leaveDays = parseInt(leaves.rows[0].days);
      } catch {}

      await query(
        `INSERT INTO hr_payslips (payroll_run_id, employee_id, basic_salary, hra, da, special_allowance,
          conveyance_allowance, medical_allowance, other_earnings, gross_salary,
          pf_deduction, pf_employer, esi_employee, esi_employer, professional_tax, tds, tax_deduction,
          loan_deduction, other_deductions, total_deductions, net_salary, ctc, working_days, leave_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,22,$23)`,
        [run.rows[0].id, emp.id, basic, hra, da, specialAllow, conveyance, medical, otherEarnings, gross,
         pfEmployee, pfEmployer, esiEmployee, esiEmployer, professionalTax, tds, tds,
         0, 0, totalDed, net, ctc, leaveDays]);

      totalGross += gross; totalDeductions += totalDed; totalNet += net;
      totalEmployerPF += pfEmployer; totalEmployerESI += esiEmployer;
    }

    await query(
      `UPDATE hr_payroll_runs SET total_gross=$1, total_deductions=$2, total_net=$3, employee_count=$4,
       total_employer_pf=$5, total_employer_esi=$6, status='processed' WHERE id=$7`,
      [totalGross, totalDeductions, totalNet, employees.rows.length, totalEmployerPF, totalEmployerESI, run.rows[0].id]);

    successResponse(res, {
      id: run.rows[0].id, employees: employees.rows.length,
      total_gross: totalGross, total_net: totalNet,
      total_pf: totalEmployerPF, total_esi: totalEmployerESI
    }, 'Payroll processed with Indian statutory components', 201);
  } catch(e) { errorResponse(res, e.message); }
});

router.get('/payroll/:id/payslips', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT ps.*, e.first_name, e.last_name, e.employee_number, d.dept_name as department,
              e.pan_number, e.pf_number, e.uan_number, e.bank_account_number, e.bank_name, e.bank_ifsc
       FROM hr_payslips ps
       JOIN hr_employees e ON ps.employee_id = e.id
       LEFT JOIN hr_departments d ON e.department_id = d.id
       WHERE ps.payroll_run_id = $1 ORDER BY e.last_name`, [req.params.id]);
    successResponse(res, r.rows);
  } catch(e) { errorResponse(res, e.message); }
});

// Get single payslip detail
router.get('/payslip/:id', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT ps.*, e.first_name, e.last_name, e.employee_number, d.dept_name as department,
              e.pan_number, e.pf_number, e.uan_number, e.esi_number, e.bank_account_number, e.bank_name, e.bank_ifsc,
              pr.period_month, pr.period_year
       FROM hr_payslips ps
       JOIN hr_employees e ON ps.employee_id = e.id
       LEFT JOIN hr_departments d ON e.department_id = d.id
       JOIN hr_payroll_runs pr ON ps.payroll_run_id = pr.id
       WHERE ps.id = $1`, [req.params.id]);
    if (!r.rows.length) return errorResponse(res, 'Not found', 404);
    successResponse(res, r.rows[0]);
  } catch(e) { errorResponse(res, e.message); }
});

// DELETE ENDPOINTS
router.delete("/employees/:id", authenticate, async (req, res) => {
  try {
    const deps = await query("SELECT (SELECT COUNT(*) FROM hr_leave_requests WHERE employee_id=$1)+(SELECT COUNT(*) FROM hr_payslips WHERE employee_id=$1) as cnt", [req.params.id]);
    if (parseInt(deps.rows[0].cnt) > 0) return errorResponse(res, "Cannot delete — leave requests or payslips exist for this employee", 400);
    await query("DELETE FROM hr_employees WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Employee deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
router.delete("/leave/:id", authenticate, async (req, res) => {
  try {
    const l = await query("SELECT status FROM hr_leave_requests WHERE id = $1", [req.params.id]);
    if (!l.rows.length) return errorResponse(res, "Not found", 404);
    if (l.rows[0].status !== "pending") return errorResponse(res, "Only pending leave requests can be deleted", 400);
    await query("DELETE FROM hr_leave_requests WHERE id = $1", [req.params.id]);
    successResponse(res, null, "Leave request deleted");
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
export default router;

router.post('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { entity, ids } = req.body;
    if (!ids?.length) return errorResponse(res, 'No items selected', 400);
    const checks = {
      'employees': { table: 'hr_employees', deps: "SELECT COUNT(*) FROM hr_leave_requests WHERE employee_id = ANY($1::uuid[])" },
      'leave': { table: 'hr_leave_requests', status_check: 'pending' },
    };
    const cfg = checks[entity];
    if (!cfg) return errorResponse(res, 'Unknown entity', 400);
    if (cfg.status_check) { const sc = await query(`SELECT COUNT(*) FROM ${cfg.table} WHERE id = ANY($1::uuid[]) AND status != $2`, [ids, cfg.status_check]); if (parseInt(sc.rows[0].count) > 0) return errorResponse(res, `Cannot delete — some items not in ${cfg.status_check} status`, 400); }
    if (cfg.deps) { const d = await query(cfg.deps, [ids]); if (parseInt(d.rows[0].count) > 0) return errorResponse(res, `Cannot delete — dependent records exist`, 400); }
    const r = await query(`DELETE FROM ${cfg.table} WHERE id = ANY($1::uuid[])`, [ids]);
    successResponse(res, { deleted: r.rowCount }, `${r.rowCount} deleted`);
  } catch (err) { errorResponse(res, friendlyError(err)); }
});
