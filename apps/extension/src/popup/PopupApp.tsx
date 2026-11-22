import React, { useState, useEffect } from 'react';
import { MeetingPlatform } from '../adapters/types';

export const PopupApp: React.FC = () => {
  const [platform, setPlatform] = useState<MeetingPlatform>('UNKNOWN');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabTitle, setTabTitle] = useState<string>('');
  const [tabUrl, setTabUrl] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (active?.url) {
        setTabId(active.id ?? null);
        setTabTitle(active.title || 'Meeting Tab');
        setTabUrl(active.url);

        const url = active.url.toLowerCase();
        if (url.includes('meet.google.com')) setPlatform('GOOGLE_MEET');
        else if (url.includes('teams.microsoft.com')) setPlatform('MICROSOFT_TEAMS');
        else if (url.includes('zoom.us')) setPlatform('ZOOM');
        else setPlatform('UNKNOWN');
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
      if (res?.state === 'RECORDING') {
        setIsRecording(true);
        if (res.meetingId) setMeetingId(res.meetingId);
      }
    });
  }, []);

  async function getAuthToken(): Promise<string> {
    try {
      const loginRes = await fetch('http://localhost:8080/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@vinxa.live', password: 'Password123!' })
      });
      if (loginRes.ok) {
        const data = await loginRes.json();
        return data.token;
      }
      const regRes = await fetch('http://localhost:8080/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@vinxa.live', password: 'Password123!' })
      });
      if (regRes.ok) {
        const data = await regRes.json();
        return data.token;
      }
    } catch (e: any) {
      console.warn('Auth error:', e);
    }
    return '';
  }

  const handleStartCapture = async () => {
    if (!tabId || !consentGiven) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const token = await getAuthToken();

      // 1. Create meeting in Neon PostgreSQL
      const meetRes = await fetch('http://localhost:8080/api/v1/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title: tabTitle || 'Live Meeting Session',
          platform: platform !== 'UNKNOWN' ? platform : 'GOOGLE_MEET',
          meetingUrl: tabUrl
        })
      });

      if (!meetRes.ok) {
        throw new Error('Failed creating meeting session on backend. Is server running?');
      }

      const meetingData = await meetRes.json();
      const newMeetingId = meetingData.id;
      setMeetingId(newMeetingId);

      // 2. Log consent event
      await fetch(`http://localhost:8080/api/v1/meetings/${newMeetingId}/consent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          eventType: 'CONSENT_GRANTED',
          participantReference: 'Active Meeting Tab',
          details: 'User acknowledged participant notice in Chrome Extension popup'
        })
      });

      // 3. Issue single-use stream ticket
      let ticket = '';
      try {
        const ticketRes = await fetch(`http://localhost:8080/api/v1/meetings/${newMeetingId}/stream-ticket`, {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
        if (ticketRes.ok) {
          const ticketData = await ticketRes.json();
          ticket = ticketData.ticket;
        }
      } catch (err) {
        console.warn('Stream ticket fallback:', err);
      }

      // 4. Start browser tab audio capture
      chrome.runtime.sendMessage(
        {
          type: 'START_CAPTURE',
          tabId,
          platform,
          meetingId: newMeetingId,
          ticket
        },
        (res) => {
          if (res?.success) {
            setIsRecording(true);
          } else {
            setErrorMsg(res?.error || 'Failed starting tab audio capture');
          }
        }
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Error initializing meeting capture');
    } finally {
      setLoading(false);
    }
  };

  const handleStopCapture = async () => {
    setLoading(true);
    try {
      if (meetingId) {
        const token = await getAuthToken();
        await fetch(`http://localhost:8080/api/v1/meetings/${meetingId}/stop`, {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
      }

      chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, () => {
        setIsRecording(false);
      });
    } catch (err: any) {
      console.warn('Stop error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: 'http://localhost:5173' });
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isRecording ? '#ef4444' : '#10b981' }} />
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Vinxa Live Assistant</span>
        </div>
        <span style={{ fontSize: '10px', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', padding: '2px 6px' }}>
          Neon + Gemini
        </span>
      </div>

      {/* Detected Platform Card */}
      <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
          <span>Platform:</span>
          <span style={{ fontWeight: '600', color: platform !== 'UNKNOWN' ? '#34d399' : '#f87171' }}>
            {platform}
          </span>
        </div>
        <div style={{ color: '#cbd5e1', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tabTitle || 'No active tab'}
        </div>
      </div>

      {errorMsg && (
        <div style={{ color: '#f87171', fontSize: '11px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '6px' }}>
          {errorMsg}
        </div>
      )}

      {platform === 'UNKNOWN' ? (
        <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
          Open a Google Meet, Microsoft Teams web, or Zoom web tab to enable live meeting capture.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Explicit Consent Workflow */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={consentGiven}
              disabled={isRecording || loading}
              onChange={(e) => setConsentGiven(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>I confirm that meeting participants are notified and consent to live AI transcription.</span>
          </label>

          {/* Action button */}
          {!isRecording ? (
            <button
              onClick={handleStartCapture}
              disabled={!consentGiven || loading}
              style={{
                backgroundColor: consentGiven && !loading ? '#10b981' : '#334155',
                color: consentGiven && !loading ? '#022c22' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '10px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: consentGiven && !loading ? 'pointer' : 'not-allowed'
              }}
            >
              {loading ? 'Initializing Capture...' : 'Start Meeting Capture'}
            </button>
          ) : (
            <button
              onClick={handleStopCapture}
              disabled={loading}
              style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '10px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              {loading ? 'Finalizing AI Notes...' : 'Stop & Finalize Meeting'}
            </button>
          )}
        </div>
      )}

      {/* Footer link to Web Dashboard */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={openDashboard}
          style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', padding: 0 }}
        >
          Open Vinxa Dashboard →
        </button>
        <span style={{ fontSize: '10px', color: '#64748b' }}>v1.0.0</span>
      </div>
    </div>
  );
};
