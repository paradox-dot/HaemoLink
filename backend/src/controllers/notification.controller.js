const pool = require('../config/db');

/* GET USER'S NOTIFICATIONS */
exports.getNotifications = async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM notification WHERE user_id = $1';
    const params = [req.user.user_id];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET UNREAD COUNT */
exports.getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM notification WHERE user_id = $1 AND status = 'unread'`,
      [req.user.user_id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* MARK ONE AS READ */
exports.markRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE notification SET status = 'read' WHERE notification_id = $1 AND user_id = $2`,
      [req.params.id, req.user.user_id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* MARK ALL AS READ */
exports.markAllRead = async (req, res) => {
  try {
    await pool.query(
      `UPDATE notification SET status = 'read' WHERE user_id = $1 AND status = 'unread'`,
      [req.user.user_id]
    );
    res.json({ message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* GET DASHBOARD SUMMARY */
exports.getDashboardSummary = async (req, res) => {
  try {
    const isSystemAdmin = req.user.role_name === 'System Admin';
    const instId = req.user.institution_id;

    // Inventory and Demand are visible to all (cross-institution visibility for operational awareness)
    const inv = await pool.query(
      `SELECT status, COUNT(*) AS count FROM blood_inventory GROUP BY status`
    );

    const dem = await pool.query(
      `SELECT status, COUNT(*) AS count FROM demand_request GROUP BY status`
    );

    // Institution-scoped demand counts (for the toggle on dashboard)
    const demInst = isSystemAdmin
      ? dem
      : await pool.query(
          `SELECT status, COUNT(*) AS count FROM demand_request WHERE institution_id = $1 GROUP BY status`,
          [instId]
        );

    // Match counts (scoped for non-admins to their institution's matches)
    const matchQuery = isSystemAdmin
      ? `SELECT status, COUNT(*) AS count FROM match GROUP BY status`
      : `SELECT m.status, COUNT(*) AS count FROM match m
         JOIN blood_inventory i ON m.inventory_id = i.inventory_id
         JOIN demand_request d ON m.request_id = d.request_id
         WHERE i.institution_id = $1 OR d.institution_id = $1
         GROUP BY m.status`;
    const mat = await pool.query(matchQuery, isSystemAdmin ? [] : [instId]);

    // Transfer counts (scoped for non-admins)
    const transQuery = isSystemAdmin
      ? `SELECT status, COUNT(*) AS count FROM transfer GROUP BY status`
      : `SELECT status, COUNT(*) AS count FROM transfer WHERE source_inst_id = $1 OR dest_inst_id = $1 GROUP BY status`;
    const trans = await pool.query(transQuery, isSystemAdmin ? [] : [instId]);

    // Expiry alerts (system-wide for operational awareness)
    const expiry = await pool.query(
      `SELECT expiry_category, COUNT(*) AS count FROM blood_inventory WHERE status = 'available' AND expiry_category IN ('critical', 'warning') GROUP BY expiry_category`
    );

    // Pending institutions (System Admin only)
    let pendingInstitutions = 0;
    if (isSystemAdmin) {
      const pi = await pool.query(`SELECT COUNT(*) AS count FROM institution WHERE status = 'pending'`);
      pendingInstitutions = parseInt(pi.rows[0].count);
    }

    const toMap = (rows) => {
      const m = {};
      rows.forEach(r => { m[r.status || r.expiry_category] = parseInt(r.count); });
      return m;
    };

    // Received stock counts (institution-scoped for non-admins)
    const rsQuery = isSystemAdmin
      ? `SELECT status, COUNT(*) AS count FROM received_stock GROUP BY status`
      : `SELECT status, COUNT(*) AS count FROM received_stock WHERE dest_inst_id = $1 GROUP BY status`;
    const rs = await pool.query(rsQuery, isSystemAdmin ? [] : [instId]);

    // Wastage: last 30 days, by status, institution-scoped for non-SA
    const wastageQuery = isSystemAdmin
      ? `SELECT status, COUNT(*) AS count FROM blood_inventory WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY status`
      : `SELECT status, COUNT(*) AS count FROM blood_inventory WHERE institution_id = $1 AND created_at > NOW() - INTERVAL '30 days' GROUP BY status`;
    const wastageRows = await pool.query(wastageQuery, isSystemAdmin ? [] : [instId]);
    const wmap = toMap(wastageRows.rows);
    const wastedCount = (wmap.expired || 0) + (wmap.discarded || 0);
    const totalCount = Object.values(wmap).reduce((s, v) => s + v, 0);
    const wastagePct = totalCount > 0 ? Math.round((wastedCount / totalCount) * 1000) / 10 : 0;
    const wastage = { expired_count: wmap.expired || 0, discarded_count: wmap.discarded || 0, total_count: totalCount, wastage_pct: wastagePct };

    // My Open Actions — role-aware, capped at 10
    const myActions = [];
    const role = req.user.role_name;
    const userId = req.user.user_id;
    try {
      if (role === 'Blood Bank Ops Manager') {
        const pm = await pool.query(
          `SELECT m.match_id, bi.blood_group, bi.component_type
           FROM match m JOIN blood_inventory bi ON m.inventory_id = bi.inventory_id
           WHERE bi.institution_id = $1 AND m.status = 'proposed' ORDER BY m.created_at ASC LIMIT 5`, [instId]);
        pm.rows.forEach(r => myActions.push({ type: 'match_review', id: r.match_id, label: `Review proposed match (${r.blood_group} ${r.component_type})`, tab: 'matching', urgency: 'normal' }));
        const pd = await pool.query(
          `SELECT transfer_id FROM transfer WHERE source_inst_id = $1 AND status = 'initiated' ORDER BY created_at ASC LIMIT 5`, [instId]);
        pd.rows.forEach(r => myActions.push({ type: 'dispatch', id: r.transfer_id, label: 'Dispatch initiated transfer', tab: 'transfer', urgency: 'normal' }));
      } else if (role === 'Transfusion Officer') {
        const pr = await pool.query(
          `SELECT transfer_id FROM transfer WHERE dest_inst_id = $1 AND status IN ('dispatched', 'in_transit', 'received') ORDER BY created_at ASC LIMIT 5`, [instId]);
        pr.rows.forEach(r => myActions.push({ type: 'receive', id: r.transfer_id, label: 'Transfer awaiting receipt', tab: 'transfer', urgency: 'high' }));
        const ud = await pool.query(
          `SELECT request_id, blood_group FROM demand_request
           WHERE institution_id = $1 AND status = 'active' AND created_at < NOW() - INTERVAL '24 hours' ORDER BY priority_score DESC LIMIT 5`, [instId]);
        ud.rows.forEach(r => myActions.push({ type: 'stale_demand', id: r.request_id, label: `Unmatched demand >24h (${r.blood_group})`, tab: 'demand', urgency: 'high' }));
      } else if (role === 'Institutional Admin') {
        const pu = await pool.query(
          `SELECT user_id, name FROM "user" WHERE institution_id = $1 AND status = 'pending' LIMIT 5`, [instId]);
        pu.rows.forEach(r => myActions.push({ type: 'user_approval', id: r.user_id, label: `Approve user: ${r.name}`, tab: 'users', urgency: 'normal' }));
        const ct = await pool.query(
          `SELECT transfer_id FROM transfer WHERE (source_inst_id = $1 OR dest_inst_id = $1) AND status = 'cancelled' AND created_at > NOW() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 5`, [instId]);
        ct.rows.forEach(r => myActions.push({ type: 'cancelled_transfer', id: r.transfer_id, label: 'Review cancelled transfer', tab: 'transfer', urgency: 'low' }));
      } else if (role === 'System Admin') {
        const pi = await pool.query(`SELECT institution_id, name FROM institution WHERE status = 'pending' LIMIT 5`);
        pi.rows.forEach(r => myActions.push({ type: 'institution_approval', id: r.institution_id, label: `Approve institution: ${r.name}`, tab: 'institutions', urgency: 'high' }));
        const sd = await pool.query(`SELECT request_id, blood_group FROM demand_request WHERE status = 'active' AND created_at < NOW() - INTERVAL '48 hours' ORDER BY priority_score DESC LIMIT 5`);
        sd.rows.forEach(r => myActions.push({ type: 'stale_demand', id: r.request_id, label: `Stale demand >48h (${r.blood_group})`, tab: 'demand', urgency: 'high' }));
      }
    } catch (e) { console.error('my_actions error', e); }

    res.json({
      inventory: toMap(inv.rows),
      demand: toMap(dem.rows),
      demand_institution: toMap(demInst.rows),
      matches: toMap(mat.rows),
      transfers: toMap(trans.rows),
      expiry_alerts: toMap(expiry.rows),
      pending_institutions: pendingInstitutions,
      received_stock: toMap(rs.rows),
      wastage,
      my_actions: myActions.slice(0, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
