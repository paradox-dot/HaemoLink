const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { runMatching } = require('../services/match.service');
const { logAudit, SYSTEM_USER_ID } = require('../services/audit.service');

/* RUN MATCHING ENGINE */
exports.runMatchingEngine = async (req, res) => {
  try {
    // Expire old proposed matches
    await pool.query(
      `UPDATE match SET status = 'superseded' WHERE status = 'proposed'`
    );

    const matches = await runMatching();
    const inserted = [];

    for (const m of matches) {
      const match_id = uuidv4();

      const result = await pool.query(
        `INSERT INTO match
        (match_id, inventory_id, request_id, match_score,
         compatibility_score, distance_score, expiry_score, urgency_score,
         proposed_qty, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *`,
        [
          match_id, m.inventory_id, m.request_id, m.match_score,
          m.compatibility_score, m.distance_score, m.expiry_score, m.urgency_score,
          m.proposed_qty, 'proposed'
        ]
      );

      inserted.push(result.rows[0]);

      await logAudit({
        user_id: SYSTEM_USER_ID,
        action_type: 'match_created',
        entity_type: 'MATCH',
        entity_id: match_id,
        details: { after: result.rows[0] }
      });
    }

    res.json({
      message: 'Matching completed',
      total_matches: inserted.length,
      matches: inserted
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* GET MATCHES */
exports.getMatches = async (req, res) => {
  try {
    const { status, request_id } = req.query;
    let query = `
      SELECT m.*,
        i.blood_group AS inv_blood_group,
        i.component_type AS inv_component,
        i.quantity AS inv_quantity,
        i.status AS inv_status,
        i.expiry_date AS inv_expiry_date,
        i.expiry_category AS inv_expiry_category,
        src.name AS source_institution,
        src.type AS source_inst_type,
        d.blood_group AS dem_blood_group,
        d.component_type AS dem_component,
        d.qty_needed AS dem_qty_needed,
        d.qty_fulfilled AS dem_qty_fulfilled,
        d.urgency_level AS dem_urgency,
        d.status AS dem_status,
        d.required_by AS dem_required_by,
        dest.name AS dest_institution,
        dest.type AS dest_inst_type,
        ip.unit_price,
        ip.nat_charge,
        ip.nat_includes_gst,
        ROUND((COALESCE(ip.unit_price, 0) + COALESCE(ip.nat_charge, 0)) * m.proposed_qty, 2) AS estimated_total
      FROM match m
      JOIN blood_inventory i ON m.inventory_id = i.inventory_id
      JOIN institution src ON i.institution_id = src.institution_id
      JOIN demand_request d ON m.request_id = d.request_id
      JOIN institution dest ON d.institution_id = dest.institution_id
      LEFT JOIN institution_pricing ip ON (
        ip.institution_id = i.institution_id
        AND ip.component_type = i.component_type
        AND ip.hospital_tier = CASE
          WHEN dest.type = 'government' THEN 'government'::hospital_tier
          ELSE 'private'::hospital_tier
        END
      )
      WHERE 1=1`;
    const params = [];

    // Scope non-System-Admin users to their own institution (supply or demand side)
    if (req.user && req.user.role_name !== 'System Admin') {
      params.push(req.user.institution_id);
      query += ` AND (i.institution_id = $${params.length} OR d.institution_id = $${params.length})`;
    }

    if (status) {
      params.push(status);
      query += ` AND m.status = $${params.length}`;
    }
    if (request_id) {
      params.push(request_id);
      query += ` AND m.request_id = $${params.length}`;
    }

    query += ' ORDER BY m.match_score DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ACCEPT MATCH */
exports.acceptMatch = async (req, res) => {
  try {
    const { match_id } = req.params;
    const { decided_by } = req.body;

    const current = await pool.query(
      'SELECT * FROM match WHERE match_id = $1', [match_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (current.rows[0].status !== 'proposed') {
      return res.status(422).json({ error: 'Only proposed matches can be accepted' });
    }

    const m = current.rows[0];

    // Update match status
    const result = await pool.query(
      `UPDATE match SET status = 'accepted', decided_by = $1, decided_at = NOW()
       WHERE match_id = $2 RETURNING *`,
      [decided_by, match_id]
    );

    // Reserve the inventory
    await pool.query(
      `UPDATE blood_inventory SET status = 'reserved' WHERE inventory_id = $1`,
      [m.inventory_id]
    );

    await pool.query(
      `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
       VALUES ($1, $2, $3, 'available', 'reserved')`,
      [uuidv4(), m.inventory_id, decided_by]
    );

    // Update demand to under_matching
    await pool.query(
      `UPDATE demand_request SET status = 'under_matching'
       WHERE request_id = $1 AND status = 'active'`,
      [m.request_id]
    );

    await logAudit({
      user_id: decided_by,
      action_type: 'match_accepted',
      entity_type: 'MATCH',
      entity_id: match_id,
      details: { after: result.rows[0] }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* DELETE MATCH (System Admin only) */
exports.deleteMatch = async (req, res) => {
  try {
    const { match_id } = req.params;

    const current = await pool.query('SELECT * FROM match WHERE match_id = $1', [match_id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const m = current.rows[0];

    // Block deletion if a transfer already exists for this match
    const existingTransfer = await pool.query(
      `SELECT transfer_id, status FROM transfer WHERE match_id = $1`, [match_id]
    );
    if (existingTransfer.rows.length > 0) {
      const tStatus = existingTransfer.rows[0].status;
      return res.status(409).json({
        error: `Cannot delete — a transfer (${tStatus}) already exists for this match. Cancel the transfer first.`
      });
    }

    // If match was accepted, release the reserved inventory back to available
    if (m.status === 'accepted') {
      await pool.query(
        `UPDATE blood_inventory SET status = 'available' WHERE inventory_id = $1 AND status = 'reserved'`,
        [m.inventory_id]
      );
      await pool.query(
        `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state, reason)
         VALUES ($1, $2, $3, 'reserved', 'available', $4)`,
        [uuidv4(), m.inventory_id, req.user.user_id, 'Match deleted by System Admin']
      );

      // Revert demand status if it was under_matching
      await pool.query(
        `UPDATE demand_request SET status = 'active'
         WHERE request_id = $1 AND status = 'under_matching'`,
        [m.request_id]
      );
    }

    await pool.query('DELETE FROM match WHERE match_id = $1', [match_id]);

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'match_deleted',
      entity_type: 'MATCH',
      entity_id: match_id,
      details: { before: m }
    });

    res.json({ message: 'Match deleted', match_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* REJECT MATCH */
exports.rejectMatch = async (req, res) => {
  try {
    const { match_id } = req.params;
    const { decided_by } = req.body;

    const current = await pool.query(
      'SELECT * FROM match WHERE match_id = $1', [match_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (current.rows[0].status !== 'proposed') {
      return res.status(422).json({ error: 'Only proposed matches can be rejected' });
    }

    const m = current.rows[0];

    const result = await pool.query(
      `UPDATE match SET status = 'rejected', decided_by = $1, decided_at = NOW()
       WHERE match_id = $2 RETURNING *`,
      [decided_by, match_id]
    );

    await logAudit({
      user_id: decided_by,
      action_type: 'match_rejected',
      entity_type: 'MATCH',
      entity_id: match_id,
      details: { after: result.rows[0] }
    });

    // Notify BB Ops at the supply institution to re-run matching
    try {
      const invInfo = await pool.query(
        `SELECT bi.blood_group, bi.component_type, i.institution_id
         FROM blood_inventory bi
         JOIN institution i ON bi.institution_id = i.institution_id
         WHERE bi.inventory_id = $1`,
        [m.inventory_id]
      );
      if (invInfo.rows.length > 0) {
        const inv = invInfo.rows[0];
        const bbOpsUsers = await pool.query(
          `SELECT u.user_id FROM "user" u
           JOIN role r ON u.role_id = r.role_id
           WHERE u.institution_id = $1 AND u.status = 'active'
             AND r.role_name = 'Blood Bank Ops Manager'`,
          [inv.institution_id]
        );
        for (const u of bbOpsUsers.rows) {
          await pool.query(
            `INSERT INTO notification (notification_id, user_id, type, message, related_entity_type, related_entity_id)
             VALUES ($1,$2,'match_found',$3,'MATCH',$4)`,
            [uuidv4(), u.user_id,
             `Match for ${inv.blood_group} ${inv.component_type} was rejected — consider re-running the matching engine`,
             match_id]
          );
        }
      }
    } catch (notifErr) {
      console.error('Rejection notification error:', notifErr.message);
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
