import React, { useState } from 'react';
import { Meeting } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { PlatformIcon, PlatformBadge } from '../ui/PlatformBadge';
import { api } from '../../services/api';
import {
  Calendar,
  ChevronRight,
  Users,
  Trash2,
  MessageSquareText,
  CheckCircle2,
  CheckSquare,
  Sparkles,
  Link2,
  Check
} from 'lucide-react';

interface MeetingCardProps {
  meeting: Meeting;
  onSelect: (meeting: Meeting) => void;
  onDelete?: (meetingId: string) => void;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({ meeting, onSelect, onDelete }) => {
  const [copiedShare, setCopiedShare] = useState(false);

  const handleQuickShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await api.enablePublicShare(meeting.id);
      if (updated.shareToken) {
        await navigator.clipboard.writeText(`${window.location.origin}/?share=${updated.shareToken}`);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2500);
      }
    } catch {}
  };

  const formattedDate = new Date(meeting.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const formattedTime = new Date(meeting.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  const speakerCount =
    meeting.participantCount ?? (meeting.participants ? meeting.participants.length : 0);
  const turnCount = meeting.segmentCount ?? 0;
  const decisionCount = meeting.decisionCount ?? (meeting.summary?.decisions?.length || 0);
  const actionCount = meeting.actionItemCount ?? (meeting.summary?.actionItems?.length || 0);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm(`Delete meeting session "${meeting.title}"?`)) {
      onDelete(meeting.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(meeting)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(meeting);
        }
      }}
      className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/5 transition-all cursor-pointer group relative flex flex-col justify-between gap-4 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <PlatformIcon platform={meeting.platform} className="w-8 h-8" />
            <PlatformBadge platform={meeting.platform} />
            <StatusBadge status={meeting.status} />
          </div>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={handleQuickShare}
              title="Copy public share link"
              className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition"
            >
              {copiedShare ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                aria-label={`Delete ${meeting.title}`}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                title="Delete session"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-violet-600 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-violet-700 transition line-clamp-2 leading-snug">
          {meeting.title}
        </h3>
      </div>

      <div className="space-y-2.5 pt-3 border-t border-slate-100">
        {/* Intelligence Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/70 font-semibold">
            <Sparkles className="w-3 h-3 text-violet-600" />
            <span>AI Summary</span>
          </span>
          {turnCount > 0 && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-medium">
              <MessageSquareText className="w-3 h-3 text-violet-500" />
              <span>{turnCount} turns</span>
            </span>
          )}
          {decisionCount > 0 && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>
                {decisionCount} decision{decisionCount > 1 ? 's' : ''}
              </span>
            </span>
          )}
          {actionCount > 0 && (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/70 font-medium">
              <CheckSquare className="w-3 h-3" />
              <span>
                {actionCount} action{actionCount > 1 ? 's' : ''}
              </span>
            </span>
          )}
        </div>

        {/* Date & Speakers Footer */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {formattedDate} · {formattedTime}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {speakerCount} {speakerCount === 1 ? 'speaker' : 'speakers'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
