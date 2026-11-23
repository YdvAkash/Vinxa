package com.vinxa.live.stt;

import java.util.UUID;
import java.util.function.Consumer;

public interface SpeechToTextProvider {
    void startSession(UUID meetingId, Consumer<TranscriptEvent> eventConsumer);

    default void startSession(UUID meetingId, String language, Consumer<TranscriptEvent> eventConsumer) {
        startSession(meetingId, eventConsumer);
    }

    default void switchLanguage(UUID meetingId, String language) {
    }

    void sendAudioChunk(UUID meetingId, byte[] pcm16Data);

    void stopSession(UUID meetingId);
}
