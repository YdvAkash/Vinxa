import { useEffect, useState } from 'react';
import { TranscriptSegment } from '../types';

export function useMeetingSocket(meetingId: string | null) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!meetingId) {
      setSegments([]);
      setInterimText('');
      return;
    }

    const wsUrl = `ws://localhost:8080/ws/meetings/${encodeURIComponent(meetingId)}/events`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'TRANSCRIPT_INTERIM') {
          setInterimText(data.text || '');
        } else if (data.type === 'TRANSCRIPT') {
          setInterimText('');
          const newSeg: TranscriptSegment = {
            id: data.segmentId || 'seg-' + Date.now(),
            meetingId: data.meetingId,
            speakerKey: data.speakerKey || 'speaker-1',
            speakerName: data.speakerName || 'Speaker',
            text: data.text,
            startMs: data.startMs || 0,
            endMs: data.endMs || 0,
            isFinal: true,
            confidence: data.confidence || 0.95
          };
          setSegments((prev) => [...prev, newSeg]);
        }
      } catch (e) {
        console.error('Socket parse error:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [meetingId]);

  return { segments, setSegments, interimText, connected };
}
