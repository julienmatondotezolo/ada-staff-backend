-- ============================================================
-- Migration: Create exclusive_opening_days table
-- Description: Exclusive opening days that override normal opening hours
-- ============================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS exclusive_opening_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure date_from <= date_to
  CONSTRAINT exclusive_opening_days_date_range_check CHECK (date_from <= date_to)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_exclusive_opening_days_restaurant_id ON exclusive_opening_days(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_exclusive_opening_days_date_from ON exclusive_opening_days(date_from);

-- 3. Row Level Security
ALTER TABLE exclusive_opening_days ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (bypasses RLS automatically),
-- and authenticated users access via restaurant membership
DO $$ BEGIN
  CREATE POLICY "Users can access exclusive opening days from their restaurants" ON exclusive_opening_days
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM user_restaurant_access
        WHERE restaurant_id = exclusive_opening_days.restaurant_id
        AND user_id = auth.uid()
        AND active = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
