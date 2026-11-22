package com.vinxa.live.stt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

@Service
@Primary
public class DeepgramStreamingProvider implements SpeechToTextProvider {

    private static final Logger log = LoggerFactory.getLogger(DeepgramStreamingProvider.class);

    private final String apiKey;
    private final SyntheticStreamingProvider fallbackProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    private final Map<UUID, WebSocket> activeSockets = new ConcurrentHashMap<>();
    private final Map<UUID, Consumer<TranscriptEvent>> activeConsumers = new ConcurrentHashMap<>();
    private final Map<UUID, StringBuilder> messageBuffers = new ConcurrentHashMap<>();
    private final Map<UUID, java.util.concurrent.CompletableFuture<?>> sendPipelines = new ConcurrentHashMap<>();

    public DeepgramStreamingProvider(
            @Value("${vinxa.deepgram.api-key:}") String apiKey,
            SyntheticStreamingProvider fallbackProvider
    ) {
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.fallbackProvider = fallbackProvider;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Override
    public void startSession(UUID meetingId, Consumer<TranscriptEvent> eventConsumer) {
        if (apiKey.isEmpty()) {
            log.info("Deepgram API key not provided. Falling back to synthetic provider for meeting {}", meetingId);
            fallbackProvider.startSession(meetingId, eventConsumer);
            return;
        }

        activeConsumers.put(meetingId, eventConsumer);
        messageBuffers.put(meetingId, new StringBuilder());

        try {
            String url = "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&diarize=true&punctuate=true&interim_results=true";

            httpClient.newWebSocketBuilder()
                    .header("Authorization", "Token " + apiKey)
                    .buildAsync(URI.create(url), new DeepgramWebSocketListener(meetingId))
                    .thenAccept(ws -> {
                        activeSockets.put(meetingId, ws);
                        log.info("Connected to Deepgram Live Streaming STT for meeting {}", meetingId);
                    })
                    .exceptionally(ex -> {
                        log.warn("Failed to connect to Deepgram ({}). Falling back to synthetic provider.", ex.getMessage());
                        fallbackProvider.startSession(meetingId, eventConsumer);
                        return null;
                    });
        } catch (Exception e) {
            log.warn("Deepgram initialization error: {}. Using fallback.", e.getMessage());
            fallbackProvider.startSession(meetingId, eventConsumer);
        }
    }

    @Override
    public void sendAudioChunk(UUID meetingId, byte[] pcm16Data) {
        WebSocket ws = activeSockets.get(meetingId);
        if (ws != null) {
            ByteBuffer buf = ByteBuffer.wrap(pcm16Data);
            sendPipelines.compute(meetingId, (id, currentStage) -> {
                if (currentStage == null || currentStage.isDone()) {
                    return ws.sendBinary(buf, true);
                } else {
                    return currentStage.thenCompose(v -> ws.sendBinary(buf, true))
                            .exceptionally(ex -> {
                                log.debug("Deepgram frame send error: {}", ex.getMessage());
                                return null;
                            });
                }
            });
        } else {
            fallbackProvider.sendAudioChunk(meetingId, pcm16Data);
        }
    }

    @Override
    public void stopSession(UUID meetingId) {
        sendPipelines.remove(meetingId);
        WebSocket ws = activeSockets.remove(meetingId);
        if (ws != null) {
            try {
                // Deepgram empty buffer close signal to flush transcription pipeline
                ws.sendBinary(ByteBuffer.allocate(0), true)
                        .thenRun(() -> {
                            try {
                                ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session ended");
                            } catch (Exception e1) {}
                        })
                        .exceptionally(ex -> {
                            try {
                                ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session ended");
                            } catch (Exception e2) {}
                            return null;
                        });
            } catch (Exception e3) {
                try {
                    ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session ended");
                } catch (Exception e4) {}
            }
        }
        activeConsumers.remove(meetingId);
        messageBuffers.remove(meetingId);
        fallbackProvider.stopSession(meetingId);
    }

    private class DeepgramWebSocketListener implements WebSocket.Listener {
        private final UUID meetingId;

        public DeepgramWebSocketListener(UUID meetingId) {
            this.meetingId = meetingId;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            log.info("Deepgram Live STT WebSocket channel opened for meeting {}", meetingId);
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            StringBuilder buffer = messageBuffers.computeIfAbsent(meetingId, k -> new StringBuilder());
            buffer.append(data);

            if (last) {
                String fullJson = buffer.toString();
                buffer.setLength(0);
                handleDeepgramMessage(meetingId, fullJson);
            }
            webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            log.info("Deepgram WebSocket closed for meeting {}: {} - {}", meetingId, statusCode, reason);
            activeSockets.remove(meetingId);
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            log.warn("Deepgram WebSocket error for meeting {}: {}", meetingId, error.getMessage());
            activeSockets.remove(meetingId);
        }
    }

    private void handleDeepgramMessage(UUID meetingId, String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode channel = root.path("channel");
            JsonNode alternatives = channel.path("alternatives");
            if (!alternatives.isArray() || alternatives.isEmpty()) return;

            JsonNode bestAlt = alternatives.get(0);
            String transcript = bestAlt.path("transcript").asText("");
            if (transcript.isBlank()) return;

            boolean isFinal = root.path("is_final").asBoolean(true);
            double confidence = bestAlt.path("confidence").asDouble(0.95);

            String speakerKey = "speaker-1";
            String speakerName = "Speaker 1";

            JsonNode words = bestAlt.path("words");
            long startMs = (long) (root.path("start").asDouble(0.0) * 1000);
            long endMs = startMs + (long) (root.path("duration").asDouble(1.0) * 1000);

            if (words.isArray() && !words.isEmpty()) {
                JsonNode firstWord = words.get(0);
                if (firstWord.has("speaker")) {
                    int speakerIdx = firstWord.path("speaker").asInt(0) + 1;
                    speakerKey = "speaker-" + speakerIdx;
                    speakerName = "Speaker " + speakerIdx;
                }
                if (firstWord.has("start")) {
                    startMs = (long) (firstWord.path("start").asDouble() * 1000);
                }
                JsonNode lastWord = words.get(words.size() - 1);
                if (lastWord.has("end")) {
                    endMs = (long) (lastWord.path("end").asDouble() * 1000);
                }
            }

            TranscriptEvent event = new TranscriptEvent(
                    isFinal ? "TRANSCRIPT" : "TRANSCRIPT_INTERIM",
                    meetingId,
                    UUID.randomUUID(),
                    speakerKey,
                    speakerName,
                    transcript,
                    startMs,
                    endMs,
                    isFinal,
                    confidence
            );

            Consumer<TranscriptEvent> consumer = activeConsumers.get(meetingId);
            if (consumer != null) {
                consumer.accept(event);
            }
        } catch (Exception e) {
            log.debug("Error parsing Deepgram transcript event: {}", e.getMessage());
        }
    }
}
