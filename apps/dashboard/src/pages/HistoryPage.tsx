import React, { useState } from 'react';
import { Meeting } from '../types';
import { MeetingCard } from '../components/meetings/MeetingCard';
import { Calendar, Sparkles, Filter, ArrowUpDown } from 'lucide-react';

interface HistoryPageProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  onDeleteMeeting?: (meetingId: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  meetings,
  onSelectMeeting,
  onDeleteMeeting
}) => {
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'MOST_TURNS'>('NEWEST');

  const filtered = meetings
    .filter((m) => (platformFilter === 'ALL' ? true : m.platform === platformFilter))
    .filter((m) => {
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'ANALYZED')
        return m.status === 'ANALYSIS_COMPLETED' || m.status === 'COMPLETED';
      if (statusFilter === 'ACTIVE') return m.status === 'RECORDING' || m.status === 'READY';
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'MOST_TURNS') {
        return (b.segmentCount ?? 0) - (a.segmentCount ?? 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <span>Meetings Archive</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse, filter, and manage all your recorded meeting sessions and summaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-[#f4f3f9] border border-slate-200/80 rounded-xl px-3 py-2 flex-1 xs:flex-initial">
            <Filter className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              aria-label="Filter by platform"
              className="w-full bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Platforms</option>
              <option value="GOOGLE_MEET">Google Meet</option>
              <option value="MICROSOFT_TEAMS">Microsoft Teams</option>
              <option value="ZOOM">Zoom</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5 bg-[#f4f3f9] border border-slate-200/80 rounded-xl px-3 py-2 flex-1 xs:flex-initial">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="w-full bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ANALYZED">Analyzed</option>
              <option value="ACTIVE">Active / Ready</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5 bg-[#f4f3f9] border border-slate-200/80 rounded-xl px-3 py-2 flex-1 xs:flex-initial">
            <ArrowUpDown className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort meetings"
              className="w-full bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
              <option value="MOST_TURNS">Most Spoken Turns</option>
            </select>
          </div>

          <span className="text-xs font-bold text-violet-700 bg-violet-50 px-3 py-2 rounded-xl border border-violet-200/80">
            {filtered.length} of {meetings.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-white border border-dashed border-violet-200 space-y-3 shadow-2xs">
          <Sparkles className="w-8 h-8 text-violet-500 mx-auto" />
          <h3 className="text-sm font-extrabold text-slate-900">No Matching Meetings</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {meetings.length === 0
              ? 'Once you capture meetings with the Chrome Extension, completed transcripts and AI intelligence summaries will appear here.'
              : 'No meetings match the current filter criteria.'}
          </p>
          {meetings.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPlatformFilter('ALL');
                setStatusFilter('ALL');
              }}
              className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs text-white font-bold transition cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onSelect={onSelectMeeting}
              onDelete={onDeleteMeeting}
            />
          ))}
        </div>
      )}
    </div>
  );
};
