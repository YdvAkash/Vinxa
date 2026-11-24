-- Vinxa Live V2 Migration: Webhooks, Public Sharing & Performance Indexes

ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_auto_push BOOLEAN DEFAULT FALSE;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS public_shared BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meetings_share_token ON meetings(share_token);
CREATE INDEX IF NOT EXISTS idx_meetings_user_status ON meetings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting_created ON action_items(meeting_id, created_at);
