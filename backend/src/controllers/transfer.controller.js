const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../services/audit.service');

/* 9-STAGE STATE MACHINE */
const transferTransitions = {
  initiated:        ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'cancelled'],
  approved:         ['dispatched', 'cancelled'],
  dispatched:       ['in_transit', 'failed'],
  in_transit:       ['received', 'failed'],
  received:         ['completed'],
  completed:        [],
  cancelled:        [],
  failed:           []
};

/* CREATE TRANSFER (from an accepted match) */
exports.createTransfer = async (req, res) => {
  try {
    const { match_id, created_by, transport_mode, expected_dispatch, expected_delivery } = req.body;

    if (!match_id || !created_by || !expected_dispatch || !expected_delivery) {
      return res.status(400).json({ error: 'match_id, created_by, expected_dispatch, expected_delivery required' });
    }

    // Get match
    const matchRes = await pool.query('SELECT * FROM match WHERE match_id = $1', [match_id]);
    if (matchRes.rows.length === 0) return res.status(404).json({ error: 'Match not found' });

    const m = matchRes.rows[0];
    if (m.status !== 'accepted') {
      return res.status(422).json({ error: 'Match must be accepted before creating transfer' });
    }

    // Get source and dest institutions
    const invRes = await pool.query('SELECT institution_id FROM blood_inventory WHERE inventory_id = $1', [m.inventory_id]);
    const demRes = await pool.query('SELECT institution_id FROM demand_request WHERE request_id = $1', [m.request_id]);

    const source_inst_id = invRes.rows[0].institution_id;
    const dest_inst_id = demRes.rows[0].institution_id;

    // --- PRICING CALCULATION ---
    // Determine tier from destination institution type
    const destInstRes = await pool.query(
      'SELECT type FROM institution WHERE institution_id = $1', [dest_inst_id]
    );
    const tier = destInstRes.rows[0]?.type === 'government' ? 'government' : 'private';

    // Get component type from inventory
    const compRes = await pool.query(
      'SELECT component_type FROM blood_inventory WHERE inventory_id = $1', [m.inventory_id]
    );
    const component_type = compRes.rows[0]?.component_type;

    const pricingRes = await pool.query(
      `SELECT unit_price, nat_charge, nat_includes_gst
       FROM institution_pricing
       WHERE institution_id = $1 AND component_type = $2 AND hospital_tier = $3`,
      [source_inst_id, component_type, tier]
    );

    let calc_unit_price = null, calc_nat_charge = null, calc_subtotal = null;
    let calc_tax_amount = null, calc_total_amount = null;

    if (pricingRes.rows.length > 0) {
      const p = pricingRes.rows[0];
      calc_unit_price  = parseFloat(p.unit_price);
      calc_nat_charge  = parseFloat(p.nat_charge);
      const qty        = parseFloat(m.proposed_qty);
      calc_subtotal    = +(calc_unit_price * qty).toFixed(2);
      const nat_total  = +(calc_nat_charge * qty).toFixed(2);
      calc_tax_amount  = p.nat_includes_gst ? +((nat_total / 1.05) * 0.05).toFixed(2) : 0;
      calc_total_amount = +(calc_subtotal + nat_total).toFixed(2);
    }
    // --- END PRICING ---

    const transfer_id = uuidv4();

    const result = await pool.query(
      `INSERT INTO transfer
      (transfer_id, match_id, inventory_id, request_id, source_inst_id, dest_inst_id,
       planned_qty, status, transport_mode, expected_dispatch, expected_delivery,
       unit_price, nat_charge, subtotal, tax_amount, total_amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        transfer_id, m.match_id, m.inventory_id, m.request_id,
        source_inst_id, dest_inst_id, m.proposed_qty, 'initiated',
        transport_mode || null, expected_dispatch, expected_delivery,
        calc_unit_price, calc_nat_charge, calc_subtotal, calc_tax_amount, calc_total_amount
      ]
    );

    // Log state transition
    await pool.query(
      `INSERT INTO transfer_state_transition (id, transfer_id, changed_by, from_state, to_state)
       VALUES ($1, $2, $3, 'initiated', 'initiated')`,
      [uuidv4(), transfer_id, created_by]
    );

    await logAudit({
      user_id: created_by,
      action_type: 'transfer_created',
      entity_type: 'TRANSFER',
      entity_id: transfer_id,
      details: { after: result.rows[0] }
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE TRANSFER STATUS */
exports.updateTransferStatus = async (req, res) => {
  try {
    const { transfer_id } = req.params;
    const { status, changed_by, reason, dispatched_qty, received_qty } = req.body;

    const current = await pool.query('SELECT * FROM transfer WHERE transfer_id = $1', [transfer_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });

    const t = current.rows[0];
    const currentStatus = t.status;

    if (!transferTransitions[currentStatus]?.includes(status)) {
      return res.status(422).json({
        error: `Invalid transition: ${currentStatus} → ${status}`
      });
    }

    // PAYMENT GATE: block approved → dispatched if price set but not paid
    if (status === 'dispatched' && t.total_amount !== null && t.payment_status !== 'paid') {
      return res.status(400).json({
        error: 'Payment must be confirmed before dispatch. Please complete payment first.'
      });
    }

    // Build dynamic update
    let setClauses = ['status = $1'];
    let params = [status];
    let idx = 2;

    if (status === 'dispatched' && dispatched_qty != null) {
      setClauses.push(`dispatched_qty = $${idx}`);
      params.push(dispatched_qty);
      idx++;
      setClauses.push(`actual_dispatch = NOW()`);
    }

    if (status === 'received' && received_qty != null) {
      setClauses.push(`received_qty = $${idx}`);
      params.push(received_qty);
      idx++;
      setClauses.push(`actual_delivery = NOW()`);
    }

    if (status === 'approved') {
      if (changed_by) {
        // Determine if this is supplier or receiver based on institution
        // For now, set supplier_approved_by
        setClauses.push(`supplier_approved_by = $${idx}`);
        params.push(changed_by);
        idx++;
      }
    }

    params.push(transfer_id);
    const result = await pool.query(
      `UPDATE transfer SET ${setClauses.join(', ')} WHERE transfer_id = $${idx} RETURNING *`,
      params
    );

    const updated = result.rows[0];

    // Log state transition
    await pool.query(
      `INSERT INTO transfer_state_transition (id, transfer_id, changed_by, from_state, to_state, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), transfer_id, changed_by, currentStatus, status, reason || null]
    );

    // Side effects based on status
    if (status === 'dispatched') {
      // Move inventory to in_transfer
      await pool.query(
        `UPDATE blood_inventory SET status = 'in_transfer' WHERE inventory_id = $1`,
        [t.inventory_id]
      );
      await pool.query(
        `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
         VALUES ($1, $2, $3, 'reserved', 'in_transfer')`,
        [uuidv4(), t.inventory_id, changed_by]
      );
    }

    if (status === 'completed') {
      // Consume inventory
      await pool.query(
        `UPDATE blood_inventory SET status = 'consumed' WHERE inventory_id = $1`,
        [t.inventory_id]
      );
      await pool.query(
        `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
         VALUES ($1, $2, $3, 'in_transfer', 'consumed')`,
        [uuidv4(), t.inventory_id, changed_by]
      );

      // Update demand fulfillment
      const fulfillQty = updated.received_qty || updated.planned_qty;
      await pool.query(
        `UPDATE demand_request SET qty_fulfilled = qty_fulfilled + $1 WHERE request_id = $2`,
        [fulfillQty, t.request_id]
      );

      // Check if demand is fully fulfilled
      const demand = await pool.query(
        'SELECT * FROM demand_request WHERE request_id = $1', [t.request_id]
      );
      if (demand.rows.length > 0) {
        const d = demand.rows[0];
        if (parseFloat(d.qty_fulfilled) >= parseFloat(d.qty_needed)) {
          await pool.query(
            `UPDATE demand_request SET status = 'fulfilled' WHERE request_id = $1`,
            [t.request_id]
          );
          await pool.query(
            `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state)
             VALUES ($1, $2, $3, $4, 'fulfilled')`,
            [uuidv4(), t.request_id, changed_by, d.status]
          );
        } else if (d.status !== 'partial') {
          await pool.query(
            `UPDATE demand_request SET status = 'partial' WHERE request_id = $1`,
            [t.request_id]
          );
          await pool.query(
            `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state)
             VALUES ($1, $2, $3, $4, 'partial')`,
            [uuidv4(), t.request_id, changed_by, d.status]
          );
        }
      }

      // Update match status to fulfilled
      await pool.query(
        `UPDATE match SET status = 'fulfilled' WHERE match_id = $1`,
        [t.match_id]
      );

      // Transfer ownership
      await pool.query(
        `UPDATE inv_ownership_history SET to_date = NOW()
         WHERE inventory_id = $1 AND to_date IS NULL`,
        [t.inventory_id]
      );
      await pool.query(
        `INSERT INTO inv_ownership_history (id, inventory_id, institution_id, from_date)
         VALUES ($1, $2, $3, NOW())`,
        [uuidv4(), t.inventory_id, t.dest_inst_id]
      );

      // Create received_stock record for the destination institution
      const invData = await pool.query(
        'SELECT blood_group, component_type, unit_type, collection_date, expiry_date, expiry_category FROM blood_inventory WHERE inventory_id = $1',
        [t.inventory_id]
      );
      if (invData.rows.length > 0) {
        const inv = invData.rows[0];
        const qty = updated.received_qty || updated.planned_qty;
        await pool.query(
          `INSERT INTO received_stock
           (received_stock_id, transfer_id, inventory_id, source_inst_id, dest_inst_id,
            blood_group, component_type, quantity, unit_type, collection_date, expiry_date, expiry_category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [uuidv4(), t.transfer_id, t.inventory_id, t.source_inst_id, t.dest_inst_id,
           inv.blood_group, inv.component_type, qty, inv.unit_type, inv.collection_date, inv.expiry_date, inv.expiry_category]
        );
      }
    }

    if (status === 'cancelled') {
      // Only Institutional Admin or System Admin can cancel
      const cancelAllowed = ['Institutional Admin', 'System Admin'];
      if (!cancelAllowed.includes(req.user.role_name)) {
        return res.status(403).json({ error: 'Only Institutional Admin or System Admin can cancel a transfer' });
      }

      // Release reserved inventory back to available
      if (['initiated', 'pending_approval', 'approved'].includes(currentStatus)) {
        await pool.query(
          `UPDATE blood_inventory SET status = 'available' WHERE inventory_id = $1 AND status = 'reserved'`,
          [t.inventory_id]
        );
        await pool.query(
          `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state, reason)
           VALUES ($1, $2, $3, 'reserved', 'available', $4)`,
          [uuidv4(), t.inventory_id, changed_by, 'Transfer cancelled']
        );
      }

      // Revert match back to proposed so it can be re-accepted or rejected
      await pool.query(
        `UPDATE match SET status = 'proposed', decided_by = NULL, decided_at = NULL WHERE match_id = $1 AND status = 'accepted'`,
        [t.match_id]
      );

      // Revert demand back to active only if it was moved to under_matching
      const demandRevert = await pool.query(
        `UPDATE demand_request SET status = 'active' WHERE request_id = $1 AND status = 'under_matching' RETURNING request_id`,
        [t.request_id]
      );
      if (demandRevert.rows.length > 0) {
        await pool.query(
          `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state, reason)
           VALUES ($1, $2, $3, 'under_matching', 'active', 'Transfer cancelled')`,
          [uuidv4(), t.request_id, changed_by]
        );
      }
    }

    await logAudit({
      user_id: changed_by,
      action_type: 'transfer_status_updated',
      entity_type: 'TRANSFER',
      entity_id: transfer_id,
      details: { before: { status: currentStatus }, after: { status } }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

/* GET TRANSFERS */
exports.getTransfers = async (req, res) => {
  try {
    const { source_inst_id, dest_inst_id, status } = req.query;
    let query = 'SELECT * FROM transfer WHERE 1=1';
    const params = [];

    // Scope non-System-Admin users to their own institution
    if (req.user && req.user.role_name !== 'System Admin') {
      params.push(req.user.institution_id);
      query += ` AND (source_inst_id = $${params.length} OR dest_inst_id = $${params.length})`;
    }

    if (source_inst_id) {
      params.push(source_inst_id);
      query += ` AND source_inst_id = $${params.length}`;
    }
    if (dest_inst_id) {
      params.push(dest_inst_id);
      query += ` AND dest_inst_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    if (req.query.format === 'csv') {
      const { sendCsv } = require('../utils/csv.util');
      const cols = ['transfer_id', 'match_id', 'inventory_id', 'source_inst_id', 'dest_inst_id', 'planned_qty', 'received_qty', 'status', 'dispatched_at', 'delivered_at', 'completed_at', 'created_at'];
      return sendCsv(res, 'transfers', result.rows, cols);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
