package com.vinxa.live.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.participant.Participant;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.stt.SpeechToTextProvider;
import com.vinxa.live.stt.TranscriptEvent;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.net.URI;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID meetingId = extractMeetingId(session.getUri());
        String language = extractLanguage(session.getUri());
        if (meetingId != null) {
            sessionToMeetingMap.put(session.getId(), meetingId);
            frameCounters.put(meetingId, 0L);
            log.info("Audio WebSocket connected for meeting {} [language={}]", meetingId, language);

            Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
            if (meeting != null && meeting.getStatus().canTransitionTo(MeetingStatus.RECORDING)) {
                meeting.updateStatus(MeetingStatus.RECORDING);
                meetingRepository.save(meeting);
            }

            sttProvider.startSession(meetingId, language, (TranscriptEvent event) -> {
                handleTranscriptEvent(meetingId, event);
            });
        }
    }

    private void handleTranscriptEvent(UUID meetingId, TranscriptEvent event) {
        try {
            if (event.isFinal()) {
                Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
                if (meeting != null) {
                    if (meeting.getStatus() != MeetingStatus.RECORDING && meeting.getStatus().canTransitionTo(MeetingStatus.RECORDING)) {
                        meeting.updateStatus(MeetingStatus.RECORDING);
                    }

                    // Auto-name meeting from live discussion if still on default code title
                    if (com.vinxa.live.meeting.MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())
                            && event.text() != null && event.text().trim().length() > 14) {
                        String code = com.vinxa.live.meeting.MeetingService.extractMeetingCode(
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
                        }
                    }
                    meetingRepository.save(meeting);

                    // Find or create participant
                    Participant participant = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, event.speakerKey())
                            .orElseGet(() -> {
                                Participant p = new Participant(UUID.randomUUID(), meeting, event.speakerKey(), event.speakerName());
                                return participantRepository.save(p);
                            });

                    // Save segment to Neon PostgreSQL
                    TranscriptSegment segment = new TranscriptSegment(
                            event.segmentId() != null ? event.segmentId() : UUID.randomUUID(),
                            meeting,
                            participant,
                            event.segmentId() != null ? event.segmentId().toString() : UUID.randomUUID().toString(),
                            event.text(),
                            event.startMs(),
                            event.endMs(),
                            (float) event.confidence(),
                            true
                    );
                    transcriptSegmentRepository.save(segment);
                }
            }
        } catch (Exception e) {
            log.warn("Failed saving transcript segment to DB: {}", e.getMessage());
        }

        // Broadcast event in real time to connected dashboard clients
        eventWebSocketHandler.broadcastToMeeting(meetingId, event);
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
            if (total % 160000 < payload.length) {
                log.info("Received audio stream: total {} bytes for meeting {}", total, meetingId);
            }
            return total;
        });
        sttProvider.sendAudioChunk(meetingId, payload);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID meetingId = sessionToMeetingMap.remove(session.getId());
        if (meetingId != null) {
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
