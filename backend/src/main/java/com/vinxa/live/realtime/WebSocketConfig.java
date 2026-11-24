package com.vinxa.live.realtime;

import jakarta.servlet.ServletContext;
import jakarta.websocket.server.ServerContainer;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.ServletContextAware;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer, ServletContextAware {

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

        // Real-time Event broadcast WebSocket for React Dashboard (wildcard + query param support)
        registry.addHandler(eventWebSocketHandler, "/ws/meetings/*/events", "/ws/meetings/{meetingId}/events", "/ws/events")
                .setAllowedOrigins("*");
    }

    @Override
    public void setServletContext(ServletContext servletContext) {
        Object attr = servletContext.getAttribute("jakarta.websocket.server.ServerContainer");
        if (attr instanceof ServerContainer container) {
            container.setDefaultMaxTextMessageBufferSize(131072);
            container.setDefaultMaxBinaryMessageBufferSize(131072);
            container.setDefaultMaxSessionIdleTimeout(300000L);
        }
    }
}
