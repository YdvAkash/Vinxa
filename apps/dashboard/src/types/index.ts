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
  title?: string;
  assignee: string | null;
  deadline: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
  evidenceSegmentIds: string[];
}

export interface MeetingSummary {
  suggestedTitle?: string | null;
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
  participants?: Participant[];
  participantCount?: number;
  segmentCount?: number;
  actionItemCount?: number;
  decisionCount?: number;
  summary?: MeetingSummary;
  shareToken?: string | null;
  publicShared?: boolean;
}

export interface PublicSharedMeetingData {
  meeting: Meeting;
  sharedBy: string;
  summary: MeetingSummary | null;
  actionItems: ActionItem[];
  transcript: TranscriptSegment[];
}

export interface CopilotCitation {
  meetingId: string;
  meetingTitle: string;
  meetingDate?: string;
  segmentId?: string | null;
  speaker: string;
  quote: string;
}

export interface CopilotAskResponse {
  answer: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  meetingsAnalyzed: number;
  segmentsAnalyzed: number;
  citations: CopilotCitation[];
  suggestedFollowUps: string[];
}

export interface CopilotChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface SearchResultItem {
  segmentId: string;
  meetingId: string;
  meetingTitle: string;
  content: string;
  startMs: number;
}

export interface VinxaSettings {
  defaultSpokenLanguage: string;
  defaultTranslationLanguage: string;
  tabAudioEnabled: boolean;
  micAudioEnabled: boolean;
  autoPurgeDays: number;
  autoScrollLive: boolean;
  onScreenCaptionsEnabled: boolean;
  webhookUrl: string;
  webhookSecret?: string;
  webhookAutoPush: boolean;
}

export interface WebhookDispatchResult {
  success: boolean;
  statusCode: number;
  responseMessage: string;
  webhookUrl: string;
  payloadSent: Record<string, any>;
}
