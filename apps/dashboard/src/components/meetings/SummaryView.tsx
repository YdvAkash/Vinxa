import React from 'react';
import { MeetingSummary } from '../../types';
import { CheckCircle2, HelpCircle, Lightbulb, Sparkles, FileText } from 'lucide-react';

interface SummaryViewProps {
  summary?: MeetingSummary;
  onEvidenceClick?: (segmentId: string) => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({ summary }) => {
  if (!summary) {
    return (
      <div className="p-10 text-center text-slate-500 bg-white border border-dashed border-slate-200 rounded-2xl">
        AI Meeting Intelligence pending or meeting is currently active. Click "Re-run AI Analysis" above to generate insights.
      </div>
    );
  }

  const rawOverview = (summary.overview || '').trim();
  const paragraphs = rawOverview
    ? rawOverview.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    : [];
  const wordCount = rawOverview ? rawOverview.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="space-y-5">
      {/* Comprehensive Executive Overview (100 - 1,000 words) */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-violet-600">
            <Sparkles className="w-4 h-4" />
            <span>Comprehensive Meeting Summary & Narrative</span>
          </div>
          {wordCount > 0 && (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200/80 text-[11px] font-bold">
              <FileText className="w-3 h-3" />
              <span>Detailed Report · {wordCount} words</span>
            </span>
          )}
        </div>

        <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, idx) => (
              <p key={idx} className="leading-relaxed">
                {para}
              </p>
            ))
          ) : (
            <p className="leading-relaxed">{rawOverview}</p>
          )}
        </div>
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

      {/* Confirmed Decisions */}
      {summary.decisions && summary.decisions.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3.5">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Confirmed Decisions</span>
          </div>
          <div className="space-y-3">
            {summary.decisions.map((dec, index) => (
              <div
                key={index}
                className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-1.5"
              >
                <p className="text-sm font-semibold text-slate-900">{dec.decision}</p>
                {dec.reason && <p className="text-xs text-slate-600">{dec.reason}</p>}
              </div>
            ))}
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
