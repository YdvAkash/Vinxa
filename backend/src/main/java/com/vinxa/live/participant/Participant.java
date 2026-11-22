package com.vinxa.live.participant;

import com.vinxa.live.meeting.Meeting;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "participants")
public class Participant {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;

    @Column(name = "speaker_key", nullable = false)
    private String speakerKey;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public Participant() {
    }

    public Participant(UUID id, Meeting meeting, String speakerKey, String displayName) {
        this.id = id != null ? id : UUID.randomUUID();
        this.meeting = meeting;
        this.speakerKey = speakerKey;
        this.displayName = displayName;
        this.createdAt = OffsetDateTime.now();
    }

    @PrePersist
    public void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public Meeting getMeeting() {
        return meeting;
    }

    public String getSpeakerKey() {
        return speakerKey;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
