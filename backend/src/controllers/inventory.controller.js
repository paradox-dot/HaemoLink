const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../services/audit.service');
const { sendCsv, parseCsv } = require('../utils/csv.util');

/* CREATE INVENTORY */
exports.createInventory = async (req, res) => {
  try {
    const {
      institution_id,
      created_by,
      blood_group,
      component_type,
      quantity,
      unit_type,
      collection_date,
      expiry_date,
      is_network_visible
    } = req.body;

    if (!institution_id || !created_by || !blood_group || !component_type || !quantity || !collection_date || !expiry_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Compute expiry category
    const now = new Date();
    const expiry = new Date(expiry_date);
    const hoursToExpiry = (expiry - now) / (1000 * 60 * 60);
    let expiry_category = 'safe';
    if (hoursToExpiry <= 24) expiry_category = 'critical';
    else if (hoursToExpiry <= 72) expiry_category = 'warning';

    const inventory_id = uuidv4();

    const result = await pool.query(
      `INSERT INTO blood_inventory
      (inventory_id, institution_id, created_by, blood_group, component_type, quantity,
       unit_type, collection_date, expiry_date, status, expiry_category, is_network_visible)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        inventory_id, institution_id, created_by, blood_group, component_type, quantity,
        unit_type || 'units', collection_date, expiry_date, 'available', expiry_category,
        is_network_visible || false
      ]
    );

    // Log state transition: created → available
    await pool.query(
      `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
       VALUES ($1, $2, $3, 'created', 'available')`,
      [uuidv4(), inventory_id, created_by]
    );

    // Insert ownership record
    await pool.query(
      `INSERT INTO inv_ownership_history (id, inventory_id, institution_id, from_date)
       VALUES ($1, $2, $3, NOW())`,
      [uuidv4(), inventory_id, institution_id]
    );

    await logAudit({
      user_id: created_by,
      action_type: 'inventory_created',
      entity_type: 'BLOOD_INVENTORY',
      entity_id: inventory_id,
      details: { after: result.rows[0] }
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* GET INVENTORY — filtered by institution */
exports.getInventory = async (req, res) => {
  try {
    const { institution_id, status, blood_group } = req.query;
    let query = `
      SELECT bi.*, i.name AS institution_name
      FROM blood_inventory bi
      LEFT JOIN institution i ON bi.institution_id = i.institution_id
      WHERE 1=1`;
    const params = [];

    if (institution_id) {
      params.push(institution_id);
      query += ` AND bi.institution_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND bi.status = $${params.length}`;
    }
    if (blood_group) {
      params.push(blood_group);
      query += ` AND bi.blood_group = $${params.length}`;
    }

    query += ' ORDER BY bi.expiry_date ASC';

    const result = await pool.query(query, params);
    if (req.query.format === 'csv') {
      const cols = ['inventory_id', 'institution_name', 'blood_group', 'component_type', 'quantity', 'unit_type', 'status', 'expiry_category', 'collection_date', 'expiry_date', 'created_at'];
      return sendCsv(res, 'inventory', result.rows, cols);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* BULK CREATE INVENTORY via CSV */
exports.bulkCreateInventory = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'CSV file is required (field name: file)' });
    }
    const { institution_id, created_by } = req.body;
    if (!institution_id || !created_by) {
      return res.status(400).json({ error: 'institution_id and created_by are required' });
    }
    // Non-SA must import into own institution
    if (req.user.role_name !== 'System Admin' && institution_id !== req.user.institution_id) {
      return res.status(403).json({ error: 'Cannot import inventory for another institution' });
    }

    const text = req.file.buffer.toString('utf8');
    const { rows } = parseCsv(text);
    if (rows.length === 0) return res.status(400).json({ error: 'CSV has no data rows' });
    if (rows.length > 500) return res.status(413).json({ error: 'Max 500 rows per upload' });

    const required = ['blood_group', 'component_type', 'quantity', 'collection_date', 'expiry_date'];
    const validGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const validComponents = ['whole_blood', 'platelets', 'plasma', 'rbc'];
    const errors = [];
    rows.forEach((r, idx) => {
      required.forEach(f => {
        if (!r[f] || String(r[f]).trim() === '') errors.push({ row: idx + 2, field: f, reason: 'required' });
      });
      if (r.blood_group && !validGroups.includes(r.blood_group.trim()))
        errors.push({ row: idx + 2, field: 'blood_group', reason: `must be one of ${validGroups.join(', ')}` });
      if (r.component_type && !validComponents.includes(r.component_type.trim()))
        errors.push({ row: idx + 2, field: 'component_type', reason: `must be one of ${validComponents.join(', ')}` });
      if (r.quantity && (isNaN(parseFloat(r.quantity)) || parseFloat(r.quantity) <= 0))
        errors.push({ row: idx + 2, field: 'quantity', reason: 'must be a positive number' });
      if (r.collection_date && isNaN(new Date(r.collection_date).getTime()))
        errors.push({ row: idx + 2, field: 'collection_date', reason: 'invalid date' });
      if (r.expiry_date && isNaN(new Date(r.expiry_date).getTime()))
        errors.push({ row: idx + 2, field: 'expiry_date', reason: 'invalid date' });
    });
    if (errors.length) return res.status(400).json({ error: 'Validation failed', errors });

    await client.query('BEGIN');
    const inserted = [];
    for (const r of rows) {
      const now = new Date();
      const expiry = new Date(r.expiry_date);
      const hoursToExpiry = (expiry - now) / (1000 * 60 * 60);
      let expiry_category = 'safe';
      if (hoursToExpiry <= 24) expiry_category = 'critical';
      else if (hoursToExpiry <= 72) expiry_category = 'warning';

      const inventory_id = uuidv4();
      const result = await client.query(
        `INSERT INTO blood_inventory
          (inventory_id, institution_id, created_by, blood_group, component_type, quantity,
           unit_type, collection_date, expiry_date, status, expiry_category, is_network_visible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          inventory_id, institution_id, created_by,
          r.blood_group.trim(), r.component_type.trim(), parseFloat(r.quantity),
          (r.unit_type || 'units').trim(), r.collection_date, r.expiry_date,
          'available', expiry_category, false
        ]
      );
      await client.query(
        `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
         VALUES ($1, $2, $3, 'created', 'available')`,
        [uuidv4(), inventory_id, created_by]
      );
      await client.query(
        `INSERT INTO inv_ownership_history (id, inventory_id, institution_id, from_date)
         VALUES ($1, $2, $3, NOW())`,
        [uuidv4(), inventory_id, institution_id]
      );
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');

    // Audit (post-commit; non-transactional)
    for (const row of inserted) {
      await logAudit({
        user_id: created_by,
        action_type: 'inventory_bulk_created',
        entity_type: 'BLOOD_INVENTORY',
        entity_id: row.inventory_id,
        details: { after: row, source: 'bulk_csv' }
      });
    }

    res.status(201).json({ inserted: inserted.length, items: inserted });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/* EDIT INVENTORY — System Admin only */
exports.editInventory = async (req, res) => {
  try {
    const { inventory_id } = req.params;
    const { blood_group, component_type, quantity, expiry_date, notes, changed_by } = req.body;

    const current = await pool.query('SELECT * FROM blood_inventory WHERE inventory_id = $1', [inventory_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Inventory not found' });

    const item = current.rows[0];

    if (['reserved', 'in_transfer'].includes(item.status)) {
      return res.status(409).json({ error: `Cannot edit — inventory is locked in an active workflow (status: ${item.status})` });
    }

    // If blood type or quantity changes, supersede any proposed matches
    const typeChanged = (blood_group && blood_group !== item.blood_group) ||
                        (component_type && component_type !== item.component_type) ||
                        (quantity && parseFloat(quantity) !== parseFloat(item.quantity));

    if (typeChanged) {
      await pool.query(
        `UPDATE match SET status = 'superseded' WHERE inventory_id = $1 AND status = 'proposed'`,
        [inventory_id]
      );
    }

    // Recompute expiry_category if expiry_date changes
    let expiry_category = item.expiry_category;
    if (expiry_date) {
      const now = new Date();
      const expiry = new Date(expiry_date);
      const hoursToExpiry = (expiry - now) / (1000 * 60 * 60);
      if (hoursToExpiry <= 24) expiry_category = 'critical';
      else if (hoursToExpiry <= 72) expiry_category = 'warning';
      else expiry_category = 'safe';
    }

    const setClauses = [];
    const params = [];
    let idx = 1;

    if (blood_group)    { setClauses.push(`blood_group = $${idx++}`);    params.push(blood_group); }
    if (component_type) { setClauses.push(`component_type = $${idx++}`); params.push(component_type); }
    if (quantity)       { setClauses.push(`quantity = $${idx++}`);        params.push(quantity); }
    if (expiry_date)    { setClauses.push(`expiry_date = $${idx++}`);     params.push(expiry_date);
                          setClauses.push(`expiry_category = $${idx++}`); params.push(expiry_category); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); params.push(notes); }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(inventory_id);
    const result = await pool.query(
      `UPDATE blood_inventory SET ${setClauses.join(', ')} WHERE inventory_id = $${idx} RETURNING *`,
      params
    );

    await logAudit({
      user_id: changed_by || req.user.user_id,
      action_type: 'inventory_edited',
      entity_type: 'BLOOD_INVENTORY',
      entity_id: inventory_id,
      details: { before: item, after: result.rows[0] }
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* DELETE INVENTORY — System Admin, Institutional Admin, Blood Bank Ops Manager */
exports.deleteInventory = async (req, res) => {
  try {
    const { inventory_id } = req.params;

    const current = await pool.query('SELECT * FROM blood_inventory WHERE inventory_id = $1', [inventory_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Inventory not found' });

    const item = current.rows[0];

    // Institution scoping: IA and BB Ops can only delete their own institution's inventory
    if (req.user.role_name !== 'System Admin' && item.institution_id !== req.user.institution_id) {
      return res.status(403).json({ error: 'Cannot delete inventory from another institution' });
    }

    // Block locked statuses
    if (item.status === 'reserved') {
      return res.status(409).json({ error: 'Cannot delete — inventory is reserved for an accepted match. Cancel the transfer first.' });
    }
    if (item.status === 'in_transfer') {
      return res.status(409).json({ error: 'Cannot delete — inventory is currently in transit.' });
    }
    if (item.status === 'consumed') {
      return res.status(409).json({ error: 'Cannot delete — inventory has been consumed (completed transfer). This is historical data.' });
    }

    // Block if an accepted match exists
    const acceptedMatch = await pool.query(
      `SELECT match_id FROM match WHERE inventory_id = $1 AND status = 'accepted'`,
      [inventory_id]
    );
    if (acceptedMatch.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot delete — an accepted match exists for this inventory. Cancel the associated transfer first.' });
    }

    // Supersede any proposed matches
    await pool.query(
      `UPDATE match SET status = 'superseded' WHERE inventory_id = $1 AND status = 'proposed'`,
      [inventory_id]
    );

    // Delete FK dependents in order
    await pool.query(`DELETE FROM match WHERE inventory_id = $1 AND status IN ('superseded', 'rejected')`, [inventory_id]);
    await pool.query(`DELETE FROM inv_state_transition WHERE inventory_id = $1`, [inventory_id]);
    await pool.query(`DELETE FROM inv_ownership_history WHERE inventory_id = $1`, [inventory_id]);
    await pool.query(`DELETE FROM blood_inventory WHERE inventory_id = $1`, [inventory_id]);

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'inventory_deleted',
      entity_type: 'BLOOD_INVENTORY',
      entity_id: inventory_id,
      details: { deleted: item }
    });

    res.json({ message: 'Inventory deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE INVENTORY STATUS (state machine) */
const inventoryTransitions = {
  created:     ['available'],
  available:   ['reserved', 'expired', 'discarded'],
  reserved:    ['available', 'in_transfer', 'expired', 'discarded'],
  in_transfer: ['consumed', 'discarded'],
  consumed:    [],
  expired:     ['discarded'],
  discarded:   []
};

exports.updateInventoryStatus = async (req, res) => {
  try {
    const { inventory_id } = req.params;
    const { status, changed_by, reason } = req.body;

    const current = await pool.query(
      'SELECT * FROM blood_inventory WHERE inventory_id = $1', [inventory_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const currentStatus = current.rows[0].status;
    if (!inventoryTransitions[currentStatus]?.includes(status)) {
      return res.status(422).json({
        error: `Invalid transition: ${currentStatus} → ${status}`
      });
    }

    const result = await pool.query(
      'UPDATE blood_inventory SET status = $1 WHERE inventory_id = $2 RETURNING *',
      [status, inventory_id]
    );

    await pool.query(
      `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), inventory_id, changed_by, currentStatus, status, reason || null]
    );

    await logAudit({
      user_id: changed_by,
      action_type: 'inventory_status_updated',
      entity_type: 'BLOOD_INVENTORY',
      entity_id: inventory_id,
      details: { before: { status: currentStatus }, after: { status } }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
