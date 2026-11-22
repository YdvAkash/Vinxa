import React, { useState } from 'react';
import { Shield, CheckCircle2 } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [tabAudioEnabled, setTabAudioEnabled] = useState(true);
  const [micAudioEnabled, setMicAudioEnabled] = useState(false);
  const [autoPurgeDays, setAutoPurgeDays] = useState(30);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center space-x-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <span>Privacy & Capture Controls</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure how Vinxa Live captures audio, manages consent, and retains meeting intelligence.
        </p>
      </div>

      {/* Audio Capture Settings */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Audio Capture Sources</h2>

        <div className="flex items-center justify-between py-3 border-b border-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-200">Chrome Tab Audio Capture</p>
            <p className="text-xs text-slate-400">Captures remote participants in Google Meet, Teams, or Zoom tabs.</p>
          </div>
          <input
            type="checkbox"
            checked={tabAudioEnabled}
            onChange={(e) => setTabAudioEnabled(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 rounded"
          />
        </div>

        <div className="flex items-center justify-between py-3 border-b border-slate-800">
          <div>
            <p className="text-sm font-medium text-slate-200">Local Microphone Capture</p>
            <p className="text-xs text-slate-400">Captures your own voice via browser mic permission.</p>
          </div>
          <input
            type="checkbox"
            checked={micAudioEnabled}
            onChange={(e) => setMicAudioEnabled(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 rounded"
          />
        </div>
      </div>

      {/* Retention & Privacy Settings */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Data Minimization & Purge Policy</h2>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200 block">Automatic Meeting Purge Window</label>
          <select
            value={autoPurgeDays}
            onChange={(e) => setAutoPurgeDays(Number(e.target.value))}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value={7}>7 Days (High Privacy)</option>
            <option value={30}>30 Days (Recommended)</option>
            <option value={90}>90 Days</option>
            <option value={365}>1 Year</option>
          </select>
          <p className="text-xs text-slate-500">
            Raw audio streams are never stored by default. Only transcripts and generated summaries are kept for the retention period.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={handleSave}
          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Save Preferences</span>
        </button>

        {saved && (
          <span className="text-xs text-emerald-400 font-semibold animate-fade-in">
            Preferences successfully saved.
          </span>
        )}
      </div>
    </div>
  );
};
