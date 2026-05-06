-- Migration: Create received_stock table
-- Run: psql -U postgres -d haemolink -f migration_received_stock.sql

CREATE TYPE received_stock_status AS ENUM ('available', 'used', 'expired', 'discarded');

CREATE TABLE received_stock (
    received_stock_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id       UUID NOT NULL REFERENCES transfer(transfer_id),
    inventory_id      UUID NOT NULL REFERENCES blood_inventory(inventory_id),
    source_inst_id    UUID NOT NULL REFERENCES institution(institution_id),
    dest_inst_id      UUID NOT NULL REFERENCES institution(institution_id),
    blood_group       VARCHAR(10)           NOT NULL,
    component_type    component_type        NOT NULL,
    quantity          DECIMAL(8,2)          NOT NULL,
    unit_type         unit_type             NOT NULL DEFAULT 'units',
    collection_date   DATE,
    expiry_date       TIMESTAMP             NOT NULL,
    expiry_category   expiry_category       NOT NULL DEFAULT 'safe',
    status            received_stock_status NOT NULL DEFAULT 'available',
    received_at       TIMESTAMP             NOT NULL DEFAULT NOW(),
    created_at        TIMESTAMP             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_received_stock_dest   ON received_stock(dest_inst_id);
CREATE INDEX idx_received_stock_status ON received_stock(status);
CREATE INDEX idx_received_stock_expiry ON received_stock(expiry_date);
