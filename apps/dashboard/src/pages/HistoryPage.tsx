import React from 'react';
import { Meeting } from '../types';
import { MeetingCard } from '../components/meetings/MeetingCard';
import { History as HistoryIcon, Sparkles } from 'lucide-react';

interface HistoryPageProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ meetings, onSelectMeeting }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-emerald-400" />
            <span>Meeting History Archive</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse all past analyzed browser meeting sessions stored in Neon PostgreSQL.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-800">
          {meetings.length} Total Sessions
        </span>
      </div>

      {meetings.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 space-y-3">
          <Sparkles className="w-8 h-8 text-slate-500 mx-auto" />
          <h3 className="text-sm font-semibold text-white">No Past Meetings</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Once you capture meetings with the Chrome Extension, completed transcripts and AI intelligence summaries will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} onSelect={onSelectMeeting} />
          ))}
        </div>
      )}
    </div>
  );
};
