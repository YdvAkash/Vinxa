package com.vinxa.live.meeting.dto;

import jakarta.validation.constraints.NotBlank;

public record ConsentEventRequest(
        @NotBlank String eventType,
        String participantReference,
        String details
) {}
