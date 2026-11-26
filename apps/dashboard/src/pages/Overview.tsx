import React, { useState } from 'react';
import { Meeting } from '../types';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformIcon } from '../components/ui/PlatformBadge';
import meetIconUrl from '../assets/meet_icon.png';
import teamsIconUrl from '../assets/teams_icon.png';
import zoomIconUrl from '../assets/zoom_icon.png';
import {
  Play,
  Plus,
  Sparkles,
  Calendar,
  CheckSquare,
  Users,
  Clock,
  ExternalLink,
  MoreVertical,
  Trash2,
  ArrowUpRight,
  Link2,
  Check
} from 'lucide-react';
import { api } from '../services/api';

interface OverviewProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  onGoToLive: () => void;
  onGoToCopilot?: (initialQuestion?: string) => void;
  onCreateMeeting: (title: string, platform: string, url: string) => Promise<void>;
  onDeleteMeeting?: (meetingId: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({
  meetings,
  onSelectMeeting,
  onGoToLive,
  onGoToCopilot,
  onCreateMeeting,
  onDeleteMeeting
}) => {
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPlatform, setNewPlatform] = useState('GOOGLE_MEET');
  const [newUrl, setNewUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleQuickShareLink = async (e: React.MouseEvent, meeting: Meeting) => {
    e.stopPropagation();
    setSharingId(meeting.id);
    try {
      const updated = await api.enablePublicShare(meeting.id);
      if (updated.shareToken) {
        const shareUrl = `${window.location.origin}/?share=${updated.shareToken}`;
        await navigator.clipboard.writeText(shareUrl);
        setCopiedId(meeting.id);
        setTimeout(() => setCopiedId((prev) => (prev === meeting.id ? null : prev)), 2500);
      }
    } catch (err) {
      console.error('Quick share failed:', err);
    } finally {
      setSharingId(null);
    }
  };

  const activeMeeting = meetings.find((m) => m.status === 'RECORDING');
  const completedMeetings = meetings.filter(
    (m) => m.status === 'ANALYSIS_COMPLETED' || m.status === 'COMPLETED'
  );
  const totalDecisions = meetings.reduce(
    (acc, m) => acc + (m.decisionCount ?? m.summary?.decisions?.length ?? 0),
    0
  );
  const totalActionItems = meetings.reduce(
    (acc, m) => acc + (m.actionItemCount ?? m.summary?.actionItems?.length ?? 0),
    0
  );
  const totalTranscriptTurns = meetings.reduce((acc, m) => acc + (m.segmentCount ?? 0), 0);

  const filteredByPlatform =
    platformFilter === 'ALL'
      ? meetings
      : meetings.filter((m) => m.platform === platformFilter);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await onCreateMeeting(newTitle.trim(), newPlatform, newUrl.trim());
      setShowModal(false);
      setNewTitle('');
      setNewUrl('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          HERO BANNER
          ===================================================================== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#f3effe] via-[#ebe4ff] to-[#e2d8ff] border border-violet-200/80 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-xs">
        <div className="absolute -right-12 -top-12 w-72 h-72 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
        <div className="absolute left-1/2 -bottom-16 w-64 h-64 rounded-full bg-purple-400/15 blur-3xl pointer-events-none" />

        <div className="space-y-3.5 max-w-xl relative z-10">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-violet-600">
            AI MEETING INTELLIGENCE
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-slate-900 tracking-tight leading-[1.16]">
            Turn every meeting into <span className="text-violet-600">actionable</span>
            <br className="hidden sm:inline" /> knowledge.
          </h1>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            Real-time captions, multi-language translation, AI summaries, key decisions and action items — all in one place.
          </p>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-1">
            <button
              type="button"
              onClick={onGoToLive}
              className="w-full xs:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md shadow-violet-500/25 transition cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{activeMeeting ? 'Live Session Active' : 'Open Live Monitor'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex-1 xs:flex-initial px-4 py-2.5 rounded-xl bg-white hover:bg-violet-50 text-slate-800 font-bold text-xs flex items-center justify-center space-x-1.5 border border-slate-200/90 shadow-2xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-700" />
              <span>New Session</span>
            </button>

            {onGoToCopilot && (
              <button
                type="button"
                onClick={() => onGoToCopilot()}
                className="flex-1 xs:flex-initial px-4 py-2.5 rounded-xl bg-white hover:bg-violet-50 text-slate-800 font-bold text-xs flex items-center justify-center space-x-1.5 border border-slate-200/90 shadow-2xs transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-violet-600" />
                <span>Ask Vinxa AI</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Floating 3D Frosted Glass Visuals */}
        <div className="hidden md:flex items-center justify-center relative w-80 h-44 shrink-0 select-none">
          <div className="w-56 h-36 rounded-2xl bg-white/45 backdrop-blur-md border border-white/80 shadow-lg transform -rotate-3 flex flex-col justify-between p-4">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="w-2 h-2 rounded-full bg-purple-300" />
              <span className="w-2 h-2 rounded-full bg-indigo-200" />
            </div>
            <div className="flex items-center justify-center space-x-1.5 py-2">
              {[14, 26, 18, 30, 12, 22, 28, 16, 24, 14].map((h, idx) => (
                <span
                  key={idx}
                  className="w-1.5 rounded-full bg-gradient-to-t from-violet-600 to-purple-400"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <div className="h-2 w-2/3 mx-auto rounded-full bg-violet-300/60" />
          </div>

          <div className="absolute left-3 top-6 w-14 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30 flex items-center justify-center transform -rotate-6">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6.5A2.5 2.5 0 016.5 4h7A2.5 2.5 0 0116 6.5v11a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 014 17.5v-11zm13.5 3l3.5-2.2v9.4L17.5 14.5v-5z" />
            </svg>
          </div>

          <div className="absolute right-1 top-3 px-3.5 py-2.5 rounded-2xl bg-white/80 backdrop-blur-md border border-white shadow-md flex items-center space-x-2.5 transform rotate-3">
            <span className="text-xs font-extrabold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-md">
              A/文
            </span>
            <div className="space-y-1">
              <div className="w-12 h-1.5 rounded-full bg-violet-300" />
              <div className="w-8 h-1.5 rounded-full bg-violet-200" />
            </div>
          </div>

          <div className="absolute right-8 bottom-2 w-11 h-11 rounded-2xl bg-white/85 backdrop-blur-md border border-white shadow-md flex items-center justify-center text-violet-600 transform rotate-6">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* =====================================================================
          4 KPI METRIC CARDS WITH SMOOTH SVG SPARKLINES
          ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Total Meetings</div>
                <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {meetings.length}
                </div>
              </div>
            </div>
            <div className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1 pt-0.5">
              <span>↑ {completedMeetings.length} analyzed</span>
              <span className="text-slate-400 font-normal">this month</span>
            </div>
          </div>
          <svg className="w-20 h-10 text-violet-500 shrink-0" viewBox="0 0 80 36" fill="none">
            <path
              d="M2 28C14 28 18 18 28 20C38 22 44 30 54 18C64 6 70 10 78 6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Confirmed Decisions</div>
                <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {totalDecisions}
                </div>
              </div>
            </div>
            <div className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1 pt-0.5">
              <span>↑ +100%</span>
              <span className="text-slate-400 font-normal">evidence-linked</span>
            </div>
          </div>
          <svg className="w-20 h-10 text-emerald-500 shrink-0" viewBox="0 0 80 36" fill="none">
            <path
              d="M2 30C16 26 22 24 34 22C46 20 54 10 66 12C72 13 75 8 78 5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Action Items</div>
                <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {totalActionItems}
                </div>
              </div>
            </div>
            <div className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1 pt-0.5">
              <span>↑ Tracked</span>
              <span className="text-slate-400 font-normal">with owners</span>
            </div>
          </div>
          <svg className="w-20 h-10 text-amber-500 shrink-0" viewBox="0 0 80 36" fill="none">
            <path
              d="M2 26C14 28 24 16 36 20C48 24 56 12 68 14C73 15 76 8 78 6"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Spoken Turns</div>
                <div className="text-2xl font-extrabold text-slate-900 leading-tight">
                  {totalTranscriptTurns}
                </div>
              </div>
            </div>
            <div className="text-[11px] font-bold text-emerald-600 flex items-center space-x-1 pt-0.5">
              <span>↑ Searchable</span>
              <span className="text-slate-400 font-normal">across workspace</span>
            </div>
          </div>
          <svg className="w-20 h-10 text-sky-500 shrink-0" viewBox="0 0 80 36" fill="none">
            <path
              d="M2 29C15 24 25 28 38 18C51 8 60 18 70 10C74 7 76 6 78 5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* =====================================================================
          FULL-WIDTH RECENT MEETING SESSIONS (With Given Platform Icons)
          ===================================================================== */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Recent Meeting Sessions
              </h2>
              <p className="text-xs text-slate-500">
                Automatically named from your meeting or discussion.
              </p>
            </div>
          </div>

          {/* Platform Filter Pills using meet_icon.png, teams_icon.png, zoom_icon.png */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#f4f3f9] p-1 rounded-xl border border-slate-200/60 self-start">
            {[
              { id: 'ALL', label: 'All', icon: null },
              { id: 'GOOGLE_MEET', label: 'Google Meet', icon: meetIconUrl },
              { id: 'MICROSOFT_TEAMS', label: 'Teams', icon: teamsIconUrl },
              { id: 'ZOOM', label: 'Zoom', icon: zoomIconUrl }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPlatformFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                  platformFilter === tab.id
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {tab.icon && (
                  <img
                    src={tab.icon}
                    alt={tab.label}
                    className="w-3.5 h-3.5 object-contain shrink-0"
                  />
                )}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sessions Rows */}
        {filteredByPlatform.length === 0 ? (
          <div className="p-10 text-center rounded-2xl bg-[#fbfaff] border border-dashed border-violet-200 space-y-3">
            <p className="text-sm font-bold text-slate-800">
              {platformFilter === 'ALL'
                ? 'No Meeting Sessions Recorded Yet'
                : `No ${platformFilter.replace('_', ' ')} Sessions Found`}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Join a Google Meet, Microsoft Teams, or Zoom call and click the Vinxa Live extension icon to capture live captions and generate AI summaries.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs transition cursor-pointer"
              >
                + New Session
              </button>
              {platformFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setPlatformFilter('ALL')}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredByPlatform.map((meeting) => {
              const dateStr = new Date(meeting.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              });
              const timeStr = new Date(meeting.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              });
              const turns = meeting.segmentCount ?? 0;

              return (
                <div
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting)}
                  className="p-3.5 sm:p-4 rounded-2xl bg-[#fbfaff] hover:bg-violet-50/50 border border-slate-200/80 hover:border-violet-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group relative"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <PlatformIcon platform={meeting.platform} className="w-10 h-10" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-violet-700 truncate transition">
                        {meeting.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="inline-flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{dateStr}</span>
                        </span>
                        <span>·</span>
                        <span>{timeStr}</span>
                        <span>·</span>
                        <span className="inline-flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{turns > 0 ? `${turns} turns` : 'Live / Ready'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right badges & action icons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-stretch sm:self-center justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={meeting.status} />

                      <span className="hidden xs:inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/80 text-[11px] font-semibold">
                        <Sparkles className="w-3 h-3 text-violet-600" />
                        <span>AI Summary</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleQuickShareLink(e, meeting)}
                        title="Copy Public Share Link"
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1 border transition ${
                          copiedId === meeting.id
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-white hover:bg-violet-50 text-slate-600 hover:text-violet-700 border-slate-200'
                        }`}
                      >
                        {copiedId === meeting.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3 h-3 text-violet-600" />
                            <span>{sharingId === meeting.id ? 'Sharing...' : 'Share'}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMeeting(meeting);
                        }}
                        title="Open Full Analysis"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-violet-100/70 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>

                      {onDeleteMeeting && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === meeting.id ? null : meeting.id);
                            }}
                            title="More actions"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {openMenuId === meeting.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 mt-1 w-40 rounded-xl bg-white border border-slate-200 shadow-lg py-1 z-30"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onSelectMeeting(meeting);
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-violet-50 flex items-center space-x-2"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5 text-violet-600" />
                                <span>Open Analysis</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  if (
                                    window.confirm(`Delete meeting session "${meeting.title}"?`)
                                  ) {
                                    onDeleteMeeting(meeting.id);
                                  }
                                }}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center space-x-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Session</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Session Modal with Given Platform Icons */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">
                Create New Meeting Session
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700 text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Platform</label>
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
                  {[
                    { id: 'GOOGLE_MEET', label: 'Google Meet', icon: meetIconUrl },
                    { id: 'MICROSOFT_TEAMS', label: 'MS Teams', icon: teamsIconUrl },
                    { id: 'ZOOM', label: 'Zoom', icon: zoomIconUrl }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNewPlatform(p.id)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                        newPlatform === p.id
                          ? 'bg-violet-50 border-violet-500 text-violet-700'
                          : 'bg-[#f7f6fc] border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <img src={p.icon} alt={p.label} className="w-4 h-4 object-contain" />
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Meeting Title{' '}
                  <span className="text-slate-400 font-normal">
                    (Leave blank for auto meeting code)
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Product Strategy Sync"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#f7f6fc] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Meeting URL or Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-[#f7f6fc] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-violet-500/20 transition cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
