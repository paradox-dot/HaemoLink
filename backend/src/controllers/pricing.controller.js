const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../services/audit.service');

// Default Indian reference rates (used when institution has no custom pricing)
const SYSTEM_DEFAULTS = [
  { component_type: 'whole_blood', hospital_tier: 'government', unit_price: 1100.00, nat_charge: 960.00, nat_includes_gst: true },
  { component_type: 'whole_blood', hospital_tier: 'private',    unit_price: 1550.00, nat_charge: 960.00, nat_includes_gst: true },
  { component_type: 'rbc',         hospital_tier: 'government', unit_price: 1100.00, nat_charge: 960.00, nat_includes_gst: true },
  { component_type: 'rbc',         hospital_tier: 'private',    unit_price: 1550.00, nat_charge: 960.00, nat_includes_gst: true },
  { component_type: 'plasma',      hospital_tier: 'government', unit_price: 300.00,  nat_charge: 75.00,  nat_includes_gst: false },
  { component_type: 'plasma',      hospital_tier: 'private',    unit_price: 400.00,  nat_charge: 75.00,  nat_includes_gst: false },
  { component_type: 'platelets',   hospital_tier: 'government', unit_price: 300.00,  nat_charge: 100.00, nat_includes_gst: false },
  { component_type: 'platelets',   hospital_tier: 'private',    unit_price: 400.00,  nat_charge: 100.00, nat_includes_gst: false },
];

/* GET /pricing/defaults — system reference rates */
exports.getDefaults = async (req, res) => {
  try {
    res.json(SYSTEM_DEFAULTS);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET /pricing/:institution_id — get pricing for a blood bank */
exports.getPricing = async (req, res) => {
  try {
    const { institution_id } = req.params;

    const result = await pool.query(
      `SELECT * FROM institution_pricing
       WHERE institution_id = $1
       ORDER BY component_type, hospital_tier`,
      [institution_id]
    );

    // If no custom pricing exists, return system defaults with institution_id filled in
    if (result.rows.length === 0) {
      return res.json(SYSTEM_DEFAULTS.map(d => ({ ...d, institution_id, pricing_id: null })));
    }

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET /pricing/institution/list — list all blood bank institutions with pricing (SA only) */
exports.getBloodBankInstitutions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT institution_id, name, type, sub_type, city
       FROM institution
       WHERE sub_type IN ('blood_bank', 'both') AND status = 'verified'
       ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* PUT /pricing/:institution_id — upsert pricing rows */
exports.upsertPricing = async (req, res) => {
  try {
    const { institution_id } = req.params;
    const rows = req.body; // array of { component_type, hospital_tier, unit_price, nat_charge, nat_includes_gst }

    // Non-SA users can only update their own institution
    if (req.user.role_name !== 'System Admin' && req.user.institution_id !== institution_id) {
      return res.status(403).json({ error: 'You can only manage pricing for your own institution' });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Request body must be a non-empty array of pricing rows' });
    }

    const updated = [];
    for (const row of rows) {
      const { component_type, hospital_tier, unit_price, nat_charge, nat_includes_gst } = row;
      if (!component_type || !hospital_tier || unit_price == null) {
        return res.status(400).json({ error: `Invalid row: ${JSON.stringify(row)}` });
      }
      const result = await pool.query(
        `INSERT INTO institution_pricing
           (pricing_id, institution_id, component_type, hospital_tier, unit_price, nat_charge, nat_includes_gst, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (institution_id, component_type, hospital_tier)
         DO UPDATE SET
           unit_price       = EXCLUDED.unit_price,
           nat_charge       = EXCLUDED.nat_charge,
           nat_includes_gst = EXCLUDED.nat_includes_gst,
           updated_at       = NOW()
         RETURNING *`,
        [uuidv4(), institution_id, component_type, hospital_tier,
         parseFloat(unit_price), parseFloat(nat_charge || 0), nat_includes_gst === true]
      );
      updated.push(result.rows[0]);
    }

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'pricing_updated',
      entity_type: 'INSTITUTION',
      entity_id: institution_id,
      details: { rows_updated: updated.length }
    });

    res.json({ message: 'Pricing updated', rows: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* POST /transfer/:transfer_id/pay — simulate payment confirmation */
exports.confirmPayment = async (req, res) => {
  try {
    const { transfer_id } = req.params;
    const user_id = req.user.user_id;

    const current = await pool.query(
      'SELECT * FROM transfer WHERE transfer_id = $1', [transfer_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    const t = current.rows[0];

    if (t.status !== 'approved') {
      return res.status(422).json({ error: 'Payment can only be confirmed when transfer is in "approved" status' });
    }
    if (t.payment_status === 'paid') {
      return res.status(422).json({ error: 'Payment has already been confirmed' });
    }

    const result = await pool.query(
      `UPDATE transfer
       SET payment_status = 'paid',
           payment_confirmed_at = NOW(),
           payment_confirmed_by = $1
       WHERE transfer_id = $2
       RETURNING *`,
      [user_id, transfer_id]
    );

    await logAudit({
      user_id,
      action_type: 'payment_confirmed',
      entity_type: 'TRANSFER',
      entity_id: transfer_id,
      details: {
        total_amount: t.total_amount,
        payment_confirmed_by: user_id
      }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
