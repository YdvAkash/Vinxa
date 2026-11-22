package com.vinxa.live.meeting.dto;

import com.vinxa.live.meeting.MeetingStatus;

public record UpdateMeetingRequest(
        String title,
        MeetingStatus status
) {}
