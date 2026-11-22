# Vinxa Live — Solo Development Roadmap for Google Antigravity

**Product:** Vinxa Live — AI Meeting Intelligence  
**Development mode:** Solo developer with Google Antigravity  
**Target platforms:** Google Meet, Microsoft Teams web, Zoom web in Chrome  
**Approach:** Incremental vertical slices, modular monolith first  
**Primary objective:** A reliable end-to-end browser meeting assistant, not a large collection of unfinished features.

---

# 1. How to approach the project solo

Do not build all services and all platform integrations at once. Build one working vertical slice at a time:

1. A dashboard that runs.
2. A backend that stores meetings.
3. An extension that detects a meeting.
4. A consent and recording workflow.
5. Audio capture.
6. Audio streaming.
7. Live transcription.
8. Speaker diarization.
9. AI meeting notes.
10. Search, export, deletion, and cross-platform hardening.

At the end of every phase, the application must still run. Commit a working checkpoint before moving forward.

## Recommended solo architecture

Start with fewer moving parts than the team architecture.

| Layer | Technology | Initial responsibility |
|---|---|---|
| Browser extension | TypeScript, Chrome Manifest V3 | Platform detection, user controls, capture |
| Dashboard | React, Vite, TypeScript, Tailwind | Meeting UI, transcript, history |
| Backend | Spring Boot 3, Java 21 | Auth, meeting lifecycle, persistence, APIs |
| Realtime | Spring WebSocket | Audio frames and meeting events |
| Speech-to-text | Deepgram streaming | Live transcript and diarization |
| AI analysis | Claude API | Summary, decisions, tasks |
| Database | PostgreSQL | Persistent data |
| Local infrastructure | Docker Compose | PostgreSQL and optional Redis |
| Audio processing | Browser AudioWorklet | Frame processing and PCM conversion |

### Why not start with FastAPI too?

A separate Python audio service may eventually be useful, but it creates another runtime, deployment, authentication boundary, and debugging surface. First prove that the browser can capture audio and that Spring Boot can relay the stream to the STT provider.

Extract a dedicated audio service only if Java WebSocket handling or provider integration becomes a genuine blocker. Do not add infrastructure merely because it appears in a diagram.

### Important platform scope

The initial product supports meetings running in Chrome browser tabs. It does not capture standalone Zoom or Teams desktop applications.

Build one common tab-audio pipeline and small platform adapters for:
- Google Meet web
- Microsoft Teams web
- Zoom web

Platform detection is not proof that a meeting is active. Require user action and a valid capture context.

---

# 2. Solo project phase map

| Phase | Name | Main outcome |
|---|---|---|
| 0 | Product and repository setup | Clean project foundation |
| 1 | Dashboard foundation | Usable web application |
| 2 | Backend and database | Meetings persist through APIs |
| 3 | Chrome extension foundation | Extension detects supported platforms |
| 4 | Consent and recording controls | Safe user-initiated capture flow |
| 5 | Audio capture and local playback | Browser audio captured reliably |
| 6 | WebSocket streaming | Audio reaches backend |
| 7 | Live STT and diarization | Live speaker-labelled transcript |
| 8 | AI meeting intelligence | Summary, decisions, action items |
| 9 | History, search, export, deletion | Complete meeting lifecycle |
| 10 | Teams/Zoom hardening and release | Three-platform browser MVP |

A realistic solo schedule is approximately 3–5 focused weeks depending on experience, API access, platform quirks, and how much UI polish is required. Do not compress the schedule by skipping testing.

---

# 3. Repository structure

Use a monorepo, but keep the initial layout lean.

```text
vinxa-live/
├── apps/
│   ├── dashboard/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   ├── meetings/
│   │   │   │   ├── transcript/
│   │   │   │   └── ui/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── types/
│   │   │   └── main.tsx
│   │   └── package.json
│   │
│   └── extension/
│       ├── public/
│       │   ├── manifest.json
│       │   └── icons/
│       ├── src/
│       │   ├── background/
│       │   ├── content/
│       │   ├── popup/
│       │   ├── offscreen/
│       │   ├── adapters/
│       │   ├── audio/
│       │   ├── messaging/
│       │   └── shared/
│       └── package.json
│
├── backend/
│   ├── src/main/java/com/vinxa/live/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── meeting/
│   │   ├── participant/
│   │   ├── transcript/
│   │   ├── realtime/
│   │   ├── ai/
│   │   ├── search/
│   │   ├── export/
│   │   ├── deletion/
│   │   └── config/
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   └── db/migration/
│   └── pom.xml
│
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── API_CONTRACT.md
│   ├── DATA_MODEL.md
│   └── TEST_PLAN.md
│
├── infrastructure/
│   └── compose.yaml
├── .env.example
├── .gitignore
└── README.md
```

Do not ask Antigravity to create every file at the start. Create only the folders and files needed for the current phase.

---

# 4. How to use Antigravity effectively

Antigravity should work as a coding agent, but you remain the technical lead.

## Rules for every task

1. Give it one phase or one small feature at a time.
2. Ask it to inspect the existing repository before editing.
3. Ask it to propose a plan and list files it will change.
4. Approve the plan before broad changes.
5. Require tests and a short explanation of changes.
6. Run the application yourself.
7. Review the diff before accepting it.
8. Commit a working checkpoint.
9. Never paste real API keys into prompts or source files.
10. Do not let the agent rewrite unrelated working modules.

## Reusable Antigravity instruction

Use this at the start of each phase:

> You are the senior engineer helping me build Vinxa Live. This is an existing project, so inspect the repository and current implementation before changing anything. Follow the current architecture and coding conventions. Do not rewrite working modules or add unnecessary dependencies. First give me an implementation plan, the files you intend to create/change, assumptions, and test plan. Wait for my approval before making broad changes. Implement in small steps, run relevant tests/builds, fix errors, and summarize exactly what changed and how I can verify it. Never hardcode secrets. Do not claim a feature works unless it has been tested.

## Context files to maintain

Keep these files updated and ask Antigravity to read them before implementation:

- `docs/PRODUCT.md`: user journey, MVP scope, non-goals.
- `docs/ARCHITECTURE.md`: components and data flow.
- `docs/API_CONTRACT.md`: REST and WebSocket messages.
- `docs/DATA_MODEL.md`: tables and relationships.
- `docs/TEST_PLAN.md`: manual and automated checks.

These files reduce architectural drift between sessions.

---

# 5. Phase-by-phase implementation

## Phase 0 — Product definition and repository setup

**Goal:** Establish a stable foundation and freeze the MVP.

### Tasks

- Create GitHub repository `vinxa-live`.
- Create the monorepo folders.
- Initialize dashboard with React + Vite + TypeScript.
- Initialize backend with Spring Boot 3 and Java 21.
- Add Docker Compose for PostgreSQL.
- Add `.env.example` and `.gitignore`.
- Write product scope and architecture docs.
- Create a GitHub issue for every phase.
- Make the first baseline commit.

### Antigravity prompt

> Start Phase 0 of Vinxa Live. Inspect the current workspace. Create a minimal monorepo for a React + Vite + TypeScript dashboard, a Spring Boot 3 + Java 21 backend, and Docker Compose with PostgreSQL. Do not implement business features yet. Add a clear README, `.env.example`, `.gitignore`, and initial docs for product scope and architecture. Keep the setup minimal. Run the frontend build, backend tests, and Docker/database health check if available. Report exact commands to run the project.

### Acceptance criteria

- Dashboard starts locally.
- Spring Boot starts locally.
- PostgreSQL starts through Docker Compose.
- Backend health endpoint responds.
- No secrets are committed.
- README contains setup instructions.

**Checkpoint:** `phase-0-foundation`

---

## Phase 1 — Dashboard foundation

**Goal:** Create the visual shell before adding real-time complexity.

### Screens

1. Login/register (can be a temporary development screen initially).
2. Dashboard overview.
3. Meeting history.
4. Live meeting page.
5. Meeting details page.
6. Settings/privacy page.

### UI components

- Sidebar navigation.
- Meeting cards.
- Platform badge.
- Recording status.
- Transcript panel.
- Speaker label.
- Summary panel.
- Decisions list.
- Action-item list.
- Search input.
- Export and delete controls.

Use mock data initially. Do not connect the STT provider yet.

### Antigravity prompt

> Implement Phase 1: the Vinxa Live dashboard UI in the existing React + Vite + TypeScript app. Create a polished, responsive enterprise meeting-intelligence dashboard with pages for overview, meeting history, live meeting, meeting details, and settings. Use local mock data only. Build reusable components for transcript segments, speaker labels, meeting status, summaries, decisions, and action items. Do not add backend calls or audio features in this phase. Keep the UI accessible and consistent. Run the production build and report changed files.

### Acceptance criteria

- All screens render.
- Responsive layout works.
- Mock transcript can be displayed.
- UI has loading, empty, and error states.
- No backend dependency.

**Checkpoint:** `phase-1-dashboard`

---

## Phase 2 — Backend, authentication and database

**Goal:** Persist users and meetings through a stable REST API.

### Implement

- User registration/login.
- Password hashing using a secure standard.
- Authenticated user endpoint.
- Meeting create/list/get/update.
- Meeting lifecycle states.
- PostgreSQL migrations using Flyway.
- Ownership checks on all meeting endpoints.

### Initial meeting states

```text
CREATED
CONSENT_REQUIRED
READY
RECORDING
STOPPING
FINALIZING
COMPLETED
ANALYSIS_PENDING
ANALYSIS_COMPLETED
ERROR
DELETION_PENDING
DELETED
```

Do not permit arbitrary state changes. Implement and test valid transitions.

### Initial REST endpoints

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auth/me

POST   /api/v1/meetings
GET    /api/v1/meetings
GET    /api/v1/meetings/{id}
PATCH  /api/v1/meetings/{id}
```

### Antigravity prompt

> Implement Phase 2 in the existing Spring Boot backend. Add Flyway migrations for users and meetings, secure password hashing, authentication, and meeting CRUD APIs. Enforce ownership so a user cannot read or modify another user's meeting. Implement explicit meeting state transitions instead of allowing arbitrary status updates. Add validation, consistent error responses, and integration tests. Do not implement WebSockets or AI yet. Update `docs/API_CONTRACT.md` and `docs/DATA_MODEL.md`.

### Acceptance criteria

- User can register and log in.
- Authenticated user can create and list meetings.
- User can retrieve their own meeting.
- Cross-user access is denied.
- Database survives backend restart.
- API tests pass.

**Checkpoint:** `phase-2-backend`

---

## Phase 3 — Chrome extension foundation

**Goal:** Build an installable extension that detects supported meeting tabs.

### Implement

- Manifest V3.
- Service worker.
- Popup UI.
- Platform adapter interface.
- URL detection for Meet, Teams web, Zoom web.
- Message passing between popup, content script, and service worker.
- Link from extension to dashboard.

### Platform detection

Use hostname/URL checks as the first signal. Do not scrape private platform internals.

### Antigravity prompt

> Implement Phase 3: a Chrome Manifest V3 extension in `apps/extension`. Add TypeScript build configuration, service worker, popup, content-script entry points, and a platform-adapter interface. Detect Google Meet, Microsoft Teams web, and Zoom web using supported URL/hostname patterns. Show the detected platform and a clear unsupported state. Do not capture audio yet. Do not use brittle DOM selectors or request unnecessary permissions. Provide exact instructions to build and load the unpacked extension in Chrome.

### Acceptance criteria

- Extension loads without errors.
- Meet URL is detected.
- Teams web URL is detected.
- Zoom web URL is detected.
- Unsupported sites are rejected.
- Popup and service worker messaging work.

**Checkpoint:** `phase-3-extension`

---

## Phase 4 — Consent and recording controls

**Goal:** Make capture explicitly user-initiated and visibly active.

### Implement

- Start meeting assistant action.
- Pre-capture explanation.
- Participant notice workflow.
- Consent/authorization state.
- Persistent extension recording indicator.
- Stop control.
- Clear state transitions.
- No automatic recording on page load.

A notice shown by Vinxa is not proof that every participant has legally consented. Follow platform rules and applicable law. If required authorization is not established, do not start capture.

### Antigravity prompt

> Implement Phase 4: the consent and recording-control workflow in the Chrome extension. The user must explicitly click Start. Show what will be captured, why, and how to stop. Add a participant-notice step and record the workflow state in the backend. Keep a persistent visible recording indicator while capture is active and an immediate Stop action. Never auto-start capture based on meeting detection. Do not claim that the organizer's click proves all participants consented. Add tests for valid and invalid state transitions.

### Acceptance criteria

- Meeting detection does not start capture.
- User sees explanation before starting.
- Start requires explicit user action.
- Recording indicator is visible while active.
- Stop works from extension UI.
- Backend records consent workflow events.
- No capture occurs if required authorization is missing.

**Checkpoint:** `phase-4-consent`

---

## Phase 5 — Tab audio capture

**Goal:** Capture browser meeting-tab audio and keep it audible to the user.

### Implement

- `chrome.tabCapture` invoked after user action.
- Offscreen document.
- Stream ID handoff from service worker.
- MediaStream handling.
- AudioContext and AudioWorklet setup.
- Audio playback preservation.
- Stream cleanup on stop, tab close, or error.

### Important

Tab audio and local microphone are different sources. Do not assume tab capture includes the user's microphone. Add microphone capture only as a separate permission-controlled feature, preferably after remote tab audio works.

### Antigravity prompt

> Implement Phase 5: user-initiated Chrome tab audio capture using Manifest V3 `chrome.tabCapture` and an offscreen document. Follow the current Chrome-supported stream-ID handoff pattern. Keep the captured tab audio audible to the user. Add start/stop cleanup, stream-ended handling, and visible errors. Do not send audio to an external provider yet. Add a local debug mode that confirms audio frames are being received without saving raw audio. Verify permissions against current Chrome documentation.

### Acceptance criteria

- User can start capture from extension.
- Audio frames are received locally.
- Meeting audio remains audible.
- Stop releases media tracks and audio contexts.
- Tab close stops capture.
- Permission errors are handled visibly.
- No silent capture.

**Checkpoint:** `phase-5-audio-capture`

---

## Phase 6 — Secure WebSocket audio streaming

**Goal:** Send captured audio to the backend.

### Implement

- Spring WebSocket endpoint.
- One-time short-lived stream ticket.
- Ticket bound to user and meeting.
- Binary audio frames.
- Start/stop control messages.
- Sequence numbers.
- Bounded buffering and backpressure.
- Connection status and reconnect strategy.

### Initial audio format

Choose a format accepted by the selected STT streaming endpoint. A practical initial target may be mono PCM16 at 16 kHz, but verify the provider's current requirements. Correctly resample; do not assume setting an AudioContext sample rate guarantees the input format.

### Suggested protocol

Start control message:

```json
{
  "type": "START_SESSION",
  "meetingId": "meeting-uuid",
  "sequence": 0,
  "sampleRate": 16000,
  "channels": 1,
  "encoding": "linear16"
}
```

Then send binary frames with a documented framing/timing strategy. Avoid base64-encoding every audio frame.

### Antigravity prompt

> Implement Phase 6: secure audio streaming from the extension to Spring Boot WebSocket. First define and document the wire protocol. Add a short-lived, single-use stream ticket bound to the authenticated user and meeting. Validate the ticket before accepting binary audio. Add sequence numbers, bounded queues, backpressure, start/stop messages, and clear connection errors. Initially receive audio and count/inspect frames only; do not connect Deepgram yet. Add integration tests and update the API contract.

### Acceptance criteria

- Extension connects with a valid ticket.
- Invalid/expired/reused tickets are rejected.
- Binary frames reach the backend.
- Frame sequence and byte counts are tracked.
- Stop closes the session cleanly.
- No unbounded audio buffering.
- Audio frames and tokens are not logged.

**Checkpoint:** `phase-6-audio-streaming`

---

## Phase 7 — Live transcription and speaker diarization

**Goal:** Show live speaker-labelled text in the dashboard.

### Implement

- Deepgram streaming connection on the server.
- Audio forwarding.
- Interim and final transcript handling.
- Provider event normalization.
- Stable speaker mapping.
- Transcript persistence.
- Dashboard WebSocket events.
- Provider failure and reconnect handling.

Keep Deepgram API keys on the server only.

### Event contract

```json
{
  "type": "TRANSCRIPT",
  "meetingId": "meeting-uuid",
  "segmentId": "segment-uuid",
  "speakerId": "speaker-1",
  "text": "Let's finalize the architecture.",
  "startMs": 12000,
  "endMs": 15300,
  "isFinal": true,
  "confidence": 0.96
}
```

Interim events update the UI but should not be stored as final segments. Persist finalized segments idempotently.

Diarization identifies voice turns; it does not verify a participant's real-world identity. Mixed audio, overlap, echo, and similar voices can reduce accuracy.

### Antigravity prompt

> Implement Phase 7: connect the server-side audio WebSocket stream to Deepgram streaming transcription with diarization. Keep the API key server-side. Normalize interim/final transcript events into a provider-independent event model. Map provider speaker indexes to stable meeting-scoped IDs such as speaker-1 and speaker-2. Persist final transcript segments idempotently and broadcast updates to authorized dashboard clients. Add tests with mocked provider events and a manual real-audio test plan. Do not claim speaker labels are verified identities.

### Acceptance criteria

- Real meeting speech appears in dashboard.
- Interim transcript updates without duplication.
- Final segments persist once.
- Speaker labels remain stable during the session.
- Timestamps are retained.
- Provider errors appear in UI.
- Stop flushes final transcript.

**Checkpoint:** `phase-7-live-transcription`

---

## Phase 8 — AI meeting intelligence

**Goal:** Generate useful notes after a meeting stops.

### Output

- Overview/summary.
- Key points.
- Confirmed decisions.
- Action items.
- Assignees when explicitly supported.
- Deadlines when explicitly supported.
- Open questions.
- Evidence transcript segment IDs.

### Processing

1. Stop and finalize STT.
2. Verify transcript completion.
3. Create background analysis job.
4. Send transcript or timestamped chunks to Claude.
5. Validate JSON against a schema.
6. Persist analysis.
7. Notify dashboard.

Never invent a decision, deadline, owner, or commitment. Use `null` where unknown. Treat transcript text as untrusted data, not as instructions.

### Antigravity prompt

> Implement Phase 8: post-meeting AI analysis using the Claude API. Trigger analysis only after transcript finalization. Generate overview, key points, confirmed decisions, action items, and open questions. Require evidence segment IDs for decisions and action items. Unknown assignees/deadlines must be null; do not infer them. Validate the response against a strict JSON schema before saving. Run analysis asynchronously and expose analysis status to the dashboard. Keep API keys server-side and add mocked tests.

### Acceptance criteria

- Stop triggers analysis after transcript finalization.
- Analysis runs asynchronously.
- Summary and tasks are structured.
- Evidence segment IDs are present.
- Invalid JSON is rejected/retried safely.
- Dashboard shows pending, completed, and failed states.

**Checkpoint:** `phase-8-ai-intelligence`

---

## Phase 9 — Meeting history, search, export and deletion

**Goal:** Complete the user-facing meeting lifecycle.

### Implement

- Meeting history with pagination.
- Meeting details page.
- Transcript search.
- Search across user's own meetings only.
- Markdown export.
- PDF export.
- Speaker rename.
- Delete confirmation.
- Deletion job and verification.

### Search

Use PostgreSQL full-text search with a GIN index on transcript content. Scope all results to the authenticated user.

### Deletion

Deletion must cover:
- Meeting metadata.
- Transcript segments.
- Participants.
- Summary and action items.
- Optional stored audio and object versions.
- Redis session/cache data.
- Search indexes and derived artifacts.

Immediately block normal access when deletion starts. Keep only a minimal deletion audit record that does not retain deleted meeting content. Disclose backup retention limits; do not claim immediate physical erasure from immutable backups.

### Antigravity prompt

> Implement Phase 9: meeting history, PostgreSQL full-text search, Markdown/PDF export, speaker renaming, and deletion. Every query must be scoped to the authenticated user. Add pagination. Implement deletion as an explicit workflow: block access, stop sessions, remove database content and any configured object-storage data, clear cache/index data, verify operations, then mark complete. Handle failures and retries. Do not claim permanent deletion from backups unless the backup lifecycle actually supports it. Add integration tests.

### Acceptance criteria

- User sees only their meetings.
- Search returns relevant transcript matches.
- Search cannot leak another user's data.
- Markdown export is valid.
- PDF export is readable.
- Delete removes meeting from normal access immediately.
- Deletion job verifies all configured data stores.
- Backup retention is documented honestly.

**Checkpoint:** `phase-9-meeting-management`

---

## Phase 10 — Teams and Zoom support, hardening and release

**Goal:** Verify the shared pipeline on all three browser meeting platforms.

### Test matrix

| Platform | Detection | Tab audio | Transcript | Diarization | Stop/finalize |
|---|---|---|---|---|---|
| Google Meet web | Test | Test | Test | Test | Test |
| Teams web | Test | Test | Test | Test | Test |
| Zoom web | Test | Test | Test | Test | Test |

Do not mark a platform supported just because URL detection works. Complete a real end-to-end test on that platform.

### Hardening

- Re-test Chrome permissions.
- Handle tab navigation and tab close.
- Handle browser service-worker suspension/restart.
- Handle network loss and reconnect.
- Handle STT provider limits/errors.
- Validate all authorization boundaries.
- Review logs for secrets and transcript leakage.
- Test deletion.
- Measure transcription latency.
- Create a demo account and consented test meeting.
- Prepare a clearly labelled backup demo recording.

### Antigravity prompt

> Implement Phase 10: harden and verify Vinxa Live for Google Meet web, Microsoft Teams web, and Zoom web in Chrome. Do not add native desktop capture. Create a platform test matrix and run or document actual end-to-end tests for each platform. Fix capture lifecycle, tab navigation, reconnect, provider errors, authorization, and deletion issues. Add deployment instructions and a demo checklist. Do not claim a platform works unless the complete capture-to-transcript flow has been tested.

### Acceptance criteria

- End-to-end test passes on each claimed browser platform.
- No silent recording.
- Stop reliably ends capture.
- No API secrets in extension.
- User data isolation passes.
- Deletion workflow passes.
- Production build succeeds.
- Demo can be repeated reliably.

**Checkpoint:** `phase-10-release-candidate`

---

# 6. Recommended daily development loop

Use this loop for every phase:

1. Read the phase requirements.
2. Ask Antigravity to inspect the current code.
3. Request a short implementation plan.
4. Approve a small implementation step.
5. Let Antigravity edit the relevant files.
6. Run build/tests.
7. Manually test the feature.
8. Ask Antigravity to fix specific errors.
9. Review the Git diff.
10. Commit a working checkpoint.
11. Update the project docs.

Do not ask Antigravity to “finish the whole project” in one prompt. Large one-shot changes make failures difficult to isolate.

---

# 7. First five prompts to use

Use these prompts in order. Do not skip ahead if the previous phase is broken.

### Prompt 1 — Foundation

> Start Phase 0 from `docs` and the current repository. Set up the minimal monorepo and local development environment. Explain each command and verify all builds.

### Prompt 2 — Dashboard

> Start Phase 1. Build only the frontend dashboard using mock data. Do not implement backend or audio functionality.

### Prompt 3 — Backend

> Start Phase 2. Implement authentication, meeting CRUD, database migrations, validation, ownership checks, and tests. Do not implement WebSockets yet.

### Prompt 4 — Extension

> Start Phase 3. Build a loadable Chrome Manifest V3 extension with platform detection for Google Meet, Teams web, and Zoom web. Do not capture audio yet.

### Prompt 5 — Consent and capture

> Start Phase 4 only after Phase 3 passes. Add explicit user initiation, participant notice workflow, persistent recording state, and stop control. Then proceed to Phase 5 only after the consent state machine is tested.

---

# 8. Development priorities if time becomes limited

If you fall behind, prioritize in this order:

1. Google Meet browser capture.
2. Reliable live transcription.
3. Speaker diarization.
4. AI summary and action items.
5. Meeting persistence.
6. Search and export.
7. Deletion workflow.
8. Teams and Zoom browser compatibility.
9. UI polish.

However, do not remove consent, visible recording status, authorization, or deletion safeguards to save time. If a platform integration is not reliable, clearly state that it is not yet supported rather than presenting a fake demo.

---

# 9. Final Definition of Done

- [ ] Dashboard runs.
- [ ] Backend runs.
- [ ] PostgreSQL migrations run.
- [ ] Chrome extension loads.
- [ ] Google Meet, Teams web, and Zoom web are detected.
- [ ] Capture requires explicit user action.
- [ ] Participant notice/authorization workflow is implemented.
- [ ] Recording indicator is persistent.
- [ ] Tab audio capture works.
- [ ] Optional microphone capture works with separate permission.
- [ ] Audio streams securely.
- [ ] Live transcription works.
- [ ] Speaker labels work.
- [ ] Final transcript persists.
- [ ] AI summary works.
- [ ] Decisions and action items have evidence.
- [ ] Meeting history works.
- [ ] Keyword search works.
- [ ] Markdown export works.
- [ ] PDF export works.
- [ ] Deletion workflow is verified.
- [ ] Each claimed platform passes a real end-to-end test.
- [ ] Demo and backup are ready.

---

# 10. Final Advice

Build Vinxa Live as a sequence of working products, not as one giant coding task.

**Your first milestone is not an AI summary. It is this:**

> Open a Google Meet meeting in Chrome, explicitly start Vinxa, capture the meeting audio, stream it securely, and see the spoken words appear in the dashboard.

Once that works, add diarization. Then add AI intelligence. Then add history, search, export, deletion, and the other browser platforms.

**Vinxa Live — Turn every meeting into clear outcomes.**
