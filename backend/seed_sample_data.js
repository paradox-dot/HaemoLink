/**
 * HaemoLink — Sample Data Seed Script
 * Creates realistic data across all entities to demo every portal feature
 * Run: node seed_sample_data.js
 */

const pool = require('./src/config/db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const PASSWORD_HASH = ''; // Will be set after bcrypt

// ── Known IDs (existing) ──────────────────────────────────────────────────
const INST = {
  cityBB:       '11111111-1111-1111-1111-111111111111',
  lilavati:     '22222222-2222-2222-2222-222222222222',
  hiranandani:  '08ff1b74-a0fb-4a25-97a6-0625942ce124',
  triumphBB:    'f349be00-e5fe-4a5f-bb78-bb6318ac7492',
};

const ROLE = {
  sysAdmin:    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  instAdmin:   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  bbOps:       'cccccccc-cccc-cccc-cccc-cccccccccccc',
  to:          'dddddddd-dddd-dddd-dddd-dddddddddddd',
  hospitalAdmin:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
};

const USER = {
  rajesh:   'aaaaaaaa-1111-1111-1111-111111111111', // BB Ops City BB
  ritu:     'bbbbbbbb-2222-2222-2222-222222222222', // TO Lilavati
  arka:     'dddddddd-4444-4444-4444-444444444444', // Sys Admin
  suresh:   'f22b6ab6-71f5-495b-b669-c681fae243ff', // TO Hiranandani
  sumit:    '2eecbe98-4bd4-493a-90ac-afebd606f322', // BB Ops Triumph
};

// ── New IDs to create ──────────────────────────────────────────────────────
const NEW = {
  // Institution
  kokilaben:     'bb000001-0000-0000-0000-000000000001',
  // Users
  adminHira:     'bb000002-0000-0000-0000-000000000002', // Inst Admin Hiranandani
  hospitalAdminLilavati: 'bb000003-0000-0000-0000-000000000003',
  hospitalAdminHira:     'bb000004-0000-0000-0000-000000000004',
  toTriumph:             'bb000005-0000-0000-0000-000000000005', // TO for Kokilaben
  adminKokilaben:        'bb000006-0000-0000-0000-000000000006',
};

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function hoursFromNow(hours) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function daysFromNowISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function expiryCategory(expiryDate) {
  const hours = (new Date(expiryDate) - new Date()) / (1000 * 60 * 60);
  if (hours <= 24) return 'critical';
  if (hours <= 72) return 'warning';
  return 'safe';
}

function priorityScore({ urgency_level, demand_type, required_by }) {
  let score = 0;
  if (urgency_level === 'emergency') score += 45;
  else if (urgency_level === 'urgent') score += 28;
  else score += 10;
  if (demand_type === 'hard') score += 20;
  else score += 5;
  const hoursLeft = (new Date(required_by) - new Date()) / (1000 * 60 * 60);
  if (hoursLeft <= 4) score += 25;
  else if (hoursLeft <= 12) score += 20;
  else if (hoursLeft <= 24) score += 15;
  else if (hoursLeft <= 72) score += 8;
  else score += 3;
  return Math.min(score, 99);
}

async function main() {
  console.log('🌱 HaemoLink Sample Data Seeder\n');

  const hash = await bcrypt.hash('Password123!', 10);

  // ── 1. NEW INSTITUTION (pending — for approval workflow demo) ────────────
  console.log('1️⃣  Creating pending institution...');
  await pool.query(`
    INSERT INTO institution (institution_id, name, type, sub_type, city, license_number, contact_email, contact_phone, status)
    VALUES ($1,'Kokilaben Dhirubhai Ambani Hospital','private','hospital','Mumbai','MH-KDAH-2024','admin@kokilaben.org','+91-22-30999999','pending')
    ON CONFLICT (institution_id) DO NOTHING
  `, [NEW.kokilaben]);
  console.log('   ✅ Kokilaben Hospital (pending approval)');

  // ── 2. NEW USERS ──────────────────────────────────────────────────────────
  console.log('\n2️⃣  Creating new users...');

  const newUsers = [
    {
      id: NEW.adminHira,
      inst: INST.hiranandani,
      role: ROLE.instAdmin,
      name: 'Dr. Priya Mehta',
      email: 'admin@hiranandani.com',
    },
    {
      id: NEW.hospitalAdminLilavati,
      inst: INST.lilavati,
      role: ROLE.hospitalAdmin,
      name: 'Rakesh Nair',
      email: 'hospitaladmin@lilavati.org',
    },
    {
      id: NEW.hospitalAdminHira,
      inst: INST.hiranandani,
      role: ROLE.hospitalAdmin,
      name: 'Anita Desai',
      email: 'hospitaladmin@hiranandani.com',
    },
    {
      id: NEW.adminKokilaben,
      inst: NEW.kokilaben,
      role: ROLE.instAdmin,
      name: 'Dr. Vikram Shah',
      email: 'admin@kokilaben.org',
      status: 'inactive', // pending institution
    },
    {
      id: NEW.toTriumph,
      inst: NEW.kokilaben,
      role: ROLE.to,
      name: 'Dr. Neha Kapoor',
      email: 'neha@kokilaben.org',
      status: 'inactive',
    },
  ];

  for (const u of newUsers) {
    await pool.query(`
      INSERT INTO "user" (user_id, institution_id, role_id, name, email, password_hash, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id) DO NOTHING
    `, [u.id, u.inst, u.role, u.name, u.email, hash, u.status || 'active']);
    console.log(`   ✅ ${u.name} (${u.email})`);
  }

  // ── 3. INVENTORY — rich variety ──────────────────────────────────────────
  console.log('\n3️⃣  Creating inventory...');

  const inventoryItems = [
    // City Blood Bank — various blood groups and components
    { inst: INST.cityBB, by: USER.rajesh, bg: 'A+',  comp: 'rbc',         qty: 4,  collect: daysFromNow(-5), expiry: daysFromNow(25) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'A-',  comp: 'rbc',         qty: 2,  collect: daysFromNow(-3), expiry: daysFromNow(30) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'B+',  comp: 'rbc',         qty: 3,  collect: daysFromNow(-4), expiry: daysFromNow(20) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'B-',  comp: 'rbc',         qty: 1,  collect: daysFromNow(-2), expiry: daysFromNow(28) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'O+',  comp: 'rbc',         qty: 5,  collect: daysFromNow(-6), expiry: daysFromNow(15) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'O-',  comp: 'rbc',         qty: 2,  collect: daysFromNow(-1), expiry: daysFromNow(35) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'AB+', comp: 'rbc',         qty: 1,  collect: daysFromNow(-3), expiry: daysFromNow(22) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'A+',  comp: 'platelets',   qty: 3,  collect: daysFromNow(-1), expiry: daysFromNow(3)  }, // warning
    { inst: INST.cityBB, by: USER.rajesh, bg: 'B+',  comp: 'platelets',   qty: 2,  collect: daysFromNow(-1), expiry: daysFromNow(2)  }, // warning
    { inst: INST.cityBB, by: USER.rajesh, bg: 'O+',  comp: 'platelets',   qty: 2,  collect: daysFromNow(0),  expiry: hoursFromNow(20).split('T')[0] }, // critical
    { inst: INST.cityBB, by: USER.rajesh, bg: 'A+',  comp: 'plasma',      qty: 4,  collect: daysFromNow(-10),expiry: daysFromNow(80) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'AB+', comp: 'plasma',      qty: 3,  collect: daysFromNow(-8), expiry: daysFromNow(90) },
    { inst: INST.cityBB, by: USER.rajesh, bg: 'O+',  comp: 'whole_blood', qty: 2,  collect: daysFromNow(-2), expiry: daysFromNow(28) },
    // Triumph Blood Bank — different city (lower distance score for cross-city matching)
    { inst: INST.triumphBB, by: USER.sumit, bg: 'A+',  comp: 'rbc',       qty: 3,  collect: daysFromNow(-4), expiry: daysFromNow(18) },
    { inst: INST.triumphBB, by: USER.sumit, bg: 'O+',  comp: 'rbc',       qty: 4,  collect: daysFromNow(-5), expiry: daysFromNow(12) },
    { inst: INST.triumphBB, by: USER.sumit, bg: 'B+',  comp: 'rbc',       qty: 2,  collect: daysFromNow(-3), expiry: daysFromNow(25) },
    { inst: INST.triumphBB, by: USER.sumit, bg: 'AB-', comp: 'rbc',       qty: 1,  collect: daysFromNow(-2), expiry: daysFromNow(30) },
    { inst: INST.triumphBB, by: USER.sumit, bg: 'O-',  comp: 'rbc',       qty: 2,  collect: daysFromNow(-1), expiry: daysFromNow(40) },
    { inst: INST.triumphBB, by: USER.sumit, bg: 'A+',  comp: 'platelets', qty: 2,  collect: daysFromNow(-1), expiry: daysFromNow(4)  }, // warning
    { inst: INST.triumphBB, by: USER.sumit, bg: 'B+',  comp: 'plasma',    qty: 3,  collect: daysFromNow(-7), expiry: daysFromNow(85) },
    { inst: INST.triumphBB, by: USER.sumit, bg: 'O+',  comp: 'whole_blood',qty: 1, collect: daysFromNow(-3), expiry: daysFromNow(26) },
  ];

  const invIds = [];
  for (const item of inventoryItems) {
    const id = uuidv4();
    invIds.push({ id, ...item });
    const cat = expiryCategory(item.expiry);
    await pool.query(`
      INSERT INTO blood_inventory
        (inventory_id, institution_id, created_by, blood_group, component_type, quantity, unit_type,
         collection_date, expiry_date, status, expiry_category, is_network_visible)
      VALUES ($1,$2,$3,$4,$5,$6,'units',$7,$8,'available',$9,true)
    `, [id, item.inst, item.by, item.bg, item.comp, item.qty, item.collect, item.expiry, cat]);

    await pool.query(`
      INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
      VALUES ($1,$2,$3,'created','available')
    `, [uuidv4(), id, item.by]);
  }
  console.log(`   ✅ ${inventoryItems.length} inventory items created`);

  // ── 4. DEMANDS — rich variety ────────────────────────────────────────────
  console.log('\n4️⃣  Creating demand requests...');

  const demandItems = [
    // Lilavati Hospital — Dr Ritu Sharma
    { inst: INST.lilavati,    by: USER.ritu,   bg: 'A+',  comp: 'rbc',       qty: 2, urgency: 'emergency', type: 'hard', reqBy: daysFromNowISO(1),  proc: 'Emergency Surgery' },
    { inst: INST.lilavati,    by: USER.ritu,   bg: 'O+',  comp: 'rbc',       qty: 3, urgency: 'urgent',    type: 'hard', reqBy: daysFromNowISO(2),  proc: 'Cardiac Surgery' },
    { inst: INST.lilavati,    by: USER.ritu,   bg: 'A+',  comp: 'platelets', qty: 2, urgency: 'urgent',    type: 'hard', reqBy: daysFromNowISO(1),  proc: 'Chemotherapy' },
    { inst: INST.lilavati,    by: USER.ritu,   bg: 'AB+', comp: 'plasma',    qty: 2, urgency: 'routine',   type: 'soft', reqBy: daysFromNowISO(5),  proc: 'Liver Transplant' },
    { inst: INST.lilavati,    by: USER.ritu,   bg: 'B+',  comp: 'rbc',       qty: 1, urgency: 'routine',   type: 'hard', reqBy: daysFromNowISO(7),  proc: 'Elective Surgery' },
    { inst: INST.lilavati,    by: USER.ritu,   bg: 'O+',  comp: 'platelets', qty: 3, urgency: 'emergency', type: 'hard', reqBy: daysFromNowISO(0.5),proc: 'Trauma/Accident' },
    // Hiranandani Hospital — Dr Suresh Advani
    { inst: INST.hiranandani, by: USER.suresh, bg: 'A+',  comp: 'rbc',       qty: 2, urgency: 'urgent',    type: 'hard', reqBy: daysFromNowISO(2),  proc: 'Orthopaedic Surgery' },
    { inst: INST.hiranandani, by: USER.suresh, bg: 'O+',  comp: 'rbc',       qty: 2, urgency: 'emergency', type: 'hard', reqBy: daysFromNowISO(0.3),proc: 'ICU Patient' },
    { inst: INST.hiranandani, by: USER.suresh, bg: 'B+',  comp: 'platelets', qty: 1, urgency: 'urgent',    type: 'hard', reqBy: daysFromNowISO(3),  proc: 'Oncology' },
    { inst: INST.hiranandani, by: USER.suresh, bg: 'AB+', comp: 'rbc',       qty: 1, urgency: 'routine',   type: 'soft', reqBy: daysFromNowISO(10), proc: 'Planned Surgery' },
    { inst: INST.hiranandani, by: USER.suresh, bg: 'A+',  comp: 'plasma',    qty: 2, urgency: 'urgent',    type: 'hard', reqBy: daysFromNowISO(2),  proc: 'Burns Unit' },
    { inst: INST.hiranandani, by: USER.suresh, bg: 'O-',  comp: 'rbc',       qty: 1, urgency: 'emergency', type: 'hard', reqBy: daysFromNowISO(0.5),proc: 'Neonatal ICU' },
  ];

  const demIds = [];
  for (const item of demandItems) {
    const id = uuidv4();
    const score = priorityScore({ urgency_level: item.urgency, demand_type: item.type, required_by: item.reqBy });
    demIds.push({ id, ...item, score });
    await pool.query(`
      INSERT INTO demand_request
        (request_id, institution_id, created_by, blood_group, component_type,
         qty_needed, qty_fulfilled, urgency_level, demand_type, procedure_type,
         required_by, status, priority_score)
      VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,'active',$11)
    `, [id, item.inst, item.by, item.bg, item.comp, item.qty, item.urgency, item.type, item.proc, item.reqBy, score]);

    await pool.query(`
      INSERT INTO demand_state_transition (id, request_id, changed_by, from_state, to_state)
      VALUES ($1,$2,$3,'draft','active')
    `, [uuidv4(), id, item.by]);
  }
  console.log(`   ✅ ${demandItems.length} demand requests created`);

  // ── 5. RUN MATCHING ENGINE ────────────────────────────────────────────────
  console.log('\n5️⃣  Running matching engine...');

  // Supersede old proposed
  await pool.query(`UPDATE match SET status = 'superseded' WHERE status = 'proposed'`);

  // Fetch active inventory and demands
  const inventory = await pool.query(`
    SELECT bi.*, i.city as source_city
    FROM blood_inventory bi
    JOIN institution i ON bi.institution_id = i.institution_id
    WHERE bi.status = 'available' AND bi.expiry_date > NOW() AND bi.quantity > 0
  `);
  const demands = await pool.query(`
    SELECT dr.*, i.city as dest_city
    FROM demand_request dr
    JOIN institution i ON dr.institution_id = i.institution_id
    WHERE dr.status IN ('active','partial')
    ORDER BY dr.priority_score DESC
  `);
  const existingPairs = await pool.query(
    `SELECT inventory_id, request_id FROM match WHERE status IN ('accepted','fulfilled')`
  );
  const pairSet = new Set(existingPairs.rows.map(r => `${r.inventory_id}::${r.request_id}`));

  function compatScore(inv, dem) {
    return (inv.blood_group === dem.blood_group && inv.component_type === dem.component_type) ? 100 : 0;
  }
  function distScore(c1, c2) { return c1 === c2 ? 90 : 30; }
  function expScore(expiry) {
    const h = (new Date(expiry) - new Date()) / 3600000;
    if (h <= 0) return 0;
    if (h <= 24) return 95;
    if (h <= 72) return 75;
    if (h <= 168) return 50;
    return 30;
  }
  function urgScore(u) { return u === 'emergency' ? 100 : u === 'urgent' ? 70 : 35; }

  const matchResults = [];
  for (const d of demands.rows) {
    for (const inv of inventory.rows) {
      if (pairSet.has(`${inv.inventory_id}::${d.request_id}`)) continue;
      const compat = compatScore(inv, d);
      if (compat === 0) continue;
      const dist = distScore(inv.source_city, d.dest_city);
      const exp = expScore(inv.expiry_date);
      const urg = urgScore(d.urgency_level);
      const score = Math.round(0.30 * compat + 0.20 * dist + 0.25 * exp + 0.25 * urg);
      const qty = Math.min(parseFloat(inv.quantity), parseFloat(d.qty_needed) - parseFloat(d.qty_fulfilled));
      if (qty <= 0) continue;
      matchResults.push({ inv, d, compat, dist, exp, urg, score, qty });
    }
  }
  matchResults.sort((a, b) => b.score - a.score);

  // Insert top matches (deduplicated by demand to avoid flooding)
  const seenDemands = new Set();
  const seenInv = new Set();
  let matchCount = 0;
  for (const m of matchResults) {
    if (matchCount >= 18) break;
    // Allow multiple matches per demand but limit per inventory
    if (seenInv.has(m.inv.inventory_id)) continue;
    seenInv.add(m.inv.inventory_id);
    seenDemands.add(m.d.request_id);

    const mid = uuidv4();
    await pool.query(`
      INSERT INTO match (match_id, inventory_id, request_id, match_score,
        compatibility_score, distance_score, expiry_score, urgency_score, proposed_qty, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'proposed')
    `, [mid, m.inv.inventory_id, m.d.request_id, m.score, m.compat, m.dist, m.exp, m.urg, m.qty]);
    matchCount++;
  }
  console.log(`   ✅ ${matchCount} proposed matches created`);

  // ── 6. ACCEPT SOME MATCHES + CREATE TRANSFERS IN VARIOUS STAGES ──────────
  console.log('\n6️⃣  Accepting matches and creating transfers in various stages...');

  // Get proposed matches sorted by score
  const proposed = await pool.query(`
    SELECT m.*, bi.institution_id as src_inst, dr.institution_id as dest_inst
    FROM match m
    JOIN blood_inventory bi ON m.inventory_id = bi.inventory_id
    JOIN demand_request dr ON m.request_id = dr.request_id
    WHERE m.status = 'proposed'
    ORDER BY m.match_score DESC
  `);

  const toAccept = proposed.rows.slice(0, 6); // Accept top 6

  const transferStages = [
    ['initiated'],                                                         // T1: just created
    ['initiated','pending_approval'],                                      // T2: pending approval
    ['initiated','pending_approval','approved'],                           // T3: approved
    ['initiated','pending_approval','approved','dispatched'],              // T4: dispatched
    ['initiated','pending_approval','approved','dispatched','in_transit'], // T5: in transit
    ['initiated','pending_approval','approved','dispatched','in_transit','received'], // T6: received
  ];

  for (let i = 0; i < toAccept.length; i++) {
    const match = toAccept[i];
    const decidedBy = match.dest_inst === INST.lilavati ? USER.ritu : USER.suresh;

    // Accept match
    await pool.query(`UPDATE match SET status='accepted', decided_by=$1, decided_at=NOW() WHERE match_id=$2`, [decidedBy, match.match_id]);
    await pool.query(`UPDATE blood_inventory SET status='reserved' WHERE inventory_id=$1`, [match.inventory_id]);
    await pool.query(`
      INSERT INTO inv_state_transition (id, inventory_id, changed_by, from_state, to_state)
      VALUES ($1,$2,$3,'available','reserved')
    `, [uuidv4(), match.inventory_id, decidedBy]);
    await pool.query(`
      UPDATE demand_request SET status='under_matching'
      WHERE request_id=$1 AND status='active'
    `, [match.request_id]);

    // Create transfer
    const tid = uuidv4();
    const createdBy = match.src_inst === INST.cityBB ? USER.rajesh : USER.sumit;
    const dispatch = new Date(); dispatch.setDate(dispatch.getDate() + 1);
    const delivery = new Date(); delivery.setDate(delivery.getDate() + 2);

    await pool.query(`
      INSERT INTO transfer
        (transfer_id, match_id, inventory_id, request_id,
         source_inst_id, dest_inst_id,
         planned_qty, status, transport_mode,
         expected_dispatch, expected_delivery)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'initiated','road',$8,$9)
    `, [tid, match.match_id, match.inventory_id, match.request_id,
        match.src_inst, match.dest_inst, match.proposed_qty,
        dispatch.toISOString(), delivery.toISOString()]);

    await pool.query(`
      INSERT INTO transfer_state_transition (id, transfer_id, changed_by, from_state, to_state)
      VALUES ($1,$2,$3,'initiated','initiated')
    `, [uuidv4(), tid, createdBy]);

    // Progress through stages for this transfer
    const stages = transferStages[i];
    let prevStatus = 'initiated';
    for (let s = 1; s < stages.length; s++) {
      const nextStatus = stages[s];
      const changedBy = ['received','completed'].includes(nextStatus) ? decidedBy : createdBy;
      await pool.query(`UPDATE transfer SET status=$1 WHERE transfer_id=$2`, [nextStatus, tid]);
      await pool.query(`
        INSERT INTO transfer_state_transition (id, transfer_id, changed_by, from_state, to_state)
        VALUES ($1,$2,$3,$4,$5)
      `, [uuidv4(), tid, changedBy, prevStatus, nextStatus]);
      prevStatus = nextStatus;
    }

    console.log(`   ✅ Match accepted → Transfer stage: ${stages[stages.length - 1]}`);
  }

  // ── 7. CREATE NOTIFICATIONS ───────────────────────────────────────────────
  console.log('\n7️⃣  Creating sample notifications...');

  const notifItems = [
    { user: USER.rajesh, type: 'expiry_alert',    msg: 'CRITICAL: O+ Platelets expiring within 20 hours', ent: 'INVENTORY' },
    { user: USER.rajesh, type: 'expiry_alert',    msg: 'WARNING: A+ Platelets expiring within 72 hours',  ent: 'INVENTORY' },
    { user: USER.sumit,  type: 'expiry_alert',    msg: 'WARNING: A+ Platelets (Triumph) expiring within 96 hours', ent: 'INVENTORY' },
    { user: USER.ritu,   type: 'match_found',     msg: 'New match found for your A+ RBC emergency request', ent: 'MATCH' },
    { user: USER.ritu,   type: 'match_found',     msg: 'New match found for your O+ Platelets trauma request', ent: 'MATCH' },
    { user: USER.suresh, type: 'match_found',     msg: 'New match found for your O+ RBC ICU request', ent: 'MATCH' },
    { user: USER.ritu,   type: 'transfer_update', msg: 'Transfer for A+ RBC has been dispatched', ent: 'TRANSFER' },
    { user: USER.suresh, type: 'transfer_update', msg: 'Transfer for O+ RBC is in transit', ent: 'TRANSFER' },
    { user: USER.arka,   type: 'approval_pending',msg: 'Kokilaben Hospital has submitted registration for approval', ent: 'INSTITUTION' },
  ];

  for (const n of notifItems) {
    await pool.query(`
      INSERT INTO notification (notification_id, user_id, type, message, related_entity_type, related_entity_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,'unread')
    `, [uuidv4(), n.user, n.type, n.msg, n.ent, uuidv4()]);
  }
  console.log(`   ✅ ${notifItems.length} notifications created`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n📊 Final Data Summary:');
  const summary = [
    ['institution',    'SELECT COUNT(*) FROM institution'],
    ['"user"',         'SELECT COUNT(*) FROM "user"'],
    ['inventory',      'SELECT COUNT(*) FROM blood_inventory WHERE status = \'available\''],
    ['demands (active)','SELECT COUNT(*) FROM demand_request WHERE status IN (\'active\',\'under_matching\',\'partial\')'],
    ['matches (proposed)','SELECT COUNT(*) FROM match WHERE status = \'proposed\''],
    ['matches (accepted)','SELECT COUNT(*) FROM match WHERE status = \'accepted\''],
    ['transfers',      'SELECT COUNT(*) FROM transfer'],
    ['notifications',  'SELECT COUNT(*) FROM notification WHERE status = \'unread\''],
  ];
  for (const [label, q] of summary) {
    const r = await pool.query(q);
    console.log(`   ${label.padEnd(22)} ${r.rows[0].count}`);
  }

  console.log('\n✅ Seeding complete!\n');
  console.log('🔑 All users: Password123!');
  console.log('📧 New users added:');
  newUsers.forEach(u => console.log(`   ${u.email} — ${u.name}`));

  pool.end();
}

main().catch(e => { console.error('❌ Error:', e.message); pool.end(); });
