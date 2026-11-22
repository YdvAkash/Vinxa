package com.vinxa.live.actionitem;

import com.vinxa.live.meeting.Meeting;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "action_items")
public class ActionItem {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id", nullable = false)
    private Meeting meeting;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "assignee")
    private String assignee;

    @Column(name = "deadline")
    private OffsetDateTime deadline;

    @Column(name = "priority")
    private String priority = "MEDIUM";

    @Column(name = "status", nullable = false)
    private String status = "OPEN";

    @Column(name = "evidence_segment_ids")
    private String evidenceSegmentIds;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public ActionItem() {
    }

    public ActionItem(
            UUID id,
            Meeting meeting,
            String title,
            String assignee,
            OffsetDateTime deadline,
            String priority,
            String evidenceSegmentIds
    ) {
        this.id = id != null ? id : UUID.randomUUID();
        this.meeting = meeting;
        this.title = title;
        this.assignee = assignee;
        this.deadline = deadline;
        this.priority = priority != null ? priority : "MEDIUM";
        this.status = "OPEN";
        this.evidenceSegmentIds = evidenceSegmentIds;
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

    public String getTitle() {
        return title;
    }

    public String getAssignee() {
        return assignee;
    }

    public OffsetDateTime getDeadline() {
        return deadline;
    }

    public String getPriority() {
        return priority;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getEvidenceSegmentIds() {
        return evidenceSegmentIds;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
