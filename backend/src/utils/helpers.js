import { query } from '../config/database.js';

export async function getNextNumber(objectType) {
  const result = await query(
    `UPDATE sys_number_ranges
     SET current_number = current_number + step
     WHERE object_type = $1
     RETURNING prefix, current_number, pad_length`,
    [objectType]
  );
  if (!result.rows.length) throw new Error(`Number range not found: ${objectType}`);
  const { prefix, current_number, pad_length } = result.rows[0];
  const num = parseInt(current_number);
  const padded = pad_length > 0 ? String(num).padStart(pad_length, '0') : String(num);
  return `${prefix}${padded}`;
}

export function paginate(queryStr, page = 1, limit = 25) {
  const offset = (Math.max(1, page) - 1) * limit;
  return `${queryStr} LIMIT ${limit} OFFSET ${offset}`;
}

export function buildWhereClause(filters, startIndex = 1) {
  const conditions = [];
  const values = [];
  let idx = startIndex;

  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined || val === null || val === '') continue;
    if (key.endsWith('_from')) {
      conditions.push(`${key.replace('_from', '')} >= $${idx++}`);
      values.push(val);
    } else if (key.endsWith('_to')) {
      conditions.push(`${key.replace('_to', '')} <= $${idx++}`);
      values.push(val);
    } else if (key.endsWith('_like')) {
      conditions.push(`${key.replace('_like', '')} ILIKE $${idx++}`);
      values.push(`%${val}%`);
    } else {
      conditions.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values, nextIndex: idx };
}

export function formatDate(date) {
  if (!date) return null;
  return new Date(date).toISOString().split('T')[0];
}

export function successResponse(res, data, message = 'Success', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function errorResponse(res, rawMessage = 'Error', status = 500, details = null) {
  const message = friendlyError(rawMessage);
  return res.status(status).json({ success: false, message, error: message, details });
}

// Translate raw DB/system errors to user-friendly messages
export function friendlyError(msg) {
  if (!msg) return 'An unexpected error occurred';
  const m = msg.toString();

  // Duplicate key violations
  if (m.includes('duplicate key') || m.includes('already exists')) {
    const match = m.match(/Key \((\w+)\)=\(([^)]+)\)/);
    if (match) {
      const fieldMap = { plant_code:'Plant Code', company_code:'Company Code', sloc_code:'Storage Location Code',
        bp_number:'Partner Number', material_code:'Material Code', email:'Email', username:'Username',
        account_code:'Account Code', cc_code:'Cost Center Code', pc_code:'Profit Center Code',
        sales_org_code:'Sales Org Code', gstin:'GSTIN', employee_number:'Employee Number',
        doc_number:'Document Number', tax_code:'Tax Code', bin_code:'Bin Code' };
      const friendly = fieldMap[match[1]] || match[1].replace(/_/g, ' ');
      return `${friendly} "${match[2]}" already exists. Please use a different value.`;
    }
    if (m.includes('already exists')) return m;
    return 'This record already exists. Please check for duplicates.';
  }

  // Foreign key violations
  if (m.includes('foreign key constraint') || m.includes('violates foreign key')) {
    if (m.includes('company_id')) return 'Invalid company selected. Please choose a valid company.';
    if (m.includes('plant_id')) return 'Invalid plant selected. Please choose a valid plant.';
    if (m.includes('vendor_id') || m.includes('customer_id') || m.includes('bp_id')) return 'Invalid business partner. Please select a valid vendor/customer.';
    if (m.includes('material_id')) return 'Invalid material. Please select a valid material.';
    if (m.includes('department_id')) return 'Invalid department selected.';
    return 'Referenced record not found. Please check your selections.';
  }

  // Not null violations
  if (m.includes('not-null constraint') || m.includes('violates not-null')) {
    const match = m.match(/column "(\w+)"/);
    if (match) {
      const fieldMap = { company_id:'Company', plant_id:'Plant', vendor_id:'Vendor', customer_id:'Customer',
        material_id:'Material', plant_code:'Plant Code', plant_name:'Plant Name', company_code:'Company Code',
        company_name:'Company Name', display_name:'Display Name', first_name:'First Name', last_name:'Last Name',
        email:'Email', bp_type:'Partner Type', material_name:'Material Name', account_code:'Account Code',
        account_name:'Account Name', description:'Description' };
      const friendly = fieldMap[match[1]] || match[1].replace(/_/g, ' ');
      return `${friendly} is required. Please fill in this field.`;
    }
    return 'A required field is missing. Please fill in all mandatory fields.';
  }

  // Data type errors
  if (m.includes('invalid input syntax for type uuid')) return 'Invalid selection — please choose from the dropdown.';
  if (m.includes('invalid input syntax for type numeric') || m.includes('invalid input syntax for type integer'))
    return 'Please enter a valid number.';
  if (m.includes('invalid input syntax for type date')) return 'Please enter a valid date (YYYY-MM-DD).';
  if (m.includes('value too long for type character varying')) {
    const match = m.match(/character varying\((\d+)\)/);
    return match ? `Value is too long. Maximum ${match[1]} characters allowed.` : 'Value is too long. Please shorten your input.';
  }

  // Check constraint violations
  if (m.includes('check constraint')) return 'Value is outside the allowed range. Please check your input.';

  // Permission errors
  if (m.includes('Access denied') || m.includes('Not authorized')) return m;
  if (m.includes('Not found') || m.includes('not found')) return m;

  // Enum errors
  if (m.includes('invalid input value for enum')) {
    const match = m.match(/enum (\w+): "([^"]+)"/);
    if (match) return `Invalid value "${match[2]}" for ${match[1].replace(/_/g, ' ')}. Please select a valid option.`;
    return 'Invalid option selected. Please choose from the available options.';
  }

  // Connection / timeout
  if (m.includes('ECONNREFUSED') || m.includes('connection refused')) return 'Database connection failed. Please try again.';
  if (m.includes('timeout') || m.includes('timed out')) return 'Request timed out. Please try again.';

  // Return original if no match (but strip technical details)
  if (m.length > 200) return m.substring(0, 200) + '...';
  return m;
}

export function validateRequired(body, fields) {
  const missing = fields.filter(f => !body[f] && body[f] !== 0);
  if (missing.length) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  return null;
}
