package com.vinxa.live.auth.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record UserDto(
        UUID id,
        String email,
        OffsetDateTime createdAt
) {}
