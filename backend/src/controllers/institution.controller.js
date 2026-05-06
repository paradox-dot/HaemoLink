const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../services/audit.service');

/* CREATE INSTITUTION */
exports.createInstitution = async (req, res) => {
  try {
    const { name, type, sub_type, city, license_number, contact_email, contact_phone } = req.body;

    if (!name || !type || !sub_type || !city || !license_number) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO institution (institution_id, name, type, sub_type, city, license_number, contact_email, contact_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING *`,
      [uuidv4(), name, type, sub_type, city, license_number, contact_email || null, contact_phone || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET ALL INSTITUTIONS */
exports.getInstitutions = async (req, res) => {
  try {
    const { status, city } = req.query;
    let query = `SELECT i.*, u.name AS admin_name, u.email AS admin_email, u.status AS admin_status
                 FROM institution i
                 LEFT JOIN "user" u ON i.registered_by = u.user_id
                 WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND i.status = $${params.length}`;
    }
    if (city) {
      params.push(city);
      query += ` AND i.city = $${params.length}`;
    }

    query += ' ORDER BY i.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET SINGLE INSTITUTION */
exports.getInstitutionById = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM institution WHERE institution_id = $1',
      [req.params.institution_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* VERIFY / SUSPEND / REJECT INSTITUTION */
exports.updateInstitutionStatus = async (req, res) => {
  try {
    const { institution_id } = req.params;
    const { status } = req.body;

    const valid = ['pending', 'verified', 'suspended', 'rejected'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
    }

    // Get current institution
    const current = await pool.query('SELECT * FROM institution WHERE institution_id = $1', [institution_id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Institution not found' });

    const oldStatus = current.rows[0].status;

    const result = await pool.query(
      'UPDATE institution SET status = $1 WHERE institution_id = $2 RETURNING *',
      [status, institution_id]
    );

    // Activate/deactivate the registered admin user
    if (current.rows[0].registered_by) {
      if (status === 'verified') {
        // Approve: activate the admin user
        await pool.query(
          `UPDATE "user" SET status = 'active' WHERE user_id = $1 AND status = 'inactive'`,
          [current.rows[0].registered_by]
        );
      } else if (status === 'rejected' || status === 'suspended') {
        // Reject/Suspend: deactivate the admin and expire sessions
        await pool.query(
          `UPDATE "user" SET status = 'suspended' WHERE user_id = $1`,
          [current.rows[0].registered_by]
        );
        await pool.query(
          `UPDATE session SET status = 'expired', logout_time = NOW()
           WHERE user_id = $1 AND status = 'active'`,
          [current.rows[0].registered_by]
        );
      }
    }

    // If suspending institution, also suspend all its users and expire sessions
    if (status === 'suspended') {
      await pool.query(
        `UPDATE "user" SET status = 'suspended' WHERE institution_id = $1 AND status = 'active'`,
        [institution_id]
      );
      await pool.query(
        `UPDATE session SET status = 'expired', logout_time = NOW()
         WHERE user_id IN (SELECT user_id FROM "user" WHERE institution_id = $1) AND status = 'active'`,
        [institution_id]
      );
    }

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'institution_status_changed',
      entity_type: 'INSTITUTION',
      entity_id: institution_id,
      details: { before: { status: oldStatus }, after: { status } }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
