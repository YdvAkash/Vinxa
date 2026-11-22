# Vinxa Live — Test Plan

## 1. Automated Testing Layers
- **Backend Unit & Integration Tests**:
  - Auth registration & login (valid JWT generation and verification).
  - Meeting CRUD and strict state machine lifecycle transitions.
  - Cross-user tenant isolation (User B forbidden from accessing User A's data).
  - Stream ticket issuance, single-use validation, and expiration.
  - WebSocket binary audio ingestion and byte counter verification.
  - Full-text search and multi-resource deletion cascade.
- **Frontend Unit & Component Tests**:
  - Live transcript rendering with speaker turns.
  - Status badge states and action item checklists.
- **Extension Tests**:
  - URL matching logic for Meet, Teams web, Zoom web.
  - Consent workflow state transitions without auto-capture.

## 2. End-to-End Test Matrix
| Platform | Detection | Audio Capture | Live STT | Diarization | Summary & Tasks | Deletion |
|---|---|---|---|---|---|---|
| Google Meet | Verified | Verified | Verified | Verified | Verified | Verified |
| Teams Web | Verified | Verified | Verified | Verified | Verified | Verified |
| Zoom Web | Verified | Verified | Verified | Verified | Verified | Verified |
