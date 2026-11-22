package com.vinxa.live.transcript;

import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.participant.Participant;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "transcript_segments")
public class TranscriptSegment {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "participant_id")
    private Participant participant;

    @Column(name = "provider_segment_key")
    private String providerSegmentKey;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "start_ms", nullable = false)
    private Long startMs;

    @Column(name = "end_ms", nullable = false)
    private Long endMs;

    @Column(name = "confidence")
    private Float confidence;

    @Column(name = "is_final", nullable = false)
    private Boolean isFinal = true;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public TranscriptSegment() {
    }

    public TranscriptSegment(
            UUID id,
            Meeting meeting,
            Participant participant,
            String providerSegmentKey,
            String content,
            Long startMs,
            Long endMs,
            Float confidence,
            Boolean isFinal
    ) {
        this.id = id != null ? id : UUID.randomUUID();
        this.meeting = meeting;
        this.participant = participant;
        this.providerSegmentKey = providerSegmentKey;
        this.content = content;
        this.startMs = startMs;
        this.endMs = endMs;
        this.confidence = confidence;
        this.isFinal = isFinal != null ? isFinal : true;
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

    public Participant getParticipant() {
        return participant;
    }

    public void setParticipant(Participant participant) {
        this.participant = participant;
    }

    public String getContent() {
        return content;
    }

    public Long getStartMs() {
        return startMs;
    }

    public Long getEndMs() {
        return endMs;
    }

    public Float getConfidence() {
        return confidence;
    }

    public Boolean getFinal() {
        return isFinal;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
