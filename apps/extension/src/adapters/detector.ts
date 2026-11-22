import { MeetingPlatform } from './types';

export function detectPlatformFromUrl(urlString: string): MeetingPlatform {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'meet.google.com') {
      return 'GOOGLE_MEET';
    }

    if (hostname === 'teams.microsoft.com' || hostname.endsWith('.teams.microsoft.com')) {
      return 'MICROSOFT_TEAMS';
    }

    if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) {
      return 'ZOOM';
    }

    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}
