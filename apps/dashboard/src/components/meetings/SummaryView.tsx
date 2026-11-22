import React from 'react';
import { MeetingSummary } from '../../types';
import { CheckCircle2, HelpCircle, Lightbulb, Sparkles } from 'lucide-react';

interface SummaryViewProps {
  summary?: MeetingSummary;
  onEvidenceClick?: (segmentId: string) => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({ summary, onEvidenceClick }) => {
  if (!summary) {
    return (
      <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
        AI Meeting Intelligence pending or meeting is currently active.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
          <Sparkles className="w-4 h-4" />
          <span>Executive Summary</span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          {summary.overview}
        </p>
      </div>

      {/* Key Points */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span>Key Discussion Highlights</span>
        </div>
        <ul className="space-y-2">
          {summary.keyPoints.map((point, index) => (
            <li key={index} className="flex items-start space-x-2 text-sm text-slate-300">
              <span className="text-emerald-400 mt-1 font-bold">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Confirmed Decisions with Evidence */}
      <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Confirmed Decisions (With Verifiable Evidence)</span>
        </div>
        <div className="space-y-3">
          {summary.decisions.map((dec, index) => (
            <div key={index} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1.5">
              <p className="text-sm font-medium text-slate-200">{dec.decision}</p>
              {dec.reason && <p className="text-xs text-slate-400">{dec.reason}</p>}
              {dec.evidenceSegmentIds && dec.evidenceSegmentIds.length > 0 && (
                <div className="flex items-center space-x-2 pt-1 text-xs">
                  <span className="text-slate-500">Evidence:</span>
                  {dec.evidenceSegmentIds.map((id) => (
                    <button
                      key={id}
                      onClick={() => onEvidenceClick?.(id)}
                      className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition font-mono text-[10px]"
                    >
                      #{id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Open Questions */}
      {summary.openQuestions && summary.openQuestions.length > 0 && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-sky-400">
            <HelpCircle className="w-4 h-4" />
            <span>Open Questions & Follow-ups</span>
          </div>
          <ul className="space-y-2">
            {summary.openQuestions.map((q, index) => (
              <li key={index} className="flex items-start space-x-2 text-sm text-slate-300">
                <span className="text-sky-400 mt-1 font-bold">?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
