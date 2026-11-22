package com.vinxa.live.meeting.dto;

import com.vinxa.live.meeting.Platform;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateMeetingRequest(
        @NotBlank String title,
        @NotNull Platform platform,
        String meetingUrl
) {}
