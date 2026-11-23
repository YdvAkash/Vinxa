import React, { useState, useEffect } from 'react';
import { MeetingPlatform } from '../adapters/types';

const SUPPORTED_LANGUAGES = [
  { code: 'multi', label: '🌐 Auto Multi-Language (EN + HI + Global)' },
  { code: 'hi', label: '🇮🇳 Hindi (हिन्दी)' },
  { code: 'en-IN', label: '🇮🇳 English (India)' },
  { code: 'en-US', label: '🇺🇸 English (US)' },
  { code: 'ja', label: '🇯🇵 Japanese (日本語)' },
  { code: 'es', label: '🇪🇸 Spanish (Español)' },
  { code: 'fr', label: '🇫🇷 French (Français)' },
  { code: 'de', label: '🇩🇪 German (Deutsch)' },
  { code: 'pt', label: '🇧🇷 Portuguese (Português)' },
  { code: 'it', label: '🇮🇹 Italian (Italiano)' },
  { code: 'ru', label: '🇷🇺 Russian (Русский)' },
  { code: 'zh', label: '🇨🇳 Chinese (中文)' },
  { code: 'ko', label: '🇰🇷 Korean (한국어)' }
];

const TRANSLATION_LANGUAGES = [
  { code: 'ORIGINAL', label: 'Original Speech Only (No Translation)' },
  { code: 'Hindi (हिन्दी)', label: '🇮🇳 Translate On-Screen → Hindi (हिन्दी)' },
  { code: 'English', label: '🇺🇸 Translate On-Screen → English' },
  { code: 'Japanese (日本語)', label: '🇯🇵 Translate On-Screen → Japanese' },
  { code: 'Spanish (Español)', label: '🇪🇸 Translate On-Screen → Spanish' },
  { code: 'French (Français)', label: '🇫🇷 Translate On-Screen → French' },
  { code: 'German (Deutsch)', label: '🇩🇪 Translate On-Screen → German' },
  { code: 'Portuguese (Português)', label: '🇧🇷 Translate On-Screen → Portuguese' },
  { code: 'Arabic (العربية)', label: '🇸🇦 Translate On-Screen → Arabic' },
  { code: 'Chinese (中文)', label: '🇨🇳 Translate On-Screen → Chinese' },
  { code: 'Russian (Русский)', label: '🇷🇺 Translate On-Screen → Russian' }
];

function extractMeetingCodePreview(title: string, url: string): string | null {
  const meetMatch = (url + ' ' + title).match(/\b([a-z]{3}-[a-z]{4}-[a-z]{3})\b/i);
  if (meetMatch) return meetMatch[1].toLowerCase();
  const zoomMatch = url.match(/\/(?:j|wc)\/(\d{8,12})/);
  if (zoomMatch) return zoomMatch[1];
  return null;
}

export const PopupApp: React.FC = () => {
  const [platform, setPlatform] = useState<MeetingPlatform>('UNKNOWN');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabTitle, setTabTitle] = useState<string>('');
  const [tabUrl, setTabUrl] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(true);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [language, setLanguage] = useState<string>('multi');
  const [targetTranslation, setTargetTranslation] = useState<string>('ORIGINAL');
  const [segmentCount, setSegmentCount] = useState<number>(0);

  // Strict Authentication State
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showInlineAuth, setShowInlineAuth] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (active?.url) {
        setTabId(active.id ?? null);
        setTabTitle(active.title || 'Meeting Tab');
        setTabUrl(active.url);

        const url = active.url.toLowerCase();
        if (url.includes('meet.google.com')) {
          setPlatform('GOOGLE_MEET');
          if (active.id) chrome.runtime.sendMessage({ type: 'ENSURE_OVERLAY', tabId: active.id });
        } else if (url.includes('teams.microsoft.com') || url.includes('teams.live.com')) {
          setPlatform('MICROSOFT_TEAMS');
          if (active.id) chrome.runtime.sendMessage({ type: 'ENSURE_OVERLAY', tabId: active.id });
        } else if (url.includes('zoom.us')) {
          setPlatform('ZOOM');
          if (active.id) chrome.runtime.sendMessage({ type: 'ENSURE_OVERLAY', tabId: active.id });
        } else {
          setPlatform('UNKNOWN');
        }
      }
    });

    // Trigger auth bridge sync on any open localhost:5173 tab
    chrome.tabs.query({ url: 'http://localhost:5173/*' }, (dashTabs) => {
      for (const dt of dashTabs) {
        if (dt.id) {
          chrome.runtime.sendMessage({ type: 'ENSURE_OVERLAY', tabId: dt.id });
        }
      }
    });

    verifyStoredAuth();

    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.authToken || changes.userEmail) {
        verifyStoredAuth();
      }
      if (changes.recordingState) {
        setIsRecording(changes.recordingState.newValue === 'RECORDING');
      }
      if (changes.isPaused !== undefined) {
        setIsPaused(Boolean(changes.isPaused.newValue));
      }
      if (changes.liveSegments && Array.isArray(changes.liveSegments.newValue)) {
        setSegmentCount(changes.liveSegments.newValue.length);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    const statsListener = (msg: any) => {
      if (msg.type === 'AUDIO_STATS') {
        setAudioLevel(Math.min(100, Math.round(msg.rms * 300)));
      }
    };
    chrome.runtime.onMessage.addListener(statsListener);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.runtime.onMessage.removeListener(statsListener);
    };
  }, []);

  async function verifyStoredAuth() {
    setAuthChecking(true);
    chrome.storage.local.get(
      [
        'authToken',
        'userEmail',
        'recordingState',
        'isPaused',
        'activeMeetingId',
        'activeStartTime',
        'micPermissionGranted',
        'selectedLanguage',
        'targetTranslation',
        'liveSegments'
      ],
      async (data) => {
        if (data.recordingState === 'RECORDING') {
          setIsRecording(true);
          if (data.activeMeetingId) setMeetingId(data.activeMeetingId);
          if (data.activeStartTime) setStartTime(data.activeStartTime);
        }
        if (typeof data.isPaused === 'boolean') {
          setIsPaused(data.isPaused);
        }
        if (Array.isArray(data.liveSegments)) {
          setSegmentCount(data.liveSegments.length);
        }
        if (data.selectedLanguage) {
          setLanguage(data.selectedLanguage);
        }
        if (data.targetTranslation) {
          setTargetTranslation(data.targetTranslation);
        }
        if (data.micPermissionGranted !== undefined) {
          setHasMicPermission(Boolean(data.micPermissionGranted));
        } else {
          checkMic();
        }

        const token = data.authToken;
        if (!token) {
          setIsAuthenticated(false);
          setUserEmail(null);
          setAuthChecking(false);
          return;
        }

        try {
          const meRes = await fetch('http://localhost:8080/api/v1/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (meRes.ok) {
            const me = await meRes.json();
            setIsAuthenticated(true);
            setUserEmail(me.email || data.userEmail || 'Authenticated User');
          } else {
            await chrome.storage.local.remove(['authToken', 'userEmail']);
            setIsAuthenticated(false);
            setUserEmail(null);
          }
        } catch {
          setIsAuthenticated(Boolean(token));
          setUserEmail(data.userEmail || 'Authenticated User');
        } finally {
          setAuthChecking(false);
        }
      }
    );
  }

  async function checkMic() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setHasMicPermission(res.state === 'granted');
      }
    } catch {}
  }

  useEffect(() => {
    if (!isRecording || isPaused) {
      return;
    }
    const interval = setInterval(() => {
      if (startTime) {
        setElapsedSec(Math.floor((Date.now() - startTime) / 1000));
      } else {
        setElapsedSec((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording, isPaused, startTime]);

  async function getAuthToken(): Promise<string> {
    const stored = await chrome.storage.local.get(['authToken']);
    return stored.authToken || '';
  }

  function showFeedback(text: string) {
    setStatusFeedback(text);
    setTimeout(() => setStatusFeedback(null), 2200);
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (authMode === 'signup' && passwordInput.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = authMode === 'login' ? 'login' : 'register';
      const res = await fetch(`http://localhost:8080/api/v1/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), password: passwordInput })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Invalid email or password.');
      }
      const data = await res.json();
      await chrome.storage.local.set({ authToken: data.token, userEmail: data.email });
      setIsAuthenticated(true);
      setUserEmail(data.email);
      setShowInlineAuth(false);
      setEmailInput('');
      setPasswordInput('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await chrome.runtime.sendMessage({ type: 'REVOKE_EXTENSION_AUTH' });
    setIsAuthenticated(false);
    setUserEmail(null);
    setIsRecording(false);
    setIsPaused(false);
  };

  const openWebLogin = () => {
    chrome.tabs.create({ url: 'http://localhost:5173/?auth=extension' });
  };

  const handleStartCapture = async () => {
    if (!tabId || !consentGiven || !isAuthenticated) return;
    setLoading(true);
    setErrorMsg(null);

    let createdMeetingId: string | null = null;
    let token = '';

    try {
      token = await getAuthToken();
      if (!token) {
        setIsAuthenticated(false);
        throw new Error('Please sign in before starting meeting capture.');
      }

      const meetRes = await fetch('http://localhost:8080/api/v1/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: tabTitle || 'Live Meeting Session',
          platform: platform !== 'UNKNOWN' ? platform : 'GOOGLE_MEET',
          meetingUrl: tabUrl
        })
      });

      if (meetRes.status === 401 || meetRes.status === 403) {
        await handleSignOut();
        throw new Error('Your session expired. Please sign in again.');
      }

      if (!meetRes.ok) {
        throw new Error('Failed creating meeting session on backend. Is the server running?');
      }

      const meetingData = await meetRes.json();
      createdMeetingId = meetingData.id;
      setMeetingId(createdMeetingId);

      await fetch(`http://localhost:8080/api/v1/meetings/${createdMeetingId}/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          eventType: 'CONSENT_GRANTED',
          participantReference: 'Active Meeting Tab',
          details: 'User acknowledged participant notice in Chrome Extension popup'
        })
      });

      let ticket = '';
      try {
        const ticketRes = await fetch(
          `http://localhost:8080/api/v1/meetings/${createdMeetingId}/stream-ticket`,
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

      chrome.runtime.sendMessage(
        {
          type: 'START_CAPTURE',
          tabId,
          platform,
          meetingId: createdMeetingId,
          ticket,
          language
        },
        (res) => {
          if (res?.success) {
            setIsRecording(true);
            setIsPaused(false);
            setStartTime(Date.now());
            setTimeout(() => window.close(), 350);
          } else {
            const err = res?.error || 'Failed starting tab audio capture';
            setErrorMsg(err);
            if (createdMeetingId && token) {
              fetch(`http://localhost:8080/api/v1/meetings/${createdMeetingId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              }).catch(() => {});
            }
          }
        }
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Error initializing meeting capture');
      if (createdMeetingId && token) {
        fetch(`http://localhost:8080/api/v1/meetings/${createdMeetingId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePause = () => {
    const action = isPaused ? 'RESUME_CAPTURE' : 'PAUSE_CAPTURE';
    chrome.runtime.sendMessage({ type: action }, (res) => {
      if (res && typeof res.isPaused === 'boolean') {
        setIsPaused(res.isPaused);
        showFeedback(res.isPaused ? 'Transcription Paused' : 'Transcription Resumed');
      }
    });
  };

  const handleStopCapture = async () => {
    setLoading(true);
    try {
      if (meetingId) {
        const token = await getAuthToken();
        if (token) {
          await fetch(`http://localhost:8080/api/v1/meetings/${meetingId}/stop`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }

      chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, () => {
        setIsRecording(false);
        setIsPaused(false);
        setStartTime(null);
      });
    } catch (err: any) {
      console.warn('Stop error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyTranscriptFromStorage = () => {
    chrome.storage.local.get(['liveSegments'], (data) => {
      const segs = Array.isArray(data.liveSegments) ? data.liveSegments : [];
      if (segs.length === 0) {
        showFeedback('No transcript segments yet');
        return;
      }
      const text = segs.map((s: any) => `${s.speakerName}: ${s.text}`).join('\n');
      navigator.clipboard.writeText(text);
      showFeedback('✓ Copied Live Transcript!');
    });
  };

  const handleCenterOnScreenHud = () => {
    chrome.runtime.sendMessage({ type: 'RESET_HUD_POSITION', tabId }, () => {
      showFeedback('✓ On-Screen Captions Centered');
    });
  };

  const handleResetCapture = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'RESET_CAPTURE' }, () => {
      setIsRecording(false);
      setIsPaused(false);
      setStartTime(null);
      setErrorMsg(null);
      setLoading(false);
      showFeedback('Audio Engine Reset');
    });
  };

  const handleReloadMeetingTab = () => {
    if (!tabId) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'RELOAD_TAB', tabId }, () => {
      setErrorMsg(null);
      setLoading(false);
      window.close();
    });
  };

  const openPermissionTab = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  };

  const openDashboard = (customPath?: string) => {
    const url = customPath
      ? `http://localhost:5173${customPath}`
      : meetingId && isRecording
      ? `http://localhost:5173/live?id=${meetingId}`
      : 'http://localhost:5173';
    chrome.tabs.create({ url });
  };

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const extractedCode = extractMeetingCodePreview(tabTitle, tabUrl);
  const userInitials = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'VX';

  // ============================================================================
  // 1. LOADING SKELETON STATE (PREVENTS UNAUTHENTICATED UI FLASH)
  // ============================================================================
  if (authChecking) {
    return (
      <div className="vx-shell" style={{ minHeight: '220px', justifyContent: 'center', alignItems: 'center' }}>
        <div className="vx-logo">V</div>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
          Verifying Vinxa Live Session...
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. UNAUTHENTICATED GUARD SCREEN — BLOCKS PROTECTED FEATURES UNTIL SIGNED IN
  // ============================================================================
  if (!isAuthenticated) {
    return (
      <div className="vx-shell">
        <div className="vx-header">
          <div className="vx-brand">
            <div className="vx-logo">V</div>
            <div className="vx-title-group">
              <span className="vx-title">Vinxa</span>
              <span className="vx-subtitle">Live Intelligence</span>
            </div>
          </div>
          <span className="vx-pill vx-pill-warn">
            <span className="vx-dot" />
            <span>Locked</span>
          </span>
        </div>

        <div className="vx-card" style={{ textAlign: 'center', padding: '16px 14px', gap: '10px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: '#ede9fe',
              border: '1px solid #ddd6fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
              fontSize: '18px'
            }}
          >
            🔒
          </div>
          <div style={{ fontWeight: 800, fontSize: '14px', color: '#1e1b4b' }}>
            Sign In to Enable Live Captions
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.5 }}>
            Connect your Vinxa Live workspace to stream real-time multi-language captions on Google Meet, Teams, and Zoom.
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              color: '#dc2626',
              fontSize: '11px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '9px 11px',
              borderRadius: '10px',
              fontWeight: 600
            }}
          >
            {errorMsg}
          </div>
        )}

        <button type="button" onClick={openWebLogin} className="vx-btn vx-btn-primary">
          <span>Sign In / Create Account on Vinxa Web</span>
          <span>→</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowInlineAuth(!showInlineAuth);
            setErrorMsg(null);
          }}
          className="vx-btn vx-btn-secondary"
          style={{ padding: '8px 12px', fontSize: '11.5px' }}
        >
          {showInlineAuth ? 'Hide Direct Login Form' : 'Or Sign In Directly in Extension'}
        </button>

        {showInlineAuth && (
          <form onSubmit={handleAuthSubmit} className="vx-card" style={{ gap: '9px' }}>
            <div className="vx-grid-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMsg(null);
                }}
                className={`vx-btn ${authMode === 'login' ? 'vx-btn-primary' : 'vx-btn-secondary'}`}
                style={{ padding: '6px', fontSize: '11px' }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setErrorMsg(null);
                }}
                className={`vx-btn ${authMode === 'signup' ? 'vx-btn-primary' : 'vx-btn-secondary'}`}
                style={{ padding: '6px', fontSize: '11px' }}
              >
                Create Account
              </button>
            </div>

            <input
              type="email"
              required
              placeholder="you@company.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="vx-input"
            />

            <input
              type="password"
              required
              placeholder="Password (min 8 chars)"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="vx-input"
            />

            <button
              type="submit"
              disabled={loading}
              className="vx-btn vx-btn-primary"
              style={{ padding: '8px' }}
            >
              {loading
                ? 'Authenticating...'
                : authMode === 'login'
                ? 'Sign In to Vinxa'
                : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    );
  }

  // ============================================================================
  // 3. AUTHENTICATED EXTENSION CONTROL CENTER
  // ============================================================================
  return (
    <div className="vx-shell">
      {/* Header */}
      <div className="vx-header">
        <div className="vx-brand">
          <div className="vx-logo">V</div>
          <div className="vx-title-group">
            <span className="vx-title">Vinxa</span>
            <span className="vx-subtitle">Live Intelligence</span>
          </div>
        </div>

        {isRecording ? (
          <span className={`vx-pill ${isPaused ? 'vx-pill-warn' : 'vx-pill-live'}`}>
            <span className={`vx-dot ${isPaused ? '' : 'vx-dot-pulse'}`} />
            <span>{isPaused ? 'PAUSED' : 'LIVE'}</span>
          </span>
        ) : (
          <span className="vx-pill vx-pill-auth">
            <span className="vx-dot" />
            <span>Extension Synced</span>
          </span>
        )}
      </div>

      {/* Authenticated Account Bar */}
      <div className="vx-account-bar">
        <div className="vx-user-info">
          <div className="vx-avatar">{userInitials}</div>
          <span className="vx-email" title={userEmail || ''}>
            {userEmail}
          </span>
        </div>
        <button type="button" onClick={handleSignOut} className="vx-btn-ghost" style={{ color: '#dc2626' }}>
          Sign Out
        </button>
      </div>

      {/* Detected Meeting Context Card */}
      <div className="vx-card">
        <div className="vx-row-between">
          <span className="vx-label">Meeting Source</span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 800,
              color: platform !== 'UNKNOWN' ? '#059669' : '#64748b'
            }}
          >
            {platform !== 'UNKNOWN' ? platform.replace('_', ' ') : 'NO ACTIVE CALL TAB'}
          </span>
        </div>

        <div
          style={{
            fontSize: '12.5px',
            fontWeight: 700,
            color: '#1e1b4b',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {tabTitle || 'Browser Tab'}
        </div>

        <div className="vx-row-between" style={{ fontSize: '10.5px', color: '#64748b' }}>
          <span>
            {extractedCode
              ? `Default Code: ${extractedCode}`
              : 'Auto-named from meeting discussion'}
          </span>
          {platform !== 'UNKNOWN' && (
            <button
              type="button"
              onClick={handleCenterOnScreenHud}
              className="vx-btn-ghost"
              style={{ color: '#7c3aed', padding: '2px 6px', fontSize: '10px' }}
              title="Show and center the On-Screen Transcript HUD on the meeting page"
            >
              Center On-Screen HUD
            </button>
          )}
        </div>
      </div>

      {/* Multi-Language & Live Translation Configuration Card */}
      <div className="vx-card">
        <span className="vx-label">Multi-Language Speech & Translation</span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '10.5px', color: '#475569', fontWeight: 600 }}>
            Spoken Audio Recognition (Deepgram Nova-2):
          </span>
          <select
            value={language}
            onChange={async (e) => {
              const newLang = e.target.value;
              setLanguage(newLang);
              chrome.storage.local.set({ selectedLanguage: newLang });
              chrome.runtime.sendMessage({
                type: 'SWITCH_MEETING_LANGUAGE',
                meetingId,
                language: newLang
              });
              showFeedback('✓ Spoken Language Updated');
            }}
            className="vx-select"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          <span style={{ fontSize: '10.5px', color: '#475569', fontWeight: 600 }}>
            Live On-Screen Bilingual Translation (Gemini):
          </span>
          <select
            value={targetTranslation}
            onChange={(e) => {
              const newTrans = e.target.value;
              setTargetTranslation(newTrans);
              chrome.runtime.sendMessage({
                type: 'SET_TRANSLATION_LANGUAGE',
                targetTranslation: newTrans
              });
              showFeedback('✓ On-Screen Translation Updated');
            }}
            className="vx-select"
          >
            {TRANSLATION_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Microphone Permission Warning */}
      {!hasMicPermission && (
        <div
          className="vx-card"
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            borderColor: 'rgba(245, 158, 11, 0.35)'
          }}
        >
          <div style={{ fontSize: '11px', color: '#fde68a', lineHeight: 1.4 }}>
            🎙️ Grant microphone access so your own voice is transcribed alongside remote attendees.
          </div>
          <button
            type="button"
            onClick={openPermissionTab}
            className="vx-btn vx-btn-warn"
            style={{ padding: '7px 10px', fontSize: '11px' }}
          >
            Grant Microphone Access →
          </button>
        </div>
      )}

      {/* Live Recording Control Center */}
      {isRecording && (
        <div className={`vx-card ${isPaused ? 'vx-card-paused' : 'vx-card-live'}`}>
          <div className="vx-row-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span
                className={`vx-dot ${isPaused ? '' : 'vx-dot-pulse'}`}
                style={{ color: isPaused ? '#fbbf24' : '#ef4444' }}
              />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: isPaused ? '#b45309' : '#dc2626'
                }}
              >
                {isPaused ? 'Transcription Paused' : 'Streaming On-Screen Captions'}
              </span>
            </div>
            <span
              style={{
                fontSize: '13.5px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 800,
                color: '#1e1b4b'
              }}
            >
              {formatTimer(elapsedSec)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>Voice Level:</span>
            <div className="vx-meter-track">
              <div
                className="vx-meter-fill"
                style={{
                  width: `${isPaused ? 0 : audioLevel}%`
                }}
              />
            </div>
            <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', fontWeight: 700 }}>
              {segmentCount} turns
            </span>
          </div>

          {/* Quick Actions During Active Recording */}
          <div className="vx-grid-2" style={{ marginTop: '4px' }}>
            <button
              type="button"
              onClick={handleTogglePause}
              className="vx-btn vx-btn-warn"
              style={{ padding: '8px', fontSize: '11.5px' }}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              type="button"
              onClick={handleCopyTranscriptFromStorage}
              className="vx-btn vx-btn-secondary"
              style={{ padding: '8px', fontSize: '11.5px' }}
            >
              Copy Captions
            </button>
          </div>
        </div>
      )}

      {/* Status Toast Feedback */}
      {statusFeedback && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.14)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#6ee7b7',
            padding: '7px 10px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            textAlign: 'center'
          }}
        >
          {statusFeedback}
        </div>
      )}

      {/* Error Message & Tab Stream Lock Recovery */}
      {errorMsg && (
        <div
          className="vx-card"
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            borderColor: 'rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            fontSize: '11px'
          }}
        >
          <div>{errorMsg}</div>
          {(errorMsg.includes('TAB_STREAM_LOCKED') || errorMsg.includes('active stream')) && (
            <div className="vx-grid-2" style={{ marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleReloadMeetingTab}
                className="vx-btn vx-btn-danger"
                style={{ padding: '7px', fontSize: '11px' }}
              >
                🔄 Reload Tab
              </button>
              <button
                type="button"
                onClick={handleResetCapture}
                className="vx-btn vx-btn-secondary"
                style={{ padding: '7px', fontSize: '11px' }}
              >
                Reset Engine
              </button>
            </div>
          )}
        </div>
      )}

      {/* Non-Meeting Tab Quick Launchers OR Meeting Capture Controls */}
      {platform === 'UNKNOWN' && !isRecording ? (
        <div className="vx-card">
          <span className="vx-label">Quick Launch Supported Platform</span>
          <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
            Open a supported meeting tab to start capturing live on-screen captions:
          </p>
          <div className="vx-grid-3" style={{ marginTop: '2px' }}>
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: 'https://meet.google.com/new' })}
              className="vx-btn vx-btn-secondary"
              style={{ padding: '7px 4px', fontSize: '10.5px' }}
            >
              Google Meet
            </button>
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: 'https://teams.microsoft.com' })}
              className="vx-btn vx-btn-secondary"
              style={{ padding: '7px 4px', fontSize: '10.5px' }}
            >
              MS Teams
            </button>
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: 'https://zoom.us/join' })}
              className="vx-btn vx-btn-secondary"
              style={{ padding: '7px 4px', fontSize: '10.5px' }}
            >
              Zoom Web
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!isRecording && (
            <label className="vx-consent-box">
              <input
                type="checkbox"
                checked={consentGiven}
                disabled={isRecording || loading}
                onChange={(e) => setConsentGiven(e.target.checked)}
              />
              <span>
                I confirm that meeting participants are notified and consent to live AI transcription.
              </span>
            </label>
          )}

          {!isRecording ? (
            <button
              type="button"
              onClick={handleStartCapture}
              disabled={!consentGiven || loading}
              className="vx-btn vx-btn-primary"
            >
              {loading ? 'Initializing Audio Pipeline...' : 'Start Live Meeting Capture'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopCapture}
              disabled={loading}
              className="vx-btn vx-btn-danger"
            >
              {loading ? 'Generating AI Summary...' : '⏹ Stop & Finalize Meeting'}
            </button>
          )}
        </div>
      )}

      {/* Footer Navigation */}
      <div className="vx-footer">
        <button
          type="button"
          onClick={() => openDashboard()}
          className="vx-btn-ghost"
          style={{ color: '#7c3aed' }}
        >
          {isRecording ? 'Open Live Monitor →' : 'Open Web Workspace →'}
        </button>
        <button
          type="button"
          onClick={handleResetCapture}
          title="Reset audio capture engine"
          className="vx-btn-ghost"
        >
          Reset Engine
        </button>
      </div>
    </div>
  );
};
