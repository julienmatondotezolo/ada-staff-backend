-- ============================================================================
-- Migration 002: Notifications & Shift Response Tokens
-- AdaStaff API v3.0.0
-- Run in Supabase SQL Editor
-- ============================================================================

-- ─── Shift Response Tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shift_response_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  action VARCHAR(20), -- null until responded, then 'accepted' or 'declined'
  responded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_response_tokens_token ON shift_response_tokens(token);
CREATE INDEX IF NOT EXISTS idx_shift_response_tokens_shift_id ON shift_response_tokens(shift_id);

-- RLS for shift_response_tokens
ALTER TABLE shift_response_tokens ENABLE ROW LEVEL SECURITY;

-- Service role bypass (our backend uses service role key)
-- Public access via token is handled by the API, not direct DB access
CREATE POLICY "Service role full access on shift_response_tokens"
  ON shift_response_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── Notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  recipient_user_id UUID, -- manager who receives the notification
  type VARCHAR(50) NOT NULL, -- 'shift_accepted', 'shift_declined', 'shift_pending'
  title VARCHAR(255) NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}', -- { shift_id, employee_id, employee_name, date, etc. }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_restaurant_id ON notifications(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "Service role full access on notifications"
  ON notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);
