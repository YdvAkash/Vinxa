package com.vinxa.live.meeting.dto;

import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.meeting.Platform;

import java.time.OffsetDateTime;
import java.util.UUID;

public record MeetingResponse(
        UUID id,
        UUID userId,
        String title,
        Platform platform,
        String meetingUrl,
        MeetingStatus status,
        OffsetDateTime startedAt,
        OffsetDateTime endedAt,
        OffsetDateTime createdAt
) {
    public static MeetingResponse fromEntity(Meeting m) {
        return new MeetingResponse(
                m.getId(),
                m.getUser().getId(),
                m.getTitle(),
                m.getPlatform(),
                m.getMeetingUrl(),
                m.getStatus(),
                m.getStartedAt(),
                m.getEndedAt(),
                m.getCreatedAt()
        );
    }
}
