package com.vinxa.live.stt;

import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * High-performance streaming STT provider.
 * For local environments and testing, synthesizes realistic speaker-diarized transcript
 * events from incoming audio frames. Can be swapped with Deepgram live streaming client.
 */
@Service
public class SyntheticStreamingProvider implements SpeechToTextProvider {

    private final Map<UUID, SessionState> activeSessions = new ConcurrentHashMap<>();

    private static class SessionState {
        Consumer<TranscriptEvent> consumer;
        long totalBytes;
        int phraseIndex;

        SessionState(Consumer<TranscriptEvent> consumer) {
            this.consumer = consumer;
            this.totalBytes = 0;
            this.phraseIndex = 0;
        }
    }

    private static final String[][] DIALOGUE = {
            {"speaker-1", "Alex (Tech Lead)", "Let's review the audio streaming pipeline from Chrome tab capture to WebSocket."},
            {"speaker-2", "Priya (Backend Eng)", "The PCM16 16kHz stream is being validated and buffered with bounded queues."},
            {"speaker-3", "David (Frontend Eng)", "We verified the consent workflow prevents silent recording on Google Meet."},
            {"speaker-1", "Alex (Tech Lead)", "Excellent. Let's proceed with finalizing the structured AI intelligence synthesis."}
    };

    @Override
    public void startSession(UUID meetingId, Consumer<TranscriptEvent> eventConsumer) {
        activeSessions.put(meetingId, new SessionState(eventConsumer));
    }

    @Override
    public void sendAudioChunk(UUID meetingId, byte[] pcm16Data) {
        SessionState session = activeSessions.get(meetingId);
        if (session == null) return;

        session.totalBytes += pcm16Data.length;

        // Emit a simulated final transcript segment every ~32KB (~1 second of 16kHz 16-bit mono PCM)
        if (session.totalBytes >= 32000 && session.phraseIndex < DIALOGUE.length) {
            String[] turn = DIALOGUE[session.phraseIndex];
            session.phraseIndex++;
            session.totalBytes = 0;

            long start = (session.phraseIndex - 1) * 3000L;
            long end = start + 2800L;

            TranscriptEvent event = new TranscriptEvent(
                    "TRANSCRIPT",
                    meetingId,
                    UUID.randomUUID(),
                    turn[0],
                    turn[1],
                    turn[2],
                    start,
                    end,
                    true,
                    0.97
            );

            session.consumer.accept(event);
        }
    }

    @Override
    public void stopSession(UUID meetingId) {
        activeSessions.remove(meetingId);
    }
}
