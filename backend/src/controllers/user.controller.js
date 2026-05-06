const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { logAudit } = require('../services/audit.service');

/* CREATE USER */
exports.createUser = async (req, res) => {
  try {
    const { role_id, name, email, phone, password } = req.body;
    // Institutional Admin can only create users in their own institution
    const institution_id = req.user.role_name === 'Institutional Admin'
      ? req.user.institution_id
      : req.body.institution_id;

    if (!institution_id || !role_id || !name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO "user" (user_id, institution_id, role_id, name, email, phone, password_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING user_id, institution_id, role_id, name, email, phone, status, last_login`,
      [uuidv4(), institution_id, role_id, name, email, phone || null, password_hash]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

/* GET USERS — scoped by role */
exports.getUsers = async (req, res) => {
  try {
    let query = `SELECT u.user_id, u.institution_id, u.role_id, u.name, u.email, u.phone, u.status, u.last_login, r.role_name, i.name AS institution_name
                 FROM "user" u JOIN role r ON u.role_id = r.role_id LEFT JOIN institution i ON u.institution_id = i.institution_id WHERE 1=1`;
    const params = [];

    // Institutional Admin can only see their own institution's users
    if (req.user.role_name === 'Institutional Admin') {
      params.push(req.user.institution_id);
      query += ` AND u.institution_id = $${params.length}`;
    } else if (req.query.institution_id) {
      params.push(req.query.institution_id);
      query += ` AND u.institution_id = $${params.length}`;
    }

    query += ' ORDER BY u.name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET SINGLE USER */
exports.getUserById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.institution_id, u.role_id, u.name, u.email, u.phone, u.status, u.last_login, r.role_name
       FROM "user" u JOIN role r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [req.params.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE USER STATUS (suspend / activate) */
exports.updateUserStatus = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "active" or "suspended"' });
    }

    // Cannot change your own status
    if (user_id === req.user.user_id) {
      return res.status(403).json({ error: 'Cannot change your own status' });
    }

    // Get target user
    const target = await pool.query('SELECT * FROM "user" WHERE user_id = $1', [user_id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Institutional Admin can only manage users in their own institution
    if (req.user.role_name === 'Institutional Admin' && target.rows[0].institution_id !== req.user.institution_id) {
      return res.status(403).json({ error: 'Cannot manage users outside your institution' });
    }

    // Get target's role — Institutional Admin cannot manage System Admins or other Institutional Admins
    const targetRole = await pool.query('SELECT role_name FROM role WHERE role_id = $1', [target.rows[0].role_id]);
    const targetRoleName = targetRole.rows[0]?.role_name;
    if (req.user.role_name === 'Institutional Admin' && (targetRoleName === 'System Admin' || targetRoleName === 'Institutional Admin')) {
      return res.status(403).json({ error: 'Cannot manage admins' });
    }

    const oldStatus = target.rows[0].status;

    const result = await pool.query(
      `UPDATE "user" SET status = $1 WHERE user_id = $2
       RETURNING user_id, name, email, status`,
      [status, user_id]
    );

    // If suspended, expire all active sessions (force logout)
    if (status === 'suspended') {
      await pool.query(
        `UPDATE session SET status = 'expired', logout_time = NOW()
         WHERE user_id = $1 AND status = 'active'`,
        [user_id]
      );
    }

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'user_status_changed',
      entity_type: 'USER',
      entity_id: user_id,
      details: {
        before: { status: oldStatus },
        after: { status }
      }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE USER ROLE */
exports.updateUserRole = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ error: 'role_id is required' });
    }

    // Guard: cannot change your own role
    if (user_id === req.user.user_id) {
      return res.status(403).json({ error: 'Cannot change your own role' });
    }

    // Get current user + old role for audit
    const current = await pool.query(
      `SELECT u.*, r.role_name AS old_role_name
       FROM "user" u JOIN role r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [user_id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldRole = current.rows[0].old_role_name;
    const oldRoleId = current.rows[0].role_id;

    // Get new role name for audit
    const newRole = await pool.query('SELECT role_name FROM role WHERE role_id = $1', [role_id]);
    if (newRole.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid role_id' });
    }

    // Warn if assigning Institutional Admin and one already exists
    if (newRole.rows[0].role_name === 'Institutional Admin') {
      const existingAdmin = await pool.query(
        `SELECT u.user_id, u.name FROM "user" u
         JOIN role r ON u.role_id = r.role_id
         WHERE r.role_name = 'Institutional Admin'
           AND u.institution_id = $1 AND u.status = 'active' AND u.user_id != $2`,
        [current.rows[0].institution_id, user_id]
      );
      if (existingAdmin.rows.length > 0) {
        return res.status(409).json({
          error: `Institution already has an active Institutional Admin: ${existingAdmin.rows[0].name}. Remove their admin role first.`
        });
      }
    }

    // Update role
    const result = await pool.query(
      `UPDATE "user" SET role_id = $1 WHERE user_id = $2
       RETURNING user_id, institution_id, role_id, name, email, phone, status`,
      [role_id, user_id]
    );

    // Expire all active sessions for this user (force re-login)
    await pool.query(
      `UPDATE session SET status = 'expired', logout_time = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [user_id]
    );

    // Audit log
    await logAudit({
      user_id: req.user.user_id,
      action_type: 'role_changed',
      entity_type: 'USER',
      entity_id: user_id,
      details: {
        before: { role_id: oldRoleId, role_name: oldRole },
        after: { role_id, role_name: newRole.rows[0].role_name }
      }
    });

    res.json({
      ...result.rows[0],
      role_name: newRole.rows[0].role_name,
      message: `Role changed from "${oldRole}" to "${newRole.rows[0].role_name}". User's active sessions have been expired.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* UPDATE USER NAME */
exports.updateUserName = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const current = await pool.query('SELECT * FROM "user" WHERE user_id = $1', [user_id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const oldName = current.rows[0].name;

    const result = await pool.query(
      `UPDATE "user" SET name = $1 WHERE user_id = $2
       RETURNING user_id, name, email, status`,
      [name.trim(), user_id]
    );

    await logAudit({
      user_id: req.user.user_id,
      action_type: 'user_name_changed',
      entity_type: 'USER',
      entity_id: user_id,
      details: { before: { name: oldName }, after: { name: name.trim() } }
    });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET ROLES */
exports.getRoles = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM role ORDER BY role_name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
