import React from 'react';
import { Meeting } from '../types';
import { MeetingCard } from '../components/meetings/MeetingCard';
import { Activity, CheckCircle, ShieldCheck, Video } from 'lucide-react';

interface OverviewProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  onGoToLive: () => void;
}

export const Overview: React.FC<OverviewProps> = ({ meetings, onSelectMeeting, onGoToLive }) => {
  const activeMeeting = meetings.find((m) => m.status === 'RECORDING');
  const completedMeetings = meetings.filter((m) => m.status === 'ANALYSIS_COMPLETED' || m.status === 'COMPLETED');
  const totalDecisions = meetings.reduce((acc, m) => acc + (m.summary?.decisions.length || 0), 0);
  const totalActionItems = meetings.reduce((acc, m) => acc + (m.summary?.actionItems.length || 0), 0);

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
            Capturing tab audio from Google Meet, Teams, and Zoom with explicit consent and verifiable evidence.
          </p>
        </div>

        {activeMeeting ? (
          <button
            onClick={onGoToLive}
            className="px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm flex items-center space-x-2 shadow-lg shadow-red-500/20 transition shrink-0 animate-pulse"
          >
            <span className="w-2 h-2 rounded-full bg-white" />
            <span>Active Session in Progress →</span>
          </button>
        ) : (
          <button
            onClick={onGoToLive}
            className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-sm flex items-center space-x-2 shadow-lg shadow-emerald-500/20 transition shrink-0"
          >
            <Video className="w-4 h-4 text-slate-950" />
            <span>Launch Live Meeting Session</span>
          </button>
        )}
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
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Extracted Action Items</div>
          <div className="text-2xl font-bold text-amber-400">{totalActionItems}</div>
          <div className="text-xs text-slate-400 mt-1">Directly attributed</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Privacy & Compliance</div>
          <div className="text-2xl font-bold text-sky-400">100%</div>
          <div className="text-xs text-sky-400/80 mt-1 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Consent validated</span>
          </div>
        </div>
      </div>

      {/* Recent Meetings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Recent Meeting Sessions</h2>
          <span className="text-xs text-slate-400">Auto-synced with Chrome Extension</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} onSelect={onSelectMeeting} />
          ))}
        </div>
      </div>
    </div>
  );
};
