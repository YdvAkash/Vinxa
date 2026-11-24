import {
  Meeting,
  TranscriptSegment,
  MeetingSummary,
  ActionItem,
  CopilotAskResponse,
  CopilotChatTurn,
  AuthUser,
  SearchResultItem,
  VinxaSettings,
  WebhookDispatchResult,
  PublicSharedMeetingData
} from '../types';

const isLocalhost =
  typeof window === 'undefined' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const API_BASE = !isLocalhost
  ? `${window.location.origin}/api/v1`
  : (import.meta as any).env?.VITE_API_BASE_URL || 'http://api.vinxa.ogakash.xyz/api/v1';

let authToken: string | null = localStorage.getItem('vinxa_token');

export const DEFAULT_SETTINGS: VinxaSettings = {
  defaultSpokenLanguage: 'multi',
  defaultTranslationLanguage: 'ORIGINAL',
  tabAudioEnabled: true,
  micAudioEnabled: true,
  autoPurgeDays: 30,
  autoScrollLive: true,
  onScreenCaptionsEnabled: true,
  webhookUrl: `${API_BASE}/webhooks/test-receiver`,
  webhookSecret: '',
  webhookAutoPush: false
};

export function getStoredSettings(): VinxaSettings {
  try {
    const raw = localStorage.getItem('vinxa_settings');
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: VinxaSettings): void {
  localStorage.setItem('vinxa_settings', JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('vinxa-settings-changed', { detail: settings }));
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('vinxa_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: AuthUser) {
  authToken = token;
  localStorage.setItem('vinxa_token', token);
  localStorage.setItem('vinxa_user', JSON.stringify(user));
  localStorage.removeItem('vinxa_logged_out');
  // Notify Chrome Extension auth bridge on localhost:5173
  window.dispatchEvent(
    new CustomEvent('vinxa-auth-changed', {
      detail: { token, user }
    })
  );
}

export function clearAuthSession() {
  authToken = null;
  localStorage.removeItem('vinxa_token');
  localStorage.removeItem('vinxa_user');
  localStorage.setItem('vinxa_logged_out', 'true');
  // Notify Chrome Extension auth bridge to immediately revoke extension session
  window.dispatchEvent(
    new CustomEvent('vinxa-auth-changed', {
      detail: { token: null, user: null }
    })
  );
}

export async function getAuthToken(): Promise<string> {
  if (authToken) return authToken;
  const stored = localStorage.getItem('vinxa_token');
  if (stored) {
    authToken = stored;
    return stored;
  }
  return '';
}

async function authFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    // Token expired or invalid
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('vinxa-session-expired'));
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let errMsg = `API error ${res.status}: ${res.statusText}`;
    try {
      const errBody = await res.json();
      if (errBody?.message) errMsg = errBody.message;
    } catch {}
    throw new Error(errMsg);
  }

  return res;
}

export const api = {
  async login(email: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    });
    if (!res.ok) {
      let msg = 'Invalid email or password.';
      try {
        const err = await res.json();
        if (err?.message) msg = err.message;
      } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    const user: AuthUser = { id: data.userId, email: data.email };
    setAuthSession(data.token, user);
    return user;
  },

  async register(email: string, password: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    });
    if (!res.ok) {
      let msg = 'Registration failed. Please verify your email and password (minimum 8 characters).';
      try {
        const err = await res.json();
        if (err?.message) msg = err.message;
      } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    const user: AuthUser = { id: data.userId, email: data.email };
    setAuthSession(data.token, user);
    return user;
  },

  async verifySession(): Promise<AuthUser | null> {
    const token = await getAuthToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        clearAuthSession();
        return null;
      }
      const data = await res.json();
      const user: AuthUser = { id: data.id, email: data.email };
      // Re-emit sync event so extension stays synchronized on refresh
      window.dispatchEvent(
        new CustomEvent('vinxa-auth-changed', {
          detail: { token, user }
        })
      );
      return user;
    } catch {
      return getStoredUser();
    }
  },

  logout() {
    clearAuthSession();
  },

  getStoredUser,
  getStoredSettings,
  saveStoredSettings,

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

  async renameMeeting(id: string, title: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    });
    return res.json();
  },

  async stopMeeting(id: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${id}/stop`, {
      method: 'POST'
    });
    return res.json();
  },

  async reanalyzeMeeting(id: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${id}/reanalyze`, {
      method: 'POST'
    });
    return res.json();
  },

  async deleteMeeting(id: string): Promise<void> {
    await authFetch(`/meetings/${id}`, {
      method: 'DELETE'
    });
  },

  async enablePublicShare(meetingId: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${meetingId}/share`, {
      method: 'POST'
    });
    return res.json();
  },

  async disablePublicShare(meetingId: string): Promise<Meeting> {
    const res = await authFetch(`/meetings/${meetingId}/share`, {
      method: 'DELETE'
    });
    return res.json();
  },

  async getPublicSharedMeeting(shareToken: string): Promise<PublicSharedMeetingData> {
    const res = await fetch(`${API_BASE}/public/share/${encodeURIComponent(shareToken)}`);
    if (!res.ok) {
      let msg = 'This shared meeting link is invalid or has been disabled by the owner.';
      try {
        const err = await res.json();
        if (err?.message) msg = err.message;
      } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    let parsedSummary: MeetingSummary | null = null;
    if (data.summaryJson) {
      try {
        parsedSummary = JSON.parse(data.summaryJson);
      } catch {}
    }
    return {
      meeting: data.meeting,
      sharedBy: data.sharedBy || 'Vinxa User',
      summary: parsedSummary,
      actionItems: data.actionItems || [],
      transcript: data.transcript || []
    };
  },

  async getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
    const res = await authFetch(`/meetings/${meetingId}/transcript`);
    return res.json();
  },

  async renameSpeaker(meetingId: string, speakerKey: string, displayName: string): Promise<void> {
    await authFetch(`/meetings/${meetingId}/speakers/${encodeURIComponent(speakerKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ displayName })
    });
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

  async toggleActionItem(meetingId: string, actionId: string): Promise<ActionItem> {
    const res = await authFetch(`/meetings/${meetingId}/actions/${actionId}`, {
      method: 'PATCH'
    });
    return res.json();
  },

  async exportMarkdownFromServer(meetingId: string): Promise<string> {
    const res = await authFetch(`/meetings/${meetingId}/export?format=md`);
    return res.text();
  },

  async search(query: string, meetingId?: string): Promise<SearchResultItem[]> {
    const params = new URLSearchParams({ q: query });
    if (meetingId) params.set('meetingId', meetingId);
    const res = await authFetch(`/search?${params.toString()}`);
    return res.json();
  },

  async askCopilot(
    question: string,
    meetingId?: string | null,
    history: CopilotChatTurn[] = []
  ): Promise<CopilotAskResponse> {
    const res = await authFetch('/copilot/ask', {
      method: 'POST',
      body: JSON.stringify({
        question,
        meetingId: meetingId || null,
        history
      })
    });
    return res.json();
  },

  async changeMeetingLanguage(meetingId: string, language: string): Promise<void> {
    await authFetch(`/meetings/${meetingId}/language`, {
      method: 'POST',
      body: JSON.stringify({ language })
    });
  },

  async translateTexts(texts: string[], targetLanguage: string): Promise<string[]> {
    const res = await authFetch('/copilot/translate', {
      method: 'POST',
      body: JSON.stringify({ texts, targetLanguage })
    });
    const data = await res.json();
    return data.translations || texts;
  },

  async getWebhookConfig(): Promise<{
    webhookUrl: string;
    webhookSecret?: string;
    webhookAutoPush: boolean;
    recentLoopbackDeliveries: Record<string, any>[];
  }> {
    const res = await authFetch('/webhooks/config');
    return res.json();
  },

  async updateWebhookConfig(
    webhookUrl: string,
    webhookAutoPush: boolean,
    webhookSecret?: string
  ): Promise<void> {
    await authFetch('/webhooks/config', {
      method: 'PUT',
      body: JSON.stringify({
        webhookUrl,
        webhookSecret: webhookSecret || '',
        webhookAutoPush
      })
    });
  },

  async testWebhook(webhookUrl?: string, webhookSecret?: string): Promise<WebhookDispatchResult> {
    const res = await authFetch('/webhooks/test', {
      method: 'POST',
      body: JSON.stringify({ webhookUrl, webhookSecret })
    });
    return res.json();
  },

  async pushActionItemToWebhook(
    meetingId: string,
    actionId: string,
    webhookUrl?: string
  ): Promise<WebhookDispatchResult> {
    const stored = getStoredSettings();
    const res = await authFetch(`/meetings/${meetingId}/actions/${actionId}/webhook`, {
      method: 'POST',
      body: JSON.stringify({
        webhookUrl: webhookUrl || stored.webhookUrl || undefined,
        webhookSecret: stored.webhookSecret || undefined
      })
    });
    return res.json();
  },

  async pushAllMeetingActionsToWebhook(
    meetingId: string,
    webhookUrl?: string
  ): Promise<{ total: number; succeeded: number; results: WebhookDispatchResult[] }> {
    const stored = getStoredSettings();
    const res = await authFetch(`/meetings/${meetingId}/actions/webhook-all`, {
      method: 'POST',
      body: JSON.stringify({
        webhookUrl: webhookUrl || stored.webhookUrl || undefined,
        webhookSecret: stored.webhookSecret || undefined
      })
    });
    return res.json();
  }
};
