package com.vinxa.live.ai.dto;

import java.util.List;
import java.util.UUID;

public record CopilotAskRequest(
        String question,
        UUID meetingId,
        List<ChatTurn> history
) {
    public record ChatTurn(
            String role,
            String content
    ) {}
}
