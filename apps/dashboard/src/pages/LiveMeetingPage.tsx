import React, { useState } from 'react';
import { Meeting, TranscriptSegment } from '../types';
import { TranscriptFeed } from '../components/transcript/TranscriptFeed';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { Radio, Mic, StopCircle, Users, Activity } from 'lucide-react';

interface LiveMeetingPageProps {
  meeting: Meeting;
  transcript: TranscriptSegment[];
  onStopMeeting: () => void;
}

export const LiveMeetingPage: React.FC<LiveMeetingPageProps> = ({
  meeting,
  transcript,
  onStopMeeting
}) => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedInterim, setSimulatedInterim] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const isRecording = meeting.status === 'RECORDING';

  const triggerMockSpeech = () => {
    setIsSimulating(true);
    setSimulatedInterim('We are verifying the WebSocket binary audio stream to ensure minimal jitter...');
    setTimeout(() => {
      setSimulatedInterim('');
      setIsSimulating(false);
    }, 3000);
  };

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
              <span>{meeting.participants.length} Active Speakers</span>
            </div>
            <span>•</span>
            <div className="flex items-center space-x-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">AudioWorklet PCM16 @ 16kHz Active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={triggerMockSpeech}
            disabled={isSimulating}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center space-x-1.5 border border-slate-700 transition"
          >
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simulate Live Speech</span>
          </button>

          {isRecording ? (
            <button
              onClick={onStopMeeting}
              className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <StopCircle className="w-4 h-4 text-red-400" />
              <span>Stop & Finalize Meeting</span>
            </button>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-medium">
              Meeting Completed
            </div>
          )}
        </div>
      </div>

      {/* Main Transcript Stream Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="font-semibold text-white text-sm">Real-time Diarized Transcript Stream</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {transcript.length} Finalized Turns
          </span>
        </div>

        <div className="max-h-[500px] overflow-y-auto pr-2">
          <TranscriptFeed
            segments={transcript}
            interimText={simulatedInterim}
            highlightedId={selectedSegmentId}
            onSelectSegment={(id) => setSelectedSegmentId(id)}
          />
        </div>
      </div>
    </div>
  );
};
