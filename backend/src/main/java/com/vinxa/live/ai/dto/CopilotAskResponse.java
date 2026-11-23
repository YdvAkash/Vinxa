package com.vinxa.live.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CopilotAskResponse(
        String answer,
        String confidence,
        int meetingsAnalyzed,
        int segmentsAnalyzed,
        List<CitationDto> citations,
        List<String> suggestedFollowUps
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CitationDto(
            UUID meetingId,
            String meetingTitle,
            String meetingDate,
            UUID segmentId,
            String speaker,
            String quote
    ) {}
}
