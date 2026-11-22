import React, { useState } from 'react';
import { Meeting } from '../types';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { useMeetingSocket } from '../hooks/useMeetingSocket';
import { Radio, StopCircle, Users, Activity, Sparkles, AlertCircle } from 'lucide-react';

interface LiveMeetingPageProps {
  meeting: Meeting | null;
  onStopMeeting: () => void;
  onSelectAnotherMeeting?: () => void;
}

export const LiveMeetingPage: React.FC<LiveMeetingPageProps> = ({
  meeting,
  onStopMeeting,
  onSelectAnotherMeeting
}) => {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Real-time WebSocket hook connected to backend live events
  const { segments, interimText, connected } = useMeetingSocket(meeting ? meeting.id : null);

  if (!meeting) {
    return (
      <div className="p-16 text-center rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 space-y-3">
        <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
        <h3 className="text-base font-semibold text-white">No Active Meeting Selected</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Select an active meeting or start a session using the Vinxa Chrome Extension on Google Meet, Teams, or Zoom.
        </p>
        {onSelectAnotherMeeting && (
          <button
            onClick={onSelectAnotherMeeting}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-600 transition"
          >
            Go to Meeting Overview
          </button>
        )}
      </div>
    );
  }

  const isRecording = meeting.status === 'RECORDING';
  const isProcessing = meeting.status === 'ANALYSIS_PENDING' || meeting.status === 'FINALIZING' || meeting.status === 'STOPPING';

  return (
    <div className="space-y-6">
      {/* Active Session Header Bar */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <PlatformBadge platform={meeting.platform} />
            <StatusBadge status={meeting.status} />
            <span className="text-xs text-slate-400 font-mono">ID: {meeting.id}</span>
          </div>
          <h2 className="text-xl font-bold text-white">{meeting.title}</h2>
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <div className="flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>{meeting.participants?.length || 0} Speakers</span>
            </div>
            <span>•</span>
            <div className="flex items-center space-x-1">
              <Activity className={`w-3.5 h-3.5 ${connected ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className={connected ? 'text-emerald-400' : 'text-slate-400'}>
                {connected ? 'WebSocket Stream Connected' : 'Waiting for Audio Stream'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {isRecording ? (
            <button
              onClick={onStopMeeting}
              className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <StopCircle className="w-4 h-4 text-red-400" />
              <span>Stop & Finalize Meeting</span>
            </button>
          ) : isProcessing ? (
            <div className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center space-x-2 animate-pulse">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span>Generating AI Intelligence via Google Gemini...</span>
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-medium">
              Meeting Finalized
            </div>
          )}
        </div>
      </div>

      {/* Main Transcript Stream Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2">
            <Radio className={`w-4 h-4 ${connected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <h3 className="font-semibold text-white text-sm">Real-time Diarized Transcript Stream</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {segments.length} Finalized Turns
          </span>
        </div>

        {segments.length === 0 && !interimText ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <p className="text-sm">Listening for meeting speech...</p>
            <p className="text-xs text-slate-600">
              Audio frames streamed via Chrome Extension are processed by Deepgram streaming STT.
            </p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto pr-2">
            <TranscriptFeed
              segments={segments}
              interimText={interimText}
              highlightedId={selectedSegmentId}
              onSelectSegment={(id) => setSelectedSegmentId(id)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
