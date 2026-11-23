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
        OffsetDateTime createdAt,
        int participantCount,
        int segmentCount,
        int actionItemCount,
        int decisionCount,
        String shareToken,
        boolean publicShared
) {
    public static MeetingResponse fromEntity(Meeting m) {
        return fromEntityWithCounts(m, 0, 0, 0, 0);
    }

    public static MeetingResponse fromEntityWithCounts(
            Meeting m,
            int participantCount,
            int segmentCount,
            int actionItemCount,
            int decisionCount
    ) {
        return new MeetingResponse(
                m.getId(),
                m.getUser().getId(),
                m.getTitle(),
                m.getPlatform(),
                m.getMeetingUrl(),
                m.getStatus(),
                m.getStartedAt(),
                m.getEndedAt(),
                m.getCreatedAt(),
                participantCount,
                segmentCount,
                actionItemCount,
                decisionCount,
                m.getShareToken(),
                Boolean.TRUE.equals(m.getPublicShared())
        );
    }
}
