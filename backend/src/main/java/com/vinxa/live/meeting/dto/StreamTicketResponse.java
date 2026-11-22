package com.vinxa.live.meeting.dto;

public record StreamTicketResponse(
        String ticket,
        String websocketUrl,
        int expiresIn
) {}
