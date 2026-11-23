package com.vinxa.live.meeting;

import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.meeting.dto.MeetingResponse;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptController;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/public/share")
public class PublicShareController {

    private final MeetingRepository meetingRepository;
    private final ParticipantRepository participantRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final ActionItemRepository actionItemRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;

    public PublicShareController(
            MeetingRepository meetingRepository,
            ParticipantRepository participantRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            ActionItemRepository actionItemRepository,
            MeetingSummaryRepository meetingSummaryRepository
    ) {
        this.meetingRepository = meetingRepository;
        this.participantRepository = participantRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.actionItemRepository = actionItemRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
    }

    @GetMapping("/{shareToken}")
    public ResponseEntity<Map<String, Object>> getPublicSharedMeeting(@PathVariable("shareToken") String shareToken) {
        Meeting meeting = meetingRepository.findByShareTokenAndPublicSharedTrueAndDeletedAtIsNull(shareToken)
                .orElseThrow(() -> new IllegalArgumentException("Shared meeting link is invalid or has been disabled by the owner."));

        UUID meetingId = meeting.getId();
        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);
        List<ActionItem> actions = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
        MeetingSummary summary = meetingSummaryRepository.findByMeetingId(meetingId).orElse(null);
        int participantCount = participantRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId).size();
        if (participantCount == 0 && !segments.isEmpty()) participantCount = 1;

        List<TranscriptController.TranscriptSegmentDto> segmentDtos = segments.stream()
                .map(s -> new TranscriptController.TranscriptSegmentDto(
                        s.getId(),
                        meetingId,
                        s.getParticipant() != null ? s.getParticipant().getSpeakerKey() : "speaker-1",
                        s.getParticipant() != null ? s.getParticipant().getDisplayName() : "Speaker",
                        s.getContent(),
                        s.getStartMs(),
                        s.getEndMs(),
                        s.getFinal(),
                        s.getConfidence()
                ))
                .toList();

        List<TranscriptController.ActionItemDto> actionDtos = actions.stream()
                .map(i -> new TranscriptController.ActionItemDto(
                        i.getId(),
                        meetingId,
                        i.getTitle(),
                        i.getTitle(),
                        i.getAssignee(),
                        i.getDeadline() != null ? i.getDeadline().toString() : null,
                        i.getPriority() != null ? i.getPriority().toUpperCase() : "MEDIUM",
                        i.getStatus(),
                        parseEvidenceList(i.getEvidenceSegmentIds()),
                        i.getCreatedAt() != null ? i.getCreatedAt().toString() : null
                ))
                .toList();

        MeetingResponse meetingDto = MeetingResponse.fromEntityWithCounts(
                meeting,
                participantCount,
                segmentDtos.size(),
                actionDtos.size(),
                0
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("meeting", meetingDto);
        payload.put("sharedBy", meeting.getUser() != null ? meeting.getUser().getEmail() : "Vinxa Workspace");
        payload.put("summaryJson", summary != null ? summary.getSummary() : null);
        payload.put("actionItems", actionDtos);
        payload.put("transcript", segmentDtos);

        return ResponseEntity.ok(payload);
    }

    private static List<String> parseEvidenceList(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        String trimmed = raw.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return Arrays.stream(trimmed.split(","))
                .map(s -> s.replace("\"", "").replace("'", "").trim())
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
