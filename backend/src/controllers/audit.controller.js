const pool = require('../config/db');
const { sendCsv } = require('../utils/csv.util');

/* GET AUDIT LOGS */
exports.getAuditLogs = async (req, res) => {
  try {
    const { entity_type, entity_id, user_id, action_type, limit = 100, offset = 0 } = req.query;
    const isInstAdmin = req.user.role_name === 'Institutional Admin';

    let query = `
      SELECT a.*, u.name AS user_name, u.email AS user_email
      FROM audit_log a
      LEFT JOIN "user" u ON a.user_id = u.user_id
    `;
    const params = [];
    const conditions = [];

    // Scope Institutional Admin to their institution's users
    if (isInstAdmin) {
      conditions.push(`a.user_id IN (SELECT user_id FROM "user" WHERE institution_id = $${params.length + 1})`);
      params.push(req.user.institution_id);
    }

    if (entity_type) {
      params.push(entity_type);
      conditions.push(`a.entity_type = $${params.length}`);
    }
    if (entity_id) {
      params.push(entity_id);
      conditions.push(`a.entity_id = $${params.length}`);
    }
    if (user_id) {
      params.push(user_id);
      conditions.push(`a.user_id = $${params.length}`);
    }
    if (action_type) {
      params.push(action_type);
      conditions.push(`a.action_type = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.created_at DESC';

    params.push(parseInt(limit));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);
    if (req.query.format === 'csv') {
      const cols = ['audit_id', 'user_name', 'user_email', 'action_type', 'entity_type', 'entity_id', 'details', 'created_at'];
      const flatRows = result.rows.map(r => ({ ...r, details: typeof r.details === 'object' ? JSON.stringify(r.details) : r.details }));
      return sendCsv(res, 'audit_log', flatRows, cols);
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* GET INVENTORY STATE TRANSITIONS */
exports.getInventoryTransitions = async (req, res) => {
  try {
    const { inventory_id } = req.query;
    let query = `
      SELECT t.*, u.name AS changed_by_name,
        i.blood_group, i.component_type
      FROM inv_state_transition t
      LEFT JOIN "user" u ON t.changed_by = u.user_id
      LEFT JOIN blood_inventory i ON t.inventory_id = i.inventory_id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role_name === 'Institutional Admin') {
      conditions.push(`i.institution_id = $${params.length + 1}`);
      params.push(req.user.institution_id);
    }

    if (inventory_id) {
      params.push(inventory_id);
      conditions.push(`t.inventory_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET DEMAND STATE TRANSITIONS */
exports.getDemandTransitions = async (req, res) => {
  try {
    const { request_id } = req.query;
    let query = `
      SELECT t.*, u.name AS changed_by_name,
        d.blood_group, d.component_type, d.urgency_level
      FROM demand_state_transition t
      LEFT JOIN "user" u ON t.changed_by = u.user_id
      LEFT JOIN demand_request d ON t.request_id = d.request_id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role_name === 'Institutional Admin') {
      conditions.push(`d.institution_id = $${params.length + 1}`);
      params.push(req.user.institution_id);
    }

    if (request_id) {
      params.push(request_id);
      conditions.push(`t.request_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET TRANSFER STATE TRANSITIONS */
exports.getTransferTransitions = async (req, res) => {
  try {
    const { transfer_id } = req.query;
    let query = `
      SELECT t.*, u.name AS changed_by_name
      FROM transfer_state_transition t
      LEFT JOIN "user" u ON t.changed_by = u.user_id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role_name === 'Institutional Admin') {
      conditions.push(`t.transfer_id IN (
        SELECT tr.transfer_id FROM transfer tr
        WHERE tr.source_inst_id = $${params.length + 1} OR tr.dest_inst_id = $${params.length + 1}
      )`);
      params.push(req.user.institution_id);
    }

    if (transfer_id) {
      params.push(transfer_id);
      conditions.push(`t.transfer_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY t.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET OWNERSHIP HISTORY */
exports.getOwnershipHistory = async (req, res) => {
  try {
    const { inventory_id } = req.query;
    let query = `
      SELECT h.*, inst.name AS institution_name,
        i.blood_group, i.component_type
      FROM inv_ownership_history h
      LEFT JOIN institution inst ON h.institution_id = inst.institution_id
      LEFT JOIN blood_inventory i ON h.inventory_id = i.inventory_id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role_name === 'Institutional Admin') {
      conditions.push(`(h.institution_id = $${params.length + 1} OR i.institution_id = $${params.length + 1})`);
      params.push(req.user.institution_id);
    }

    if (inventory_id) {
      params.push(inventory_id);
      conditions.push(`h.inventory_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY h.from_date DESC LIMIT 200';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
