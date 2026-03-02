-- Add 'declined' to allowed shift statuses
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_status_check 
  CHECK (status IN ('draft', 'scheduled', 'confirmed', 'completed', 'cancelled', 'declined'));
