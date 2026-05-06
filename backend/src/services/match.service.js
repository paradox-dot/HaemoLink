const pool = require('../config/db');

/*
  Scoring engine with 4 sub-scores:
  - compatibility_score: blood group + component match (0-100)
  - distance_score: geographic proximity (0-100)
  - expiry_score: time-to-expiry urgency of inventory (0-100)
  - urgency_score: urgency of demand request (0-100)

  Final: match_score = 0.30 * compatibility + 0.20 * distance + 0.25 * expiry + 0.25 * urgency
*/

function calculateCompatibility(inventory, demand) {
  if (inventory.blood_group !== demand.blood_group) return 0;
  if (inventory.component_type !== demand.component_type) return 0;
  return 100;
}

function calculateDistance(sourceCity, destCity) {
  // Same city = high score; different city = lower
  // In production this would use actual coordinates
  if (sourceCity === destCity) return 90;
  return 30;
}

function calculateExpiryScore(expiry_date) {
  const hoursToExpiry = (new Date(expiry_date) - new Date()) / (1000 * 60 * 60);
  if (hoursToExpiry <= 0) return 0;       // expired
  if (hoursToExpiry <= 24) return 95;     // critical — use first
  if (hoursToExpiry <= 72) return 75;     // warning — prioritize
  if (hoursToExpiry <= 168) return 50;    // week
  return 30;                              // safe shelf life
}

function calculateUrgencyScore(urgency_level) {
  if (urgency_level === 'emergency') return 100;
  if (urgency_level === 'urgent') return 70;
  return 35;
}

exports.runMatching = async () => {
  // Get active/partial demands sorted by priority
  const demands = await pool.query(
    `SELECT dr.*, i.city as dest_city
     FROM demand_request dr
     JOIN institution i ON dr.institution_id = i.institution_id
     WHERE dr.status IN ('active', 'partial')
     ORDER BY dr.priority_score DESC`
  );

  // Get available, non-expired inventory
  const inventory = await pool.query(
    `SELECT bi.*, i.city as source_city
     FROM blood_inventory bi
     JOIN institution i ON bi.institution_id = i.institution_id
     WHERE bi.status = 'available'
       AND bi.expiry_date > NOW()
       AND bi.quantity > 0
     ORDER BY bi.collection_date ASC NULLS LAST, bi.expiry_date ASC`
  );

  // Get inventory-demand pairs that already have an accepted or fulfilled match
  const existingMatches = await pool.query(
    `SELECT inventory_id, request_id FROM match WHERE status IN ('accepted', 'fulfilled')`
  );
  const existingPairs = new Set(
    existingMatches.rows.map(r => `${r.inventory_id}::${r.request_id}`)
  );

  const results = [];

  for (const d of demands.rows) {
    for (const inv of inventory.rows) {
      // Skip pairs that already have an active match
      if (existingPairs.has(`${inv.inventory_id}::${d.request_id}`)) continue;

      const compatibility_score = calculateCompatibility(inv, d);
      if (compatibility_score === 0) continue;

      const distance_score = calculateDistance(inv.source_city, d.dest_city);
      const expiry_score = calculateExpiryScore(inv.expiry_date);
      const urgency_score = calculateUrgencyScore(d.urgency_level);

      const match_score = Math.round(
        (0.30 * compatibility_score) +
        (0.20 * distance_score) +
        (0.25 * expiry_score) +
        (0.25 * urgency_score)
      );

      const proposed_qty = Math.min(
        parseFloat(inv.quantity),
        parseFloat(d.qty_needed) - parseFloat(d.qty_fulfilled)
      );

      if (proposed_qty <= 0) continue;

      results.push({
        inventory_id: inv.inventory_id,
        request_id: d.request_id,
        match_score,
        compatibility_score,
        distance_score,
        expiry_score,
        urgency_score,
        proposed_qty,
        // FIFO tiebreaker fields (not persisted; used only for deterministic ordering)
        _collection_date: inv.collection_date,
        _expiry_date: inv.expiry_date
      });
    }
  }

  // Sort by score desc, then FIFO (oldest collection first, then nearest expiry)
  results.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    const ca = a._collection_date ? new Date(a._collection_date).getTime() : Infinity;
    const cb = b._collection_date ? new Date(b._collection_date).getTime() : Infinity;
    if (ca !== cb) return ca - cb;
    const ea = new Date(a._expiry_date).getTime();
    const eb = new Date(b._expiry_date).getTime();
    return ea - eb;
  });
  // Strip internal fields before returning
  return results.map(({ _collection_date, _expiry_date, ...rest }) => rest);
};
