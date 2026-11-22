import React from 'react';
import { TranscriptSegment } from '../../types';
import { User } from 'lucide-react';

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  interimText?: string;
  onSelectSegment?: (segmentId: string) => void;
  highlightedId?: string | null;
}

export const TranscriptFeed: React.FC<TranscriptFeedProps> = ({
  segments,
  interimText,
  onSelectSegment,
  highlightedId
}) => {
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 font-sans">
      {segments.map((seg) => {
        const isHighlighted = highlightedId === seg.id;
        return (
          <div
            key={seg.id}
            id={seg.id}
            onClick={() => onSelectSegment?.(seg.id)}
            className={`p-3.5 rounded-xl transition cursor-pointer border ${
              isHighlighted
                ? 'bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/40'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-emerald-400 font-semibold">
                  <User className="w-3 h-3" />
                </div>
                <span className="font-semibold text-slate-200">{seg.speakerName}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                  {seg.speakerKey}
                </span>
              </div>
              <span className="text-slate-500 font-mono text-[11px]">
                {formatTime(seg.startMs)}
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed pl-7">
              {seg.text}
            </p>
          </div>
        );
      })}

      {interimText && (
        <div className="p-3.5 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 animate-pulse">
          <div className="flex items-center space-x-2 mb-1.5 text-xs text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Speaking now...</span>
          </div>
          <p className="text-sm text-slate-300 italic pl-4">
            {interimText}
          </p>
        </div>
      )}
    </div>
  );
};
