-- HaemoLink Pricing & Payment Migration
-- Run: psql -d haemolink -f backend/src/config/migration_pricing.sql

-- ENUMs
DO $$ BEGIN
  CREATE TYPE hospital_tier AS ENUM ('government', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_type AS ENUM ('pending', 'paid', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Per-institution pricing table
CREATE TABLE IF NOT EXISTS institution_pricing (
  pricing_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id   UUID NOT NULL REFERENCES institution(institution_id) ON DELETE CASCADE,
  component_type   component_type NOT NULL,
  hospital_tier    hospital_tier NOT NULL,
  unit_price       DECIMAL(10,2) NOT NULL,
  nat_charge       DECIMAL(10,2) NOT NULL DEFAULT 0,
  nat_includes_gst BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, component_type, hospital_tier)
);

-- Add payment columns to transfer table (idempotent)
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS unit_price            DECIMAL(10,2);
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS nat_charge            DECIMAL(10,2);
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS subtotal              DECIMAL(10,2);
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS tax_amount            DECIMAL(10,2);
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS total_amount          DECIMAL(10,2);
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS payment_status        payment_status_type DEFAULT 'pending';
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS payment_confirmed_at  TIMESTAMP;
ALTER TABLE transfer ADD COLUMN IF NOT EXISTS payment_confirmed_by  UUID REFERENCES "user"(user_id);

-- Seed default Indian reference rates for all existing blood bank institutions
INSERT INTO institution_pricing
  (institution_id, component_type, hospital_tier, unit_price, nat_charge, nat_includes_gst)
SELECT i.institution_id, c.component_type, c.hospital_tier, c.unit_price, c.nat_charge, c.nat_includes_gst
FROM institution i
CROSS JOIN (VALUES
  ('whole_blood'::component_type, 'government'::hospital_tier, 1100.00, 960.00, true),
  ('whole_blood'::component_type, 'private'::hospital_tier,    1550.00, 960.00, true),
  ('rbc'::component_type,         'government'::hospital_tier, 1100.00, 960.00, true),
  ('rbc'::component_type,         'private'::hospital_tier,    1550.00, 960.00, true),
  ('plasma'::component_type,      'government'::hospital_tier,  300.00,  75.00, false),
  ('plasma'::component_type,      'private'::hospital_tier,     400.00,  75.00, false),
  ('platelets'::component_type,   'government'::hospital_tier,  300.00, 100.00, false),
  ('platelets'::component_type,   'private'::hospital_tier,     400.00, 100.00, false)
) AS c(component_type, hospital_tier, unit_price, nat_charge, nat_includes_gst)
WHERE i.sub_type IN ('blood_bank', 'both')
ON CONFLICT (institution_id, component_type, hospital_tier) DO NOTHING;
