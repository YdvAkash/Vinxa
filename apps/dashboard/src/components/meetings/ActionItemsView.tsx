import React from 'react';
import { ActionItem } from '../../types';
import { CheckSquare, Calendar, User } from 'lucide-react';

interface ActionItemsViewProps {
  actionItems?: ActionItem[];
  onToggleStatus?: (id: string) => void;
  onEvidenceClick?: (segmentId: string) => void;
}

export const ActionItemsView: React.FC<ActionItemsViewProps> = ({
  actionItems = [],
  onToggleStatus,
  onEvidenceClick
}) => {
  const getPriorityBadge = (priority: 'LOW' | 'MEDIUM' | 'HIGH') => {
    switch (priority) {
      case 'HIGH':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'MEDIUM':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  if (actionItems.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
        No action items extracted for this meeting.
      </div>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      {actionItems.map((item) => {
        const isDone = item.status === 'DONE';
        return (
          <div
            key={item.id}
            className={`p-4 rounded-xl border transition ${
              isDone
                ? 'bg-slate-900/30 border-slate-800/60 opacity-60'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <button
                  onClick={() => onToggleStatus?.(item.id)}
                  className={`mt-0.5 p-1 rounded hover:bg-slate-800 transition ${
                    isDone ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <div>
                  <p className={`text-sm font-medium ${isDone ? 'line-through text-slate-400' : 'text-slate-200'}`}>
                    {item.task}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400">
                    {item.assignee && (
                      <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>{item.assignee}</span>
                      </div>
                    )}

                    {item.deadline && (
                      <div className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{new Date(item.deadline).toLocaleDateString()}</span>
                      </div>
                    )}

                    {item.evidenceSegmentIds && item.evidenceSegmentIds.length > 0 && (
                      <div className="flex items-center space-x-1">
                        <span className="text-slate-500">Evidence:</span>
                        {item.evidenceSegmentIds.map((id) => (
                          <button
                            key={id}
                            onClick={() => onEvidenceClick?.(id)}
                            className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-mono text-[10px] hover:bg-slate-700"
                          >
                            #{id}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${getPriorityBadge(item.priority)}`}>
                {item.priority}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
