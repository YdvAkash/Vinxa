import React from 'react';
import { Meeting } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { PlatformBadge } from '../ui/PlatformBadge';
import { Calendar, ChevronRight, Users } from 'lucide-react';

interface MeetingCardProps {
  meeting: Meeting;
  onSelect: (meeting: Meeting) => void;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({ meeting, onSelect }) => {
  const formattedDate = new Date(meeting.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div
      onClick={() => onSelect(meeting)}
      className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/40 transition cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <PlatformBadge platform={meeting.platform} />
          <StatusBadge status={meeting.status} />
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition" />
      </div>

      <h3 className="font-semibold text-slate-100 group-hover:text-white transition line-clamp-1 mb-2">
        {meeting.title}
      </h3>

      <div className="flex items-center space-x-4 text-xs text-slate-400">
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span>{formattedDate}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Users className="w-3.5 h-3.5 text-slate-500" />
          <span>{meeting.participants?.length || 0} participants</span>
        </div>
      </div>
    </div>
  );
};
