const pool = require('../config/db');
const { logAudit } = require('../services/audit.service');

/* GET RECEIVED STOCK — scoped to destination institution */
exports.getReceivedStock = async (req, res) => {
  try {
    const { status, blood_group, component_type } = req.query;
    const isSystemAdmin = req.user.role_name === 'System Admin';
    const instId = req.user.institution_id;

    let query = `
      SELECT rs.*, i.name AS source_institution_name
      FROM received_stock rs
      LEFT JOIN institution i ON rs.source_inst_id = i.institution_id
      WHERE 1=1`;
    const params = [];

    // Institution scoping: non-SA see only their institution's received stock
    if (!isSystemAdmin) {
      params.push(instId);
      query += ` AND rs.dest_inst_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND rs.status = $${params.length}`;
    }
    if (blood_group) {
      params.push(blood_group);
      query += ` AND rs.blood_group = $${params.length}`;
    }
    if (component_type) {
      params.push(component_type);
      query += ` AND rs.component_type = $${params.length}`;
    }

    query += ' ORDER BY rs.received_at DESC';

    const result = await pool.query(query, params);
    if (req.query.format === 'csv') {
      const { sendCsv } = require('../utils/csv.util');
      const cols = ['received_stock_id', 'transfer_id', 'source_institution_name', 'blood_group', 'component_type', 'quantity', 'unit_type', 'status', 'expiry_category', 'expiry_date', 'received_at'];
      return sendCsv(res, 'received_stock', result.rows, cols);
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE RECEIVED STOCK STATUS */
exports.updateReceivedStockStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const current = await pool.query(
      'SELECT * FROM received_stock WHERE received_stock_id = $1', [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Received stock record not found' });
    }

    const item = current.rows[0];

    // Institution check: only dest institution can update (unless SA)
    if (req.user.role_name !== 'System Admin' && item.dest_inst_id !== req.user.institution_id) {
      return res.status(403).json({ error: 'Cannot update received stock from another institution' });
    }

    // Only available items can be manually updated
    if (item.status !== 'available') {
      return res.status(409).json({ error: `Cannot update — item is already ${item.status}` });
    }

    // Only allow manual transitions to 'used' or 'discarded'
    if (!['used', 'discarded'].includes(status)) {
      return res.status(422).json({ error: `Invalid status. Use 'used' or 'discarded'.` });
    }

    const result = await pool.query(
      'UPDATE received_stock SET status = $1 WHERE received_stock_id = $2 RETURNING *',
      [status, id]
    );

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'received_stock_status_updated',
      entity_type: 'RECEIVED_STOCK',
      entity_id: id,
      details: { before: { status: item.status }, after: { status } }
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
