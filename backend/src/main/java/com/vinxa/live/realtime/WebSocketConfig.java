package com.vinxa.live.realtime;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final AudioWebSocketHandler audioWebSocketHandler;
    private final EventWebSocketHandler eventWebSocketHandler;

    public WebSocketConfig(AudioWebSocketHandler audioWebSocketHandler, EventWebSocketHandler eventWebSocketHandler) {
        this.audioWebSocketHandler = audioWebSocketHandler;
        this.eventWebSocketHandler = eventWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Audio Ingestion WebSocket for Chrome Extension
        registry.addHandler(audioWebSocketHandler, "/ws/audio")
                .setAllowedOrigins("*");

        // Real-time Event broadcast WebSocket for React Dashboard
        registry.addHandler(eventWebSocketHandler, "/ws/meetings/{meetingId}/events")
                .setAllowedOrigins("*");
    }
}
