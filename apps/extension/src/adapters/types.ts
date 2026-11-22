export type MeetingPlatform = 'GOOGLE_MEET' | 'MICROSOFT_TEAMS' | 'ZOOM' | 'UNKNOWN';

export interface DetectedMeeting {
  platform: MeetingPlatform;
  url: string;
  tabId: number;
  title: string;
}

export type ExtensionRecordingState =
  | 'IDLE'
  | 'PLATFORM_DETECTED'
  | 'CONSENT_REQUIRED'
  | 'READY'
  | 'STARTING'
  | 'RECORDING'
  | 'STOPPING'
  | 'COMPLETED'
  | 'ERROR';
