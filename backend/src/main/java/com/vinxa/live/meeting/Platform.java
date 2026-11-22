package com.vinxa.live.meeting;

public enum Platform {
    GOOGLE_MEET,
    MICROSOFT_TEAMS,
    ZOOM,
    UNKNOWN;

    public static Platform fromString(String val) {
        if (val == null) return UNKNOWN;
        try {
            return Platform.valueOf(val.toUpperCase());
        } catch (IllegalArgumentException e) {
            return UNKNOWN;
        }
    }
}
