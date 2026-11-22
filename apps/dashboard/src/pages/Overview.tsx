import React, { useState } from 'react';
import { Meeting } from '../types';
import { MeetingCard } from '../components/meetings/MeetingCard';
import { Activity, CheckCircle, ShieldCheck, Video, Plus, Sparkles } from 'lucide-react';

interface OverviewProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  onGoToLive: () => void;
  onCreateMeeting: (title: string, platform: string, url: string) => Promise<void>;
}

export const Overview: React.FC<OverviewProps> = ({
  meetings,
  onSelectMeeting,
  onGoToLive,
  onCreateMeeting
}) => {
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPlatform, setNewPlatform] = useState('GOOGLE_MEET');
  const [newUrl, setNewUrl] = useState('');
  const [creating, setCreating] = useState(false);

  const activeMeeting = meetings.find((m) => m.status === 'RECORDING');
  const completedMeetings = meetings.filter((m) => m.status === 'ANALYSIS_COMPLETED' || m.status === 'COMPLETED');
  const totalDecisions = meetings.reduce((acc, m) => acc + (m.summary?.decisions?.length || 0), 0);
  const totalActionItems = meetings.reduce((acc, m) => acc + (m.summary?.actionItems?.length || 0), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await onCreateMeeting(newTitle, newPlatform, newUrl);
      setShowModal(false);
      setNewTitle('');
      setNewUrl('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Hero */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Activity className="w-4 h-4" />
            <span>AI Meeting Intelligence Platform</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Turn every meeting into clear, verifiable outcomes.
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Connected to Neon Cloud PostgreSQL, Deepgram Live STT, and Google Gemini AI.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center space-x-1.5 border border-slate-700 transition"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>New Session</span>
          </button>

          {activeMeeting ? (
            <button
              onClick={onGoToLive}
              className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-xs flex items-center space-x-2 shadow-lg shadow-red-500/20 transition animate-pulse"
            >
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>Live Session in Progress →</span>
            </button>
          ) : (
            <button
              onClick={onGoToLive}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition"
            >
              <Video className="w-4 h-4 text-slate-950" />
              <span>Open Live Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Meetings</div>
          <div className="text-2xl font-bold text-white">{meetings.length}</div>
          <div className="text-xs text-emerald-400 mt-1 flex items-center space-x-1">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>{completedMeetings.length} analyzed</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Confirmed Decisions</div>
          <div className="text-2xl font-bold text-emerald-400">{totalDecisions}</div>
          <div className="text-xs text-slate-400 mt-1">Evidence-linked</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Action Items</div>
          <div className="text-2xl font-bold text-amber-400">{totalActionItems}</div>
          <div className="text-xs text-slate-400 mt-1">Attributed in DB</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Cloud Engine</div>
          <div className="text-2xl font-bold text-sky-400">Live</div>
          <div className="text-xs text-sky-400/80 mt-1 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Neon DB + Gemini</span>
          </div>
        </div>
      </div>

      {/* Recent Meetings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Recent Meeting Sessions</h2>
          <span className="text-xs text-slate-400 font-mono">Live PostgreSQL Cloud</span>
        </div>

        {meetings.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-emerald-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No Meetings Recorded Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Start capturing directly from Google Meet, Teams, or Zoom in Chrome using the Vinxa Extension, or create a meeting session below.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition"
            >
              Create First Session
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {meetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} onSelect={onSelectMeeting} />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm">Create New Meeting Session</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Meeting Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Strategy & Architecture Review"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Platform</label>
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="GOOGLE_MEET">Google Meet</option>
                  <option value="MICROSOFT_TEAMS">Microsoft Teams Web</option>
                  <option value="ZOOM">Zoom Web</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Meeting URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://meet.google.com/..."
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-xs transition"
                >
                  {creating ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
