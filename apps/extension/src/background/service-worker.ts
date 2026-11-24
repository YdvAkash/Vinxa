import { ExtensionRecordingState, MeetingPlatform } from '../adapters/types';
import { resolveExtensionEndpoints, setStoredServerOrigin } from '../config';

function detectPlatformFromUrl(urlString: string): MeetingPlatform {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'meet.google.com') {
      return 'GOOGLE_MEET';
    }

    if (
      hostname === 'teams.microsoft.com' ||
      hostname.endsWith('.teams.microsoft.com') ||
      hostname === 'teams.live.com'
    ) {
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

export interface LiveSegmentItem {
  id: string;
  speakerKey: string;
  speakerName: string;
  text: string;
  startMs: number;
}

let currentState: ExtensionRecordingState = 'IDLE';
let isPaused: boolean = false;
let activeMeetingPlatform: MeetingPlatform = 'UNKNOWN';
let activeTabId: number | null = null;
let activeMeetingId: string | null = null;
let activeStartTime: number | null = null;
let liveSegments: LiveSegmentItem[] = [];
let liveInterimText: string = '';

// Initialize state from persistent storage and auto-inject into open meeting & dashboard tabs
chrome.storage.local.get(
  [
    'recordingState',
    'isPaused',
    'meetingPlatform',
    'activeTabId',
    'activeMeetingId',
    'activeStartTime',
    'liveSegments',
    'liveInterimText'
  ],
  (data) => {
    if (data.recordingState) currentState = data.recordingState;
    if (typeof data.isPaused === 'boolean') isPaused = data.isPaused;
    if (data.meetingPlatform) activeMeetingPlatform = data.meetingPlatform;
    if (data.activeTabId) activeTabId = data.activeTabId;
    if (data.activeMeetingId) activeMeetingId = data.activeMeetingId;
    if (data.activeStartTime) activeStartTime = data.activeStartTime;
    if (Array.isArray(data.liveSegments)) liveSegments = data.liveSegments;
    if (typeof data.liveInterimText === 'string') liveInterimText = data.liveInterimText;

    injectIntoAllOpenTabs();
  }
);

function injectIntoAllOpenTabs() {
  chrome.tabs.query(
    {
      url: [
        'https://meet.google.com/*',
        'https://teams.microsoft.com/*',
        'https://*.teams.microsoft.com/*',
        'https://teams.live.com/*',
        'https://zoom.us/*',
        'https://*.zoom.us/*',
        'http://localhost:5173/*'
      ]
    },
    (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          const p = tab.url ? detectPlatformFromUrl(tab.url) : 'UNKNOWN';
          if (p !== 'UNKNOWN' && !activeTabId) {
            activeTabId = tab.id;
          }
          ensureContentScriptInjected(tab.id).then(() => {
            if (p !== 'UNKNOWN') broadcastToMeetingTab();
          });
        }
      }
    }
  );
}

// Background 1.5s DB sync during active recording so on-screen overlay always has latest turns
setInterval(async () => {
  if (currentState !== 'RECORDING' || isPaused || !activeMeetingId) return;
  try {
    const token = await getBackendAuthToken();
    if (!token) return;
    const { apiBase } = await resolveExtensionEndpoints();
    const res = await fetch(
      `${apiBase}/meetings/${activeMeetingId}/transcript`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (res.ok) {
      const dbSegs = await res.json();
      if (Array.isArray(dbSegs) && dbSegs.length >= liveSegments.length) {
        liveSegments = dbSegs.slice(-50).map((s: any) => ({
          id: s.id,
          speakerKey: s.speakerKey || 'speaker-1',
          speakerName: s.speakerName || 'Speaker 1',
          text: s.text,
          startMs: s.startMs || 0
        }));
        chrome.storage.local.set({ liveSegments });
        broadcastToMeetingTab();
      }
    }
  } catch {}
}, 1500);

// Strictly retrieve authenticated session token — never silently auto-login with dummy credentials
async function getBackendAuthToken(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get(['authToken']);
    if (stored.authToken && typeof stored.authToken === 'string') {
      return stored.authToken;
    }
  } catch (e) {
    console.warn('[Vinxa SW] Auth storage read error:', e);
  }
  return '';
}

async function ensureContentScriptInjected(tabId: number | null) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['detector-content.js']
    });
  } catch {
    // Already injected or restricted tab
  }
}

function broadcastToMeetingTab() {
  if (!activeTabId) return;
  chrome.storage.local.get(
    ['authToken', 'userEmail', 'selectedLanguage', 'targetTranslation'],
    (authData) => {
      chrome.tabs
        .sendMessage(activeTabId!, {
          type: 'LIVE_TRANSCRIPT_UPDATE',
          state: currentState,
          isPaused,
          meetingId: activeMeetingId,
          startTime: activeStartTime,
          segments: liveSegments,
          interimText: liveInterimText,
          isAuthenticated: Boolean(authData.authToken),
          userEmail: authData.userEmail || null,
          selectedLanguage: authData.selectedLanguage || 'multi',
          targetTranslation: authData.targetTranslation || 'ORIGINAL'
        })
        .catch(() => {});
    }
  );
}

async function saveState(
  state: ExtensionRecordingState,
  platform: MeetingPlatform,
  tabId: number | null,
  meetingId: string | null,
  startTime: number | null,
  paused: boolean = false
) {
  currentState = state;
  isPaused = paused;
  activeMeetingPlatform = platform;
  activeTabId = tabId;
  activeMeetingId = meetingId;
  activeStartTime = startTime;

  if (state === 'IDLE') {
    liveSegments = [];
    liveInterimText = '';
    isPaused = false;
  }

  await chrome.storage.local.set({
    recordingState: state,
    isPaused,
    meetingPlatform: platform,
    activeTabId: tabId,
    activeMeetingId: meetingId,
    activeStartTime: startTime,
    liveSegments,
    liveInterimText
  });

  broadcastToMeetingTab();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(
      [
        'recordingState',
        'isPaused',
        'meetingPlatform',
        'activeTabId',
        'activeMeetingId',
        'activeStartTime',
        'liveSegments',
        'liveInterimText',
        'authToken',
        'userEmail',
        'selectedLanguage',
        'targetTranslation'
      ],
      (data) => {
        sendResponse({
          state: data.recordingState || currentState,
          isPaused: typeof data.isPaused === 'boolean' ? data.isPaused : isPaused,
          platform: data.meetingPlatform || activeMeetingPlatform,
          tabId: data.activeTabId || activeTabId,
          meetingId: data.activeMeetingId || activeMeetingId,
          startTime: data.activeStartTime || activeStartTime,
          segments: data.liveSegments || liveSegments,
          interimText: data.liveInterimText ?? liveInterimText,
          isAuthenticated: Boolean(data.authToken),
          userEmail: data.userEmail || null,
          selectedLanguage: data.selectedLanguage || 'multi',
          targetTranslation: data.targetTranslation || 'ORIGINAL'
        });
      }
    );
    return true;
  }

  if (message.type === 'SYNC_EXTENSION_AUTH') {
    if (message.serverOrigin) {
      setStoredServerOrigin(message.serverOrigin).catch(() => {});
    }
    if (message.token && message.email) {
      chrome.storage.local
        .set({
          authToken: message.token,
          userEmail: message.email
        })
        .then(() => {
          broadcastToMeetingTab();
          sendResponse({ success: true });
        });
      return true;
    }
  }

  if (message.type === 'REVOKE_EXTENSION_AUTH') {
    if (message.serverOrigin) {
      setStoredServerOrigin(message.serverOrigin).catch(() => {});
    }
    chrome.storage.local.remove(['authToken', 'userEmail']).then(async () => {
      if (currentState === 'RECORDING') {
        await handleStopCapture();
      } else {
        broadcastToMeetingTab();
      }
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'SYNC_EXTENSION_SETTINGS') {
    const updates: Record<string, any> = {};
    if (message.settings?.defaultSpokenLanguage) {
      updates.selectedLanguage = message.settings.defaultSpokenLanguage;
    }
    if (message.settings?.defaultTranslationLanguage) {
      updates.targetTranslation = message.settings.defaultTranslationLanguage;
    }
    chrome.storage.local.set(updates).then(() => broadcastToMeetingTab());
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'SET_TRANSLATION_LANGUAGE') {
    chrome.storage.local
      .set({ targetTranslation: message.targetTranslation || 'ORIGINAL' })
      .then(() => {
        broadcastToMeetingTab();
        sendResponse({ success: true });
      });
    return true;
  }

  if (message.type === 'PAUSE_CAPTURE') {
    isPaused = true;
    liveInterimText = '';
    chrome.storage.local.set({ isPaused: true, liveInterimText: '' });
    chrome.runtime.sendMessage({ type: 'PAUSE_OFFSCREEN_CAPTURE' }).catch(() => {});
    broadcastToMeetingTab();
    sendResponse({ success: true, isPaused: true });
    return true;
  }

  if (message.type === 'RESUME_CAPTURE') {
    isPaused = false;
    chrome.storage.local.set({ isPaused: false });
    chrome.runtime.sendMessage({ type: 'RESUME_OFFSCREEN_CAPTURE' }).catch(() => {});
    broadcastToMeetingTab();
    sendResponse({ success: true, isPaused: false });
    return true;
  }

  if (message.type === 'RESET_HUD_POSITION') {
    const targetId = message.tabId || activeTabId;
    if (targetId) {
      ensureContentScriptInjected(targetId).then(() => {
        chrome.tabs
          .sendMessage(targetId, { type: 'RESET_HUD_POSITION_ON_SCREEN' })
          .catch(() => {});
        sendResponse({ success: true });
      });
      return true;
    }
    sendResponse({ success: false });
    return true;
  }

  if (message.type === 'ENSURE_OVERLAY') {
    if (message.tabId) {
      ensureContentScriptInjected(message.tabId).then(() => sendResponse({ success: true }));
      return true;
    }
  }

  if (message.type === 'LIVE_TRANSCRIPT_EVENT') {
    if (isPaused) {
      sendResponse({ success: true });
      return true;
    }
    const ev = message.event;
    if (ev) {
      if (ev.type === 'TRANSCRIPT_INTERIM') {
        liveInterimText = ev.text || '';
      } else if (ev.type === 'TRANSCRIPT' && ev.text) {
        liveInterimText = '';
        const segId = ev.segmentId || 'seg-' + Date.now();
        if (!liveSegments.some((s) => s.id === segId)) {
          liveSegments = [
            ...liveSegments.slice(-49),
            {
              id: segId,
              speakerKey: ev.speakerKey || 'speaker-1',
              speakerName: ev.speakerName || 'Speaker 1',
              text: ev.text,
              startMs: ev.startMs || 0
            }
          ];
        }
      }
      chrome.storage.local.set({ liveSegments, liveInterimText });
      broadcastToMeetingTab();
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'SWITCH_MEETING_LANGUAGE') {
    const targetMeetingId = message.meetingId || activeMeetingId;
    const lang = message.language || 'multi';
    chrome.storage.local.set({ selectedLanguage: lang });
    if (targetMeetingId) {
      Promise.all([getBackendAuthToken(), resolveExtensionEndpoints()])
        .then(([token, { apiBase }]) => {
          if (!token) throw new Error('Authentication required');
          return fetch(`${apiBase}/meetings/${targetMeetingId}/language`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ language: lang })
          });
        })
        .then(() => {
          broadcastToMeetingTab();
          sendResponse({ success: true });
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
    broadcastToMeetingTab();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TRANSLATE_LIVE_TEXT') {
    const texts: string[] = message.texts || [];
    const targetLanguage: string = message.targetLanguage || 'ORIGINAL';
    if (texts.length === 0 || targetLanguage === 'ORIGINAL') {
      sendResponse({ success: true, translations: texts });
      return true;
    }
    Promise.all([getBackendAuthToken(), resolveExtensionEndpoints()])
      .then(([token, { apiBase }]) => {
        if (!token) throw new Error('Authentication required');
        return fetch(`${apiBase}/copilot/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ texts, targetLanguage })
        });
      })
      .then((r) => r.json())
      .then((data) => sendResponse({ success: true, translations: data.translations || texts }))
      .catch((err) => sendResponse({ success: false, translations: texts, error: err.message }));
    return true;
  }

  if (message.type === 'START_CAPTURE_FROM_OVERLAY') {
    const tabId = sender.tab?.id || activeTabId;
    const tabTitle = sender.tab?.title || message.title || 'Live Meeting Session';
    const tabUrl = sender.tab?.url || message.url || '';
    const platform = detectPlatformFromUrl(tabUrl);
    const language = message.language || 'multi';

    if (!tabId) {
      sendResponse({ success: false, error: 'Could not identify active meeting tab' });
      return true;
    }

    startFullCaptureFlow(
      tabId,
      platform !== 'UNKNOWN' ? platform : 'GOOGLE_MEET',
      tabTitle,
      tabUrl,
      language
    )
      .then((res) => sendResponse({ success: true, res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'STOP_CAPTURE_FROM_OVERLAY') {
    stopFullCaptureFlow()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'OPEN_DASHBOARD_TAB') {
    resolveExtensionEndpoints().then(({ dashboardBase }) => {
      const url = message.url
        ? message.url
        : message.meetingId
        ? `${dashboardBase}/live?id=${message.meetingId}`
        : dashboardBase;
      chrome.tabs.create({ url });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'RELOAD_TAB') {
    if (message.tabId) {
      chrome.tabs.reload(message.tabId, {}, () => {
        sendResponse({ success: true });
      });
      return true;
    }
  }

  if (message.type === 'RESET_CAPTURE') {
    handleResetCapture()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'TAB_PLATFORM_DETECTED') {
    if (currentState === 'IDLE' || currentState === 'PLATFORM_DETECTED') {
      currentState = 'PLATFORM_DETECTED';
      activeMeetingPlatform = message.platform;
      if (sender.tab?.id) {
        activeTabId = sender.tab.id;
      }
      saveState(
        currentState,
        activeMeetingPlatform,
        activeTabId,
        activeMeetingId,
        activeStartTime,
        false
      );
    } else if (sender.tab?.id) {
      activeTabId = sender.tab.id;
      broadcastToMeetingTab();
    }
    return true;
  }

  if (message.type === 'START_CAPTURE') {
    handleStartCapture(
      message.tabId,
      message.platform,
      message.meetingId,
      message.ticket,
      message.language
    )
      .then((res) => sendResponse({ success: true, res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'STOP_CAPTURE') {
    handleStopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function startFullCaptureFlow(
  tabId: number,
  platform: MeetingPlatform,
  title: string,
  meetingUrl: string,
  language: string
) {
  const token = await getBackendAuthToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED: Please sign in to Vinxa Live before starting meeting capture.');
  }
  const { apiBase } = await resolveExtensionEndpoints();

  const meetRes = await fetch(`${apiBase}/meetings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ title, platform, meetingUrl })
  });
  if (meetRes.status === 401 || meetRes.status === 403) {
    await chrome.storage.local.remove(['authToken', 'userEmail']);
    throw new Error('AUTH_REQUIRED: Your session has expired. Please sign in again.');
  }
  if (!meetRes.ok) {
    throw new Error(`Backend server unreachable at ${apiBase}`);
  }
  const meetingData = await meetRes.json();
  const newMeetingId = meetingData.id;

  await fetch(`${apiBase}/meetings/${newMeetingId}/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      eventType: 'CONSENT_GRANTED',
      participantReference: 'In-Meeting Live Overlay',
      details: 'User initiated live transcription from in-meeting HUD overlay'
    })
  });

  let ticket = '';
  try {
    const ticketRes = await fetch(
      `${apiBase}/meetings/${newMeetingId}/stream-ticket`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (ticketRes.ok) {
      const ticketData = await ticketRes.json();
      ticket = ticketData.ticket;
    }
  } catch {}

  return handleStartCapture(tabId, platform, newMeetingId, ticket, language);
}

async function stopFullCaptureFlow() {
  if (activeMeetingId) {
    try {
      const token = await getBackendAuthToken();
      if (token) {
        const { apiBase } = await resolveExtensionEndpoints();
        await fetch(`${apiBase}/meetings/${activeMeetingId}/stop`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {}
  }
  await handleStopCapture();
}

async function handleStartCapture(
  tabId: number,
  platform: MeetingPlatform,
  meetingId: string,
  ticket?: string,
  language: string = 'multi'
) {
  const token = await getBackendAuthToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED: Please sign in to Vinxa Live before starting meeting capture.');
  }

  await ensureContentScriptInjected(tabId);
  await stopOffscreenCapture();

  let streamId = '';
  try {
    streamId = await requestStreamId(tabId);
  } catch (err: any) {
    if (err.message?.includes('active stream')) {
      throw new Error(
        'TAB_STREAM_LOCKED: Tab audio is currently locked. Click "Reload Meeting Tab" below to release it.'
      );
    }
    throw err;
  }

  await ensureOffscreenDocument();
  await new Promise((r) => setTimeout(r, 250));

  liveSegments = [];
  liveInterimText = '';
  isPaused = false;
  const { wsBase } = await resolveExtensionEndpoints();

  const offscreenResponse = await new Promise<any>((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'START_OFFSCREEN_CAPTURE',
        streamId,
        meetingId,
        ticket,
        language,
        wsBase
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success === false) {
          reject(new Error(response.error || 'Offscreen capture failed to initialize'));
        } else {
          resolve(response);
        }
      }
    );
  });

  const now = Date.now();
  await saveState('RECORDING', platform, tabId, meetingId, now, false);
  return { streamId, meetingId, offscreenResponse };
}

function requestStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(id);
      }
    });
  });
}

async function handleStopCapture() {
  await stopOffscreenCapture();
  await saveState('IDLE', 'UNKNOWN', activeTabId, null, null, false);
}

async function handleResetCapture() {
  await stopOffscreenCapture();
  await saveState('IDLE', 'UNKNOWN', activeTabId, null, null, false);
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [
        chrome.offscreen.Reason.USER_MEDIA,
        chrome.offscreen.Reason.DISPLAY_MEDIA,
        chrome.offscreen.Reason.AUDIO_PLAYBACK
      ],
      justification: 'Capturing meeting audio and local mic for live transcription'
    });
  }
}

async function stopOffscreenCapture() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length > 0) {
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: 'STOP_OFFSCREEN_CAPTURE' }, () => {
          resolve();
        });
        setTimeout(resolve, 300);
      });
    } catch (e) {
      console.warn('[Vinxa SW] Message offscreen error:', e);
    }

    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      console.warn('[Vinxa SW] Error closing offscreen document:', e);
    }
  }
}

chrome.tabs.onRemoved.addListener((removedTabId) => {
  if (activeTabId && removedTabId === activeTabId) {
    handleStopCapture();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url) {
      if (tab.url.startsWith('http://localhost:5173')) {
        ensureContentScriptInjected(tab.id ?? null);
        return;
      }
      const platform = detectPlatformFromUrl(tab.url);
      if (platform !== 'UNKNOWN') {
        ensureContentScriptInjected(tab.id ?? null);
        if (currentState === 'IDLE') {
          saveState('PLATFORM_DETECTED', platform, tab.id ?? null, null, null, false);
        }
      }
    }
  } catch {
    // tab access or closed tab
  }
});
