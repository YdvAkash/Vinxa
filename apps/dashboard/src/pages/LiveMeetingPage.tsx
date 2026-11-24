import React, { useState, useEffect, useRef } from 'react';
import { Meeting } from '../types';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformIcon, PlatformBadge } from '../components/ui/PlatformBadge';
import { useMeetingSocket } from '../hooks/useMeetingSocket';
import { api } from '../services/api';
import {
  Radio,
  StopCircle,
  Users,
  Activity,
  Sparkles,
  AlertCircle,
  Globe,
  Languages,
  Copy,
  Check,
  Download
} from 'lucide-react';

interface LiveMeetingPageProps {
  meeting: Meeting | null;
  allMeetings?: Meeting[];
  onSelectLiveMeeting?: (meeting: Meeting) => void;
  onStopMeeting: () => void;
  onSelectAnotherMeeting?: () => void;
}

export const SPOKEN_LANGUAGES = [
  { code: 'multi', label: '🌐 Auto Multi-Language (English + Hindi + Global)' },
  { code: 'hi', label: '🇮🇳 Hindi (हिन्दी)' },
  { code: 'en-IN', label: '🇮🇳 English (India)' },
  { code: 'en-US', label: '🇺🇸 English (US)' },
  { code: 'ja', label: '🇯🇵 Japanese (日本語)' },
  { code: 'es', label: '🇪🇸 Spanish (Español)' },
  { code: 'fr', label: '🇫🇷 French (Français)' },
  { code: 'de', label: '🇩🇪 German (Deutsch)' },
  { code: 'pt', label: '🇧🇷 Portuguese (Português)' },
  { code: 'it', label: '🇮🇹 Italian (Italiano)' },
  { code: 'ru', label: '🇷🇺 Russian (Русский)' },
  { code: 'zh', label: '🇨🇳 Chinese (中文)' },
  { code: 'ko', label: '🇰🇷 Korean (한국어)' }
];

export const TRANSLATION_LANGUAGES = [
  { code: 'ORIGINAL', label: 'Original Speech Only (No Translation)' },
  { code: 'Hindi (हिन्दी)', label: '🇮🇳 Translate Live to Hindi (हिन्दी)' },
  { code: 'English', label: '🇺🇸 Translate Live to English' },
  { code: 'Japanese (日本語)', label: '🇯🇵 Translate Live to Japanese (日本語)' },
  { code: 'Spanish (Español)', label: '🇪🇸 Translate Live to Spanish (Español)' },
  { code: 'French (Français)', label: '🇫🇷 Translate Live to French (Français)' },
  { code: 'German (Deutsch)', label: '🇩🇪 Translate Live to German (Deutsch)' },
  { code: 'Portuguese (Português)', label: '🇧🇷 Translate Live to Portuguese' },
  { code: 'Arabic (العربية)', label: '🇸🇦 Translate Live to Arabic (العربية)' },
  { code: 'Chinese (中文)', label: '🇨🇳 Translate Live to Chinese (中文)' },
  { code: 'Russian (Русский)', label: '🇷🇺 Translate Live to Russian (Русский)' }
];

export const LiveMeetingPage: React.FC<LiveMeetingPageProps> = ({
  meeting,
  allMeetings = [],
  onSelectLiveMeeting,
  onStopMeeting,
  onSelectAnotherMeeting
}) => {
  const savedSettings = api.getStoredSettings();
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [spokenLanguage, setSpokenLanguage] = useState<string>(
    savedSettings.defaultSpokenLanguage || 'multi'
  );
  const [targetTranslation, setTargetTranslation] = useState<string>(
    savedSettings.defaultTranslationLanguage || 'ORIGINAL'
  );
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<boolean>(false);
  const [switchingLang, setSwitchingLang] = useState<boolean>(false);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [joineeInput, setJoineeInput] = useState<string>('');
  const [syncedJoinees, setSyncedJoinees] = useState<string[]>([]);
  const [syncingJoinees, setSyncingJoinees] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const { segments, setSegments, interimText, connected } = useMeetingSocket(
    meeting ? meeting.id : null
  );

  useEffect(() => {
    if (savedSettings.autoScrollLive) {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
  }, [segments.length, interimText]);

  useEffect(() => {
    setTranslations({});
  }, [targetTranslation, meeting?.id]);

  // Automatically seed authenticated host / detected joinees on meeting selection
  useEffect(() => {
    if (!meeting?.id) return;
    api
      .syncMeetingJoinees(meeting.id, [])
      .then((res) => {
        if (Array.isArray(res.joinees) && res.joinees.length > 0) {
          setSyncedJoinees(res.joinees);
        }
      })
      .catch(() => {});
  }, [meeting?.id]);

  const handleSyncJoinees = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meeting || !joineeInput.trim()) return;
    const names = joineeInput
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setSyncingJoinees(true);
    try {
      const merged = Array.from(new Set([...syncedJoinees, ...names]));
      const res = await api.syncMeetingJoinees(meeting.id, merged, names[0]);
      setSyncedJoinees(res.joinees || merged);
      setJoineeInput('');
      if (res.assignedSpeakers) {
        setSegments((prev) =>
          prev.map((s) =>
            res.assignedSpeakers[s.speakerKey]
              ? { ...s, speakerName: res.assignedSpeakers[s.speakerKey] }
              : s
          )
        );
      }
    } catch (err) {
      console.warn('Joinee sync error:', err);
    } finally {
      setSyncingJoinees(false);
    }
  };

  useEffect(() => {
    if (targetTranslation === 'ORIGINAL' || segments.length === 0) return;

    const untranslated = segments.filter((s) => !translations[s.id]);
    if (untranslated.length === 0) return;

    let isCancelled = false;
    async function runTranslation() {
      setTranslating(true);
      try {
        const texts = untranslated.map((s) => s.text);
        const translatedList = await api.translateTexts(texts, targetTranslation);
        if (isCancelled) return;

        setTranslations((prev) => {
          const next = { ...prev };
          untranslated.forEach((seg, idx) => {
            next[seg.id] = translatedList[idx] || seg.text;
          });
          return next;
        });
      } catch (e) {
        console.warn('Live translation error:', e);
      } finally {
        if (!isCancelled) setTranslating(false);
      }
    }

    runTranslation();
    return () => {
      isCancelled = true;
    };
  }, [segments, targetTranslation]);

  const handleSpokenLanguageChange = async (newLang: string) => {
    setSpokenLanguage(newLang);
    if (!meeting) return;
    setSwitchingLang(true);
    try {
      await api.changeMeetingLanguage(meeting.id, newLang);
    } catch (e) {
      console.warn('Language switch error:', e);
    } finally {
      setSwitchingLang(false);
    }
  };

  const handleRenameSpeaker = async (speakerKey: string, newDisplayName: string) => {
    if (!meeting) return;
    await api.renameSpeaker(meeting.id, speakerKey, newDisplayName);
    setSegments((prev) =>
      prev.map((s) => (s.speakerKey === speakerKey ? { ...s, speakerName: newDisplayName } : s))
    );
  };

  const handleCopyTranscript = () => {
    if (segments.length === 0) return;
    const text = segments
      .map((s) => {
        const trans =
          targetTranslation !== 'ORIGINAL' && translations[s.id]
            ? `\n  [${targetTranslation}]: ${translations[s.id]}`
            : '';
        return `${s.speakerName}: ${s.text}${trans}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleDownloadTranscript = () => {
    if (!meeting || segments.length === 0) return;
    const md = [
      `# ${meeting.title}`,
      `- **Platform:** ${meeting.platform}`,
      `- **Status:** ${meeting.status}`,
      `- **Date:** ${new Date(meeting.createdAt).toLocaleString()}`,
      '',
      '## Live Diarized Transcript',
      ...segments.map((s) => {
        const trans =
          targetTranslation !== 'ORIGINAL' && translations[s.id]
            ? `\n  - *${targetTranslation}:* ${translations[s.id]}`
            : '';
        return `- **${s.speakerName}**: ${s.text}${trans}`;
      })
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-live.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!meeting) {
    return (
      <div className="p-16 text-center rounded-3xl bg-white border border-dashed border-violet-200 space-y-3 shadow-2xs">
        <AlertCircle className="w-8 h-8 text-violet-500 mx-auto" />
        <h3 className="text-base font-extrabold text-slate-900">No Active Meeting Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Select an active meeting or start a session using the Vinxa Chrome Extension on Google Meet, Teams, or Zoom.
        </p>
        {onSelectAnotherMeeting && (
          <button
            type="button"
            onClick={onSelectAnotherMeeting}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-xs shadow-sm transition cursor-pointer"
          >
            Go to Meeting Overview
          </button>
        )}
      </div>
    );
  }

  const isRecording = meeting.status === 'RECORDING' || meeting.status === 'READY';
  const isProcessing =
    meeting.status === 'ANALYSIS_PENDING' ||
    meeting.status === 'FINALIZING' ||
    meeting.status === 'STOPPING';

  const uniqueSpeakers =
    new Set(segments.map((s) => s.speakerKey)).size || meeting.participantCount || 1;

  return (
    <div className="space-y-5">
      {/* Active Session Header Bar (Scroll & Transcript buttons removed from here) */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformIcon platform={meeting.platform} className="w-7 h-7" />
            <PlatformBadge platform={meeting.platform} />
            <StatusBadge status={meeting.status} />
            {allMeetings.length > 1 && onSelectLiveMeeting && (
              <select
                value={meeting.id}
                onChange={(e) => {
                  const found = allMeetings.find((m) => m.id === e.target.value);
                  if (found) onSelectLiveMeeting(found);
                }}
                aria-label="Switch meeting session"
                className="bg-[#f4f3f9] border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-violet-400"
              >
                {allMeetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.status === 'RECORDING' ? '🔴 [LIVE] ' : ''}
                    {m.title} (
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    )
                  </option>
                ))}
              </select>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">{meeting.title}</h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-violet-500" />
              <span>{uniqueSpeakers} Identified Speaker(s)</span>
            </div>
            <span>·</span>
            <div className="flex items-center space-x-1">
              <Activity
                className={`w-3.5 h-3.5 ${connected ? 'text-emerald-600' : 'text-amber-500'}`}
              />
              <span className={connected ? 'text-emerald-700 font-semibold' : 'text-amber-600'}>
                {connected
                  ? 'Live WebSocket + Neon DB Sync Connected'
                  : 'Reconnecting Live Stream...'}
              </span>
            </div>
          </div>
        </div>

        {/* Session Status / Stop Action */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isRecording ? (
            <button
              type="button"
              onClick={onStopMeeting}
              className="px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
            >
              <StopCircle className="w-4 h-4 text-red-600" />
              <span>Stop & Finalize Meeting</span>
            </button>
          ) : isProcessing ? (
            <div className="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold flex items-center space-x-2 animate-pulse">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Generating AI Intelligence...</span>
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">
              Meeting Finalized
            </div>
          )}
        </div>
      </div>

      {/* Multi-Language Controls Bar */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center space-x-3 bg-[#fbfaff] border border-slate-200/80 rounded-2xl px-4 py-2.5">
          <Globe className="w-4 h-4 text-violet-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Spoken Audio Language (Deepgram Nova-2)
              </label>
              {switchingLang && (
                <span className="text-[10px] text-violet-600 font-bold animate-pulse">
                  Switching...
                </span>
              )}
            </div>
            <select
              value={spokenLanguage}
              onChange={(e) => handleSpokenLanguageChange(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-none mt-0.5 cursor-pointer"
            >
              {SPOKEN_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-3 bg-[#fbfaff] border border-slate-200/80 rounded-2xl px-4 py-2.5">
          <Languages className="w-4 h-4 text-violet-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Live Bilingual Translation (Google Gemini)
              </label>
              {translating && (
                <span className="text-[10px] text-violet-600 font-bold animate-pulse">
                  Translating live...
                </span>
              )}
            </div>
            <select
              value={targetTranslation}
              onChange={(e) => setTargetTranslation(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-slate-800 focus:outline-none mt-0.5 cursor-pointer"
            >
              {TRANSLATION_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Automatic Joinee-to-Speaker Name Assignment Bar */}
      <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-900">
                Auto-Assign Speaker Names from Meeting Joinees
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                Auto-Detected from Call & Speech
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {syncedJoinees.length > 0
                ? `Active Joinees Mapped: ${syncedJoinees.join(' · ')}`
                : 'Joinees are automatically detected from Google Meet / Teams / Zoom tiles or self-introductions.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSyncJoinees} className="flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={joineeInput}
            onChange={(e) => setJoineeInput(e.target.value)}
            placeholder="Add joinees (e.g. Akash, Priya, Rohit)"
            className="bg-[#fbfaff] border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400 w-56 sm:w-64"
          />
          <button
            type="submit"
            disabled={!joineeInput.trim() || syncingJoinees}
            className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
          >
            {syncingJoinees ? 'Assigning...' : 'Auto-Assign'}
          </button>
        </form>
      </div>

      {/* Main Transcript Stream Card (Transcript Copy & Download buttons placed here) */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-2xs space-y-4 relative">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <Radio
              className={`w-4 h-4 ${connected ? 'text-violet-600 animate-pulse' : 'text-slate-400'}`}
            />
            <h3 className="font-extrabold text-slate-900 text-sm">
              Real-Time Multi-Language Diarized Transcript Stream
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {interimText && (
              <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold animate-pulse">
                Active Speech
              </span>
            )}
            <span className="text-xs text-slate-500 font-mono font-semibold mr-1">
              {segments.length} Finalized Turn(s)
            </span>

            {segments.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="px-3 py-1.5 rounded-xl bg-[#f4f3f9] hover:bg-violet-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Transcript</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTranscript}
                  className="px-3 py-1.5 rounded-xl bg-[#f4f3f9] hover:bg-violet-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .MD</span>
                </button>
              </>
            )}
          </div>
        </div>

        {segments.length === 0 && !interimText ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center mx-auto text-violet-600">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <p className="text-sm text-slate-800 font-bold">Listening for live meeting speech...</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Speak in your meeting tab. Live captions appear both on your meeting screen (frosted glass HUD) and right here in real time.
            </p>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="max-h-[520px] overflow-y-auto pr-2 space-y-2"
          >
            <TranscriptFeed
              segments={segments}
              interimText={interimText}
              translations={targetTranslation !== 'ORIGINAL' ? translations : {}}
              targetLanguageLabel={targetTranslation !== 'ORIGINAL' ? targetTranslation : undefined}
              highlightedId={selectedSegmentId}
              onSelectSegment={(id) => setSelectedSegmentId(id)}
              onRenameSpeaker={handleRenameSpeaker}
            />
            <div ref={feedEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};
