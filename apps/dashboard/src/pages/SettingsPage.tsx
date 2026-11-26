import React, { useState, useRef, useEffect } from 'react';
import { AuthUser, Meeting, VinxaSettings, WebhookDispatchResult } from '../types';
import { api, API_BASE } from '../services/api';
import { SPOKEN_LANGUAGES, TRANSLATION_LANGUAGES } from './LiveMeetingPage';
import {
  Shield,
  CheckCircle2,
  Mic,
  Square,
  Globe,
  Download,
  Trash2,
  User,
  Webhook,
  Send,
  AlertCircle
} from 'lucide-react';

interface SettingsPageProps {
  user?: AuthUser | null;
  meetings?: Meeting[];
  onRefreshMeetings?: () => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  user,
  meetings = [],
  onRefreshMeetings
}) => {
  const [settings, setSettings] = useState<VinxaSettings>(() => api.getStoredSettings());
  const [saved, setSaved] = useState(false);

  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [cleaningEmpty, setCleaningEmpty] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookDispatchResult | null>(null);
  const [webhookTestError, setWebhookTestError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getWebhookConfig()
      .then((cfg) => {
        setSettings((prev) => ({
          ...prev,
          webhookUrl: cfg.webhookUrl || prev.webhookUrl || `${API_BASE}/webhooks/test-receiver`,
          webhookSecret: cfg.webhookSecret ?? prev.webhookSecret ?? '',
          webhookAutoPush: Boolean(cfg.webhookAutoPush)
        }));
      })
      .catch(() => {});

    return () => {
      stopMicTest();
    };
  }, []);

  const handleSave = async () => {
    api.saveStoredSettings(settings);
    try {
      await api.updateWebhookConfig(
        settings.webhookUrl,
        settings.webhookAutoPush,
        settings.webhookSecret
      );
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSendTestWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    setWebhookTestError(null);
    try {
      await api.updateWebhookConfig(
        settings.webhookUrl,
        settings.webhookAutoPush,
        settings.webhookSecret
      );
      api.saveStoredSettings(settings);
      const result = await api.testWebhook(settings.webhookUrl, settings.webhookSecret);
      setWebhookTestResult(result);
    } catch (err: any) {
      setWebhookTestError(err.message || 'Unable to connect to your project board right now.');
    } finally {
      setTestingWebhook(false);
    }
  };

  const startMicTest = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setTestingMic(true);

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 100) * 100)));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err: any) {
      setMicError(err.message || 'Microphone access denied by browser.');
      setTestingMic(false);
    }
  };

  const stopMicTest = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setTestingMic(false);
    setMicLevel(0);
  };

  const handleExportAllData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      user,
      settings,
      meetings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vinxa-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const emptySessions = meetings.filter(
    (m) => (m.segmentCount ?? 0) === 0 && m.status !== 'RECORDING'
  );

  const handlePurgeEmptySessions = async () => {
    if (emptySessions.length === 0) return;
    if (
      !window.confirm(`Delete ${emptySessions.length} empty session(s) with 0 transcript turns?`)
    ) {
      return;
    }
    setCleaningEmpty(true);
    setCleanResult(null);
    let deleted = 0;
    for (const m of emptySessions) {
      try {
        await api.deleteMeeting(m.id);
        deleted++;
      } catch {}
    }
    await onRefreshMeetings?.();
    setCleaningEmpty(false);
    setCleanResult(`Cleaned up ${deleted} empty session(s).`);
    setTimeout(() => setCleanResult(null), 4000);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
            <Shield className="w-4 h-4" />
          </div>
          <span>Settings, Multi-Language & Privacy</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Configure your default transcription languages, audio hardware, and data retention policies.
        </p>
      </div>

      {/* Account Info Card */}
      {user && (
        <div className="p-4 sm:p-5 rounded-3xl bg-white border border-slate-200/80 shadow-2xs flex flex-col xs:flex-row xs:items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-700 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user.email}</p>
              <p className="text-xs text-slate-500">Personal & Team Workspace Account</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold self-start xs:self-center shrink-0">
            Account Active
          </span>
        </div>
      )}

      {/* Multi-Language Defaults */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex items-center space-x-2">
          <Globe className="w-4 h-4 text-violet-600" />
          <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            Default Multi-Language Preferences
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Default Spoken Audio Language
            </label>
            <select
              value={settings.defaultSpokenLanguage}
              onChange={(e) =>
                setSettings({ ...settings, defaultSpokenLanguage: e.target.value })
              }
              className="w-full bg-[#fbfaff] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500"
            >
              {SPOKEN_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Default Live Bilingual Translation
            </label>
            <select
              value={settings.defaultTranslationLanguage}
              onChange={(e) =>
                setSettings({ ...settings, defaultTranslationLanguage: e.target.value })
              }
              className="w-full bg-[#fbfaff] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500"
            >
              {TRANSLATION_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audio Capture & Live Diagnostic Meter */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
        <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
          Audio & Caption Preferences
        </h2>

        <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-900">On-Screen Meeting Captions</p>
            <p className="text-xs text-slate-500">
              Displays live captions and translations directly on your Google Meet, Teams, or Zoom call screen.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.onScreenCaptionsEnabled}
            onChange={(e) =>
              setSettings({ ...settings, onScreenCaptionsEnabled: e.target.checked })
            }
            className="w-4 h-4 accent-violet-600 rounded cursor-pointer shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-900">Smart Live Auto-Scroll</p>
            <p className="text-xs text-slate-500">
              Automatically scrolls to new speech unless you scroll up to read earlier history.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.autoScrollLive}
            onChange={(e) => setSettings({ ...settings, autoScrollLive: e.target.checked })}
            className="w-4 h-4 accent-violet-600 rounded cursor-pointer shrink-0"
          />
        </div>

        {/* Interactive Microphone Tester */}
        <div className="pt-2 space-y-3">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Test Microphone Input</p>
              <p className="text-xs text-slate-500">
                Verify your microphone is picking up your voice before joining a meeting.
              </p>
            </div>
            <button
              type="button"
              onClick={testingMic ? stopMicTest : startMicTest}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer shrink-0 ${
                testingMic
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-[#f4f3f9] hover:bg-violet-50 text-slate-700 border border-slate-200'
              }`}
            >
              {testingMic ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop Mic Test</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-violet-600" />
                  <span>Test Microphone</span>
                </>
              )}
            </button>
          </div>

          {testingMic && (
            <div className="p-3.5 rounded-2xl bg-[#fbfaff] border border-violet-200 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-violet-700 font-bold">
                  {micLevel > 5 ? '🎙️ Voice Detected' : 'Listening... Speak now'}
                </span>
                <span className="font-mono text-slate-500">{micLevel}%</span>
              </div>
              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-purple-500 transition-all duration-75"
                  style={{ width: `${micLevel}%` }}
                />
              </div>
            </div>
          )}

          {micError && <p className="text-xs text-red-600">{micError}</p>}
        </div>
      </div>

      {/* Project Management & Task Sync Integration */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-violet-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2.5">
          <div className="flex items-start xs:items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
              <Webhook className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Project Board & Task Sync (Jira & Team Tools)
              </h2>
              <p className="text-[11px] text-slate-500">
                Automatically send meeting action items to your team's project management board.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold uppercase tracking-wider self-start xs:self-center shrink-0">
            Integration Active
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-700 block">
              Project Board Integration Link
            </label>
            <button
              type="button"
              onClick={() =>
                setSettings({
                  ...settings,
                  webhookUrl: `${API_BASE}/webhooks/test-receiver`
                })
              }
              className="text-[11px] font-bold text-violet-600 hover:text-violet-800 cursor-pointer"
            >
              Use Default Demo Board
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={settings.webhookUrl}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              placeholder="Paste your Jira or project automation link..."
              className="flex-1 bg-[#fbfaff] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500 min-w-0"
            />
            <button
              type="button"
              onClick={handleSendTestWebhook}
              disabled={testingWebhook || !settings.webhookUrl.trim()}
              className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm shadow-violet-500/20 transition shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testingWebhook ? 'Testing...' : 'Test Connection'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            Integration Passcode <span className="text-slate-400 font-normal">(Optional)</span>
          </label>
          <input
            type="password"
            value={settings.webhookSecret || ''}
            onChange={(e) => setSettings({ ...settings, webhookSecret: e.target.value })}
            placeholder="Optional project board verification key"
            className="w-full bg-[#fbfaff] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
          />
        </div>

        <div className="flex items-center justify-between gap-4 py-2.5 border-t border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-900">
              Automatically Sync Action Items After Each Meeting
            </p>
            <p className="text-xs text-slate-500">
              Sends newly extracted action items to your project board as soon as your meeting summary is ready.
            </p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(settings.webhookAutoPush)}
            onChange={(e) => setSettings({ ...settings, webhookAutoPush: e.target.checked })}
            className="w-4 h-4 accent-violet-600 rounded cursor-pointer shrink-0"
          />
        </div>

        {webhookTestError && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-center space-x-2 text-xs text-red-700 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{webhookTestError}</span>
          </div>
        )}

        {webhookTestResult && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              webhookTestResult.success
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                : 'bg-red-50/70 border-red-200 text-red-800'
            }`}
          >
            <span className="text-xs font-bold">
              {webhookTestResult.success
                ? '✓ Project Board Connection Verified Successfully'
                : '✕ Unable to reach the specified integration link'}
            </span>
          </div>
        )}
      </div>

      {/* Data Retention & Workspace Maintenance */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
        <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
          Data Retention & Workspace Maintenance
        </h2>

        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 block">
            Automatic Meeting Retention Window
          </label>
          <select
            value={settings.autoPurgeDays}
            onChange={(e) => setSettings({ ...settings, autoPurgeDays: Number(e.target.value) })}
            className="w-full bg-[#fbfaff] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-500"
          >
            <option value={7}>7 Days (High Privacy)</option>
            <option value={30}>30 Days (Recommended)</option>
            <option value={90}>90 Days</option>
            <option value={365}>1 Year</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={handleExportAllData}
            className="px-4 py-2 rounded-xl bg-[#f4f3f9] hover:bg-violet-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-violet-600" />
            <span>Download Workspace Backup</span>
          </button>

          <button
            type="button"
            onClick={handlePurgeEmptySessions}
            disabled={cleaningEmpty || emptySessions.length === 0}
            className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 border border-red-200 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {cleaningEmpty
                ? 'Cleaning...'
                : `Clean Up Empty Sessions (${emptySessions.length})`}
            </span>
          </button>

          {cleanResult && (
            <span className="text-xs text-emerald-700 font-bold">{cleanResult}</span>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center space-x-4">
        <button
          type="button"
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-xs flex items-center space-x-2 shadow-md shadow-violet-500/25 transition cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Save Preferences</span>
        </button>

        {saved && (
          <span className="text-xs text-emerald-700 font-bold">
            ✓ Preferences saved & synced with Chrome Extension.
          </span>
        )}
      </div>
    </div>
  );
};
