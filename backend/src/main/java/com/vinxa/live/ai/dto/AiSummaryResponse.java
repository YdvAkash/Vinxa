package com.vinxa.live.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiSummaryResponse(
        String suggestedTitle,
        String overview,
        List<String> keyPoints,
        List<DecisionDto> decisions,
        List<ActionItemDto> actionItems,
        List<String> openQuestions
) {
    public AiSummaryResponse(
            String overview,
            List<String> keyPoints,
            List<DecisionDto> decisions,
            List<ActionItemDto> actionItems,
            List<String> openQuestions
    ) {
        this(null, overview, keyPoints, decisions, actionItems, openQuestions);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DecisionDto(
            String decision,
            String reason,
            List<String> evidenceSegmentIds
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ActionItemDto(
            String task,
            String assignee,
            String deadline,
            String priority,
            List<String> evidenceSegmentIds
    ) {}
}
