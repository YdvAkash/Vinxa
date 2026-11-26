import React, { useState, useEffect } from 'react';
import { PublicSharedMeetingData } from '../types';
import { api } from '../services/api';
import { SummaryView } from '../components/meetings/SummaryView';
import { ActionItemsView } from '../components/meetings/ActionItemsView';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformIcon, PlatformBadge } from '../components/ui/PlatformBadge';
import {
  FileText,
  CheckSquare,
  ListOrdered,
  Globe,
  Copy,
  Check,
  AlertCircle,
  ArrowUpRight
} from 'lucide-react';

interface PublicSharedMeetingPageProps {
  shareToken: string;
}

export const PublicSharedMeetingPage: React.FC<PublicSharedMeetingPageProps> = ({
  shareToken
}) => {
  const [data, setData] = useState<PublicSharedMeetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'actionItems' | 'transcript'>('summary');
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getPublicSharedMeeting(shareToken)
      .then((res) => {
        setData(res);
      })
      .catch((err: any) => {
        setError(err.message || 'Unable to load shared meeting analysis.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [shareToken]);

  const handleEvidenceClick = (segmentId: string) => {
    setActiveTab('transcript');
    setHighlightedSegmentId(segmentId);
    setTimeout(() => {
      const element = document.getElementById(segmentId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleCopyShareUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#f7f6fc] text-slate-900 flex flex-col">
      {/* Public Top Navigation Bar */}
      <header className="min-h-16 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 sm:px-8 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-30">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white font-extrabold text-sm sm:text-base flex items-center justify-center shadow-sm shadow-violet-500/20 shrink-0">
            V
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-base text-slate-900 tracking-tight">Vinxa</span>
              <span className="hidden xs:inline-block px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold truncate">
                Shared Meeting Report
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyShareUrl}
            className="px-3 py-2 rounded-xl bg-[#f4f3f9] hover:bg-violet-100 text-slate-700 hover:text-violet-800 border border-slate-200 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-violet-600" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <a
            href="/"
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-sm shadow-violet-500/20 transition"
          >
            <span>Open Workspace</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {loading ? (
          <div className="py-24 text-center text-slate-500 text-sm font-semibold animate-pulse">
            Loading shared meeting analysis...
          </div>
        ) : error || !data ? (
          <div className="p-12 rounded-3xl bg-white border border-red-200 text-center space-y-3 max-w-lg mx-auto my-12 shadow-2xs">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h2 className="text-base font-extrabold text-slate-900">
              Shared Link Unavailable
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {error || 'This shared meeting link is invalid or has been revoked by the owner.'}
            </p>
            <div className="pt-2">
              <a
                href="/"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold"
              >
                <span>Go to Vinxa Dashboard</span>
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* Meeting Header Card */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <PlatformIcon platform={data.meeting.platform} className="w-7 h-7" />
                  <PlatformBadge platform={data.meeting.platform} />
                  <StatusBadge status={data.meeting.status} />
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                    <Globe className="w-3 h-3" />
                    <span>Public Read-Only Report</span>
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Shared by {data.sharedBy} · {new Date(data.meeting.createdAt).toLocaleString()}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                {data.meeting.title}
              </h1>
            </div>

            {/* Section Tabs */}
            <div className="grid grid-cols-1 xs:grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => setActiveTab('summary')}
                className={`flex items-center justify-center sm:justify-start space-x-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'summary'
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">Summary & Decisions</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('actionItems')}
                className={`flex items-center justify-center sm:justify-start space-x-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'actionItems'
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <CheckSquare className="w-4 h-4 shrink-0" />
                <span className="truncate">Action Items ({data.actionItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transcript')}
                className={`flex items-center justify-center sm:justify-start space-x-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'transcript'
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
                    : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
                }`}
              >
                <ListOrdered className="w-4 h-4 shrink-0" />
                <span className="truncate">Full Transcript ({data.transcript.length})</span>
              </button>
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === 'summary' && (
                <SummaryView
                  summary={data.summary || undefined}
                  onEvidenceClick={handleEvidenceClick}
                />
              )}

              {activeTab === 'actionItems' && (
                <ActionItemsView
                  actionItems={data.actionItems}
                  onEvidenceClick={handleEvidenceClick}
                />
              )}

              {activeTab === 'transcript' && (
                <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs">
                  {data.transcript.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-8">
                      No transcript segments recorded for this meeting.
                    </p>
                  ) : (
                    <TranscriptFeed
                      segments={data.transcript}
                      highlightedId={highlightedSegmentId}
                      onSelectSegment={(id) => setHighlightedSegmentId(id)}
                    />
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
