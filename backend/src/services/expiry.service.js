const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { logAudit, SYSTEM_USER_ID } = require('./audit.service');

const CRITICAL_HOURS = 24;
const WARNING_HOURS = 72;
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

async function runExpiryCheck() {
  try {
    const now = new Date();

    // 1. Auto-expire available items past their expiry_date
    // NOTE: 'reserved' items are skipped — they are tied to an active accepted match/transfer.
    // Expiring them here would leave the match and transfer dangling. BB Ops is notified instead.
    const expiredRes = await pool.query(
      `SELECT inventory_id, status, expiry_category FROM blood_inventory
       WHERE status = 'available' AND expiry_date <= NOW()`
    );

    for (const item of expiredRes.rows) {
      await pool.query(
        `UPDATE blood_inventory SET status = 'expired', expiry_category = 'critical' WHERE inventory_id = $1`,
        [item.inventory_id]
      );

      await pool.query(
        `INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state, reason)
         VALUES ($1, $2, $3, $4, 'expired', 'Auto-expired by system')`,
        [uuidv4(), item.inventory_id, SYSTEM_USER_ID, item.status]
      );

      await notifyInstitutionUsers(item.inventory_id, 'expired');
    }

    // 1b. Notify (but do NOT auto-expire) reserved items that have passed expiry_date
    const expiredReservedRes = await pool.query(
      `SELECT inventory_id FROM blood_inventory
       WHERE status = 'reserved' AND expiry_date <= NOW()`
    );
    for (const item of expiredReservedRes.rows) {
      await notifyInstitutionUsers(item.inventory_id, 'expired_reserved');
    }

    // 2. Auto-expire demand requests past their required_by date
    const expiredDemands = await pool.query(
      `SELECT request_id, status FROM demand_request
       WHERE status IN ('active', 'partial') AND required_by < NOW()`
    );

    for (const demand of expiredDemands.rows) {
      await pool.query(
        `UPDATE demand_request SET status = 'expired' WHERE request_id = $1`,
        [demand.request_id]
      );

      await pool.query(
        `INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state)
         VALUES ($1, $2, $3, $4, 'expired')`,
        [uuidv4(), demand.request_id, SYSTEM_USER_ID, demand.status]
      );

      await logAudit({
        user_id: SYSTEM_USER_ID,
        action_type: 'demand_expired',
        entity_type: 'DEMAND_REQUEST',
        entity_id: demand.request_id,
        details: { reason: 'Required by date passed', from_status: demand.status }
      });
    }

    if (expiredDemands.rows.length > 0) {
      console.log(`[${now.toISOString()}] Auto-expired ${expiredDemands.rows.length} overdue demand(s)`);
    }

    // 3. Auto-expire received_stock items past expiry_date
    const expiredRS = await pool.query(
      `SELECT received_stock_id FROM received_stock WHERE status = 'available' AND expiry_date <= NOW()`
    );
    for (const item of expiredRS.rows) {
      await pool.query(
        `UPDATE received_stock SET status = 'expired', expiry_category = 'critical' WHERE received_stock_id = $1`,
        [item.received_stock_id]
      );
    }
    if (expiredRS.rows.length > 0) {
      console.log(`[${now.toISOString()}] Auto-expired ${expiredRS.rows.length} received stock item(s)`);
    }

    // 4. Update expiry_category for received_stock available items
    const activeRS = await pool.query(
      `SELECT received_stock_id, expiry_date, expiry_category FROM received_stock WHERE status = 'available' AND expiry_date > NOW()`
    );
    for (const item of activeRS.rows) {
      const hoursToExpiry = (new Date(item.expiry_date) - now) / (1000 * 60 * 60);
      let newCategory;
      if (hoursToExpiry <= CRITICAL_HOURS) newCategory = 'critical';
      else if (hoursToExpiry <= WARNING_HOURS) newCategory = 'warning';
      else newCategory = 'safe';
      if (item.expiry_category !== newCategory) {
        await pool.query(
          `UPDATE received_stock SET expiry_category = $1 WHERE received_stock_id = $2`,
          [newCategory, item.received_stock_id]
        );
      }
    }

    // 5. Update expiry_category for available inventory items
    const activeRes = await pool.query(
      `SELECT inventory_id, expiry_date, expiry_category, institution_id
       FROM blood_inventory
       WHERE status = 'available' AND expiry_date > NOW()`
    );

    let criticalCount = 0;
    let warningCount = 0;

    for (const item of activeRes.rows) {
      const hoursToExpiry = (new Date(item.expiry_date) - now) / (1000 * 60 * 60);
      let newCategory;

      if (hoursToExpiry <= CRITICAL_HOURS) {
        newCategory = 'critical';
        criticalCount++;
      } else if (hoursToExpiry <= WARNING_HOURS) {
        newCategory = 'warning';
        warningCount++;
      } else {
        newCategory = 'safe';
      }

      // Only update if category changed
      if (item.expiry_category !== newCategory) {
        await pool.query(
          `UPDATE blood_inventory SET expiry_category = $1 WHERE inventory_id = $2`,
          [newCategory, item.inventory_id]
        );

        // Notify on escalation to critical or warning (not on safe)
        if (newCategory === 'critical' || (newCategory === 'warning' && item.expiry_category === 'safe')) {
          await notifyInstitutionUsers(item.inventory_id, newCategory);
        }
      }
    }

    const summary = `Expiry check: ${expiredRes.rows.length} inv expired, ${criticalCount} critical, ${warningCount} warning, ${expiredDemands.rows.length} demands expired`;
    console.log(`[${now.toISOString()}] ${summary}`);
  } catch (err) {
    console.error('Expiry check error:', err.message);
  }
}

async function notifyInstitutionUsers(inventory_id, severity) {
  try {
    // Get inventory details + institution
    const inv = await pool.query(
      `SELECT bi.blood_group, bi.component_type, bi.expiry_date, bi.institution_id, i.name AS inst_name
       FROM blood_inventory bi
       JOIN institution i ON bi.institution_id = i.institution_id
       WHERE bi.inventory_id = $1`,
      [inventory_id]
    );

    if (inv.rows.length === 0) return;
    const item = inv.rows[0];

    const message = severity === 'expired'
      ? `${item.blood_group} ${item.component_type} has expired (was due ${new Date(item.expiry_date).toLocaleDateString()})`
      : severity === 'expired_reserved'
        ? `URGENT: Reserved ${item.blood_group} ${item.component_type} has passed its expiry date — review the associated transfer immediately`
        : severity === 'critical'
          ? `${item.blood_group} ${item.component_type} expires within 24 hours (${new Date(item.expiry_date).toLocaleString()})`
          : `${item.blood_group} ${item.component_type} expires within 72 hours (${new Date(item.expiry_date).toLocaleString()})`;

    // Get BB Ops + Inst Admin users for this institution
    const users = await pool.query(
      `SELECT u.user_id FROM "user" u
       JOIN role r ON u.role_id = r.role_id
       WHERE u.institution_id = $1
         AND u.status = 'active'
         AND r.role_name IN ('Blood Bank Ops Manager', 'Institutional Admin')`,
      [item.institution_id]
    );

    // Check if notification already sent for this item today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const u of users.rows) {
      const existing = await pool.query(
        `SELECT notification_id FROM notification
         WHERE user_id = $1 AND related_entity_id = $2 AND type = 'expiry_alert' AND created_at >= $3`,
        [u.user_id, inventory_id, today]
      );

      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO notification (notification_id, user_id, type, message, related_entity_type, related_entity_id)
           VALUES ($1, $2, 'expiry_alert', $3, 'INVENTORY', $4)`,
          [uuidv4(), u.user_id, message, inventory_id]
        );
      }
    }
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

function startExpiryMonitor() {
  console.log(`Expiry monitor started (interval: ${CHECK_INTERVAL_MS / 60000} min)`);
  // Run immediately on startup
  runExpiryCheck();
  // Then run periodically
  setInterval(runExpiryCheck, CHECK_INTERVAL_MS);
}

module.exports = { startExpiryMonitor, runExpiryCheck };
