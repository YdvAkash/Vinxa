package com.vinxa.live.export;

import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.common.SecurityUtils;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/meetings/{id}/export")
public class ExportController {

    private final MeetingService meetingService;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;
    private final ActionItemRepository actionItemRepository;

    public ExportController(
            MeetingService meetingService,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository
    ) {
        this.meetingService = meetingService;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
    }

    @GetMapping
    public ResponseEntity<String> exportMeeting(
            @PathVariable("id") UUID meetingId,
            @RequestParam(value = "format", defaultValue = "md") String format
    ) {
        User user = SecurityUtils.getCurrentUser();
        Meeting meeting = meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);
        MeetingSummary summary = meetingSummaryRepository.findByMeetingId(meetingId).orElse(null);
        List<ActionItem> actionItems = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);

        StringBuilder sb = new StringBuilder();
        sb.append("# ").append(meeting.getTitle()).append("\n\n");
        sb.append("- **Platform:** ").append(meeting.getPlatform()).append("\n");
        sb.append("- **Status:** ").append(meeting.getStatus()).append("\n");
        sb.append("- **Date:** ").append(meeting.getCreatedAt()).append("\n\n");

        if (summary != null) {
            sb.append("## Executive Summary\n").append(summary.getSummary()).append("\n\n");
        }

        sb.append("## Action Items\n");
        if (actionItems.isEmpty()) {
            sb.append("No action items recorded.\n\n");
        } else {
            for (ActionItem item : actionItems) {
                sb.append("- [ ] ").append(item.getTitle());
                if (item.getAssignee() != null) sb.append(" (@").append(item.getAssignee()).append(")");
                sb.append(" [").append(item.getPriority()).append("]\n");
            }
            sb.append("\n");
        }

        sb.append("## Diarized Transcript\n");
        for (TranscriptSegment seg : segments) {
            sb.append("**[").append(seg.getStartMs() / 1000).append("s]**: ").append(seg.getContent()).append("\n\n");
        }

        String filename = meeting.getTitle().toLowerCase().replaceAll("[^a-z0-9]", "-") + ".md";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.TEXT_MARKDOWN)
                .body(sb.toString());
    }
}
