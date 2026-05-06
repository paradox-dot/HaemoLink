const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/* LOGIN */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user with role
    const result = await pool.query(
      `SELECT u.*, r.role_name
       FROM "user" u
       JOIN role r ON u.role_id = r.role_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session
    const session_id = uuidv4();
    await pool.query(
      'INSERT INTO session (session_id, user_id) VALUES ($1, $2)',
      [session_id, user.user_id]
    );

    // Update last_login
    await pool.query(
      'UPDATE "user" SET last_login = NOW() WHERE user_id = $1',
      [user.user_id]
    );

    // Sign JWT
    const token = jwt.sign(
      {
        user_id: user.user_id,
        role_id: user.role_id,
        role_name: user.role_name,
        institution_id: user.institution_id,
        session_id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role_name: user.role_name,
        institution_id: user.institution_id
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* REGISTER INSTITUTION + ADMIN */
exports.register = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      inst_name, inst_type, inst_sub_type, license_number, city,
      contact_email, contact_phone,
      admin_name, admin_email, admin_password
    } = req.body;

    if (!inst_name || !inst_type || !inst_sub_type || !license_number || !city ||
        !admin_name || !admin_email || !admin_password) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    if (admin_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if admin email already exists
    const existing = await client.query('SELECT user_id FROM "user" WHERE email = $1', [admin_email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Admin email already exists' });
    }

    await client.query('BEGIN');

    const institution_id = uuidv4();
    const user_id = uuidv4();

    // Handle file upload path
    const license_document = req.file ? req.file.filename : null;

    // Create institution (pending)
    await client.query(
      `INSERT INTO institution (institution_id, name, type, sub_type, city, license_number, contact_email, contact_phone, license_document, registered_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
      [institution_id, inst_name, inst_type, inst_sub_type, city, license_number, contact_email || null, contact_phone || null, license_document, user_id]
    );

    // Get Institutional Admin role_id
    const roleRes = await client.query("SELECT role_id FROM role WHERE role_name = 'Institutional Admin'");
    if (roleRes.rows.length === 0) {
      throw new Error('Institutional Admin role not found');
    }

    const password_hash = await bcrypt.hash(admin_password, 10);

    // Create admin user (inactive until approved)
    await client.query(
      `INSERT INTO "user" (user_id, institution_id, role_id, name, email, password_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,'inactive')`,
      [user_id, institution_id, roleRes.rows[0].role_id, admin_name, admin_email, password_hash]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Registration submitted. Your institution is pending approval by the System Admin.',
      institution_id,
      admin_user_id: user_id
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registration error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email or license number already exists' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/* LOGOUT */
exports.logout = async (req, res) => {
  try {
    await pool.query(
      `UPDATE session SET status = 'logged_out', logout_time = NOW()
       WHERE session_id = $1 AND status = 'active'`,
      [req.user.session_id]
    );
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* CHANGE PASSWORD */
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const result = await pool.query('SELECT password_hash FROM "user" WHERE user_id = $1', [req.user.user_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE "user" SET password_hash = $1 WHERE user_id = $2', [newHash, req.user.user_id]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET CURRENT USER */
exports.getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.phone,
              u.institution_id, u.status, u.last_login,
              r.role_name,
              i.name AS institution_name
       FROM "user" u
       JOIN role r ON u.role_id = r.role_id
       LEFT JOIN institution i ON u.institution_id = i.institution_id
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
