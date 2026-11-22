package com.vinxa.live.summary;

import com.vinxa.live.meeting.Meeting;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "meeting_summaries")
public class MeetingSummary {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false, unique = true)
    private Meeting meeting;

    @Column(name = "summary", nullable = false, columnDefinition = "TEXT")
    private String summary;

    @Column(name = "generated_at", nullable = false)
    private OffsetDateTime generatedAt;

    public MeetingSummary() {
    }

    public MeetingSummary(UUID id, Meeting meeting, String summary) {
        this.id = id != null ? id : UUID.randomUUID();
        this.meeting = meeting;
        this.summary = summary;
        this.generatedAt = OffsetDateTime.now();
    }

    @PrePersist
    public void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (generatedAt == null) generatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public Meeting getMeeting() {
        return meeting;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public OffsetDateTime getGeneratedAt() {
        return generatedAt;
    }
}
