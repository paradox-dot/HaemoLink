const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../services/audit.service');

/* PRIORITY SCORE CALCULATION */
function computePriorityScore({ urgency_level, demand_type, required_by }) {
  let score = 0;

  // Urgency: max 45 pts
  if (urgency_level === 'emergency') score += 45;
  else if (urgency_level === 'urgent') score += 28;
  else score += 10;

  // Demand type: max 20 pts
  if (demand_type === 'hard') score += 20;
  else score += 5;

  // Time-to-deadline: max 25 pts
  const hoursLeft = (new Date(required_by) - new Date()) / (1000 * 60 * 60);
  if (hoursLeft <= 4) score += 25;
  else if (hoursLeft <= 12) score += 20;
  else if (hoursLeft <= 24) score += 15;
  else if (hoursLeft <= 72) score += 8;
  else score += 3;

  return Math.min(score, 99);
}

/* STATE MACHINE */
const demandTransitions = {
  draft:          ['active', 'cancelled'],
  active:         ['under_matching', 'cancelled', 'expired'],
  under_matching: ['partial', 'fulfilled', 'cancelled', 'expired'],
  partial:        ['fulfilled', 'cancelled', 'expired'],
  fulfilled:      [],
  cancelled:      [],
  expired:        []
};

/* CREATE DEMAND */
exports.createDemand = async (req, res) => {
  try {
    const {
      institution_id,
      created_by,
      blood_group,
      component_type,
      qty_needed,
      urgency_level,
      demand_type,
      procedure_type,
      required_by
    } = req.body;

    if (!institution_id || !created_by || !blood_group || !component_type || !qty_needed || !urgency_level || !required_by) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const priority_score = computePriorityScore({
      urgency_level,
      demand_type: demand_type || 'hard',
      required_by
    });

    const request_id = uuidv4();

    const result = await pool.query(
      `INSERT INTO demand_request
      (request_id, institution_id, created_by, blood_group, component_type,
       qty_needed, urgency_level, demand_type, procedure_type, required_by,
       status, priority_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        request_id, institution_id, created_by, blood_group, component_type,
        qty_needed, urgency_level, demand_type || 'hard', procedure_type || null,
        required_by, 'active', priority_score
      ]
    );

    // Log state transition: draft → active
    await pool.query(
      `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state)
       VALUES ($1, $2, $3, 'draft', 'active')`,
      [uuidv4(), request_id, created_by]
    );

    await logAudit({
      user_id: created_by,
      action_type: 'demand_created',
      entity_type: 'DEMAND_REQUEST',
      entity_id: request_id,
      details: { after: result.rows[0] }
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET DEMANDS — filtered, with institution scoping */
exports.getDemand = async (req, res) => {
  try {
    const { status, scope } = req.query;
    const isSystemAdmin = req.user.role_name === 'System Admin';
    const instId = req.user.institution_id;

    let query = 'SELECT * FROM demand_request WHERE 1=1';
    const params = [];

    // Institution scoping: default to own institution, unless scope=network or System Admin
    if (!isSystemAdmin && scope !== 'network') {
      params.push(instId);
      query += ` AND institution_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY priority_score DESC, created_at DESC';

    const result = await pool.query(query, params);
    if (req.query.format === 'csv') {
      const { sendCsv } = require('../utils/csv.util');
      const cols = ['request_id', 'institution_id', 'patient_name', 'blood_group', 'component_type', 'qty_needed', 'qty_fulfilled', 'urgency_level', 'status', 'priority_score', 'required_by', 'created_at'];
      return sendCsv(res, 'demand', result.rows, cols);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* CANCEL DEMAND — System Admin, Institutional Admin, Transfusion Officer */
exports.cancelDemand = async (req, res) => {
  try {
    const { request_id } = req.params;

    const current = await pool.query('SELECT * FROM demand_request WHERE request_id = $1', [request_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Demand request not found' });

    const demand = current.rows[0];

    // Institution scoping: IA and TO can only cancel their own institution's demands
    if (req.user.role_name !== 'System Admin' && demand.institution_id !== req.user.institution_id) {
      return res.status(403).json({ error: 'Cannot cancel a demand from another institution' });
    }

    // Block if already closed
    if (['fulfilled', 'expired', 'cancelled'].includes(demand.status)) {
      return res.status(409).json({ error: `Demand is already ${demand.status} and cannot be cancelled` });
    }

    // Block if under active matching — an accepted match/reserved inventory is in play
    if (demand.status === 'under_matching') {
      return res.status(409).json({ error: 'Cannot cancel — an accepted match exists for this demand. Cancel the associated transfer first to free the demand.' });
    }

    // Allow cancel only for active and partial
    if (!['active', 'partial'].includes(demand.status)) {
      return res.status(409).json({ error: `Cannot cancel demand with status: ${demand.status}` });
    }

    const fromStatus = demand.status;

    // Supersede any proposed matches for this demand
    await pool.query(
      `UPDATE match SET status = 'superseded' WHERE request_id = $1 AND status = 'proposed'`,
      [request_id]
    );

    await pool.query(
      `UPDATE demand_request SET status = 'cancelled' WHERE request_id = $1`,
      [request_id]
    );

    await pool.query(
      `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state, reason)
       VALUES ($1, $2, $3, $4, 'cancelled', 'Cancelled by user')`,
      [uuidv4(), request_id, req.user.user_id, fromStatus]
    );

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'demand_cancelled',
      entity_type: 'DEMAND_REQUEST',
      entity_id: request_id,
      details: { before: { status: fromStatus }, after: { status: 'cancelled' } }
    });

    res.json({ message: 'Demand cancelled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* EDIT DEMAND — System Admin only */
exports.editDemand = async (req, res) => {
  try {
    const { request_id } = req.params;
    const { blood_group, component_type, qty_needed, urgency_level, demand_type, required_by, procedure_type } = req.body;

    const current = await pool.query('SELECT * FROM demand_request WHERE request_id = $1', [request_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Demand request not found' });

    const demand = current.rows[0];

    if (['fulfilled', 'expired', 'cancelled'].includes(demand.status)) {
      return res.status(409).json({ error: `Cannot edit — demand is ${demand.status}` });
    }
    if (demand.status === 'under_matching') {
      return res.status(409).json({ error: 'Cannot edit — an accepted match is in progress for this demand. Cancel the transfer first.' });
    }

    // Block if qty_needed would be set below what's already fulfilled
    if (qty_needed !== undefined && parseFloat(qty_needed) < parseFloat(demand.qty_fulfilled || 0)) {
      return res.status(409).json({ error: `Cannot set qty_needed (${qty_needed}) below already-fulfilled quantity (${demand.qty_fulfilled})` });
    }

    // If blood type changes, supersede proposed matches (they're now invalid)
    const typeChanged = (blood_group && blood_group !== demand.blood_group) ||
                        (component_type && component_type !== demand.component_type);
    if (typeChanged) {
      await pool.query(
        `UPDATE match SET status = 'superseded' WHERE request_id = $1 AND status = 'proposed'`,
        [request_id]
      );
    }

    // Recompute priority score if relevant fields change
    const newUrgency = urgency_level || demand.urgency_level;
    const newDemandType = demand_type || demand.demand_type;
    const newRequiredBy = required_by || demand.required_by;
    const priority_score = computePriorityScore({ urgency_level: newUrgency, demand_type: newDemandType, required_by: newRequiredBy });

    const setClauses = ['priority_score = $1'];
    const params = [priority_score];
    let idx = 2;

    if (blood_group)     { setClauses.push(`blood_group = $${idx++}`);     params.push(blood_group); }
    if (component_type)  { setClauses.push(`component_type = $${idx++}`);  params.push(component_type); }
    if (qty_needed)      { setClauses.push(`qty_needed = $${idx++}`);       params.push(qty_needed); }
    if (urgency_level)   { setClauses.push(`urgency_level = $${idx++}`);    params.push(urgency_level); }
    if (demand_type)     { setClauses.push(`demand_type = $${idx++}`);      params.push(demand_type); }
    if (required_by)     { setClauses.push(`required_by = $${idx++}`);      params.push(required_by); }
    if (procedure_type !== undefined) { setClauses.push(`procedure_type = $${idx++}`); params.push(procedure_type); }

    params.push(request_id);
    const result = await pool.query(
      `UPDATE demand_request SET ${setClauses.join(', ')} WHERE request_id = $${idx} RETURNING *`,
      params
    );

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'demand_edited',
      entity_type: 'DEMAND_REQUEST',
      entity_id: request_id,
      details: { before: demand, after: result.rows[0] }
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* DELETE DEMAND — System Admin, Institutional Admin, Transfusion Officer */
exports.deleteDemand = async (req, res) => {
  try {
    const { request_id } = req.params;

    const current = await pool.query('SELECT * FROM demand_request WHERE request_id = $1', [request_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Demand request not found' });

    const demand = current.rows[0];

    // Institution scoping: IA and TO can only delete their own institution's demands
    if (req.user.role_name !== 'System Admin' && demand.institution_id !== req.user.institution_id) {
      return res.status(403).json({ error: 'Cannot delete a demand from another institution' });
    }

    // Block if any transfer references this demand (FK chain too deep to safely unwind)
    const linkedTransfer = await pool.query(
      `SELECT transfer_id FROM transfer WHERE request_id = $1 LIMIT 1`,
      [request_id]
    );
    if (linkedTransfer.rows.length > 0) {
      return res.status(409).json({ error: 'Cannot delete — one or more transfers are linked to this demand. Only historical data can be removed this way.' });
    }

    // IA and TO: block if under_matching or fulfilled
    if (req.user.role_name !== 'System Admin') {
      if (demand.status === 'under_matching') {
        return res.status(409).json({ error: 'Cannot delete — an accepted match exists for this demand. Cancel the transfer first.' });
      }
      if (demand.status === 'fulfilled') {
        return res.status(409).json({ error: 'Cannot delete a fulfilled demand. Contact System Admin if needed.' });
      }
    }

    // Supersede any proposed matches
    await pool.query(
      `UPDATE match SET status = 'superseded' WHERE request_id = $1 AND status = 'proposed'`,
      [request_id]
    );

    // Delete FK dependents in order
    await pool.query(`DELETE FROM match WHERE request_id = $1 AND status IN ('superseded', 'rejected', 'proposed')`, [request_id]);
    await pool.query(`DELETE FROM demand_state_transition WHERE request_id = $1`, [request_id]);
    await pool.query(`DELETE FROM demand_request WHERE request_id = $1`, [request_id]);

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'demand_deleted',
      entity_type: 'DEMAND_REQUEST',
      entity_id: request_id,
      details: { deleted: demand }
    });

    res.json({ message: 'Demand deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE DEMAND STATUS */
exports.updateDemandStatus = async (req, res) => {
  try {
    const { request_id } = req.params;
    const { status, changed_by } = req.body;

    const current = await pool.query(
      'SELECT * FROM demand_request WHERE request_id = $1', [request_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Demand request not found' });
    }

    const currentStatus = current.rows[0].status;
    if (!demandTransitions[currentStatus]?.includes(status)) {
      return res.status(422).json({
        error: `Invalid transition: ${currentStatus} → ${status}`
      });
    }

    const result = await pool.query(
      'UPDATE demand_request SET status = $1 WHERE request_id = $2 RETURNING *',
      [status, request_id]
    );

    await pool.query(
      `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), request_id, changed_by, currentStatus, status]
    );

    await logAudit({
      user_id: changed_by,
      action_type: 'demand_status_updated',
      entity_type: 'DEMAND_REQUEST',
      entity_id: request_id,
      details: { before: { status: currentStatus }, after: { status } }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
