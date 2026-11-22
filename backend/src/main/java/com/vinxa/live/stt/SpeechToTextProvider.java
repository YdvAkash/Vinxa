package com.vinxa.live.stt;

import java.util.UUID;
import java.util.function.Consumer;

public interface SpeechToTextProvider {
    void startSession(UUID meetingId, Consumer<TranscriptEvent> eventConsumer);
    void sendAudioChunk(UUID meetingId, byte[] pcm16Data);
    void stopSession(UUID meetingId);
}
