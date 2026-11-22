# Vinxa Live — Data Model

```text
users (1) ---> (N) meetings (1) ---> (N) participants
                            (1) ---> (N) transcript_segments
                            (1) ---> (1) meeting_summaries
                            (1) ---> (N) action_items
                            (1) ---> (N) consent_events
```

## Schema Definitions
- `users`: `id` (UUID), `email` (unique), `password_hash`, `created_at`
- `meetings`: `id` (UUID), `user_id` (FK), `title`, `platform` (GOOGLE_MEET, MICROSOFT_TEAMS, ZOOM), `meeting_url`, `status`, `started_at`, `ended_at`, `created_at`, `deleted_at`
- `participants`: `id` (UUID), `meeting_id` (FK), `speaker_key` (speaker-1, speaker-2), `display_name`, `created_at`
- `transcript_segments`: `id` (UUID), `meeting_id` (FK), `participant_id` (FK), `provider_segment_key`, `content`, `start_ms`, `end_ms`, `confidence`, `is_final`, `search_vector`, `created_at`
- `meeting_summaries`: `id` (UUID), `meeting_id` (FK unique), `summary` (JSONB / TEXT), `generated_at`
- `action_items`: `id` (UUID), `meeting_id` (FK), `title`, `assignee`, `deadline`, `priority`, `status`, `evidence_segment_ids`, `created_at`
- `consent_events`: `id` (UUID), `meeting_id` (FK), `event_type`, `participant_reference`, `details`, `created_at`
