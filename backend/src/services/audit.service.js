const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// System user for automated actions (matching engine, auto-expiry, etc.)
// Uses the Admin User seeded in init.sql
const SYSTEM_USER_ID = 'cccccccc-3333-3333-3333-333333333333';

exports.SYSTEM_USER_ID = SYSTEM_USER_ID;

exports.logAudit = async ({
  user_id,
  action_type,
  entity_type,
  entity_id,
  details
}) => {
  try {
    await pool.query(
      `INSERT INTO audit_log
      (log_id, user_id, action_type, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuidv4(),
        user_id || SYSTEM_USER_ID,
        action_type,
        entity_type,
        entity_id,
        details || {}
      ]
    );
  } catch (err) {
    console.error('Audit Log Error:', err.message);
  }
};
