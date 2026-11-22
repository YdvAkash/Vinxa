package com.vinxa.live.consent;

import com.vinxa.live.meeting.Meeting;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "consent_events")
public class ConsentEvent {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "participant_reference")
    private String participantReference;

    @Column(name = "details")
    private String details;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public ConsentEvent() {
    }

    public ConsentEvent(UUID id, Meeting meeting, String eventType, String participantReference, String details) {
        this.id = id != null ? id : UUID.randomUUID();
        this.meeting = meeting;
        this.eventType = eventType;
        this.participantReference = participantReference;
        this.details = details;
        this.createdAt = OffsetDateTime.now();
    }

    @PrePersist
    public void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }

    public UUID getId() {
        return id;
    }

    public Meeting getMeeting() {
        return meeting;
    }

    public String getEventType() {
        return eventType;
    }

    public String getParticipantReference() {
        return participantReference;
    }

    public String getDetails() {
        return details;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
