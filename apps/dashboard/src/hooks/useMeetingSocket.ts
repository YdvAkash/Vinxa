import { useEffect, useState, useRef } from 'react';
import { TranscriptSegment } from '../types';
import { api } from '../services/api';

export function useMeetingSocket(meetingId: string | null) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!meetingId) {
      setSegments([]);
      setInterimText('');
      setConnected(false);
      return;
    }

    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // 1. Fetch existing segments from DB and poll every 1.5s for guaranteed live consistency
    const syncSegmentsFromDb = async () => {
      try {
        const dbSegments = await api.getTranscript(meetingId);
        if (!isMounted || !Array.isArray(dbSegments)) return;

        setSegments((prev) => {
          if (dbSegments.length === 0 && prev.length > 0) return prev;
          const byId = new Map<string, TranscriptSegment>();
          for (const s of prev) byId.set(s.id, s);
          for (const s of dbSegments) byId.set(s.id, s);
          return Array.from(byId.values()).sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
        });
      } catch {
        // Ignore transient poll errors
      }
    };

    syncSegmentsFromDb();
    const pollInterval = setInterval(syncSegmentsFromDb, 1500);

    // 2. Connect real-time Event WebSocket for sub-second interim + final push
    const connectWebSocket = () => {
      if (!isMounted) return;
      const isLocal =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const wsBase = !isLocal
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        : (import.meta as any).env?.VITE_WS_BASE_URL || 'ws://api.vinxa.ogakash.xyz';
      const wsUrl = `${wsBase}/ws/events?meetingId=${encodeURIComponent(meetingId)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMounted) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'TRANSCRIPT_INTERIM') {
            setInterimText(data.text || '');
          } else if (data.type === 'TRANSCRIPT') {
            setInterimText('');
            const newSeg: TranscriptSegment = {
              id: data.segmentId || 'seg-' + Date.now(),
              meetingId: data.meetingId || meetingId,
              speakerKey: data.speakerKey || 'speaker-1',
              speakerName: data.speakerName || 'Speaker',
              text: data.text,
              startMs: data.startMs || 0,
              endMs: data.endMs || 0,
              isFinal: true,
              confidence: data.confidence || 0.95
            };
            setSegments((prev) => {
              if (prev.some((s) => s.id === newSeg.id)) return prev;
              return [...prev, newSeg];
            });
          }
        } catch (e) {
          console.error('Socket parse error:', e);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setConnected(false);
        reconnectTimer = setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [meetingId]);

  return { segments, setSegments, interimText, connected };
}
