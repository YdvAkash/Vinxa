package com.vinxa.live.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.stt.SpeechToTextProvider;
import com.vinxa.live.stt.TranscriptEvent;
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

    private final SpeechToTextProvider sttProvider;
    private final EventWebSocketHandler eventWebSocketHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, UUID> sessionToMeetingMap = new ConcurrentHashMap<>();
    private final Map<UUID, Long> frameCounters = new ConcurrentHashMap<>();

    public AudioWebSocketHandler(SpeechToTextProvider sttProvider, EventWebSocketHandler eventWebSocketHandler) {
        this.sttProvider = sttProvider;
        this.eventWebSocketHandler = eventWebSocketHandler;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID meetingId = extractMeetingId(session.getUri());
        if (meetingId != null) {
            sessionToMeetingMap.put(session.getId(), meetingId);
            frameCounters.put(meetingId, 0L);

            sttProvider.startSession(meetingId, (TranscriptEvent event) -> {
                eventWebSocketHandler.broadcastToMeeting(meetingId, event);
            });
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        UUID meetingId = sessionToMeetingMap.get(session.getId());
        if (meetingId == null) return;

        Map<?, ?> map = objectMapper.readValue(message.getPayload(), Map.class);
        String type = (String) map.get("type");

        if ("STOP_SESSION".equals(type)) {
            sttProvider.stopSession(meetingId);
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        UUID meetingId = sessionToMeetingMap.get(session.getId());
        if (meetingId == null) return;

        byte[] payload = message.getPayload().array();
        frameCounters.compute(meetingId, (k, v) -> (v == null ? 0L : v) + payload.length);
        sttProvider.sendAudioChunk(meetingId, payload);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID meetingId = sessionToMeetingMap.remove(session.getId());
        if (meetingId != null) {
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
}
