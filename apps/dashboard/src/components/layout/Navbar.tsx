import React, { useState, useEffect, useRef } from 'react';
import { AuthUser, Meeting, SearchResultItem } from '../../types';
import { api } from '../../services/api';
import {
  LogOut,
  Search,
  X,
  Menu,
  FileText,
  Quote,
  ArrowRight,
  Bell,
  ChevronDown,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface NavbarProps {
  onSearch?: (query: string) => void;
  user?: AuthUser | null;
  onLogout?: () => void;
  meetings?: Meeting[];
  onSelectMeetingResult?: (meetingId: string, segmentId?: string) => void;
  onToggleMobileMenu?: () => void;
  mobileMenuOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSearch,
  user,
  onLogout,
  meetings = [],
  onSelectMeetingResult,
  onToggleMobileMenu,
  mobileMenuOpen
}) => {
  const [query, setQuery] = useState('');
  const [transcriptResults, setTranscriptResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'AY';

  // Keyboard shortcut Cmd+K / Ctrl+K to focus global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setDropdownOpen(true);
      } else if (e.key === 'Escape') {
        setDropdownOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced full-text search across Neon PostgreSQL transcripts
  useEffect(() => {
    onSearch?.(query);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setTranscriptResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.search(trimmed);
        setTranscriptResults(Array.isArray(res) ? res.slice(0, 6) : []);
      } catch {
        setTranscriptResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const matchedMeetings =
    query.trim().length >= 2
      ? meetings
          .filter(
            (m) =>
              m.title.toLowerCase().includes(query.toLowerCase()) ||
              m.platform.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 4)
      : [];

  const formatTime = (ms: number) => {
    const totalSec = Math.floor((ms || 0) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const recentAnalyzed = meetings.slice(0, 4);

  return (
    <header className="h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-7 flex items-center justify-between gap-4">
      {/* Left: Mobile Menu Button (on mobile) + Wide Global Search Bar */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        <div ref={searchContainerRef} className="flex-1 relative">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              placeholder="Search meetings, transcripts, decisions, or ask anything..."
              aria-label="Search meetings and transcripts"
              className="w-full bg-[#f4f3f9] hover:bg-[#efedf8] focus:bg-white border border-transparent focus:border-violet-300 rounded-xl pl-10 pr-16 py-2 text-xs sm:text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/15 transition"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  onSearch?.('');
                  setTranscriptResults([]);
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-white text-[10px] font-mono font-semibold text-slate-500 border border-slate-200/90 shadow-2xs pointer-events-none">
                ⌘ K
              </span>
            )}
          </div>

          {/* Search Results Dropdown Popover */}
          {dropdownOpen && query.trim().length >= 2 && (
            <div className="absolute left-0 right-0 mt-2 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden z-50 max-h-[420px] overflow-y-auto divide-y divide-slate-100">
              {matchedMeetings.length > 0 && (
                <div className="p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                    Matching Meetings ({matchedMeetings.length})
                  </div>
                  {matchedMeetings.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelectMeetingResult?.(m.id);
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-violet-50/70 flex items-center justify-between gap-2 transition group cursor-pointer"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-violet-600 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 group-hover:text-violet-700 truncate">
                            {m.title}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {m.platform} · {new Date(m.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              <div className="p-3 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 flex items-center justify-between">
                  <span>Spoken Transcript Matches</span>
                  {isSearching && (
                    <span className="text-violet-600 animate-pulse">Searching DB...</span>
                  )}
                </div>

                {transcriptResults.length === 0 && !isSearching ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    {matchedMeetings.length === 0
                      ? `No meetings or transcript quotes found for "${query}".`
                      : 'No exact transcript quotes matched.'}
                  </div>
                ) : (
                  transcriptResults.map((item) => (
                    <button
                      key={item.segmentId}
                      type="button"
                      onClick={() => {
                        onSelectMeetingResult?.(item.meetingId, item.segmentId);
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-violet-50/70 space-y-1 transition group cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[10px] text-violet-600 font-bold">
                        <span className="truncate">{item.meetingTitle}</span>
                        <span className="font-mono text-slate-400 shrink-0">
                          [{formatTime(item.startMs)}]
                        </span>
                      </div>
                      <div className="flex items-start space-x-2">
                        <Quote className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-700 line-clamp-2 group-hover:text-slate-950">
                          "{item.content}"
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Extension Synced Pill + Notification Bell + User Profile Dropdown */}
      <div className="flex items-center space-x-3 shrink-0">
        <div
          title="Authenticated session is automatically synced with the Vinxa Chrome Extension"
          className="hidden sm:flex items-center space-x-2 text-xs font-semibold text-emerald-800 bg-emerald-50/90 px-3.5 py-1.5 rounded-full border border-emerald-200/80"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Extension Synced</span>
        </div>

        {/* Notifications Bell Popover */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label="Notifications"
            className="relative p-2 rounded-xl text-slate-600 hover:text-violet-700 hover:bg-violet-50 transition cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-600 ring-2 ring-white" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200 shadow-xl p-3 z-50 space-y-2">
              <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100">
                <span className="text-xs font-extrabold text-slate-900">
                  Workspace Activity
                </span>
                <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                  Live Sync
                </span>
              </div>
              {recentAnalyzed.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  No recent meeting notifications yet.
                </p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {recentAnalyzed.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onSelectMeetingResult?.(m.id);
                        setNotifOpen(false);
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-violet-50/60 flex items-start space-x-2.5 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{m.title}</p>
                        <p className="text-[11px] text-slate-500">
                          {m.status === 'RECORDING'
                            ? 'Live transcription in progress'
                            : `${m.segmentCount ?? 0} turns · AI summary ready`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        {user && (
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2.5 pl-2 pr-2.5 py-1.5 rounded-full hover:bg-violet-50/80 border border-transparent hover:border-violet-200/70 transition cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center text-xs font-extrabold text-violet-700">
                {initials}
              </div>
              <span className="text-xs font-semibold text-slate-700 hidden md:inline max-w-[170px] truncate">
                {user.email}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 z-50 space-y-1">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900 truncate">{user.email}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold flex items-center space-x-1 mt-0.5">
                    <Sparkles className="w-3 h-3" />
                    <span>Chrome Extension Connected</span>
                  </p>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-50 text-red-600 text-xs font-semibold flex items-center space-x-2 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out of Workspace</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
