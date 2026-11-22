package com.vinxa.live.meeting;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public enum MeetingStatus {
    CREATED,
    CONSENT_REQUIRED,
    READY,
    RECORDING,
    STOPPING,
    FINALIZING,
    COMPLETED,
    ANALYSIS_PENDING,
    ANALYSIS_COMPLETED,
    ERROR,
    DELETION_PENDING,
    DELETED;

    private static final Map<MeetingStatus, Set<MeetingStatus>> VALID_TRANSITIONS = Map.ofEntries(
            Map.entry(CREATED, EnumSet.of(CONSENT_REQUIRED, READY, RECORDING, ERROR, DELETION_PENDING)),
            Map.entry(CONSENT_REQUIRED, EnumSet.of(READY, RECORDING, ERROR, DELETION_PENDING)),
            Map.entry(READY, EnumSet.of(RECORDING, STOPPING, ANALYSIS_PENDING, ERROR, DELETION_PENDING)),
            Map.entry(RECORDING, EnumSet.of(STOPPING, FINALIZING, COMPLETED, ANALYSIS_PENDING, ERROR, DELETION_PENDING)),
            Map.entry(STOPPING, EnumSet.of(FINALIZING, COMPLETED, ANALYSIS_PENDING, ERROR, DELETION_PENDING)),
            Map.entry(FINALIZING, EnumSet.of(COMPLETED, ANALYSIS_PENDING, ERROR, DELETION_PENDING)),
            Map.entry(COMPLETED, EnumSet.of(ANALYSIS_PENDING, DELETION_PENDING)),
            Map.entry(ANALYSIS_PENDING, EnumSet.of(ANALYSIS_COMPLETED, ERROR, DELETION_PENDING)),
            Map.entry(ANALYSIS_COMPLETED, EnumSet.of(DELETION_PENDING)),
            Map.entry(ERROR, EnumSet.of(READY, RECORDING, ANALYSIS_PENDING, DELETION_PENDING)),
            Map.entry(DELETION_PENDING, EnumSet.of(DELETED)),
            Map.entry(DELETED, EnumSet.noneOf(MeetingStatus.class))
    );

    public boolean canTransitionTo(MeetingStatus target) {
        if (this == target) return true;
        Set<MeetingStatus> allowed = VALID_TRANSITIONS.get(this);
        return allowed != null && allowed.contains(target);
    }
}
