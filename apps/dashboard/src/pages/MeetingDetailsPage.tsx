import React, { useState, useEffect } from 'react';
import { Meeting, TranscriptSegment, MeetingSummary, ActionItem } from '../types';
import { SummaryView } from '../components/meetings/SummaryView';
import { ActionItemsView } from '../components/meetings/ActionItemsView';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { api } from '../services/api';
import { Download, Trash2, ArrowLeft, FileText, CheckSquare, ListOrdered, Share2 } from 'lucide-react';

interface MeetingDetailsPageProps {
  meeting: Meeting;
  onBack: () => void;
  onDelete: (meetingId: string) => void;
}

export const MeetingDetailsPage: React.FC<MeetingDetailsPageProps> = ({
  meeting,
  onBack,
  onDelete
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'actionItems' | 'transcript'>('summary');
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<MeetingSummary | undefined>(meeting.summary);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [transcripts, sum, actions] = await Promise.all([
          api.getTranscript(meeting.id),
          api.getSummary(meeting.id),
          api.getActionItems(meeting.id)
        ]);

        if (isMounted) {
          setTranscript(transcripts);
          if (sum) setSummary(sum);
          setActionItems(actions);
        }
      } catch (err) {
        console.error('Failed loading meeting details:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [meeting.id]);

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
      ? `# Meeting Notes: ${meeting.title}\n\n## Overview\n${summary?.overview || ''}\n\n## Decisions\n${summary?.decisions?.map(d => `- ${d.decision} (Reason: ${d.reason})`).join('\n') || ''}`
      : JSON.stringify({ meeting, summary, actionItems, transcript }, null, 2);

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
            <span>Delete Meeting</span>
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
        {meeting.meetingUrl && <p className="text-xs text-slate-400 font-mono">URL: {meeting.meetingUrl}</p>}
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
          <span>Action Items ({actionItems.length})</span>
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
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
            Loading meeting data from Neon Cloud database...
          </div>
        ) : (
          <>
            {activeTab === 'summary' && (
              <SummaryView summary={summary} onEvidenceClick={handleEvidenceClick} />
            )}

            {activeTab === 'actionItems' && (
              <ActionItemsView
                actionItems={actionItems}
                onEvidenceClick={handleEvidenceClick}
              />
            )}

            {activeTab === 'transcript' && (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
                {transcript.length === 0 ? (
                  <p className="text-center text-slate-500 text-xs py-8">
                    No transcript segments recorded for this meeting.
                  </p>
                ) : (
                  <TranscriptFeed
                    segments={transcript}
                    highlightedId={highlightedSegmentId}
                    onSelectSegment={(id) => setHighlightedSegmentId(id)}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
