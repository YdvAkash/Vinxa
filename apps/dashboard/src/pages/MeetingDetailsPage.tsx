import React, { useState } from 'react';
import { Meeting, TranscriptSegment } from '../types';
import { SummaryView } from '../components/meetings/SummaryView';
import { ActionItemsView } from '../components/meetings/ActionItemsView';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { Download, Trash2, ArrowLeft, FileText, CheckSquare, ListOrdered, Share2 } from 'lucide-react';

interface MeetingDetailsPageProps {
  meeting: Meeting;
  transcript: TranscriptSegment[];
  onBack: () => void;
  onDelete: (meetingId: string) => void;
}

export const MeetingDetailsPage: React.FC<MeetingDetailsPageProps> = ({
  meeting,
  transcript,
  onBack,
  onDelete
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'actionItems' | 'transcript'>('summary');
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  const handleEvidenceClick = (segmentId: string) => {
    setActiveTab('transcript');
    setHighlightedSegmentId(segmentId);
    setTimeout(() => {
      const element = document.getElementById(segmentId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleExport = (format: 'md' | 'json') => {
    const data = format === 'md'
      ? `# Meeting Notes: ${meeting.title}\n\n## Overview\n${meeting.summary?.overview || ''}\n\n## Decisions\n${meeting.summary?.decisions.map(d => `- ${d.decision} (Reason: ${d.reason})`).join('\n') || ''}`
      : JSON.stringify({ meeting, transcript }, null, 2);

    const blob = new Blob([data], { type: format === 'md' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title.toLowerCase().replace(/\s+/g, '-')}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Back and Actions bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleExport('md')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Markdown</span>
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={() => onDelete(meeting.id)}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-400 border border-red-500/20 flex items-center space-x-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Meeting Data</span>
          </button>
        </div>
      </div>

      {/* Title & Metadata Header */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center space-x-3">
          <PlatformBadge platform={meeting.platform} />
          <StatusBadge status={meeting.status} />
          <span className="text-xs text-slate-500 font-mono">Created {new Date(meeting.createdAt).toLocaleString()}</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{meeting.title}</h1>
        <p className="text-xs text-slate-400 font-mono">URL: {meeting.meetingUrl}</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('summary')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'summary'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Executive Summary & Decisions</span>
        </button>

        <button
          onClick={() => setActiveTab('actionItems')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'actionItems'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Action Items ({meeting.summary?.actionItems.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === 'transcript'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          <span>Complete Diarized Transcript ({transcript.length})</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === 'summary' && (
          <SummaryView summary={meeting.summary} onEvidenceClick={handleEvidenceClick} />
        )}

        {activeTab === 'actionItems' && (
          <ActionItemsView
            actionItems={meeting.summary?.actionItems}
            onEvidenceClick={handleEvidenceClick}
          />
        )}

        {activeTab === 'transcript' && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <TranscriptFeed
              segments={transcript}
              highlightedId={highlightedSegmentId}
              onSelectSegment={(id) => setHighlightedSegmentId(id)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
