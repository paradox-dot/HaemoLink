
-- 0. Drop existing tables (reverse dependency order)
DROP TABLE IF EXISTS transfer_state_transition CASCADE;
DROP TABLE IF EXISTS transfer CASCADE;
DROP TABLE IF EXISTS match CASCADE;
DROP TABLE IF EXISTS demand_state_transition CASCADE;
DROP TABLE IF EXISTS demand_request CASCADE;
DROP TABLE IF EXISTS inv_ownership_history CASCADE;
DROP TABLE IF EXISTS inv_state_transition CASCADE;
DROP TABLE IF EXISTS blood_inventory CASCADE;
DROP TABLE IF EXISTS notification CASCADE;
DROP TABLE IF EXISTS external_integration CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS role CASCADE;
DROP TABLE IF EXISTS institution CASCADE;

-- Drop existing enum types
DROP TYPE IF EXISTS institution_type CASCADE;
DROP TYPE IF EXISTS institution_sub_type CASCADE;
DROP TYPE IF EXISTS institution_status CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;
DROP TYPE IF EXISTS inventory_status CASCADE;
DROP TYPE IF EXISTS expiry_category CASCADE;
DROP TYPE IF EXISTS unit_type CASCADE;
DROP TYPE IF EXISTS component_type CASCADE;
DROP TYPE IF EXISTS demand_status CASCADE;
DROP TYPE IF EXISTS urgency_level CASCADE;
DROP TYPE IF EXISTS demand_type CASCADE;
DROP TYPE IF EXISTS match_status CASCADE;
DROP TYPE IF EXISTS transfer_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS notification_status CASCADE;
DROP TYPE IF EXISTS integration_system_type CASCADE;
DROP TYPE IF EXISTS integration_mode CASCADE;
DROP TYPE IF EXISTS integration_conn_status CASCADE;

-- Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

CREATE TYPE institution_type        AS ENUM ('government', 'private', 'trust', 'ngo');
CREATE TYPE institution_sub_type    AS ENUM ('blood_bank', 'hospital', 'both');
CREATE TYPE institution_status      AS ENUM ('pending', 'verified', 'suspended', 'rejected');

CREATE TYPE user_status             AS ENUM ('active', 'inactive', 'suspended');

CREATE TYPE session_status          AS ENUM ('active', 'expired', 'logged_out');

CREATE TYPE inventory_status        AS ENUM ('created', 'available', 'reserved', 'in_transfer', 'consumed', 'expired', 'discarded');
CREATE TYPE expiry_category         AS ENUM ('safe', 'warning', 'critical');
CREATE TYPE unit_type               AS ENUM ('units', 'ml');
CREATE TYPE component_type          AS ENUM ('whole_blood', 'platelets', 'plasma', 'rbc');

CREATE TYPE demand_status           AS ENUM ('draft', 'active', 'under_matching', 'partial', 'fulfilled', 'cancelled', 'expired');
CREATE TYPE urgency_level           AS ENUM ('routine', 'urgent', 'emergency');
CREATE TYPE demand_type             AS ENUM ('hard', 'soft');

CREATE TYPE match_status            AS ENUM ('proposed', 'accepted', 'fulfilled', 'rejected', 'expired', 'superseded');

CREATE TYPE transfer_status         AS ENUM ('initiated', 'pending_approval', 'approved', 'dispatched', 'in_transit', 'received', 'completed', 'cancelled', 'failed');

CREATE TYPE notification_type       AS ENUM ('approval_pending', 'expiry_alert', 'transfer_update', 'match_found', 'sla_breach');
CREATE TYPE notification_status     AS ENUM ('unread', 'read', 'dismissed');

CREATE TYPE integration_system_type AS ENUM ('HIS', 'BBMS', 'eRaktKosh', 'logistics');
CREATE TYPE integration_mode        AS ENUM ('api_realtime', 'batch', 'manual');
CREATE TYPE integration_conn_status AS ENUM ('active', 'inactive', 'error');


-- ============================================================
-- 2. AUTH & USER MANAGEMENT
-- ============================================================

-- INSTITUTION
CREATE TABLE institution (
    institution_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255)            NOT NULL,
    type            institution_type        NOT NULL,
    sub_type        institution_sub_type    NOT NULL,
    city            VARCHAR(100)            NOT NULL,
    license_number  VARCHAR(100)            NOT NULL,
    contact_email   VARCHAR(255),
    contact_phone   VARCHAR(50),
    license_document VARCHAR(500),
    registered_by   UUID,
    status          institution_status      NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP               NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institution_status ON institution(status);
CREATE INDEX idx_institution_city   ON institution(city);

-- ROLE
CREATE TABLE role (
    role_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name   VARCHAR(100)    NOT NULL UNIQUE,
    permissions JSONB           NOT NULL,
    description TEXT
);

-- USER
CREATE TABLE "user" (
    user_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID            NOT NULL REFERENCES institution(institution_id),
    role_id         UUID            NOT NULL REFERENCES role(role_id),
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    phone           VARCHAR(20),
    password_hash   VARCHAR(255)    NOT NULL,
    status          user_status     NOT NULL DEFAULT 'active',
    last_login      TIMESTAMP
);

CREATE INDEX idx_user_institution ON "user"(institution_id);
CREATE INDEX idx_user_status      ON "user"(status);

-- SESSION
CREATE TABLE session (
    session_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID            NOT NULL REFERENCES "user"(user_id),
    login_time  TIMESTAMP       NOT NULL DEFAULT NOW(),
    logout_time TIMESTAMP,
    status      session_status  NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_session_user_status ON session(user_id, status);

-- AUDIT_LOG
CREATE TABLE audit_log (
    log_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID            NOT NULL REFERENCES "user"(user_id),
    action_type VARCHAR(100)    NOT NULL,
    entity_type VARCHAR(100)    NOT NULL,
    entity_id   UUID            NOT NULL,
    details     JSONB           NOT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_time ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity    ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_time      ON audit_log(created_at);


-- ============================================================
-- 3. BLOOD INVENTORY
-- ============================================================

-- BLOOD_INVENTORY
CREATE TABLE blood_inventory (
    inventory_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id      UUID                NOT NULL REFERENCES institution(institution_id),
    parent_inventory_id UUID                REFERENCES blood_inventory(inventory_id),
    created_by          UUID                NOT NULL REFERENCES "user"(user_id),
    blood_group         VARCHAR(4)          NOT NULL,
    component_type      component_type      NOT NULL,
    quantity            DECIMAL(8,2)        NOT NULL,
    unit_type           unit_type           NOT NULL DEFAULT 'units',
    collection_date     DATE                NOT NULL,
    expiry_date         TIMESTAMP           NOT NULL,
    status              inventory_status    NOT NULL DEFAULT 'created',
    expiry_category     expiry_category     NOT NULL DEFAULT 'safe',
    is_network_visible  BOOLEAN             NOT NULL DEFAULT false,
    created_at          TIMESTAMP           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_inst_status ON blood_inventory(institution_id, status);
CREATE INDEX idx_inv_matching    ON blood_inventory(blood_group, component_type, status);
CREATE INDEX idx_inv_expiry      ON blood_inventory(expiry_date);
CREATE INDEX idx_inv_network     ON blood_inventory(expiry_category, is_network_visible);
CREATE INDEX idx_inv_parent      ON blood_inventory(parent_inventory_id);

-- INV_STATE_TRANSITION
CREATE TABLE inv_state_transition (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id UUID                NOT NULL REFERENCES blood_inventory(inventory_id),
    changed_by   UUID                NOT NULL REFERENCES "user"(user_id),
    from_state   inventory_status    NOT NULL,
    to_state     inventory_status    NOT NULL,
    reason       VARCHAR(500),
    created_at   TIMESTAMP           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_trans_history ON inv_state_transition(inventory_id, created_at DESC);
CREATE INDEX idx_inv_trans_actor   ON inv_state_transition(changed_by);

-- INV_OWNERSHIP_HISTORY
CREATE TABLE inv_ownership_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id    UUID        NOT NULL REFERENCES blood_inventory(inventory_id),
    institution_id  UUID        NOT NULL REFERENCES institution(institution_id),
    from_date       TIMESTAMP   NOT NULL,
    to_date         TIMESTAMP
);

CREATE INDEX idx_own_current     ON inv_ownership_history(inventory_id, to_date);
CREATE INDEX idx_own_institution ON inv_ownership_history(institution_id);
CREATE UNIQUE INDEX idx_own_unique_current ON inv_ownership_history(inventory_id) WHERE to_date IS NULL;


-- ============================================================
-- 4. DEMAND & REQUESTS
-- ============================================================

-- DEMAND_REQUEST
CREATE TABLE demand_request (
    request_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID                NOT NULL REFERENCES institution(institution_id),
    created_by      UUID                NOT NULL REFERENCES "user"(user_id),
    blood_group     VARCHAR(4)          NOT NULL,
    component_type  component_type      NOT NULL,
    qty_needed      DECIMAL(8,2)        NOT NULL,
    qty_fulfilled   DECIMAL(8,2)        NOT NULL DEFAULT 0,
    urgency_level   urgency_level       NOT NULL,
    demand_type     demand_type         NOT NULL DEFAULT 'hard',
    procedure_type  VARCHAR(200),
    required_by     TIMESTAMP           NOT NULL,
    status          demand_status       NOT NULL DEFAULT 'draft',
    priority_score  DECIMAL(5,2)        NOT NULL DEFAULT 0,
    created_at      TIMESTAMP           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demand_inst_status ON demand_request(institution_id, status);
CREATE INDEX idx_demand_queue       ON demand_request(status, priority_score DESC);
CREATE INDEX idx_demand_matching    ON demand_request(blood_group, component_type, status);
CREATE INDEX idx_demand_expiry      ON demand_request(required_by);

-- DEMAND_STATE_TRANSITION
CREATE TABLE demand_state_transition (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id  UUID            NOT NULL REFERENCES demand_request(request_id),
    changed_by  UUID            NOT NULL REFERENCES "user"(user_id),
    from_state  demand_status   NOT NULL,
    to_state    demand_status   NOT NULL,
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demand_trans_history ON demand_state_transition(request_id, created_at DESC);


-- ============================================================
-- 5. MATCHING ENGINE
-- ============================================================

CREATE TABLE match (
    match_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id        UUID            NOT NULL REFERENCES blood_inventory(inventory_id),
    request_id          UUID            NOT NULL REFERENCES demand_request(request_id),
    decided_by          UUID            REFERENCES "user"(user_id),
    match_score         DECIMAL(5,2)    NOT NULL,
    compatibility_score DECIMAL(5,2)    NOT NULL,
    distance_score      DECIMAL(5,2)    NOT NULL,
    expiry_score        DECIMAL(5,2)    NOT NULL,
    urgency_score       DECIMAL(5,2)    NOT NULL,
    proposed_qty        DECIMAL(8,2)    NOT NULL,
    status              match_status    NOT NULL DEFAULT 'proposed',
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW(),
    decided_at          TIMESTAMP
);

CREATE INDEX idx_match_inventory ON match(inventory_id, status);
CREATE INDEX idx_match_request   ON match(request_id, status, match_score DESC);
CREATE INDEX idx_match_proposed  ON match(status) WHERE status = 'proposed';


-- ============================================================
-- 6. TRANSFER MANAGEMENT
-- ============================================================

-- TRANSFER
CREATE TABLE transfer (
    transfer_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id             UUID            NOT NULL REFERENCES match(match_id),
    inventory_id         UUID            NOT NULL REFERENCES blood_inventory(inventory_id),
    request_id           UUID            NOT NULL REFERENCES demand_request(request_id),
    source_inst_id       UUID            NOT NULL REFERENCES institution(institution_id),
    dest_inst_id         UUID            NOT NULL REFERENCES institution(institution_id),
    supplier_approved_by UUID            REFERENCES "user"(user_id),
    receiver_approved_by UUID            REFERENCES "user"(user_id),
    planned_qty          DECIMAL(8,2)    NOT NULL,
    dispatched_qty       DECIMAL(8,2),
    received_qty         DECIMAL(8,2),
    status               transfer_status NOT NULL DEFAULT 'initiated',
    transport_mode       VARCHAR(100),
    expected_dispatch    TIMESTAMP       NOT NULL,
    actual_dispatch      TIMESTAMP,
    expected_delivery    TIMESTAMP       NOT NULL,
    actual_delivery      TIMESTAMP,
    created_at           TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_match     ON transfer(match_id);
CREATE INDEX idx_transfer_inventory ON transfer(inventory_id);
CREATE INDEX idx_transfer_request   ON transfer(request_id);
CREATE INDEX idx_transfer_source    ON transfer(source_inst_id, status);
CREATE INDEX idx_transfer_dest      ON transfer(dest_inst_id, status);
CREATE INDEX idx_transfer_sla       ON transfer(expected_delivery);

-- TRANSFER_STATE_TRANSITION
CREATE TABLE transfer_state_transition (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID            NOT NULL REFERENCES transfer(transfer_id),
    changed_by  UUID            NOT NULL REFERENCES "user"(user_id),
    from_state  transfer_status NOT NULL,
    to_state    transfer_status NOT NULL,
    reason      VARCHAR(500),
    created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transfer_trans_history ON transfer_state_transition(transfer_id, created_at DESC);


-- ============================================================
-- 7. SYSTEM & INTEGRATION
-- ============================================================

-- NOTIFICATION
CREATE TABLE notification (
    notification_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID                NOT NULL REFERENCES "user"(user_id),
    type                notification_type   NOT NULL,
    message             TEXT                NOT NULL,
    related_entity_type VARCHAR(100)        NOT NULL,
    related_entity_id   UUID                NOT NULL,
    status              notification_status NOT NULL DEFAULT 'unread',
    created_at          TIMESTAMP           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_status ON notification(user_id, status);
CREATE INDEX idx_notif_entity      ON notification(related_entity_type, related_entity_id);

-- EXTERNAL_INTEGRATION
CREATE TABLE external_integration (
    integration_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID                    NOT NULL REFERENCES institution(institution_id),
    system_type     integration_system_type NOT NULL,
    mode            integration_mode        NOT NULL,
    conn_status     integration_conn_status NOT NULL DEFAULT 'inactive',
    last_sync_at    TIMESTAMP
);

CREATE INDEX idx_integration_inst   ON external_integration(institution_id);
CREATE INDEX idx_integration_status ON external_integration(conn_status);


-- ============================================================
-- 8. SEED DATA
-- ============================================================

-- 5 Roles
INSERT INTO role (role_id, role_name, permissions, description) VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'System Admin',
    '{"institutions": ["read", "write", "verify"], "users": ["read", "write"], "reports": ["read"], "system": ["read", "write"]}',
    'Full platform access. Verifies institutions, manages system settings.'
),
(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Institutional Admin',
    '{"users": ["read", "write"], "reports": ["read"], "settings": ["read", "write"]}',
    'Manages users within their institution. Views reports and configures settings.'
),
(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Blood Bank Ops Manager',
    '{"inventory": ["read", "write"], "transfers": ["send"], "reports": ["read"], "match": ["read"]}',
    'Uploads inventory, monitors expiry, accepts match recommendations, dispatches transfers.'
),
(
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Transfusion Officer',
    '{"demand": ["read", "write"], "transfers": ["receive"], "match": ["read", "accept", "reject"], "inventory": ["read"]}',
    'Creates demand requests, accepts incoming transfers, confirms receipt of blood units.'
),
(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'Hospital Administrator',
    '{"reports": ["read"], "analytics": ["read"]}',
    'Read-only dashboards, reports, wastage analytics. No operational actions.'
);

-- 2 Sample institutions (verified for dev/testing)
INSERT INTO institution (institution_id, name, type, sub_type, city, license_number, status) VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'City Blood Bank',
    'government',
    'blood_bank',
    'Mumbai',
    'MH-BB-2024-001',
    'verified'
),
(
    '22222222-2222-2222-2222-222222222222',
    'Lilavati Hospital',
    'private',
    'hospital',
    'Mumbai',
    'MH-HOSP-2024-042',
    'verified'
);

-- 4 Sample users (password: Password123! for all)
INSERT INTO "user" (user_id, institution_id, role_id, name, email, phone, password_hash, status) VALUES
(
    'aaaaaaaa-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Rajesh Patel',
    'rajesh@citybloodbank.org',
    '+919876543210',
    '$2b$10$/SpNn/j3rlb1adSR2QYyV.uyLbOXdxXydyVXMNu.t3s7YuqbUk4a.',
    'active'
),
(
    'bbbbbbbb-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Dr. Ritu Sharma',
    'ritu@lilavati.org',
    '+919876543211',
    '$2b$10$/SpNn/j3rlb1adSR2QYyV.uyLbOXdxXydyVXMNu.t3s7YuqbUk4a.',
    'active'
),
(
    'cccccccc-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Admin User',
    'admin@citybloodbank.org',
    '+919876543212',
    '$2b$10$/SpNn/j3rlb1adSR2QYyV.uyLbOXdxXydyVXMNu.t3s7YuqbUk4a.',
    'active'
),
(
    'dddddddd-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Arka Bandyopadhyay',
    'arka.bandyopadhyay@iitb.ac.in',
    '+919999999999',
    '$2b$10$/SpNn/j3rlb1adSR2QYyV.uyLbOXdxXydyVXMNu.t3s7YuqbUk4a.',
    'active'
);


