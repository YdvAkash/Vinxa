import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Overview } from './pages/Overview';
import { LiveMeetingPage } from './pages/LiveMeetingPage';
import { MeetingDetailsPage } from './pages/MeetingDetailsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { AskAiPage } from './pages/AskAiPage';
import { AuthPage } from './pages/AuthPage';
import { PublicSharedMeetingPage } from './pages/PublicSharedMeetingPage';
import { api } from './services/api';
import { Meeting, AuthUser, ActionItem, WebhookDispatchResult } from './types';
import { parseJiraTaskDetails } from './components/meetings/ActionItemsView';
import { CheckSquare, Square, ArrowUpRight, Send, Check } from 'lucide-react';

export const App: React.FC = () => {
  const [publicShareToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('share')) return params.get('share');
    const pathMatch = window.location.pathname.match(/\/share\/([a-zA-Z0-9_-]+)/);
    return pathMatch ? pathMatch[1] : null;
  });

  if (publicShareToken) {
    return <PublicSharedMeetingPage shareToken={publicShareToken} />;
  }

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => api.getStoredUser());
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    if (path.includes('/live') || params.has('id')) {
      return 'live';
    }
    return 'overview';
  });
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | null>(null);
  const [liveSelectedMeetingId, setLiveSelectedMeetingId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [globalActionItems, setGlobalActionItems] = useState<
    { meeting: Meeting; item: ActionItem }[]
  >([]);
  const [loadingGlobalActions, setLoadingGlobalActions] = useState(false);
  const [pushingGlobalId, setPushingGlobalId] = useState<string | null>(null);
  const [pushedGlobalMap, setPushedGlobalMap] = useState<Record<string, WebhookDispatchResult>>({});

  useEffect(() => {
    api.verifySession().then((verifiedUser) => {
      if (verifiedUser) {
        setCurrentUser(verifiedUser);
      } else if (!localStorage.getItem('vinxa_token')) {
        setCurrentUser(null);
      }
    });

    const handleExpired = () => {
      setCurrentUser(null);
      setMeetings([]);
      setSelectedMeeting(null);
    };
    window.addEventListener('vinxa-session-expired', handleExpired);
    return () => window.removeEventListener('vinxa-session-expired', handleExpired);
  }, []);

  const computeMeetingsSignature = (list: Meeting[]) =>
    list
      .map(
        (m) =>
          `${m.id}:${m.status}:${m.title}:${m.segmentCount ?? 0}:${m.actionItemCount ?? 0}:${m.decisionCount ?? 0}:${m.participantCount ?? 0}:${m.publicShared ? 1 : 0}:${m.shareToken ?? ''}`
      )
      .join('|');

  const fetchMeetings = async (force = false) => {
    if (!api.getStoredUser() && !localStorage.getItem('vinxa_token')) {
      setLoading(false);
      return;
    }
    if (!force && typeof document !== 'undefined' && document.hidden) {
      return;
    }
    try {
      const data = await api.getMeetings();
      setMeetings((prev) => {
        if (!force && computeMeetingsSignature(prev) === computeMeetingsSignature(data)) {
          return prev;
        }
        return data;
      });
      if (data.length > 0) {
        setSelectedMeeting((prev) => {
          if (!prev) return data[0];
          const updated = data.find((m) => m.id === prev.id);
          if (!updated) return data[0];
          if (
            updated.status === prev.status &&
            updated.title === prev.title &&
            updated.segmentCount === prev.segmentCount &&
            updated.actionItemCount === prev.actionItemCount &&
            updated.decisionCount === prev.decisionCount &&
            updated.publicShared === prev.publicShared &&
            updated.shareToken === prev.shareToken
          ) {
            return prev;
          }
          return updated;
        });
      }
      const activeRec = data.find((m) => m.status === 'RECORDING');
      if (activeRec) {
        setLiveSelectedMeetingId((prevId) => (prevId === activeRec.id ? prevId : activeRec.id));
      }
    } catch (err) {
      console.warn('Backend meetings check:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    fetchMeetings(true);
    const interval = setInterval(() => fetchMeetings(false), 3000);
    const onStatusUpdated = () => fetchMeetings(true);
    window.addEventListener('vinxa-meeting-status-updated', onStatusUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('vinxa-meeting-status-updated', onStatusUpdated);
    };
  }, [currentUser]);

  useEffect(() => {
    if (currentTab !== 'action-items' || meetings.length === 0) return;
    let cancelled = false;
    async function loadAllActions() {
      setLoadingGlobalActions(true);
      try {
        const meetingById = new Map<string, Meeting>(meetings.map((m) => [m.id, m]));
        try {
          const allItems = await api.getAllActionItems();
          if (!cancelled && Array.isArray(allItems)) {
            const list: { meeting: Meeting; item: ActionItem }[] = [];
            for (const it of allItems) {
              const m = it.meetingId ? meetingById.get(it.meetingId) : meetings[0];
              if (m) list.push({ meeting: m, item: it });
            }
            setGlobalActionItems(list);
            return;
          }
        } catch {
          // Fallback if batch endpoint unavailable
        }
        const list: { meeting: Meeting; item: ActionItem }[] = [];
        await Promise.all(
          meetings.slice(0, 15).map(async (m) => {
            try {
              const items = await api.getActionItems(m.id);
              items.forEach((it) => list.push({ meeting: m, item: it }));
            } catch {}
          })
        );
        if (!cancelled) setGlobalActionItems(list);
      } finally {
        if (!cancelled) setLoadingGlobalActions(false);
      }
    }
    loadAllActions();
    return () => {
      cancelled = true;
    };
  }, [currentTab, meetings.length]);

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setMeetings([]);
    setSelectedMeeting(null);
  };

  if (!currentUser) {
    return (
      <AuthPage
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setLoading(true);
        }}
      />
    );
  }

  const liveMeeting =
    meetings.find((m) => m.status === 'RECORDING') ||
    (liveSelectedMeetingId ? meetings.find((m) => m.id === liveSelectedMeetingId) || null : null) ||
    (meetings.length > 0 ? meetings[0] : null);

  const handleSelectMeeting = (meeting: Meeting, segmentId?: string | null) => {
    setSelectedMeeting(meeting);
    setHighlightedSegmentId(segmentId || null);
    setCurrentTab('details');
  };

  const handleSelectSearchResult = (meetingId: string, segmentId?: string) => {
    const found = meetings.find((m) => m.id === meetingId);
    if (found) {
      handleSelectMeeting(found, segmentId || null);
    }
  };

  const handleCreateMeeting = async (title: string, platform: string, url: string) => {
    const newMeeting = await api.createMeeting(title, platform, url);
    await fetchMeetings();
    setSelectedMeeting(newMeeting);
    setLiveSelectedMeetingId(newMeeting.id);
    setCurrentTab('live');
  };

  const handleRenameMeeting = async (meetingId: string, newTitle: string) => {
    const updated = await api.renameMeeting(meetingId, newTitle);
    setSelectedMeeting(updated);
    await fetchMeetings();
  };

  const handleStopMeeting = async () => {
    if (!liveMeeting) return;
    try {
      await api.stopMeeting(liveMeeting.id);
      await fetchMeetings();
      setSelectedMeeting(liveMeeting);
      setCurrentTab('details');
    } catch (err) {
      console.error('Stop meeting error:', err);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    try {
      await api.deleteMeeting(meetingId);
      await fetchMeetings();
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting(null);
        setCurrentTab('overview');
      }
    } catch (err) {
      console.error('Delete meeting error:', err);
    }
  };

  const handleToggleGlobalAction = async (meetingId: string, actionId: string) => {
    try {
      const updated = await api.toggleActionItem(meetingId, actionId);
      setGlobalActionItems((prev) =>
        prev.map((entry) =>
          entry.item.id === actionId
            ? { ...entry, item: { ...entry.item, status: updated.status } }
            : entry
        )
      );
    } catch {}
  };

  const handlePushGlobalActionWebhook = async (meetingId: string, actionId: string) => {
    setPushingGlobalId(actionId);
    try {
      const res = await api.pushActionItemToWebhook(meetingId, actionId);
      setPushedGlobalMap((prev) => ({ ...prev, [actionId]: res }));
    } catch (err) {
      console.error('Webhook dispatch failed:', err);
    } finally {
      setPushingGlobalId(null);
    }
  };

  const filteredMeetings = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.platform.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex bg-[#f7f6fc] text-slate-900">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isRecording={meetings.some((m) => m.status === 'RECORDING')}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        meetingCount={meetings.length}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          onSearch={(q) => setSearchQuery(q)}
          user={currentUser}
          onLogout={handleLogout}
          meetings={meetings}
          onSelectMeetingResult={handleSelectSearchResult}
          mobileMenuOpen={mobileMenuOpen}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-7 pb-24 lg:pb-8">
          <div className="max-w-7xl mx-auto">
            {loading && meetings.length === 0 ? (
              <div className="py-24 text-center text-slate-500 text-sm font-semibold animate-pulse">
                Loading your workspace...
              </div>
            ) : (
              <>
                {currentTab === 'overview' && (
                  <Overview
                    meetings={filteredMeetings}
                    onSelectMeeting={(m) => handleSelectMeeting(m)}
                    onGoToLive={() => setCurrentTab('live')}
                    onGoToCopilot={(initialQ) => {
                      if (initialQ) setCopilotInitialPrompt(initialQ);
                      setCurrentTab('copilot');
                    }}
                    onCreateMeeting={handleCreateMeeting}
                    onDeleteMeeting={handleDeleteMeeting}
                  />
                )}

                {currentTab === 'copilot' && (
                  <AskAiPage
                    meetings={meetings}
                    initialPrompt={copilotInitialPrompt}
                    onClearInitialPrompt={() => setCopilotInitialPrompt(null)}
                    onSelectCitation={(meetingId, segmentId) => {
                      const found = meetings.find((m) => m.id === meetingId);
                      if (found) {
                        handleSelectMeeting(found, segmentId);
                      }
                    }}
                  />
                )}

                {currentTab === 'live' && (
                  <LiveMeetingPage
                    meeting={liveMeeting}
                    allMeetings={meetings}
                    onSelectLiveMeeting={(m) => setLiveSelectedMeetingId(m.id)}
                    onStopMeeting={handleStopMeeting}
                    onSelectAnotherMeeting={() => setCurrentTab('overview')}
                  />
                )}

                {currentTab === 'details' && (
                  selectedMeeting ? (
                    <MeetingDetailsPage
                      meeting={selectedMeeting}
                      initialSegmentId={highlightedSegmentId}
                      onBack={() => setCurrentTab('overview')}
                      onDelete={handleDeleteMeeting}
                      onRename={handleRenameMeeting}
                    />
                  ) : (
                    <HistoryPage
                      meetings={filteredMeetings}
                      onSelectMeeting={(m) => handleSelectMeeting(m)}
                      onDeleteMeeting={handleDeleteMeeting}
                    />
                  )
                )}

                {currentTab === 'history' && (
                  <HistoryPage
                    meetings={filteredMeetings}
                    onSelectMeeting={(m) => handleSelectMeeting(m)}
                    onDeleteMeeting={handleDeleteMeeting}
                  />
                )}

                {currentTab === 'action-items' && (
                  <div className="space-y-6">
                    <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-extrabold text-slate-900 flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                            <CheckSquare className="w-4 h-4" />
                          </div>
                          <span>Workspace Action Items</span>
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                          All action items automatically extracted across your meetings with owners and verifiable transcript evidence.
                        </p>
                      </div>
                      <span className="px-3.5 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 text-xs font-bold self-start sm:self-center">
                        {globalActionItems.length} Total Tasks
                      </span>
                    </div>

                    {loadingGlobalActions ? (
                      <div className="p-12 text-center text-xs text-slate-500 font-semibold animate-pulse">
                        Loading action items across all meetings...
                      </div>
                    ) : globalActionItems.length === 0 ? (
                      <div className="p-14 text-center rounded-3xl bg-white border border-dashed border-violet-200 space-y-2">
                        <CheckSquare className="w-8 h-8 text-violet-400 mx-auto" />
                        <p className="text-sm font-bold text-slate-800">
                          No Action Items Extracted Yet
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          When action items or tasks with deadlines are discussed during a meeting, Vinxa AI automatically lists them here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {globalActionItems.map(({ meeting, item }, idx) => {
                          const isDone = (item.status || '').toUpperCase() === 'DONE';
                          const jira = parseJiraTaskDetails(item.task || item.title || 'Action Item', idx);
                          return (
                            <div
                              key={item.id}
                              className={`p-4 sm:p-5 rounded-2xl bg-white border transition flex flex-col sm:flex-row sm:items-start justify-between gap-4 shadow-2xs ${
                                isDone
                                  ? 'border-slate-200/60 opacity-65'
                                  : 'border-slate-200/90 hover:border-violet-300'
                              }`}
                            >
                              <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleGlobalAction(meeting.id, item.id)}
                                  className={`mt-0.5 p-1 rounded-lg hover:bg-violet-50 transition cursor-pointer ${
                                    isDone ? 'text-emerald-600' : 'text-slate-400 hover:text-violet-600'
                                  }`}
                                >
                                  {isDone ? (
                                    <CheckSquare className="w-4 h-4" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </button>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-mono text-[11px] font-bold">
                                      <span>☑</span>
                                      <span>{jira.ticketKey}</span>
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-extrabold uppercase tracking-wider">
                                      {jira.issueType}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
                                        isDone
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-slate-100 text-slate-700 border-slate-200'
                                      }`}
                                    >
                                      {isDone ? 'DONE' : 'TO DO'}
                                    </span>
                                    <span className="font-semibold text-xs text-violet-700">
                                      {meeting.title}
                                    </span>
                                  </div>
                                  <p
                                    className={`text-sm sm:text-base font-extrabold ${
                                      isDone ? 'line-through text-slate-400' : 'text-slate-900'
                                    }`}
                                  >
                                    {jira.summary}
                                  </p>
                                  <p className="text-xs text-slate-600 leading-relaxed">
                                    <strong className="text-slate-800">Deliverable: </strong>
                                    {jira.acceptanceCriteria}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                                    <span>
                                      Assignee: <strong className="text-slate-800">{item.assignee || 'Unassigned'}</strong>
                                    </span>
                                    <span>·</span>
                                    <span>
                                      Priority: <strong className="text-slate-800">{item.priority || 'MEDIUM'}</strong>
                                    </span>
                                    {item.deadline && (
                                      <>
                                        <span>·</span>
                                        <span>Due: {item.deadline}</span>
                                      </>
                                    )}
                                  </div>
                                  {pushedGlobalMap[item.id]?.success && (
                                    <p className="mt-2 text-xs text-emerald-700 font-bold flex items-center space-x-1.5">
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>Task synced to connected project board</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-center justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                                <button
                                  type="button"
                                  onClick={() => handlePushGlobalActionWebhook(meeting.id, item.id)}
                                  disabled={pushingGlobalId === item.id}
                                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition cursor-pointer ${
                                    pushedGlobalMap[item.id]?.success
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'
                                  }`}
                                >
                                  {pushedGlobalMap[item.id]?.success ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Synced to Project Board</span>
                                    </>
                                  ) : (
                                    <>
                                      <Send className="w-3.5 h-3.5" />
                                      <span>
                                        {pushingGlobalId === item.id
                                          ? 'Syncing...'
                                          : 'Send to Project Board'}
                                      </span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSelectMeeting(meeting)}
                                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center space-x-1 cursor-pointer"
                                >
                                  <span>Open Meeting</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {currentTab === 'settings' && (
                  <SettingsPage
                    user={currentUser}
                    meetings={meetings}
                    onRefreshMeetings={fetchMeetings}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
