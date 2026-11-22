package com.vinxa.live.stt;

import java.util.UUID;

public record TranscriptEvent(
        String type,
        UUID meetingId,
        UUID segmentId,
        String speakerKey,
        String speakerName,
        String text,
        long startMs,
        long endMs,
        boolean isFinal,
        double confidence
) {}
