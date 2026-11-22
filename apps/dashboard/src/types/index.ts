export type Platform = 'GOOGLE_MEET' | 'MICROSOFT_TEAMS' | 'ZOOM' | 'UNKNOWN';

export type MeetingStatus =
  | 'CREATED'
  | 'CONSENT_REQUIRED'
  | 'READY'
  | 'RECORDING'
  | 'STOPPING'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'ANALYSIS_PENDING'
  | 'ANALYSIS_COMPLETED'
  | 'ERROR'
  | 'DELETION_PENDING'
  | 'DELETED';

export interface Participant {
  id: string;
  speakerKey: string;
  displayName: string;
}

export interface TranscriptSegment {
  id: string;
  meetingId: string;
  speakerKey: string;
  speakerName: string;
  text: string;
  startMs: number;
  endMs: number;
  isFinal: boolean;
  confidence?: number;
}

export interface Decision {
  decision: string;
  reason?: string;
  evidenceSegmentIds: string[];
}

export interface ActionItem {
  id: string;
  task: string;
  assignee: string | null;
  deadline: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
  evidenceSegmentIds: string[];
}

export interface MeetingSummary {
  overview: string;
  keyPoints: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  openQuestions: string[];
}

export interface Meeting {
  id: string;
  title: string;
  platform: Platform;
  meetingUrl: string;
  status: MeetingStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  participants: Participant[];
  summary?: MeetingSummary;
}
