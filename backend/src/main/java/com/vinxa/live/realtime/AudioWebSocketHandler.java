package com.vinxa.live.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.participant.Participant;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.stt.SpeechToTextProvider;
import com.vinxa.live.stt.TranscriptEvent;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;

@Component
public class AudioWebSocketHandler extends AbstractWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(AudioWebSocketHandler.class);

    private final SpeechToTextProvider sttProvider;
    private final EventWebSocketHandler eventWebSocketHandler;
    private final MeetingRepository meetingRepository;
    private final ParticipantRepository participantRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, UUID> sessionToMeetingMap = new ConcurrentHashMap<>();
    private final Map<UUID, Long> frameCounters = new ConcurrentHashMap<>();
    private final Map<UUID, Map<String, String>> speakerDisplayNames = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> meetingTitleResolved = new ConcurrentHashMap<>();
    private final ExecutorService persistenceExecutor;

    public AudioWebSocketHandler(
            SpeechToTextProvider sttProvider,
            EventWebSocketHandler eventWebSocketHandler,
            MeetingRepository meetingRepository,
            ParticipantRepository participantRepository,
            TranscriptSegmentRepository transcriptSegmentRepository
    ) {
        this.sttProvider = sttProvider;
        this.eventWebSocketHandler = eventWebSocketHandler;
        this.meetingRepository = meetingRepository;
        this.participantRepository = participantRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.persistenceExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "transcript-db-writer");
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    public void shutdown() {
        persistenceExecutor.shutdown();
    }

    public void registerSpeakerDisplayName(UUID meetingId, String speakerKey, String displayName) {
        if (meetingId == null || speakerKey == null || displayName == null || displayName.isBlank()) return;
        speakerDisplayNames
                .computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>())
                .put(speakerKey, displayName.trim());
        eventWebSocketHandler.broadcastToMeeting(
                meetingId,
                Map.of(
                        "type", "SPEAKER_RENAMED",
                        "meetingId", meetingId.toString(),
                        "speakerKey", speakerKey,
                        "speakerName", displayName.trim()
                )
        );
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID meetingId = extractMeetingId(session.getUri());
        String language = extractLanguage(session.getUri());
        if (meetingId != null) {
            sessionToMeetingMap.put(session.getId(), meetingId);
            frameCounters.put(meetingId, 0L);
            log.info("Audio WebSocket connected for meeting {} [language={}]", meetingId, language);

            // Warm speaker display name cache and transition meeting status asynchronously
            CompletableFuture.runAsync(() -> {
                try {
                    Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
                    if (meeting != null) {
                        if (!MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())) {
                            meetingTitleResolved.put(meetingId, true);
                        }
                        if (meeting.getStatus().canTransitionTo(MeetingStatus.RECORDING)) {
                            meeting.updateStatus(MeetingStatus.RECORDING);
                            meetingRepository.save(meeting);
                        }
                    }
                    List<Participant> existingParticipants = participantRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
                    Map<String, String> nameMap = speakerDisplayNames.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());
                    for (Participant p : existingParticipants) {
                        if (p.getSpeakerKey() != null && p.getDisplayName() != null) {
                            nameMap.put(p.getSpeakerKey(), p.getDisplayName());
                        }
                    }
                } catch (Exception e) {
                    log.debug("Initial meeting status warm-up error: {}", e.getMessage());
                }
            }, persistenceExecutor);

            sttProvider.startSession(meetingId, language, (TranscriptEvent event) -> {
                handleTranscriptEvent(meetingId, event);
            });
        }
    }

    public void handleTranscriptEvent(UUID meetingId, TranscriptEvent event) {
        if (event == null) return;

        String speakerKey = event.speakerKey() != null ? event.speakerKey() : "speaker-1";
        Map<String, String> nameMap = speakerDisplayNames.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());
        String resolvedSpeakerName = nameMap.getOrDefault(
                speakerKey,
                event.speakerName() != null ? event.speakerName() : "Speaker 1"
        );
        UUID segmentId = event.segmentId() != null ? event.segmentId() : UUID.randomUUID();

        TranscriptEvent enrichedEvent = new TranscriptEvent(
                event.type(),
                meetingId,
                segmentId,
                speakerKey,
                resolvedSpeakerName,
                event.text(),
                event.startMs(),
                event.endMs(),
                event.isFinal(),
                event.confidence()
        );

        // 1. Broadcast immediately to connected dashboard & extension clients (< 1ms delivery latency)
        eventWebSocketHandler.broadcastToMeeting(meetingId, enrichedEvent);

        // 2. Persist finalized segment asynchronously so database network RTT never blocks real-time WebSocket stream
        if (enrichedEvent.isFinal()) {
            persistenceExecutor.submit(() -> persistFinalTranscriptSegment(meetingId, enrichedEvent));
        }
    }

    void persistFinalTranscriptSegment(UUID meetingId, TranscriptEvent event) {
        try {
            Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
            if (meeting == null) return;

            boolean meetingDirty = false;
            if (meeting.getStatus() != MeetingStatus.RECORDING && meeting.getStatus().canTransitionTo(MeetingStatus.RECORDING)) {
                meeting.updateStatus(MeetingStatus.RECORDING);
                meetingDirty = true;
            }

            // Auto-name meeting from live discussion if still on default code title
            if (!Boolean.TRUE.equals(meetingTitleResolved.get(meetingId))) {
                if (MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())) {
                    if (event.text() != null && event.text().trim().length() > 14) {
                        String code = MeetingService.extractMeetingCode(
                                meeting.getTitle(),
                                meeting.getMeetingUrl(),
                                meeting.getId()
                        );
                        String cleanTopic = event.text().trim()
                                .replaceAll("^(?i)(welcome everyone to our|welcome everyone|today we need to|we have officially decided to|hello team,?)\\s*", "")
                                .trim();
                        if (!cleanTopic.isEmpty()) {
                            cleanTopic = Character.toUpperCase(cleanTopic.charAt(0)) + cleanTopic.substring(1);
                            if (cleanTopic.endsWith(".")) cleanTopic = cleanTopic.substring(0, cleanTopic.length() - 1);
                            if (cleanTopic.length() > 40) {
                                int sp = cleanTopic.lastIndexOf(' ', 40);
                                cleanTopic = (sp > 14 ? cleanTopic.substring(0, sp) : cleanTopic.substring(0, 40)) + "…";
                            }
                            meeting.setTitle(cleanTopic + " • " + code);
                            meetingDirty = true;
                            meetingTitleResolved.put(meetingId, true);
                        }
                    }
                } else {
                    meetingTitleResolved.put(meetingId, true);
                }
            }

            if (meetingDirty) {
                meetingRepository.save(meeting);
            }

            // Find or create participant and cache display name
            Participant participant = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, event.speakerKey())
                    .orElseGet(() -> {
                        Participant p = new Participant(UUID.randomUUID(), meeting, event.speakerKey(), event.speakerName());
                        return participantRepository.save(p);
                    });

            if (participant.getDisplayName() != null) {
                speakerDisplayNames
                        .computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>())
                        .put(event.speakerKey(), participant.getDisplayName());
            }

            TranscriptSegment segment = new TranscriptSegment(
                    event.segmentId(),
                    meeting,
                    participant,
                    event.segmentId().toString(),
                    event.text(),
                    event.startMs(),
                    event.endMs(),
                    (float) event.confidence(),
                    true
            );
            transcriptSegmentRepository.save(segment);
        } catch (Exception e) {
            log.warn("Failed saving transcript segment to DB for meeting {}: {}", meetingId, e.getMessage());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        UUID meetingId = sessionToMeetingMap.get(session.getId());
        if (meetingId == null) return;

        Map<?, ?> map = objectMapper.readValue(message.getPayload(), Map.class);
        String type = (String) map.get("type");

        if ("STOP_SESSION".equals(type)) {
            log.info("Received STOP_SESSION frame for meeting {}", meetingId);
            sttProvider.stopSession(meetingId);
        } else if ("CHANGE_LANGUAGE".equals(type) || ("START_SESSION".equals(type) && map.get("language") != null)) {
            String lang = (String) map.get("language");
            if (lang != null && !lang.isBlank()) {
                sttProvider.switchLanguage(meetingId, lang);
            }
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        UUID meetingId = sessionToMeetingMap.get(session.getId());
        if (meetingId == null) return;

        java.nio.ByteBuffer buffer = message.getPayload();
        byte[] payload = new byte[buffer.remaining()];
        buffer.get(payload);

        frameCounters.compute(meetingId, (k, v) -> {
            long total = (v == null ? 0L : v) + payload.length;
            if (total % 320000 < payload.length) {
                log.debug("Received audio stream: total {} bytes for meeting {}", total, meetingId);
            }
            return total;
        });
        sttProvider.sendAudioChunk(meetingId, payload);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID meetingId = sessionToMeetingMap.remove(session.getId());
        if (meetingId != null) {
            frameCounters.remove(meetingId);
            meetingTitleResolved.remove(meetingId);
            log.info("Audio WebSocket closed for meeting {}", meetingId);
            sttProvider.stopSession(meetingId);
        }
    }

    private UUID extractMeetingId(URI uri) {
        if (uri == null || uri.getQuery() == null) return UUID.randomUUID();
        for (String param : uri.getQuery().split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && ("meetingId".equals(pair[0]) || "id".equals(pair[0]))) {
                try {
                    return UUID.fromString(pair[1]);
                } catch (IllegalArgumentException e) {
                    return UUID.nameUUIDFromBytes(pair[1].getBytes());
                }
            }
        }
        return UUID.randomUUID();
    }

    private String extractLanguage(URI uri) {
        if (uri == null || uri.getQuery() == null) return "multi";
        for (String param : uri.getQuery().split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && ("language".equals(pair[0]) || "lang".equals(pair[0]))) {
                return java.net.URLDecoder.decode(pair[1], java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return "multi";
    }
}
