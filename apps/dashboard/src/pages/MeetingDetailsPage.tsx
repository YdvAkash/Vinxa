import React, { useState, useEffect } from 'react';
import { Meeting, TranscriptSegment, MeetingSummary, ActionItem } from '../types';
import { SummaryView } from '../components/meetings/SummaryView';
import { ActionItemsView } from '../components/meetings/ActionItemsView';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { AskAiPage } from './AskAiPage';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformIcon, PlatformBadge } from '../components/ui/PlatformBadge';
import { api } from '../services/api';
import {
  Download,
  Trash2,
  ArrowLeft,
  FileText,
  CheckSquare,
  ListOrdered,
  Share2,
  Sparkles,
  Edit3,
  Check,
  Copy,
  RefreshCw,
  Languages,
  Globe,
  Link2
} from 'lucide-react';
import { TRANSLATION_LANGUAGES } from './LiveMeetingPage';

interface MeetingDetailsPageProps {
  meeting: Meeting;
  initialSegmentId?: string | null;
  onBack: () => void;
  onDelete: (meetingId: string) => void;
  onRename?: (meetingId: string, newTitle: string) => Promise<void>;
}

export const MeetingDetailsPage: React.FC<MeetingDetailsPageProps> = ({
  meeting,
  initialSegmentId,
  onBack,
  onDelete,
  onRename
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'actionItems' | 'transcript' | 'copilot'>(
    initialSegmentId ? 'transcript' : 'summary'
  );
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(
    initialSegmentId || null
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(meeting.title);

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState<MeetingSummary | undefined>(meeting.summary);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const [targetTranslation, setTargetTranslation] = useState<string>('ORIGINAL');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<boolean>(false);

  const [shareToken, setShareToken] = useState<string | null>(meeting.shareToken || null);
  const [publicShared, setPublicShared] = useState<boolean>(Boolean(meeting.publicShared));
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [sharingLoading, setSharingLoading] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [transcripts, sum, actions] = await Promise.all([
        api.getTranscript(meeting.id),
        api.getSummary(meeting.id),
        api.getActionItems(meeting.id)
      ]);
      setTranscript(transcripts);
      if (sum) setSummary(sum);
      setActionItems(actions);
    } catch (err) {
      console.error('Failed loading meeting details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setDraftTitle(meeting.title);
    setShareToken(meeting.shareToken || null);
    setPublicShared(Boolean(meeting.publicShared));
    loadData();
  }, [meeting.id]);

  const getPublicShareUrl = (token: string | null) => {
    if (!token) return '';
    return `${window.location.origin}/?share=${token}`;
  };

  const handleOpenShareModal = async () => {
    setShowShareModal(true);
    if (!publicShared || !shareToken) {
      setSharingLoading(true);
      try {
        const updated = await api.enablePublicShare(meeting.id);
        setShareToken(updated.shareToken || null);
        setPublicShared(Boolean(updated.publicShared));
        if (updated.shareToken) {
          navigator.clipboard.writeText(getPublicShareUrl(updated.shareToken));
          setCopiedShareLink(true);
          setTimeout(() => setCopiedShareLink(false), 2500);
        }
      } catch (err) {
        console.error('Failed to enable public share:', err);
      } finally {
        setSharingLoading(false);
      }
    }
  };

  const handleDisableShare = async () => {
    setSharingLoading(true);
    try {
      const updated = await api.disablePublicShare(meeting.id);
      setPublicShared(Boolean(updated.publicShared));
    } catch (err) {
      console.error('Failed to disable public share:', err);
    } finally {
      setSharingLoading(false);
    }
  };

  const handleCopyShareUrl = () => {
    if (!shareToken) return;
    navigator.clipboard.writeText(getPublicShareUrl(shareToken));
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2500);
  };

  useEffect(() => {
    if (initialSegmentId) {
      setActiveTab('transcript');
      setHighlightedSegmentId(initialSegmentId);
      setTimeout(() => {
        const element = document.getElementById(initialSegmentId);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    }
  }, [initialSegmentId]);

  useEffect(() => {
    if (targetTranslation === 'ORIGINAL' || transcript.length === 0) {
      setTranslations({});
      return;
    }
    let isCancelled = false;
    async function runTranslate() {
      setTranslating(true);
      try {
        const texts = transcript.map((s) => s.text);
        const translatedList = await api.translateTexts(texts, targetTranslation);
        if (isCancelled) return;
        const map: Record<string, string> = {};
        transcript.forEach((seg, idx) => {
          map[seg.id] = translatedList[idx] || seg.text;
        });
        setTranslations(map);
      } catch (e) {
        console.warn('Translation error:', e);
      } finally {
        if (!isCancelled) setTranslating(false);
      }
    }
    runTranslate();
    return () => {
      isCancelled = true;
    };
  }, [targetTranslation, transcript]);

  const handleEvidenceClick = (segmentId: string) => {
    setActiveTab('transcript');
    setHighlightedSegmentId(segmentId);
    setTimeout(() => {
      const element = document.getElementById(segmentId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleToggleStatus = async (actionId: string) => {
    try {
      const updated = await api.toggleActionItem(meeting.id, actionId);
      setActionItems((prev) =>
        prev.map((item) => (item.id === actionId ? { ...item, status: updated.status } : item))
      );
    } catch {
      setActionItems((prev) =>
        prev.map((item) =>
          item.id === actionId
            ? { ...item, status: item.status === 'DONE' ? 'OPEN' : 'DONE' }
            : item
        )
      );
    }
  };

  const handleRenameSpeaker = async (speakerKey: string, newDisplayName: string) => {
    await api.renameSpeaker(meeting.id, speakerKey, newDisplayName);
    setTranscript((prev) =>
      prev.map((s) => (s.speakerKey === speakerKey ? { ...s, speakerName: newDisplayName } : s))
    );
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      await api.reanalyzeMeeting(meeting.id);
      setTimeout(async () => {
        await loadData();
        setReanalyzing(false);
      }, 2800);
    } catch {
      setReanalyzing(false);
    }
  };

  const handleCopyTranscript = () => {
    if (transcript.length === 0) return;
    const text = transcript.map((s) => `${s.speakerName}: ${s.text}`).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const handleExport = async (format: 'md' | 'json') => {
    let data = '';
    if (format === 'md') {
      try {
        data = await api.exportMarkdownFromServer(meeting.id);
      } catch {
        data = `# Meeting Notes: ${meeting.title}\n\n## Overview\n${summary?.overview || ''}`;
      }
    } else {
      data = JSON.stringify({ meeting, summary, actionItems, transcript }, null, 2);
    }

    const blob = new Blob([data], {
      type: format === 'md' ? 'text/markdown' : 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center space-x-2 text-xs font-bold text-slate-600 hover:text-violet-700 transition self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenShareModal}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-xs font-bold text-white shadow-sm shadow-violet-500/20 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{publicShared ? 'Public Link Active' : 'Share Public Link'}</span>
          </button>

          <button
            type="button"
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="px-3.5 py-2 rounded-xl bg-violet-100 hover:bg-violet-200/80 text-xs font-bold text-violet-700 border border-violet-200 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin' : ''}`} />
            <span>{reanalyzing ? 'Re-analyzing with Gemini...' : 'Re-run AI Analysis'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('md')}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-violet-50 text-xs font-semibold text-slate-700 border border-slate-200 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-violet-600" />
            <span>Export Markdown</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('json')}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-violet-50 text-xs font-semibold text-slate-700 border border-slate-200 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-violet-600" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete meeting session "${meeting.title}"?`)) {
                onDelete(meeting.id);
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-600 border border-red-200 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Title & Metadata Header */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <PlatformIcon platform={meeting.platform} className="w-7 h-7" />
          <PlatformBadge platform={meeting.platform} />
          <StatusBadge status={meeting.status} />
          <span className="text-xs text-slate-400 font-mono">
            Created {new Date(meeting.createdAt).toLocaleString()}
          </span>
        </div>

        {isEditingTitle ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (draftTitle.trim() && onRename) {
                await onRename(meeting.id, draftTitle.trim());
              }
              setIsEditingTitle(false);
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              autoFocus
              className="flex-1 bg-[#fbfaff] border border-violet-400 rounded-xl px-3.5 py-2 text-lg font-extrabold text-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-violet-600 text-white font-bold text-xs flex items-center space-x-1 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save</span>
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {meeting.title}
            </h1>
            {onRename && (
              <button
                type="button"
                onClick={() => {
                  setDraftTitle(meeting.title);
                  setIsEditingTitle(true);
                }}
                title="Rename meeting"
                className="px-3 py-1.5 rounded-xl bg-[#f4f3f9] hover:bg-violet-100 text-slate-600 hover:text-violet-700 border border-slate-200 text-xs font-semibold flex items-center space-x-1 transition shrink-0 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Rename</span>
              </button>
            )}
          </div>
        )}

        {meeting.meetingUrl && (
          <p className="text-xs text-slate-400 font-mono truncate">URL: {meeting.meetingUrl}</p>
        )}
      </div>

      {/* Section Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'summary'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Executive Summary & Decisions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('actionItems')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'actionItems'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Action Items ({actionItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transcript')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'transcript'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          <span>Diarized Transcript ({transcript.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('copilot')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'copilot'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/20'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Ask AI About This Meeting</span>
        </button>
      </div>

      {/* Tab Content Panels */}
      <div>
        {loading ? (
          <div className="py-12 text-center text-slate-500 text-xs font-semibold animate-pulse">
            Loading meeting intelligence from Neon Cloud PostgreSQL...
          </div>
        ) : (
          <>
            {activeTab === 'summary' && (
              <SummaryView summary={summary} onEvidenceClick={handleEvidenceClick} />
            )}

            {activeTab === 'actionItems' && (
              <ActionItemsView
                meetingId={meeting.id}
                actionItems={actionItems}
                onToggleStatus={handleToggleStatus}
                onEvidenceClick={handleEvidenceClick}
              />
            )}

            {activeTab === 'transcript' && (
              <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <Languages className="w-4 h-4 text-violet-600" />
                    <span className="text-xs text-slate-700 font-bold">Bilingual View:</span>
                    <select
                      value={targetTranslation}
                      onChange={(e) => setTargetTranslation(e.target.value)}
                      className="bg-[#f4f3f9] border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-400"
                    >
                      {TRANSLATION_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    {translating && (
                      <span className="text-xs text-violet-600 font-bold animate-pulse">
                        Translating...
                      </span>
                    )}
                  </div>

                  {transcript.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCopyTranscript}
                      className="px-3.5 py-1.5 rounded-xl bg-[#f4f3f9] hover:bg-violet-50 text-xs font-semibold text-slate-700 border border-slate-200 flex items-center space-x-1.5 self-start cursor-pointer"
                    >
                      {copiedTranscript ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied All!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Full Transcript</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {transcript.length === 0 ? (
                  <p className="text-center text-slate-400 text-xs py-8">
                    No transcript segments recorded for this meeting.
                  </p>
                ) : (
                  <TranscriptFeed
                    segments={transcript}
                    translations={targetTranslation !== 'ORIGINAL' ? translations : {}}
                    targetLanguageLabel={
                      targetTranslation !== 'ORIGINAL' ? targetTranslation : undefined
                    }
                    highlightedId={highlightedSegmentId}
                    onSelectSegment={(id) => setHighlightedSegmentId(id)}
                    onRenameSpeaker={handleRenameSpeaker}
                  />
                )}
              </div>
            )}

            {activeTab === 'copilot' && (
              <AskAiPage
                meetings={[meeting]}
                fixedMeeting={meeting}
                onSelectCitation={(_mId, segId) => {
                  if (segId) handleEvidenceClick(segId);
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Share Public Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Share Meeting Analysis Link
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Anyone with this public URL can view the executive summary, decisions, action items, and transcript.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {sharingLoading ? (
              <div className="py-8 text-center text-xs font-bold text-violet-600 animate-pulse">
                Generating secure public share link...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#fbfaff] border border-violet-200/80">
                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        publicShared ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {publicShared ? 'Public Link is Active' : 'Public Link is Disabled'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {publicShared
                          ? 'Viewers do not need a Vinxa account to view this report.'
                          : 'Only you can access this meeting right now.'}
                      </p>
                    </div>
                  </div>
                  {publicShared ? (
                    <button
                      type="button"
                      onClick={handleDisableShare}
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold transition cursor-pointer"
                    >
                      Disable Link
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenShareModal}
                      className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition cursor-pointer"
                    >
                      Enable Link
                    </button>
                  )}
                </div>

                {publicShared && shareToken && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 block">
                      Public Shareable URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={getPublicShareUrl(shareToken)}
                        className="flex-1 bg-[#f4f3f9] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyShareUrl}
                        className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center space-x-1.5 shrink-0 cursor-pointer"
                      >
                        {copiedShareLink ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  {publicShared && shareToken ? (
                    <a
                      href={getPublicShareUrl(shareToken)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-violet-600 hover:text-violet-800 flex items-center space-x-1"
                    >
                      <span>Preview Public Page in New Tab →</span>
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowShareModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
