import { Meeting, TranscriptSegment, MeetingSummary, ActionItem } from '../types';

const API_BASE = 'http://localhost:8080/api/v1';

let authToken: string | null = localStorage.getItem('vinxa_token');

export async function getAuthToken(): Promise<string> {
  if (authToken) return authToken;

  // Auto-login or register demo account for instant access
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@vinxa.live', password: 'Password123!' })
    });

    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      localStorage.setItem('vinxa_token', data.token);
      return data.token;
    }

    // Register if login fails
    const regRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@vinxa.live', password: 'Password123!' })
    });

    if (regRes.ok) {
      const data = await regRes.json();
      authToken = data.token;
      localStorage.setItem('vinxa_token', data.token);
      return data.token;
    }
  } catch (e) {
    console.warn('Auth service check:', e);
  }

  return '';
}

async function authFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('Content-Type', 'application/json');

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res;
}

export const api = {
  async getMeetings(): Promise<Meeting[]> {
    const res = await authFetch('/meetings?size=50');
    const data = await res.json();
    return data.content || [];
  },

  async getMeeting(id: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${id}`);
    return res.json();
  },

  async createMeeting(title: string, platform: string, meetingUrl?: string): Promise<Meeting> {
    const res = await authFetch('/meetings', {
      method: 'POST',
      body: JSON.stringify({ title, platform, meetingUrl: meetingUrl || '' })
    });
    return res.json();
  },

  async stopMeeting(id: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${id}/stop`, {
      method: 'POST'
    });
    return res.json();
  },

  async deleteMeeting(id: string): Promise<void> {
    await authFetch(`/meetings/${id}`, {
      method: 'DELETE'
    });
  },

  async getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
    const res = await authFetch(`/meetings/${meetingId}/transcript`);
    return res.json();
  },

  async getSummary(meetingId: string): Promise<MeetingSummary | null> {
    try {
      const res = await authFetch(`/meetings/${meetingId}/summary`);
      if (res.status === 204) return null;
      const data = await res.json();
      if (data && data.summary) {
        return JSON.parse(data.summary);
      }
      return null;
    } catch {
      return null;
    }
  },

  async getActionItems(meetingId: string): Promise<ActionItem[]> {
    const res = await authFetch(`/meetings/${meetingId}/actions`);
    return res.json();
  },

  async search(query: string, meetingId?: string): Promise<any[]> {
    const params = new URLSearchParams({ q: query });
    if (meetingId) params.set('meetingId', meetingId);
    const res = await authFetch(`/search?${params.toString()}`);
    return res.json();
  }
};
