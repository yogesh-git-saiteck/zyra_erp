import { query } from '../config/database.js';

/**
 * Read a single config value. Returns defaultValue if not found.
 */
export async function getConfig(key, defaultValue = null) {
  try {
    const r = await query(`SELECT config_value FROM sys_config WHERE config_key = $1`, [key]);
    const v = r.rows[0]?.config_value;
    return v !== undefined && v !== null ? v : defaultValue;
  } catch { return defaultValue; }
}

/**
 * Read multiple config keys in one query.
 * Returns { key: value } map. Missing keys get defaultValue.
 */
export async function getConfigs(keys, defaultValue = null) {
  try {
    const r = await query(
      `SELECT config_key, config_value FROM sys_config WHERE config_key = ANY($1)`,
      [keys]);
    const out = {};
    for (const k of keys) out[k] = defaultValue;
    for (const row of r.rows) out[row.config_key] = row.config_value;
    return out;
  } catch {
    const out = {};
    for (const k of keys) out[k] = defaultValue;
    return out;
  }
}

/**
 * Convenience: read a boolean config. Returns true/false.
 */
export async function getConfigBool(key, defaultValue = false) {
  const v = await getConfig(key, String(defaultValue));
  return v === 'true';
}

/**
 * Convenience: read a numeric config.
 */
export async function getConfigNum(key, defaultValue = 0) {
  const v = await getConfig(key, String(defaultValue));
  return parseFloat(v) || defaultValue;
}
