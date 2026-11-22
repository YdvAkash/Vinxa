package com.vinxa.live.ai.dto;

import java.util.List;

public record AiSummaryResponse(
        String overview,
        List<String> keyPoints,
        List<DecisionDto> decisions,
        List<ActionItemDto> actionItems,
        List<String> openQuestions
) {
    public record DecisionDto(
            String decision,
            String reason,
            List<String> evidenceSegmentIds
    ) {}

    public record ActionItemDto(
            String task,
            String assignee,
            String deadline,
            String priority,
            List<String> evidenceSegmentIds
    ) {}
}
