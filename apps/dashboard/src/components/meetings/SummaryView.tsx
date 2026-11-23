import React from 'react';
import { MeetingSummary } from '../../types';
import { CheckCircle2, HelpCircle, Lightbulb, Sparkles } from 'lucide-react';

interface SummaryViewProps {
  summary?: MeetingSummary;
  onEvidenceClick?: (segmentId: string) => void;
}

function normalizeEvidence(evidence: any): string[] {
  if (!evidence) return [];
  if (Array.isArray(evidence)) return evidence.filter(Boolean);
  if (typeof evidence === 'string') {
    try {
      const parsed = JSON.parse(evidence);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}
    return evidence
      .split(',')
      .map((s) => s.replace(/["'[\]]/g, '').trim())
      .filter(Boolean);
  }
  return [];
}

export const SummaryView: React.FC<SummaryViewProps> = ({ summary, onEvidenceClick }) => {
  if (!summary) {
    return (
      <div className="p-10 text-center text-slate-500 bg-white border border-dashed border-slate-200 rounded-2xl">
        AI Meeting Intelligence pending or meeting is currently active. Click "Re-run AI Analysis" above to generate insights.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Executive Overview */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2.5">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-violet-600">
          <Sparkles className="w-4 h-4" />
          <span>Executive Summary</span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{summary.overview}</p>
      </div>

      {/* Key Points */}
      {summary.keyPoints && summary.keyPoints.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-slate-800">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <span>Key Discussion Highlights</span>
          </div>
          <ul className="space-y-2">
            {summary.keyPoints.map((point, index) => (
              <li key={index} className="flex items-start space-x-2.5 text-sm text-slate-700">
                <span className="text-violet-600 mt-0.5 font-bold">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confirmed Decisions with Evidence */}
      {summary.decisions && summary.decisions.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Confirmed Decisions (With Verifiable Evidence)</span>
          </div>
          <div className="space-y-3">
            {summary.decisions.map((dec, index) => {
              const evidence = normalizeEvidence(dec.evidenceSegmentIds);
              return (
                <div
                  key={index}
                  className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-1.5"
                >
                  <p className="text-sm font-semibold text-slate-900">{dec.decision}</p>
                  {dec.reason && <p className="text-xs text-slate-600">{dec.reason}</p>}
                  {evidence.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                      <span className="text-slate-500 font-medium">Evidence:</span>
                      {evidence.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onEvidenceClick?.(id)}
                          className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200 hover:bg-violet-200 transition font-mono text-[10px] font-semibold cursor-pointer"
                        >
                          #{id.length > 8 ? id.substring(0, 8) + '…' : id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open Questions */}
      {summary.openQuestions && summary.openQuestions.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-sky-700">
            <HelpCircle className="w-4 h-4 text-sky-600" />
            <span>Open Questions & Follow-ups</span>
          </div>
          <ul className="space-y-2">
            {summary.openQuestions.map((q, index) => (
              <li key={index} className="flex items-start space-x-2.5 text-sm text-slate-700">
                <span className="text-sky-600 mt-0.5 font-bold">?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
