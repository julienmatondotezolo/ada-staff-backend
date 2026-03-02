-- Migration 003: Add notified_at to shifts for tracking notification state
-- Run in Supabase SQL Editor

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_shifts_notified_at ON shifts(notified_at);
