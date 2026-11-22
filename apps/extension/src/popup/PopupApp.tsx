import React, { useState, useEffect } from 'react';
import { MeetingPlatform } from '../adapters/types';

export const PopupApp: React.FC = () => {
  const [platform, setPlatform] = useState<MeetingPlatform>('UNKNOWN');
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabTitle, setTabTitle] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs[0];
      if (active?.url) {
        setTabId(active.id ?? null);
        setTabTitle(active.title || 'Meeting Tab');

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
      }
    });
  }, []);

  const handleStartCapture = async () => {
    if (!tabId || !consentGiven) return;

    // Call backend to create meeting session or generate ticket
    const meetingId = 'm-' + Date.now();

    chrome.runtime.sendMessage(
      {
        type: 'START_CAPTURE',
        tabId,
        platform,
        meetingId
      },
      (res) => {
        if (res?.success) {
          setIsRecording(true);
        }
      }
    );
  };

  const handleStopCapture = () => {
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, () => {
      setIsRecording(false);
    });
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
          MV3 Guard
        </span>
      </div>

      {/* Detected Platform Card */}
      <div style={{ backgroundColor: '#1e293b', padding: '12px', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
          <span>Detected Platform:</span>
          <span style={{ fontWeight: '600', color: platform !== 'UNKNOWN' ? '#34d399' : '#f87171' }}>
            {platform}
          </span>
        </div>
        <div style={{ color: '#cbd5e1', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tabTitle || 'No active tab'}
        </div>
      </div>

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
              disabled={isRecording}
              onChange={(e) => setConsentGiven(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>I confirm that meeting participants are notified and consent to live AI transcription.</span>
          </label>

          {/* Action button */}
          {!isRecording ? (
            <button
              onClick={handleStartCapture}
              disabled={!consentGiven}
              style={{
                backgroundColor: consentGiven ? '#10b981' : '#334155',
                color: consentGiven ? '#022c22' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '10px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: consentGiven ? 'pointer' : 'not-allowed'
              }}
            >
              Start Meeting Capture
            </button>
          ) : (
            <button
              onClick={handleStopCapture}
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
              Stop & Finalize Meeting
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
