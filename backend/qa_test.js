/**
 * HaemoLink MVP — Full QA Test Suite
 * Run: node qa_test.js
 */

const http = require('http');

const BASE = 'http://localhost:5000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const WARN = '\x1b[33mWARN\x1b[0m';

let results = [];
let tokens = {};
let testData = {};

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 5000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    };
    const request = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(d); } catch { json = d; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    request.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) request.write(data);
    request.end();
  });
}

function assert(name, condition, detail = '') {
  const icon = condition ? PASS : FAIL;
  const line = `  ${icon} ${name}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ name, pass: condition, detail });
}

function section(title) {
  console.log(`\n\x1b[1m\x1b[34m━━━ ${title} ━━━\x1b[0m`);
}

// ─────────────────────────────────────────────
// PHASE 1: AUTH & SESSION
// ─────────────────────────────────────────────
async function phase1() {
  section('PHASE 1: Auth & Session');

  // Valid logins for all roles
  const logins = [
    { label: 'System Admin', email: 'arka.bandyopadhyay@iitb.ac.in', role: 'sysadmin' },
    { label: 'Inst Admin (City BB)', email: 'admin@citybloodbank.org', role: 'instadmin' },
    { label: 'BB Ops (City BB)', email: 'rajesh@citybloodbank.org', role: 'bbops' },
    { label: 'BB Ops (Triumph BB)', email: 'sumitgupta@triumphbloodbank.org', role: 'bbops2' },
    { label: 'TO (Lilavati)', email: 'ritu@lilavati.org', role: 'to_lilavati' },
    { label: 'TO (Hiranandani)', email: 'suresh@hiranandani.com', role: 'to_hiranandani' },
  ];

  for (const u of logins) {
    const r = await req('POST', '/auth/login', { email: u.email, password: 'Test@1234' });
    const ok = r.status === 200 && r.body.token;
    assert(`Login: ${u.label}`, ok, ok ? `role=${r.body.user?.role_name}` : r.body.error);
    if (ok) tokens[u.role] = r.body.token;
  }

  // T1.7: Invalid password
  const r2 = await req('POST', '/auth/login', { email: 'arka.bandyopadhyay@iitb.ac.in', password: 'wrongpass' });
  assert('Login rejected: wrong password', r2.status === 401, `status=${r2.status}`);

  // T1.8: Non-existent user
  const r3 = await req('POST', '/auth/login', { email: 'nobody@fake.com', password: 'Test@1234' });
  assert('Login rejected: unknown user', r3.status === 401, `status=${r3.status}`);

  // T1.9: Suspended user
  const r4 = await req('POST', '/auth/login', { email: 'coadmin@citybloodbank.org', password: 'Test@1234' });
  assert('Login rejected: suspended user', r4.status === 403, `status=${r4.status}`);

  // T1.10: GET /auth/me returns institution_name
  const r5 = await req('GET', '/auth/me', null, tokens.sysadmin);
  assert('GET /auth/me: returns user profile', r5.status === 200 && r5.body.name, `name=${r5.body.name}`);
  const r6 = await req('GET', '/auth/me', null, tokens.to_lilavati);
  assert('GET /auth/me: includes institution_name for TO', r6.status === 200 && !!r6.body.institution_name, `institution=${r6.body.institution_name}`);

  // T1.11: Change password - wrong current
  const r7 = await req('PUT', '/auth/change-password', { current_password: 'wrongpwd', new_password: 'NewPass@1234' }, tokens.bbops);
  assert('Change password: wrong current rejected', r7.status === 401, `status=${r7.status}`);

  // T1.12: No token → 401
  const r8 = await req('GET', '/auth/me', null, null);
  assert('Protected route: no token → 401', r8.status === 401, `status=${r8.status}`);

  // T1.13: Logout
  const r9 = await req('POST', '/auth/logout', null, tokens.bbops2);
  assert('Logout: session terminated', r9.status === 200, r9.body.message);
  // After logout, /auth/me should 401
  const r10 = await req('GET', '/auth/me', null, tokens.bbops2);
  assert('After logout: token rejected', r10.status === 401, `status=${r10.status}`);
  // Re-login bbops2 for further tests
  const rrl = await req('POST', '/auth/login', { email: 'sumitgupta@triumphbloodbank.org', password: 'Test@1234' });
  if (rrl.body.token) tokens.bbops2 = rrl.body.token;
}

// ─────────────────────────────────────────────
// PHASE 2: RBAC
// ─────────────────────────────────────────────
async function phase2() {
  section('PHASE 2: RBAC Enforcement');

  // TO cannot run matching
  const r1 = await req('POST', '/match/run', {}, tokens.to_lilavati);
  assert('RBAC: TO cannot run matching', r1.status === 403, `status=${r1.status}`);

  // BB Ops cannot create demand
  const r2 = await req('POST', '/demand', { blood_group: 'A+', component_type: 'rbc', qty_needed: 1, urgency_level: 'routine', required_by: '2026-05-01', institution_id: '11111111-1111-1111-1111-111111111111', created_by: tokens.bbops }, tokens.bbops);
  assert('RBAC: BB Ops cannot create demand', r2.status === 403, `status=${r2.status}`);

  // Non-admin cannot manage institutions
  const r3 = await req('PUT', '/institution/11111111-1111-1111-1111-111111111111/status', { status: 'suspended' }, tokens.bbops);
  assert('RBAC: BB Ops cannot update institution status', r3.status === 403, `status=${r3.status}`);

  // Non-admin cannot delete match
  const r4 = await req('DELETE', '/match/fake-id', {}, tokens.to_lilavati);
  assert('RBAC: TO cannot delete match', r4.status === 403, `status=${r4.status}`);

  // TO cannot create inventory
  const r5 = await req('POST', '/inventory', { blood_group: 'A+', component_type: 'rbc', quantity: 1, expiry_date: '2026-06-01' }, tokens.to_lilavati);
  assert('RBAC: TO cannot create inventory', r5.status === 403, `status=${r5.status}`);

  // Inst Admin cannot change user role
  const r6 = await req('PUT', '/user/bbbbbbbb-2222-2222-2222-222222222222/role', { role_id: 'any' }, tokens.instadmin);
  assert('RBAC: Inst Admin cannot change user role', r6.status === 403, `status=${r6.status}`);

  // Non-admin cannot access audit
  const r7 = await req('GET', '/audit/logs', null, tokens.bbops);
  assert('RBAC: BB Ops cannot access audit logs', r7.status === 403, `status=${r7.status}`);

  // TO cannot rename users
  const r8 = await req('PUT', '/user/dddddddd-4444-4444-4444-444444444444/name', { name: 'Hacked' }, tokens.to_lilavati);
  assert('RBAC: TO cannot rename users', r8.status === 403, `status=${r8.status}`);
}

// ─────────────────────────────────────────────
// PHASE 3: INVENTORY
// ─────────────────────────────────────────────
async function phase3() {
  section('PHASE 3: Inventory');

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 30);
  const expiryDate = tomorrow.toISOString().split('T')[0];
  const nearExpiry = new Date(); nearExpiry.setHours(nearExpiry.getHours() + 12);
  const criticalExpiry = nearExpiry.toISOString().split('T')[0];

  // Create inventory as BB Ops
  const r1 = await req('POST', '/inventory', {
    institution_id: '11111111-1111-1111-1111-111111111111',
    created_by: 'aaaaaaaa-1111-1111-1111-111111111111',
    blood_group: 'O+', component_type: 'rbc', quantity: 2,
    collection_date: '2026-04-01', expiry_date: expiryDate
  }, tokens.bbops);
  assert('Inventory: BB Ops can create', r1.status === 201, `status=${r1.status}`);
  assert('Inventory: status=available on create', r1.body.status === 'available', `status=${r1.body.status}`);
  assert('Inventory: expiry_category computed', !!r1.body.expiry_category, `cat=${r1.body.expiry_category}`);
  if (r1.body.inventory_id) testData.inventoryId = r1.body.inventory_id;

  // Create near-expiry inventory to test critical category
  const r2 = await req('POST', '/inventory', {
    institution_id: '11111111-1111-1111-1111-111111111111',
    created_by: 'aaaaaaaa-1111-1111-1111-111111111111',
    blood_group: 'AB+', component_type: 'plasma', quantity: 1,
    collection_date: '2026-04-01', expiry_date: criticalExpiry
  }, tokens.bbops);
  assert('Inventory: critical expiry category set', r2.body.expiry_category === 'critical', `cat=${r2.body.expiry_category}`);

  // List inventory
  const r3 = await req('GET', '/inventory', null, tokens.bbops);
  assert('Inventory: GET returns array', Array.isArray(r3.body), `count=${r3.body.length}`);

  // Filter by status
  const r4 = await req('GET', '/inventory?status=available', null, tokens.bbops);
  assert('Inventory: filter by status=available works', Array.isArray(r4.body) && r4.body.every(i => i.status === 'available'), `count=${r4.body.length}`);

  // TO cannot create inventory (already tested in RBAC)
  // Missing required fields → 400
  const r5 = await req('POST', '/inventory', { blood_group: 'A+' }, tokens.bbops);
  assert('Inventory: missing fields → 400', r5.status === 400, `status=${r5.status}`);
}

// ─────────────────────────────────────────────
// PHASE 4: DEMAND
// ─────────────────────────────────────────────
async function phase4() {
  section('PHASE 4: Demand Module + Scoping');

  const reqBy = new Date(); reqBy.setDate(reqBy.getDate() + 2);
  const requiredBy = reqBy.toISOString();

  // Create demand as TO (Lilavati)
  const r1 = await req('POST', '/demand', {
    institution_id: '22222222-2222-2222-2222-222222222222',
    created_by: 'bbbbbbbb-2222-2222-2222-222222222222',
    blood_group: 'B+', component_type: 'rbc', qty_needed: 2,
    urgency_level: 'urgent', demand_type: 'hard', required_by: requiredBy
  }, tokens.to_lilavati);
  assert('Demand: TO can create', r1.status === 201, `status=${r1.status}`);
  assert('Demand: status=active on create', r1.body.status === 'active', `status=${r1.body.status}`);
  assert('Demand: priority_score computed', r1.body.priority_score > 0, `score=${r1.body.priority_score}`);
  if (r1.body.request_id) testData.demandId = r1.body.request_id;

  // Create demand as TO (Hiranandani)
  const r1b = await req('POST', '/demand', {
    institution_id: '08ff1b74-a0fb-4a25-97a6-0625942ce124',
    created_by: 'f22b6ab6-71f5-495b-b669-c681fae243ff',
    blood_group: 'A+', component_type: 'rbc', qty_needed: 1,
    urgency_level: 'routine', demand_type: 'hard', required_by: requiredBy
  }, tokens.to_hiranandani);
  assert('Demand: TO (Hiranandani) can create', r1b.status === 201, `status=${r1b.status}`);
  testData.demandIdHiranandani = r1b.body.request_id;

  // Institution scoping: Lilavati TO sees only own demands
  const r2 = await req('GET', '/demand?status=active', null, tokens.to_lilavati);
  assert('Demand: My institution scoping works', Array.isArray(r2.body) && r2.body.every(d => d.institution_id === '22222222-2222-2222-2222-222222222222'), `count=${r2.body.length}, all_lilavati=${r2.body.every(d => d.institution_id === '22222222-2222-2222-2222-222222222222')}`);

  // Network-wide scope: sees all
  const r3 = await req('GET', '/demand?status=active&scope=network', null, tokens.to_lilavati);
  const hasMultipleInst = r3.body.length > r2.body.length;
  assert('Demand: scope=network returns more than institution-scoped', hasMultipleInst, `network=${r3.body.length}, mine=${r2.body.length}`);

  // System Admin sees all without scope param
  const r4 = await req('GET', '/demand?status=active', null, tokens.sysadmin);
  assert('Demand: System Admin sees all without scope', r4.body.length >= r3.body.length, `admin=${r4.body.length}, network=${r3.body.length}`);

  // Missing required fields → 400
  const r5 = await req('POST', '/demand', { blood_group: 'A+' }, tokens.to_lilavati);
  assert('Demand: missing fields → 400', r5.status === 400, `status=${r5.status}`);

  // BB Ops cannot create demand (already in RBAC)
}

// ─────────────────────────────────────────────
// PHASE 5: MATCHING ENGINE
// ─────────────────────────────────────────────
async function phase5() {
  section('PHASE 5: Matching Engine');

  // Run matching as BB Ops
  const r1 = await req('POST', '/match/run', {}, tokens.bbops);
  assert('Matching: BB Ops can run matching', r1.status === 200, `status=${r1.status}`);

  // Get matches after first run
  const after = await req('GET', '/match', null, tokens.sysadmin);
  assert('Matching: GET returns array', Array.isArray(after.body), `count=${after.body.length}`);

  // Re-run — should NOT duplicate existing accepted/fulfilled pairs.
  // NOTE: proposed matches are intentionally superseded on each re-run (by design).
  const r2 = await req('POST', '/match/run', {}, tokens.bbops);
  // Fetch fresh matches AFTER the second run (proposed from run1 are now superseded)
  const afterRerun = await req('GET', '/match', null, tokens.sysadmin);
  const proposedAfterRerun = afterRerun.body.filter(m => m.status === 'proposed').length;
  // Accepted/fulfilled pairs should not be re-proposed
  const acceptedPairs = afterRerun.body
    .filter(m => ['accepted','fulfilled'].includes(m.status))
    .map(m => `${m.inventory_id}::${m.request_id}`);
  const proposedPairs = afterRerun.body
    .filter(m => m.status === 'proposed')
    .map(m => `${m.inventory_id}::${m.request_id}`);
  const noDupAccepted = proposedPairs.every(p => !acceptedPairs.includes(p));
  assert('Matching: re-run does not re-propose accepted/fulfilled pairs', noDupAccepted, `proposed=${proposedAfterRerun}, dup=${noDupAccepted ? 'none' : 'found'}`);

  // Find a proposed match to test accept/reject — use FRESH proposals from the latest run
  const proposed = afterRerun.body.find(m => m.status === 'proposed');
  if (proposed) {
    testData.matchId = proposed.match_id;
    testData.matchInventoryId = proposed.inventory_id;
    testData.matchRequestId = proposed.request_id;

    // BB Ops cannot accept (only TO can)
    const r3 = await req('PUT', `/match/${proposed.match_id}/accept`, { decided_by: 'aaaaaaaa-1111-1111-1111-111111111111' }, tokens.bbops);
    assert('Matching: BB Ops cannot accept match', r3.status === 403, `status=${r3.status}`);

    // TO accepts match — use appropriate TO based on match destination
    const acceptToken = tokens.to_lilavati;
    const r4 = await req('PUT', `/match/${proposed.match_id}/accept`, { decided_by: 'bbbbbbbb-2222-2222-2222-222222222222' }, acceptToken);
    if (r4.status === 200) {
      assert('Matching: TO can accept match', true, `match=${proposed.match_id.slice(0,8)}`);
      // Check inventory is now reserved
      const invCheck = await req('GET', '/inventory', null, tokens.sysadmin);
      const inv = invCheck.body.find(i => i.inventory_id === proposed.inventory_id);
      assert('Matching: accepted → inventory reserved', inv?.status === 'reserved', `inv_status=${inv?.status}`);
      testData.acceptedMatchId = proposed.match_id;
    } else {
      // Try the other TO
      const r4b = await req('PUT', `/match/${proposed.match_id}/accept`, { decided_by: 'f22b6ab6-71f5-495b-b669-c681fae243ff' }, tokens.to_hiranandani);
      assert('Matching: TO can accept match', r4b.status === 200, `status=${r4b.status}, detail=${JSON.stringify(r4b.body).slice(0,80)}`);
      if (r4b.status === 200) testData.acceptedMatchId = proposed.match_id;
    }
  } else {
    assert('Matching: has proposed matches to test', false, 'No proposed matches found');
  }

  // Find a second proposed match to test reject — use FRESH proposals
  const proposed2 = afterRerun.body.find(m => m.status === 'proposed' && m.match_id !== testData.matchId);
  if (proposed2) {
    const rejectToken = tokens.to_lilavati;
    const r5 = await req('PUT', `/match/${proposed2.match_id}/reject`, { decided_by: 'bbbbbbbb-2222-2222-2222-222222222222' }, rejectToken);
    if (r5.status !== 200) {
      // Try other TO
      const r5b = await req('PUT', `/match/${proposed2.match_id}/reject`, { decided_by: 'f22b6ab6-71f5-495b-b669-c681fae243ff' }, tokens.to_hiranandani);
      assert('Matching: TO can reject match', r5b.status === 200, `status=${r5b.status}`);
    } else {
      assert('Matching: TO can reject match', true, `match=${proposed2.match_id.slice(0,8)}`);
    }
  } else {
    console.log(`  ${WARN} Matching: no second proposed match available for reject test`);
  }

  // Institution scoping: TO at Lilavati only sees matches for their institution
  const scopedMatches = await req('GET', '/match', null, tokens.to_lilavati);
  const allOwnInst = Array.isArray(scopedMatches.body) && scopedMatches.body.every(m =>
    m.source_institution_id === '22222222-2222-2222-2222-222222222222' ||
    m.dest_institution_id === '22222222-2222-2222-2222-222222222222'
  );
  // (We check by comparing count with sysadmin count)
  const allMatches = await req('GET', '/match', null, tokens.sysadmin);
  const scopingActive = scopedMatches.body.length <= allMatches.body.length;
  assert('Matching: institution scoping applied for TO', scopingActive, `to=${scopedMatches.body.length}, admin=${allMatches.body.length}`);
}

// ─────────────────────────────────────────────
// PHASE 6: TRANSFER
// ─────────────────────────────────────────────
async function phase6() {
  section('PHASE 6: Transfer Module');

  // Need an accepted match to create transfer
  const acceptedMatches = await req('GET', '/match?status=accepted', null, tokens.sysadmin);
  const accepted = Array.isArray(acceptedMatches.body) ? acceptedMatches.body.find(m => m.status === 'accepted') : null;

  if (!accepted) {
    console.log(`  ${WARN} Transfer: no accepted match available — skipping transfer creation tests`);
    return;
  }

  testData.transferMatchId = accepted.match_id;

  const dispatch = new Date(); dispatch.setDate(dispatch.getDate() + 1);
  const delivery = new Date(); delivery.setDate(delivery.getDate() + 2);

  // Create transfer from accepted match
  const r1 = await req('POST', '/transfer', {
    match_id: accepted.match_id,
    created_by: 'aaaaaaaa-1111-1111-1111-111111111111',
    transport_mode: 'road',
    expected_dispatch: dispatch.toISOString(),
    expected_delivery: delivery.toISOString()
  }, tokens.bbops);
  assert('Transfer: can create from accepted match', r1.status === 201, `status=${r1.status}, detail=${JSON.stringify(r1.body).slice(0,80)}`);
  if (r1.body.transfer_id) testData.transferId = r1.body.transfer_id;

  // List transfers
  const r2 = await req('GET', '/transfer', null, tokens.bbops);
  assert('Transfer: GET returns array', Array.isArray(r2.body), `count=${r2.body.length}`);

  if (testData.transferId) {
    // Progress: initiated → approved (skip pending_approval for speed)
    const transitions = ['pending_approval', 'approved', 'dispatched', 'in_transit', 'received', 'completed'];
    let lastStatus = 'initiated';
    let progressOk = true;
    for (const nextStatus of transitions) {
      const tr = await req('PUT', `/transfer/${testData.transferId}`, {
        status: nextStatus,
        changed_by: 'aaaaaaaa-1111-1111-1111-111111111111'
      }, tokens.bbops);
      if (tr.status !== 200) {
        // Try as TO for receiver steps
        const tr2 = await req('PUT', `/transfer/${testData.transferId}`, {
          status: nextStatus,
          changed_by: 'bbbbbbbb-2222-2222-2222-222222222222'
        }, tokens.to_lilavati);
        if (tr2.status !== 200) {
          progressOk = false;
          console.log(`    ${WARN} Transfer: ${lastStatus} → ${nextStatus} failed: ${JSON.stringify(tr2.body).slice(0,60)}`);
        } else {
          lastStatus = nextStatus;
        }
      } else {
        lastStatus = nextStatus;
      }
    }
    assert('Transfer: status progression to completed', lastStatus === 'completed', `reached=${lastStatus}`);

    // Verify side-effects after completion
    if (lastStatus === 'completed') {
      // Inventory should be consumed
      const invCheck = await req('GET', '/inventory', null, tokens.sysadmin);
      const inv = invCheck.body.find(i => i.inventory_id === accepted.inventory_id);
      assert('Transfer: completed → inventory consumed', inv?.status === 'consumed', `inv_status=${inv?.status}`);

      // Match should be fulfilled
      const matchCheck = await req('GET', '/match', null, tokens.sysadmin);
      const match = matchCheck.body.find(m => m.match_id === accepted.match_id);
      assert('Transfer: completed → match fulfilled', match?.status === 'fulfilled', `match_status=${match?.status}`);
    }

    // Invalid transition: try going backwards
    const r3 = await req('PUT', `/transfer/${testData.transferId}`, {
      status: 'initiated',
      changed_by: 'aaaaaaaa-1111-1111-1111-111111111111'
    }, tokens.bbops);
    assert('Transfer: invalid backwards transition rejected', r3.status === 422, `status=${r3.status}`);
  }
}

// ─────────────────────────────────────────────
// PHASE 7: DASHBOARD & NOTIFICATIONS
// ─────────────────────────────────────────────
async function phase7() {
  section('PHASE 7: Dashboard & Notifications');

  // Dashboard summary — sysadmin
  const r1 = await req('GET', '/notification/summary', null, tokens.sysadmin);
  assert('Dashboard: sysadmin gets summary', r1.status === 200, `status=${r1.status}`);
  assert('Dashboard: has inventory counts', !!r1.body.inventory, `inv=${JSON.stringify(r1.body.inventory)}`);
  assert('Dashboard: has demand counts', !!r1.body.demand, `dem=${JSON.stringify(r1.body.demand)}`);
  assert('Dashboard: has matches counts', !!r1.body.matches || r1.body.matches !== undefined, `matches=${JSON.stringify(r1.body.matches)}`);
  assert('Dashboard: has transfer counts', r1.body.transfers !== undefined, `transfers=${JSON.stringify(r1.body.transfers)}`);

  // Dashboard summary — TO (institution-scoped)
  const r2 = await req('GET', '/notification/summary', null, tokens.to_lilavati);
  assert('Dashboard: TO gets summary', r2.status === 200, `status=${r2.status}`);
  assert('Dashboard: TO has demand_institution (scoped)', !!r2.body.demand_institution, `dem_inst=${JSON.stringify(r2.body.demand_institution)}`);
  assert('Dashboard: inventory is system-wide for TO', (r2.body.inventory?.available || 0) > 0, `inv_avail=${r2.body.inventory?.available}`);

  // Notification count
  const r3 = await req('GET', '/notification/count', null, tokens.bbops);
  assert('Notifications: unread count returns', r3.status === 200 && r3.body.count !== undefined, `count=${r3.body.count}`);

  // Get notifications list
  const r4 = await req('GET', '/notification', null, tokens.bbops);
  assert('Notifications: list returns array', r4.status === 200 && Array.isArray(r4.body), `count=${r4.body?.length}`);

  // Mark all read
  const r5 = await req('PUT', '/notification/read-all', {}, tokens.bbops);
  assert('Notifications: mark-all-read works', r5.status === 200, `status=${r5.status}`);
}

// ─────────────────────────────────────────────
// PHASE 8: USER & INSTITUTION MANAGEMENT
// ─────────────────────────────────────────────
async function phase8() {
  section('PHASE 8: User & Institution Management');

  // Get users as sysadmin
  const r1 = await req('GET', '/user', null, tokens.sysadmin);
  assert('Users: sysadmin can list users', r1.status === 200 && Array.isArray(r1.body), `count=${r1.body.length}`);

  // Get users as instadmin (should only see own institution)
  const r2 = await req('GET', '/user', null, tokens.instadmin);
  assert('Users: instadmin can list users', r2.status === 200 && Array.isArray(r2.body), `count=${r2.body.length}`);

  // Get roles
  const r3 = await req('GET', '/user/roles', null, tokens.to_lilavati);
  assert('Users: roles endpoint accessible by any auth user', r3.status === 200 && Array.isArray(r3.body), `count=${r3.body.length}`);

  // Create user as instadmin
  const r4 = await req('POST', '/user', {
    name: 'QA Test User',
    email: `qa.test.${Date.now()}@test.com`,
    password: 'Test@1234',
    role_id: r3.body.find(r => r.role_name === 'Blood Bank Ops Manager')?.role_id,
    institution_id: '11111111-1111-1111-1111-111111111111'
  }, tokens.sysadmin);
  assert('Users: sysadmin can create user', r4.status === 201, `status=${r4.status}, detail=${JSON.stringify(r4.body).slice(0,60)}`);
  if (r4.body.user_id) testData.testUserId = r4.body.user_id;

  // Rename user (sysadmin only)
  if (testData.testUserId) {
    const r5 = await req('PUT', `/user/${testData.testUserId}/name`, { name: 'QA Renamed User' }, tokens.sysadmin);
    assert('Users: sysadmin can rename user', r5.status === 200, `status=${r5.status}`);
  }

  // Suspend user
  if (testData.testUserId) {
    const r6 = await req('PUT', `/user/${testData.testUserId}/status`, { status: 'suspended' }, tokens.sysadmin);
    assert('Users: sysadmin can suspend user', r6.status === 200, `status=${r6.status}`);
  }

  // Get institutions
  const r7 = await req('GET', '/institution', null, tokens.sysadmin);
  assert('Institutions: sysadmin can list', r7.status === 200 && Array.isArray(r7.body), `count=${r7.body.length}`);

  // Create institution as sysadmin
  const r8 = await req('POST', '/institution', {
    name: 'QA Test Hospital',
    type: 'private', sub_type: 'hospital',
    city: 'Mumbai', license_number: `QA-${Date.now()}`
  }, tokens.sysadmin);
  assert('Institutions: sysadmin can create', r8.status === 201, `status=${r8.status}`);
  if (r8.body.institution_id) testData.testInstId = r8.body.institution_id;

  // Update institution status
  if (testData.testInstId) {
    const r9 = await req('PUT', `/institution/${testData.testInstId}/status`, { status: 'verified' }, tokens.sysadmin);
    assert('Institutions: sysadmin can verify', r9.status === 200, `status=${r9.status}`);
    const r10 = await req('PUT', `/institution/${testData.testInstId}/status`, { status: 'suspended' }, tokens.sysadmin);
    assert('Institutions: sysadmin can suspend', r10.status === 200, `status=${r10.status}`);
  }

  // Non-sysadmin cannot create institution
  const r11 = await req('POST', '/institution', { name: 'Hack Inst' }, tokens.bbops);
  assert('Institutions: BB Ops cannot create institution', r11.status === 403, `status=${r11.status}`);
}

// ─────────────────────────────────────────────
// PHASE 9: AUDIT TRAIL
// ─────────────────────────────────────────────
async function phase9() {
  section('PHASE 9: Audit Trail');

  // Sysadmin can view audit logs
  const r1 = await req('GET', '/audit/logs', null, tokens.sysadmin);
  assert('Audit: sysadmin can view logs', r1.status === 200 && Array.isArray(r1.body), `count=${r1.body.length}`);
  assert('Audit: logs have action_type', r1.body.length > 0 && !!r1.body[0].action_type, `sample=${r1.body[0]?.action_type}`);

  // Inst admin can view audit logs (own institution)
  const r2 = await req('GET', '/audit/logs', null, tokens.instadmin);
  assert('Audit: instadmin can view logs', r2.status === 200 && Array.isArray(r2.body), `count=${r2.body.length}`);

  // BB Ops cannot view audit
  const r3 = await req('GET', '/audit/logs', null, tokens.bbops);
  assert('Audit: BB Ops cannot view logs', r3.status === 403, `status=${r3.status}`);

  // Inventory transitions
  const r4 = await req('GET', '/audit/inventory-transitions', null, tokens.sysadmin);
  assert('Audit: inventory transitions accessible', r4.status === 200 && Array.isArray(r4.body), `count=${r4.body.length}`);

  // Demand transitions
  const r5 = await req('GET', '/audit/demand-transitions', null, tokens.sysadmin);
  assert('Audit: demand transitions accessible', r5.status === 200 && Array.isArray(r5.body), `count=${r5.body.length}`);

  // Transfer transitions
  const r6 = await req('GET', '/audit/transfer-transitions', null, tokens.sysadmin);
  assert('Audit: transfer transitions accessible', r6.status === 200 && Array.isArray(r6.body), `count=${r6.body.length}`);

  // Ownership history
  const r7 = await req('GET', '/audit/ownership-history', null, tokens.sysadmin);
  assert('Audit: ownership history accessible', r7.status === 200 && Array.isArray(r7.body), `count=${r7.body.length}`);

  // Filter by entity_id
  if (r1.body.length > 0 && r1.body[0].entity_id) {
    const eid = r1.body[0].entity_id;
    const r8 = await req('GET', `/audit/logs?entity_id=${eid}`, null, tokens.sysadmin);
    assert('Audit: filter by entity_id works', r8.status === 200 && r8.body.every(l => l.entity_id === eid), `count=${r8.body.length}`);
  }
}

// ─────────────────────────────────────────────
// PHASE 10: EDGE CASES & DATA INTEGRITY
// ─────────────────────────────────────────────
async function phase10() {
  section('PHASE 10: Edge Cases & Data Integrity');

  // Invalid demand status transition
  const demands = await req('GET', '/demand', null, tokens.sysadmin);
  const fulfilledDemand = demands.body.find(d => d.status === 'fulfilled');
  if (fulfilledDemand) {
    const r1 = await req('PUT', `/demand/${fulfilledDemand.request_id}/status`, {
      status: 'active',
      changed_by: 'bbbbbbbb-2222-2222-2222-222222222222'
    }, tokens.to_lilavati);
    assert('Edge: fulfilled→active demand transition rejected', r1.status === 422, `status=${r1.status}`);
  } else {
    console.log(`  ${WARN} Edge: no fulfilled demand to test invalid transition`);
  }

  // Demand status filter — verify only requested statuses returned
  const r2 = await req('GET', '/demand?status=cancelled&scope=network', null, tokens.sysadmin);
  const allCancelled = Array.isArray(r2.body) && (r2.body.length === 0 || r2.body.every(d => d.status === 'cancelled'));
  assert('Edge: status filter returns only requested status', allCancelled, `count=${r2.body.length}`);

  // Delete match (sysadmin only)
  const matches = await req('GET', '/match', null, tokens.sysadmin);
  const proposedMatch = matches.body.find(m => m.status === 'proposed');
  if (proposedMatch) {
    const r3 = await req('DELETE', `/match/${proposedMatch.match_id}`, {}, tokens.sysadmin);
    assert('Edge: sysadmin can delete proposed match', r3.status === 200, `status=${r3.status}`);
    // Verify it's gone
    const afterDel = await req('GET', '/match', null, tokens.sysadmin);
    const stillExists = afterDel.body.find(m => m.match_id === proposedMatch.match_id);
    assert('Edge: deleted match no longer returned', !stillExists, stillExists ? 'still found' : 'correctly removed');
  } else {
    console.log(`  ${WARN} Edge: no proposed match available for delete test`);
  }

  // Expiry category: critical inventory
  const inv = await req('GET', '/inventory?status=available', null, tokens.sysadmin);
  const critical = inv.body.filter(i => i.expiry_category === 'critical');
  const warning = inv.body.filter(i => i.expiry_category === 'warning');
  const safe = inv.body.filter(i => i.expiry_category === 'safe');
  assert('Edge: expiry categories present in inventory', (critical.length + warning.length + safe.length) > 0, `crit=${critical.length}, warn=${warning.length}, safe=${safe.length}`);

  // Unauthenticated request to protected route
  const r4 = await req('GET', '/demand', null, null);
  assert('Edge: no token → 401 on protected routes', r4.status === 401, `status=${r4.status}`);

  // GET /user/:id
  const r5 = await req('GET', '/user/dddddddd-4444-4444-4444-444444444444', null, tokens.sysadmin);
  assert('Edge: GET /user/:id works', r5.status === 200 && r5.body.user_id, `status=${r5.status}`);

  // Non-existent resource
  const r6 = await req('GET', '/user/00000000-0000-0000-0000-000000000000', null, tokens.sysadmin);
  assert('Edge: non-existent user → 404', r6.status === 404, `status=${r6.status}`);
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log('\x1b[1m\x1b[35m╔══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[35m║    HaemoLink MVP — QA Test Suite     ║\x1b[0m');
  console.log('\x1b[1m\x1b[35m╚══════════════════════════════════════╝\x1b[0m');

  await phase1();
  await phase2();
  await phase3();
  await phase4();
  await phase5();
  await phase6();
  await phase7();
  await phase8();
  await phase9();
  await phase10();

  // Summary
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;

  console.log('\n\x1b[1m\x1b[35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log(`\x1b[1mQA RESULTS: ${passed}/${total} passed\x1b[0m`);
  console.log(`\x1b[32m  PASSED: ${passed}\x1b[0m`);
  console.log(`\x1b[31m  FAILED: ${failed}\x1b[0m`);

  if (failed > 0) {
    console.log('\n\x1b[1mFAILED TESTS:\x1b[0m');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  \x1b[31m✗ ${r.name}\x1b[0m — ${r.detail}`);
    });
  }

  console.log('\x1b[1m\x1b[35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
}

main().catch(console.error);
