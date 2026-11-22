import { Meeting, TranscriptSegment } from '../types';

export const mockMeetings: Meeting[] = [
  {
    id: 'm-101',
    title: 'Vinxa Architecture & Core Pipeline Review',
    platform: 'GOOGLE_MEET',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    status: 'ANALYSIS_COMPLETED',
    startedAt: '2026-11-22T14:00:00Z',
    endedAt: '2026-11-22T14:45:00Z',
    createdAt: '2026-11-22T13:55:00Z',
    participants: [
      { id: 'p-1', speakerKey: 'speaker-1', displayName: 'Alex (Tech Lead)' },
      { id: 'p-2', speakerKey: 'speaker-2', displayName: 'Priya (Backend Eng)' },
      { id: 'p-3', speakerKey: 'speaker-3', displayName: 'David (Frontend Eng)' }
    ],
    summary: {
      overview: 'The team reviewed the Vinxa Live technical implementation blueprint, confirmed Spring Boot 3 modular monolith architecture, and finalized Chrome Manifest V3 tab audio capture approach.',
      keyPoints: [
        'Single Spring Boot 3 + Java 21 backend chosen for simplicity and low latency.',
        'Chrome Manifest V3 tabCapture with offscreen document preserves audible audio.',
        'Deepgram streaming with streaming diarization normalized into meeting-scoped speaker turns.',
        'Structured LLM output with mandatory evidence segment IDs avoids hallucinated decisions.'
      ],
      decisions: [
        {
          decision: 'Use Spring Boot 3 modular monolith instead of microservice split.',
          reason: 'Minimizes deployment friction, auth handoffs, and debugging surface during hackathon.',
          evidenceSegmentIds: ['seg-102']
        },
        {
          decision: 'Strict consent workflow with persistent recording banner in Chrome.',
          reason: 'Regulatory compliance and user trust require transparent audio capture notice.',
          evidenceSegmentIds: ['seg-105']
        }
      ],
      actionItems: [
        {
          id: 'act-1',
          task: 'Implement AudioWorklet PCM16 @ 16kHz resampling processor',
          assignee: 'David (Frontend Eng)',
          deadline: '2026-11-25T18:00:00Z',
          priority: 'HIGH',
          status: 'IN_PROGRESS',
          evidenceSegmentIds: ['seg-103']
        },
        {
          id: 'act-2',
          task: 'Setup Flyway migrations with GIN full-text search index',
          assignee: 'Priya (Backend Eng)',
          deadline: '2026-11-26T12:00:00Z',
          priority: 'MEDIUM',
          status: 'OPEN',
          evidenceSegmentIds: ['seg-104']
        }
      ],
      openQuestions: [
        'Should we retain raw encrypted audio if user opts in, or discard immediately after finalization?'
      ]
    }
  },
  {
    id: 'm-102',
    title: 'Product Design & Multi-Platform Validation',
    platform: 'MICROSOFT_TEAMS',
    meetingUrl: 'https://teams.microsoft.com/l/meetup-join/123456789',
    status: 'RECORDING',
    startedAt: '2026-11-22T18:30:00Z',
    endedAt: null,
    createdAt: '2026-11-22T18:25:00Z',
    participants: [
      { id: 'p-1', speakerKey: 'speaker-1', displayName: 'Alex (Tech Lead)' },
      { id: 'p-4', speakerKey: 'speaker-2', displayName: 'Sarah (Design)' }
    ]
  },
  {
    id: 'm-103',
    title: 'Weekly Standup & Demo Readiness Sync',
    platform: 'ZOOM',
    meetingUrl: 'https://zoom.us/j/987654321',
    status: 'COMPLETED',
    startedAt: '2026-11-21T10:00:00Z',
    endedAt: '2026-11-21T10:25:00Z',
    createdAt: '2026-11-21T09:50:00Z',
    participants: [
      { id: 'p-1', speakerKey: 'speaker-1', displayName: 'Alex (Tech Lead)' },
      { id: 'p-2', speakerKey: 'speaker-2', displayName: 'Priya (Backend Eng)' }
    ]
  }
];

export const mockTranscript: TranscriptSegment[] = [
  {
    id: 'seg-101',
    meetingId: 'm-101',
    speakerKey: 'speaker-1',
    speakerName: 'Alex (Tech Lead)',
    text: "Welcome everyone. Today we're reviewing the end-to-end architecture for Vinxa Live.",
    startMs: 1200,
    endMs: 4500,
    isFinal: true,
    confidence: 0.98
  },
  {
    id: 'seg-102',
    meetingId: 'm-101',
    speakerKey: 'speaker-2',
    speakerName: 'Priya (Backend Eng)',
    text: "Regarding backend services, I recommend keeping it as a modular monolith in Spring Boot 3. It will give us high throughput for WebSockets and simpler auth checks.",
    startMs: 5100,
    endMs: 11800,
    isFinal: true,
    confidence: 0.96
  },
  {
    id: 'seg-103',
    meetingId: 'm-101',
    speakerKey: 'speaker-3',
    speakerName: 'David (Frontend Eng)',
    text: "Agreed. On the Chrome extension side, I will implement the AudioWorklet to resample the captured tab audio to 16kHz PCM linear16 before streaming.",
    startMs: 12500,
    endMs: 19200,
    isFinal: true,
    confidence: 0.97
  },
  {
    id: 'seg-104',
    meetingId: 'm-101',
    speakerKey: 'speaker-2',
    speakerName: 'Priya (Backend Eng)',
    text: "I'll prepare the PostgreSQL database migration scripts with Flyway and configure a generated tsvector column for fast full-text keyword search.",
    startMs: 20100,
    endMs: 27400,
    isFinal: true,
    confidence: 0.95
  },
  {
    id: 'seg-105',
    meetingId: 'm-101',
    speakerKey: 'speaker-1',
    speakerName: 'Alex (Tech Lead)',
    text: "Let's also make sure our consent workflow is prominent. Capture must be explicit with a persistent visible recording indicator.",
    startMs: 28200,
    endMs: 34100,
    isFinal: true,
    confidence: 0.99
  }
];
