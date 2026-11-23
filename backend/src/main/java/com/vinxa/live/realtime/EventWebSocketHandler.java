package com.vinxa.live.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class EventWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(EventWebSocketHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<UUID, Set<WebSocketSession>> meetingSubscribers = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID meetingId = extractMeetingId(session.getUri());
        if (meetingId != null) {
            meetingSubscribers.computeIfAbsent(meetingId, k -> ConcurrentHashMap.newKeySet()).add(session);
            log.info("Dashboard Live Event WebSocket subscribed to meeting {}", meetingId);
        }
    }

    public void broadcastToMeeting(UUID meetingId, Object event) {
        Set<WebSocketSession> sessions = meetingSubscribers.get(meetingId);
        if (sessions == null || sessions.isEmpty()) return;

        try {
            String json = objectMapper.writeValueAsString(event);
            TextMessage message = new TextMessage(json);
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    try {
                        synchronized (session) {
                            session.sendMessage(message);
                        }
                    } catch (IOException ignored) {
                    }
                }
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID meetingId = extractMeetingId(session.getUri());
        if (meetingId != null) {
            Set<WebSocketSession> sessions = meetingSubscribers.get(meetingId);
            if (sessions != null) {
                sessions.remove(session);
            }
        }
    }

    private UUID extractMeetingId(URI uri) {
        if (uri == null) return null;
        // 1. Check query parameter ?meetingId=...
        if (uri.getQuery() != null) {
            for (String param : uri.getQuery().split("&")) {
                String[] pair = param.split("=");
                if (pair.length == 2 && ("meetingId".equals(pair[0]) || "id".equals(pair[0]))) {
                    try {
                        return UUID.fromString(pair[1]);
                    } catch (IllegalArgumentException ignored) {
                    }
                }
            }
        }
        // 2. Check path /ws/meetings/{meetingId}/events
        if (uri.getPath() != null) {
            String[] parts = uri.getPath().split("/");
            for (int i = 0; i < parts.length - 1; i++) {
                if ("meetings".equals(parts[i])) {
                    try {
                        return UUID.fromString(parts[i + 1]);
                    } catch (IllegalArgumentException e) {
                        return UUID.nameUUIDFromBytes(parts[i + 1].getBytes());
                    }
                }
            }
        }
        return null;
    }
}
