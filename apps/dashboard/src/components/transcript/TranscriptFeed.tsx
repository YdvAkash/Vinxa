import React, { useState } from 'react';
import { TranscriptSegment } from '../../types';
import { User, Languages, Edit3, Check, Copy } from 'lucide-react';

interface TranscriptFeedProps {
  segments: TranscriptSegment[];
  interimText?: string;
  translations?: Record<string, string>;
  targetLanguageLabel?: string;
  onSelectSegment?: (segmentId: string) => void;
  highlightedId?: string | null;
  onRenameSpeaker?: (speakerKey: string, newDisplayName: string) => Promise<void>;
}

const SPEAKER_STYLES: Record<string, { badge: string; text: string; border: string }> = {
  'speaker-1': {
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    text: 'text-violet-700',
    border: 'border-l-violet-600'
  },
  'speaker-2': {
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    text: 'text-sky-700',
    border: 'border-l-sky-500'
  },
  'speaker-3': {
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    text: 'text-emerald-700',
    border: 'border-l-emerald-500'
  },
  'speaker-4': {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    text: 'text-amber-700',
    border: 'border-l-amber-500'
  }
};

export const TranscriptFeed: React.FC<TranscriptFeedProps> = React.memo(({
  segments,
  interimText,
  translations = {},
  targetLanguageLabel,
  onSelectSegment,
  highlightedId,
  onRenameSpeaker
}) => {
  const [editingSpeakerKey, setEditingSpeakerKey] = useState<string | null>(null);
  const [draftSpeakerName, setDraftSpeakerName] = useState<string>('');
  const [savingSpeaker, setSavingSpeaker] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatTime = (ms: number) => {
    const totalSec = Math.floor((ms || 0) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStyle = (speakerKey: string) => {
    return (
      SPEAKER_STYLES[speakerKey] || {
        badge: 'bg-violet-100 text-violet-700 border-violet-200',
        text: 'text-violet-700',
        border: 'border-l-violet-600'
      }
    );
  };

  const handleCopyTurn = (e: React.MouseEvent, seg: TranscriptSegment) => {
    e.stopPropagation();
    const translated = translations[seg.id];
    const textToCopy = translated
      ? `[${formatTime(seg.startMs)}] ${seg.speakerName}: ${seg.text}\n(${targetLanguageLabel}: ${translated})`
      : `[${formatTime(seg.startMs)}] ${seg.speakerName}: ${seg.text}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(seg.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleSaveSpeaker = async (e: React.FormEvent, speakerKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draftSpeakerName.trim() || !onRenameSpeaker) {
      setEditingSpeakerKey(null);
      return;
    }
    setSavingSpeaker(true);
    try {
      await onRenameSpeaker(speakerKey, draftSpeakerName.trim());
    } finally {
      setSavingSpeaker(false);
      setEditingSpeakerKey(null);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {segments.map((seg, index) => {
        const isHighlighted = highlightedId === seg.id;
        const isLatest = index === segments.length - 1;
        const translatedText = translations[seg.id];
        const style = getStyle(seg.speakerKey);

        return (
          <div
            key={seg.id}
            id={seg.id}
            onClick={() => onSelectSegment?.(seg.id)}
            className={`p-3.5 sm:p-4 rounded-2xl transition cursor-pointer border border-l-4 group ${
              style.border
            } ${
              isHighlighted
                ? 'bg-violet-50 border-violet-300 ring-2 ring-violet-400/30'
                : 'bg-[#fbfaff] border-slate-200/80 hover:border-violet-200 hover:bg-violet-50/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
              <div className="flex items-center flex-wrap gap-2">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${style.badge}`}
                >
                  <User className="w-3 h-3" />
                </div>

                {editingSpeakerKey === seg.speakerKey ? (
                  <form
                    onSubmit={(e) => handleSaveSpeaker(e, seg.speakerKey)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center space-x-1"
                  >
                    <input
                      type="text"
                      value={draftSpeakerName}
                      onChange={(e) => setDraftSpeakerName(e.target.value)}
                      autoFocus
                      placeholder="Speaker name"
                      className="bg-white border border-violet-400 rounded-lg px-2 py-0.5 text-xs text-slate-900 focus:outline-none w-32"
                    />
                    <button
                      type="submit"
                      disabled={savingSpeaker}
                      className="p-1 rounded-lg bg-violet-600 text-white font-bold"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <span className={`font-bold ${style.text}`}>{seg.speakerName}</span>
                    {onRenameSpeaker && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraftSpeakerName(seg.speakerName);
                          setEditingSpeakerKey(seg.speakerKey);
                        }}
                        title="Rename speaker across this meeting"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-violet-600 p-0.5 transition"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-mono">
                  {seg.speakerKey}
                </span>

                {isLatest && !interimText && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold">
                    Latest Turn
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleCopyTurn(e, seg)}
                  title="Copy utterance"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg hover:bg-violet-100 text-slate-400 hover:text-violet-700 transition"
                >
                  {copiedId === seg.id ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <span className="text-slate-400 font-mono text-[11px]">
                  {formatTime(seg.startMs)}
                </span>
              </div>
            </div>

            <p className="text-sm text-slate-800 leading-relaxed pl-7 break-words">{seg.text}</p>

            {translatedText && (
              <div className="mt-2 ml-7 p-2.5 rounded-xl bg-violet-50/80 border border-violet-200/70 space-y-0.5">
                <div className="flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">
                  <Languages className="w-3 h-3" />
                  <span>{targetLanguageLabel || 'Live Translation'}</span>
                </div>
                <p className="text-sm text-violet-950 font-medium leading-relaxed break-words">
                  {translatedText}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {interimText && (
        <div className="p-4 rounded-2xl border border-dashed border-violet-400 bg-violet-50/70 shadow-xs">
          <div className="flex items-center justify-between mb-1.5 text-xs text-violet-700 font-bold">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-violet-600 animate-ping" />
              <span>Active Speaker — Transcribing Live...</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-violet-500">
              Real-Time Stream
            </span>
          </div>
          <p className="text-sm sm:text-base text-slate-900 font-semibold italic pl-4 break-words">
            "{interimText}"
          </p>
        </div>
      )}
    </div>
  );
});
