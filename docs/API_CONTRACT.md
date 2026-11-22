# Vinxa Live — API & WebSocket Contract

## REST Base URL
`/api/v1`

### Authentication
- `POST /api/v1/auth/register` - Create user account
- `POST /api/v1/auth/login` - Authenticate and receive JWT
- `GET /api/v1/auth/me` - Authenticated user identity

### Meetings
- `POST /api/v1/meetings` - Create new meeting session
- `GET /api/v1/meetings` - List authenticated user's meetings (paginated)
- `GET /api/v1/meetings/{id}` - Get meeting details & status
- `PATCH /api/v1/meetings/{id}` - Update title or status
- `POST /api/v1/meetings/{id}/consent` - Log participant notice & consent event
- `POST /api/v1/meetings/{id}/stream-ticket` - Generate short-lived (60s) single-use audio streaming ticket
- `POST /api/v1/meetings/{id}/stop` - Stop recording & trigger post-meeting analysis
- `GET /api/v1/meetings/{id}/transcript` - Fetch finalized transcript segments
- `GET /api/v1/meetings/{id}/summary` - Fetch AI summary, decisions, and tasks
- `PATCH /api/v1/meetings/{id}/participants/{participantId}` - Rename speaker label
- `DELETE /api/v1/meetings/{id}` - Trigger multi-resource deletion workflow

### Search & Export
- `GET /api/v1/search?q={query}` - Full-text search across user meetings & transcripts
- `GET /api/v1/meetings/{id}/export?format={md|pdf}` - Export structured meeting artifact

## WebSocket Streaming Protocol
- **Audio Stream**: `ws://localhost:8080/ws/audio`
  - Client connects with ticket query parameter: `?ticket=<single-use-ticket>`
  - Frame 1: JSON `{"type": "START_SESSION", "meetingId": "...", "sampleRate": 16000, "channels": 1, "encoding": "linear16"}`
  - Frames 2..N: Binary PCM16 audio chunks (100–250ms per frame)
  - Frame Final: JSON `{"type": "STOP_SESSION"}`
- **Meeting Live Events**: `ws://localhost:8080/ws/meetings/{id}/events`
  - Server broadcasts: `TRANSCRIPT_INTERIM`, `TRANSCRIPT` (final), `SPEAKER_DETECTED`, `SESSION_STOPPED`, `ANALYSIS_COMPLETED`.
