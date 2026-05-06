const jwt = require('jsonwebtoken');
const pool = require('../config/db');

exports.verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify session is still active
    const session = await pool.query(
      'SELECT status FROM session WHERE session_id = $1',
      [decoded.session_id]
    );

    if (session.rows.length === 0 || session.rows[0].status !== 'active') {
      return res.status(401).json({ error: 'Session expired or logged out' });
    }

    req.user = {
      user_id: decoded.user_id,
      role_id: decoded.role_id,
      role_name: decoded.role_name,
      institution_id: decoded.institution_id,
      session_id: decoded.session_id
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

exports.requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};
