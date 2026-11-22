-- Vinxa Live Initial Schema

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    meeting_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_meetings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL,
    speaker_key VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_participants_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    CONSTRAINT uq_participants_meeting_speaker UNIQUE(meeting_id, speaker_key)
);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL,
    participant_id UUID,
    provider_segment_key VARCHAR(100),
    content TEXT NOT NULL,
    start_ms BIGINT NOT NULL,
    end_ms BIGINT NOT NULL,
    confidence REAL,
    is_final BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_transcript_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    CONSTRAINT fk_transcript_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
    CONSTRAINT uq_transcript_provider_key UNIQUE(meeting_id, provider_segment_key)
);

CREATE TABLE IF NOT EXISTS meeting_summaries (
    id UUID PRIMARY KEY,
    meeting_id UUID UNIQUE NOT NULL,
    summary TEXT NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_summaries_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS action_items (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL,
    title TEXT NOT NULL,
    assignee VARCHAR(100),
    deadline TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    evidence_segment_ids TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_action_items_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consent_events (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    participant_reference TEXT,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consent_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meetings_user_created ON meetings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcript_meeting_time ON transcript_segments(meeting_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
