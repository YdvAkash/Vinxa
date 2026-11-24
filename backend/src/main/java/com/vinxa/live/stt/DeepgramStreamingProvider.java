package com.vinxa.live.stt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

@Service
@Primary
public class DeepgramStreamingProvider implements SpeechToTextProvider {

    private static final Logger log = LoggerFactory.getLogger(DeepgramStreamingProvider.class);
    private static final int MAX_PENDING_AUDIO_CHUNKS = 120;
    private static final byte[] KEEP_ALIVE_JSON = "{\"type\":\"KeepAlive\"}".getBytes(StandardCharsets.UTF_8);

    private final String apiKey;
    private final SyntheticStreamingProvider fallbackProvider;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;
    private final ScheduledExecutorService keepAliveScheduler;

    private final Map<UUID, WebSocket> activeSockets = new ConcurrentHashMap<>();
    private final Map<UUID, Consumer<TranscriptEvent>> activeConsumers = new ConcurrentHashMap<>();
    private final Map<UUID, StringBuilder> messageBuffers = new ConcurrentHashMap<>();
    private final Map<UUID, CompletableFuture<?>> sendPipelines = new ConcurrentHashMap<>();
    private final Map<UUID, String> sessionLanguages = new ConcurrentHashMap<>();
    private final Map<UUID, ConcurrentLinkedQueue<byte[]>> pendingAudioQueues = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> fallbackActive = new ConcurrentHashMap<>();
    private final Map<UUID, Long> lastAudioSentAt = new ConcurrentHashMap<>();
    private final Map<UUID, AtomicInteger> reconnectAttempts = new ConcurrentHashMap<>();

    public DeepgramStreamingProvider(
            @Value("${vinxa.deepgram.api-key:}") String apiKey,
            SyntheticStreamingProvider fallbackProvider
    ) {
        this.apiKey = apiKey != null ? apiKey.trim() : "";
        this.fallbackProvider = fallbackProvider;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.keepAliveScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "deepgram-keepalive");
            t.setDaemon(true);
            return t;
        });
        this.keepAliveScheduler.scheduleAtFixedRate(this::sendKeepAliveToIdleSockets, 5, 5, TimeUnit.SECONDS);
    }

    @PreDestroy
    public void shutdown() {
        keepAliveScheduler.shutdownNow();
    }

    private void sendKeepAliveToIdleSockets() {
        long now = System.currentTimeMillis();
        for (Map.Entry<UUID, WebSocket> entry : activeSockets.entrySet()) {
            UUID meetingId = entry.getKey();
            WebSocket ws = entry.getValue();
            long lastSent = lastAudioSentAt.getOrDefault(meetingId, 0L);
            if (ws != null && !ws.isOutputClosed() && (now - lastSent) >= 6000L) {
                lastAudioSentAt.put(meetingId, now);
                sendPipelines.compute(meetingId, (id, stage) -> {
                    String keepAliveText = "{\"type\":\"KeepAlive\"}";
                    if (stage == null || stage.isDone()) {
                        return ws.sendText(keepAliveText, true).exceptionally(ex -> null);
                    }
                    return stage.thenCompose(v -> ws.sendText(keepAliveText, true)).exceptionally(ex -> null);
                });
            }
        }
    }

    @Override
    public void startSession(UUID meetingId, Consumer<TranscriptEvent> eventConsumer) {
        startSession(meetingId, "multi", eventConsumer);
    }

    @Override
    public void startSession(UUID meetingId, String language, Consumer<TranscriptEvent> eventConsumer) {
        if (apiKey.isEmpty()) {
            log.info("Deepgram API key not configured. Using synthetic streaming provider for meeting {}", meetingId);
            fallbackActive.put(meetingId, true);
            fallbackProvider.startSession(meetingId, eventConsumer);
            return;
        }

        String normalizedLang = normalizeLanguageCode(language);
        activeConsumers.put(meetingId, eventConsumer);
        messageBuffers.put(meetingId, new StringBuilder());
        sessionLanguages.put(meetingId, normalizedLang);
        pendingAudioQueues.put(meetingId, new ConcurrentLinkedQueue<>());
        fallbackActive.put(meetingId, false);
        reconnectAttempts.put(meetingId, new AtomicInteger(0));
        lastAudioSentAt.put(meetingId, System.currentTimeMillis());

        connectDeepgramSocket(meetingId, normalizedLang, eventConsumer, true);
    }

    @Override
    public void switchLanguage(UUID meetingId, String language) {
        String normalizedLang = normalizeLanguageCode(language);
        String currentLang = sessionLanguages.get(meetingId);
        if (normalizedLang.equalsIgnoreCase(currentLang) && activeSockets.containsKey(meetingId)) {
            return;
        }

        Consumer<TranscriptEvent> consumer = activeConsumers.get(meetingId);
        if (consumer == null) {
            sessionLanguages.put(meetingId, normalizedLang);
            return;
        }

        log.info("Switching Deepgram live STT language for meeting {} from {} to {}", meetingId, currentLang, normalizedLang);
        sessionLanguages.put(meetingId, normalizedLang);
        pendingAudioQueues.computeIfAbsent(meetingId, k -> new ConcurrentLinkedQueue<>());

        WebSocket oldWs = activeSockets.remove(meetingId);
        sendPipelines.remove(meetingId);
        if (oldWs != null) {
            try {
                oldWs.sendClose(WebSocket.NORMAL_CLOSURE, "Language switch");
            } catch (Exception ignored) {
            }
        }

        connectDeepgramSocket(meetingId, normalizedLang, consumer, true);
    }

    private void connectDeepgramSocket(UUID meetingId, String lang, Consumer<TranscriptEvent> eventConsumer, boolean allowFallbackToMulti) {
        if (!activeConsumers.containsKey(meetingId) || apiKey.startsWith("test-key-no-connect")) {
            return;
        }
        try {
            String encodedLang = URLEncoder.encode(lang, StandardCharsets.UTF_8);
            String url = "wss://api.deepgram.com/v1/listen?model=nova-2"
                    + "&language=" + encodedLang
                    + "&encoding=linear16&sample_rate=16000&channels=1"
                    + "&diarize=true&punctuate=true&smart_format=true&interim_results=true&endpointing=300&vad_events=false";

            httpClient.newWebSocketBuilder()
                    .header("Authorization", "Token " + apiKey)
                    .buildAsync(URI.create(url), new DeepgramWebSocketListener(meetingId))
                    .thenAccept(ws -> {
                        if (!activeConsumers.containsKey(meetingId)) {
                            try {
                                ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session already closed");
                            } catch (Exception ignored) {
                            }
                            return;
                        }
                        activeSockets.put(meetingId, ws);
                        AtomicInteger attempts = reconnectAttempts.get(meetingId);
                        if (attempts != null) attempts.set(0);
                        log.info("Connected to Deepgram Nova-2 Live Streaming STT [language={}] for meeting {}", lang, meetingId);
                        flushPendingAudioQueue(meetingId, ws);
                    })
                    .exceptionally(ex -> {
                        log.warn("Failed connecting Deepgram with language={} for meeting {}: {}", lang, meetingId, ex.getMessage());
                        if (allowFallbackToMulti && !"en".equals(lang)) {
                            log.info("Retrying Deepgram connection with fallback language=en for meeting {}", meetingId);
                            connectDeepgramSocket(meetingId, "en", eventConsumer, false);
                        } else {
                            activateFallback(meetingId, eventConsumer);
                        }
                        return null;
                    });
        } catch (Exception e) {
            log.warn("Deepgram initialization error for meeting {}: {}. Activating fallback.", meetingId, e.getMessage());
            activateFallback(meetingId, eventConsumer);
        }
    }

    private void activateFallback(UUID meetingId, Consumer<TranscriptEvent> eventConsumer) {
        fallbackActive.put(meetingId, true);
        fallbackProvider.startSession(meetingId, eventConsumer);
        ConcurrentLinkedQueue<byte[]> queue = pendingAudioQueues.remove(meetingId);
        if (queue != null) {
            byte[] chunk;
            while ((chunk = queue.poll()) != null) {
                fallbackProvider.sendAudioChunk(meetingId, chunk);
            }
        }
    }

    private void flushPendingAudioQueue(UUID meetingId, WebSocket ws) {
        ConcurrentLinkedQueue<byte[]> queue = pendingAudioQueues.get(meetingId);
        if (queue == null || queue.isEmpty()) return;

        byte[] chunk;
        while ((chunk = queue.poll()) != null) {
            dispatchBinaryFrame(meetingId, ws, chunk);
        }
    }

    private void dispatchBinaryFrame(UUID meetingId, WebSocket ws, byte[] pcm16Data) {
        lastAudioSentAt.put(meetingId, System.currentTimeMillis());
        ByteBuffer buf = ByteBuffer.wrap(pcm16Data);
        sendPipelines.compute(meetingId, (id, currentStage) -> {
            if (currentStage == null || currentStage.isDone()) {
                return ws.sendBinary(buf, true).exceptionally(ex -> {
                    log.debug("Deepgram frame send error: {}", ex.getMessage());
                    return null;
                });
            } else {
                return currentStage.thenCompose(v -> ws.sendBinary(buf, true))
                        .exceptionally(ex -> {
                            log.debug("Deepgram frame send error: {}", ex.getMessage());
                            return null;
                        });
            }
        });
    }

    private String normalizeLanguageCode(String language) {
        if (language == null || language.isBlank() || "auto".equalsIgnoreCase(language)) {
            return "multi";
        }
        return language.trim();
    }

    @Override
    public void sendAudioChunk(UUID meetingId, byte[] pcm16Data) {
        if (pcm16Data == null || pcm16Data.length == 0) return;

        if (Boolean.TRUE.equals(fallbackActive.get(meetingId))) {
            fallbackProvider.sendAudioChunk(meetingId, pcm16Data);
            return;
        }

        WebSocket ws = activeSockets.get(meetingId);
        if (ws != null && !ws.isOutputClosed()) {
            flushPendingAudioQueue(meetingId, ws);
            dispatchBinaryFrame(meetingId, ws, pcm16Data);
        } else if (activeConsumers.containsKey(meetingId)) {
            // Buffer audio chunks while Deepgram handshake or language switch is in progress
            ConcurrentLinkedQueue<byte[]> queue = pendingAudioQueues.computeIfAbsent(meetingId, k -> new ConcurrentLinkedQueue<>());
            if (queue.size() >= MAX_PENDING_AUDIO_CHUNKS) {
                queue.poll();
            }
            queue.offer(pcm16Data);
        } else {
            fallbackProvider.sendAudioChunk(meetingId, pcm16Data);
        }
    }

    @Override
    public void stopSession(UUID meetingId) {
        activeConsumers.remove(meetingId);
        sendPipelines.remove(meetingId);
        sessionLanguages.remove(meetingId);
        pendingAudioQueues.remove(meetingId);
        fallbackActive.remove(meetingId);
        lastAudioSentAt.remove(meetingId);
        reconnectAttempts.remove(meetingId);
        messageBuffers.remove(meetingId);

        WebSocket ws = activeSockets.remove(meetingId);
        if (ws != null) {
            try {
                ws.sendText("{\"type\":\"CloseStream\"}", true)
                        .thenRun(() -> {
                            try {
                                ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session ended");
                            } catch (Exception ignored) {
                            }
                        })
                        .exceptionally(ex -> {
                            try {
                                ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session ended");
                            } catch (Exception ignored) {
                            }
                            return null;
                        });
            } catch (Exception e3) {
                try {
                    ws.sendClose(WebSocket.NORMAL_CLOSURE, "Session ended");
                } catch (Exception ignored) {
                }
            }
        }
        fallbackProvider.stopSession(meetingId);
    }

    private class DeepgramWebSocketListener implements WebSocket.Listener {
        private final UUID meetingId;

        public DeepgramWebSocketListener(UUID meetingId) {
            this.meetingId = meetingId;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            log.debug("Deepgram Live STT WebSocket channel opened for meeting {}", meetingId);
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
            log.info("Deepgram WebSocket closed for meeting {}: {}", meetingId, statusCode);
            boolean removed = activeSockets.remove(meetingId, webSocket);
            if (removed && statusCode != WebSocket.NORMAL_CLOSURE) {
                scheduleReconnectIfActive(meetingId);
            }
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            log.warn("Deepgram WebSocket error for meeting {}: {}", meetingId, error.getMessage());
            boolean removed = activeSockets.remove(meetingId, webSocket);
            if (removed) {
                scheduleReconnectIfActive(meetingId);
            }
        }
    }

    private void scheduleReconnectIfActive(UUID meetingId) {
        Consumer<TranscriptEvent> consumer = activeConsumers.get(meetingId);
        if (consumer == null || Boolean.TRUE.equals(fallbackActive.get(meetingId))) {
            return;
        }
        AtomicInteger attempts = reconnectAttempts.computeIfAbsent(meetingId, k -> new AtomicInteger(0));
        int attempt = attempts.incrementAndGet();
        if (attempt <= 3) {
            long delayMs = attempt * 600L;
            String lang = sessionLanguages.getOrDefault(meetingId, "multi");
            log.info("Scheduling Deepgram reconnect attempt {}/3 for meeting {} in {}ms", attempt, meetingId, delayMs);
            keepAliveScheduler.schedule(() -> connectDeepgramSocket(meetingId, lang, consumer, true), delayMs, TimeUnit.MILLISECONDS);
        } else {
            log.warn("Deepgram reconnect limit reached for meeting {}. Switching to fallback.", meetingId);
            activateFallback(meetingId, consumer);
        }
    }

    void handleDeepgramMessage(UUID meetingId, String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode channel = root.path("channel");
            JsonNode alternatives = channel.path("alternatives");
            if (!alternatives.isArray() || alternatives.isEmpty()) return;

            JsonNode bestAlt = alternatives.get(0);
            String transcript = bestAlt.path("transcript").asText("").trim();
            if (transcript.isEmpty()) return;

            boolean isFinal = root.path("is_final").asBoolean(true);
            double overallConfidence = bestAlt.path("confidence").asDouble(0.95);

            Consumer<TranscriptEvent> consumer = activeConsumers.get(meetingId);
            if (consumer == null) return;

            JsonNode words = bestAlt.path("words");
            long defaultStartMs = (long) (root.path("start").asDouble(0.0) * 1000);
            long defaultEndMs = defaultStartMs + (long) (root.path("duration").asDouble(1.0) * 1000);

            if (isFinal && words.isArray() && !words.isEmpty()) {
                List<TranscriptEvent> speakerTurns = splitWordsBySpeakerTurns(
                        meetingId,
                        words,
                        transcript,
                        defaultStartMs,
                        defaultEndMs,
                        overallConfidence
                );
                for (TranscriptEvent turnEvent : speakerTurns) {
                    log.debug("Deepgram final segment for meeting {} [speaker={}, confidence={}]: {} chars",
                            meetingId, turnEvent.speakerKey(), turnEvent.confidence(), turnEvent.text().length());
                    consumer.accept(turnEvent);
                }
                return;
            }

            // Interim or word-less transcript frame
            String speakerKey = "speaker-1";
            String speakerName = "Speaker 1";
            long startMs = defaultStartMs;
            long endMs = defaultEndMs;

            if (words.isArray() && !words.isEmpty()) {
                JsonNode firstWord = words.get(0);
                JsonNode lastWord = words.get(words.size() - 1);
                // For interim transcripts, use the most recent word's speaker so active speaker transitions immediately
                JsonNode speakerRefWord = lastWord.has("speaker") ? lastWord : firstWord;
                if (speakerRefWord.has("speaker")) {
                    int speakerIdx = Math.max(0, speakerRefWord.path("speaker").asInt(0)) + 1;
                    speakerKey = "speaker-" + speakerIdx;
                    speakerName = "Speaker " + speakerIdx;
                }
                if (firstWord.has("start")) {
                    startMs = (long) (firstWord.path("start").asDouble() * 1000);
                }
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
                    Math.max(startMs, endMs),
                    isFinal,
                    overallConfidence
            );
            consumer.accept(event);
        } catch (Exception e) {
            log.debug("Error parsing Deepgram transcript event: {}", e.getMessage());
        }
    }

    private List<TranscriptEvent> splitWordsBySpeakerTurns(
            UUID meetingId,
            JsonNode words,
            String fullTranscript,
            long defaultStartMs,
            long defaultEndMs,
            double defaultConfidence
    ) {
        // Check if multiple distinct speakers exist in this finalized utterance
        int firstSpeaker = words.get(0).path("speaker").asInt(0);
        boolean multipleSpeakers = false;
        for (int i = 1; i < words.size(); i++) {
            if (words.get(i).has("speaker") && words.get(i).path("speaker").asInt(firstSpeaker) != firstSpeaker) {
                multipleSpeakers = true;
                break;
            }
        }

        if (!multipleSpeakers) {
            int speakerIdx = Math.max(0, firstSpeaker) + 1;
            long startMs = words.get(0).has("start")
                    ? (long) (words.get(0).path("start").asDouble() * 1000)
                    : defaultStartMs;
            JsonNode lastWord = words.get(words.size() - 1);
            long endMs = lastWord.has("end")
                    ? (long) (lastWord.path("end").asDouble() * 1000)
                    : defaultEndMs;
            return List.of(new TranscriptEvent(
                    "TRANSCRIPT",
                    meetingId,
                    UUID.randomUUID(),
                    "speaker-" + speakerIdx,
                    "Speaker " + speakerIdx,
                    fullTranscript,
                    startMs,
                    Math.max(startMs, endMs),
                    true,
                    defaultConfidence
            ));
        }

        // Multiple speakers detected in the same utterance: split into contiguous speaker turns
        List<TranscriptEvent> turns = new ArrayList<>();
        int currentSpeaker = firstSpeaker;
        StringBuilder turnText = new StringBuilder();
        long turnStartMs = words.get(0).has("start")
                ? (long) (words.get(0).path("start").asDouble() * 1000)
                : defaultStartMs;
        long turnEndMs = turnStartMs;
        double confSum = 0.0;
        int wordCount = 0;

        for (int i = 0; i < words.size(); i++) {
            JsonNode w = words.get(i);
            int spk = w.path("speaker").asInt(currentSpeaker);
            String token = w.hasNonNull("punctuated_word")
                    ? w.path("punctuated_word").asText("")
                    : w.path("word").asText("");
            long wStart = w.has("start") ? (long) (w.path("start").asDouble() * 1000) : turnEndMs;
            long wEnd = w.has("end") ? (long) (w.path("end").asDouble() * 1000) : wStart + 200;
            double wConf = w.path("confidence").asDouble(defaultConfidence);

            if (spk != currentSpeaker && !turnText.isEmpty()) {
                int spkIdx = Math.max(0, currentSpeaker) + 1;
                double avgConf = wordCount > 0 ? confSum / wordCount : defaultConfidence;
                turns.add(new TranscriptEvent(
                        "TRANSCRIPT",
                        meetingId,
                        UUID.randomUUID(),
                        "speaker-" + spkIdx,
                        "Speaker " + spkIdx,
                        turnText.toString().trim(),
                        turnStartMs,
                        Math.max(turnStartMs, turnEndMs),
                        true,
                        avgConf
                ));
                currentSpeaker = spk;
                turnText.setLength(0);
                turnStartMs = wStart;
                confSum = 0.0;
                wordCount = 0;
            }

            if (!token.isBlank()) {
                if (!turnText.isEmpty()) turnText.append(' ');
                turnText.append(token.trim());
            }
            turnEndMs = wEnd;
            confSum += wConf;
            wordCount++;
        }

        if (!turnText.isEmpty()) {
            int spkIdx = Math.max(0, currentSpeaker) + 1;
            double avgConf = wordCount > 0 ? confSum / wordCount : defaultConfidence;
            turns.add(new TranscriptEvent(
                    "TRANSCRIPT",
                    meetingId,
                    UUID.randomUUID(),
                    "speaker-" + spkIdx,
                    "Speaker " + spkIdx,
                    turnText.toString().trim(),
                    turnStartMs,
                    Math.max(turnStartMs, turnEndMs),
                    true,
                    avgConf
            ));
        }

        return turns;
    }
}
