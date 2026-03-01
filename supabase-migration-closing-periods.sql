-- ============================================================
-- Migration: Create closing_periods table
-- Description: Restaurant closing/vacation periods
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS closing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure date_from <= date_to
  CONSTRAINT closing_periods_date_range_check CHECK (date_from <= date_to)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_closing_periods_restaurant_id ON closing_periods(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_closing_periods_date_from ON closing_periods(date_from);

-- 3. Row Level Security
ALTER TABLE closing_periods ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (bypasses RLS automatically),
-- and authenticated users access via restaurant membership
DO $$ BEGIN
  CREATE POLICY "Users can access closing periods from their restaurants" ON closing_periods
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM user_restaurant_access
        WHERE restaurant_id = closing_periods.restaurant_id
        AND user_id = auth.uid()
        AND active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Seed data for L'Osteria
-- Replace the UUID below with the actual restaurant_id for L'Osteria
DO $$
DECLARE
  v_restaurant_id UUID;
BEGIN
  -- Try to find L'Osteria restaurant by name
  SELECT id INTO v_restaurant_id
  FROM restaurants
  WHERE name ILIKE '%osteria%'
  LIMIT 1;

  -- Fallback: if not found, skip seeding
  IF v_restaurant_id IS NULL THEN
    RAISE NOTICE 'Restaurant not found — skipping seed data. Insert manually with the correct restaurant_id.';
    RETURN;
  END IF;

  INSERT INTO closing_periods (restaurant_id, name, date_from, date_to)
  VALUES
    (v_restaurant_id, 'Verlof', '2026-03-08', '2026-03-19'),
    (v_restaurant_id, 'Verlof', '2026-06-22', '2026-06-28'),
    (v_restaurant_id, 'VERLOF', '2026-08-31', '2026-09-14')
  ON CONFLICT DO NOTHING;
END $$;
