package com.vinxa.live.transcript;

import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.common.SecurityUtils;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.participant.Participant;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/meetings/{id}")
public class TranscriptController {

    private final MeetingService meetingService;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;
    private final ActionItemRepository actionItemRepository;
    private final ParticipantRepository participantRepository;

    public TranscriptController(
            MeetingService meetingService,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            ParticipantRepository participantRepository
    ) {
        this.meetingService = meetingService;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
        this.participantRepository = participantRepository;
    }

    @GetMapping("/transcript")
    public ResponseEntity<List<TranscriptSegmentDto>> getTranscript(@PathVariable("id") UUID meetingId) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);
        List<TranscriptSegmentDto> dtos = segments.stream()
                .map(s -> new TranscriptSegmentDto(
                        s.getId(),
                        s.getMeeting().getId(),
                        s.getParticipant() != null ? s.getParticipant().getSpeakerKey() : "speaker-unknown",
                        s.getParticipant() != null ? s.getParticipant().getDisplayName() : "Speaker",
                        s.getContent(),
                        s.getStartMs(),
                        s.getEndMs(),
                        s.getFinal(),
                        s.getConfidence()
                ))
                .toList();

        return ResponseEntity.ok(dtos);
    }

    @PostMapping("/transcript")
    public ResponseEntity<TranscriptSegmentDto> appendTranscriptSegment(
            @PathVariable("id") UUID meetingId,
            @RequestBody Map<String, Object> body
    ) {
        User user = SecurityUtils.getCurrentUser();
        Meeting meeting = meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        String speakerKey = (String) body.getOrDefault("speakerKey", "speaker-1");
        String speakerName = (String) body.getOrDefault("speakerName", "Speaker 1");
        String text = (String) body.getOrDefault("text", "");
        Long startMs = body.get("startMs") != null ? ((Number) body.get("startMs")).longValue() : 0L;
        Long endMs = body.get("endMs") != null ? ((Number) body.get("endMs")).longValue() : startMs + 2000L;

        Participant participant = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, speakerKey)
                .orElseGet(() -> participantRepository.save(new Participant(UUID.randomUUID(), meeting, speakerKey, speakerName)));

        TranscriptSegment segment = new TranscriptSegment(
                UUID.randomUUID(),
                meeting,
                participant,
                UUID.randomUUID().toString(),
                text,
                startMs,
                endMs,
                0.98f,
                true
        );
        segment = transcriptSegmentRepository.save(segment);

        return ResponseEntity.status(org.springframework.http.HttpStatus.CREATED).body(new TranscriptSegmentDto(
                segment.getId(),
                meetingId,
                speakerKey,
                participant.getDisplayName(),
                segment.getContent(),
                segment.getStartMs(),
                segment.getEndMs(),
                segment.getFinal(),
                segment.getConfidence()
        ));
    }

    @GetMapping("/summary")
    public ResponseEntity<MeetingSummaryDto> getSummary(@PathVariable("id") UUID meetingId) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        MeetingSummary summary = meetingSummaryRepository.findByMeetingId(meetingId).orElse(null);
        if (summary == null) {
            return ResponseEntity.noContent().build();
        }

        return ResponseEntity.ok(new MeetingSummaryDto(summary.getId(), summary.getSummary(), summary.getGeneratedAt().toString()));
    }

    @GetMapping("/actions")
    public ResponseEntity<List<ActionItemDto>> getActionItems(@PathVariable("id") UUID meetingId) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        List<ActionItem> items = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
        List<ActionItemDto> dtos = items.stream()
                .map(i -> new ActionItemDto(
                        i.getId(),
                        i.getMeeting().getId(),
                        i.getTitle(),
                        i.getAssignee(),
                        i.getDeadline() != null ? i.getDeadline().toString() : null,
                        i.getPriority(),
                        i.getStatus(),
                        i.getEvidenceSegmentIds(),
                        i.getCreatedAt() != null ? i.getCreatedAt().toString() : null
                ))
                .toList();

        return ResponseEntity.ok(dtos);
    }

    public record ActionItemDto(
            UUID id,
            UUID meetingId,
            String title,
            String assignee,
            String deadline,
            String priority,
            String status,
            String evidenceSegmentIds,
            String createdAt
    ) {}

    @PatchMapping("/participants/{participantId}")
    public ResponseEntity<Participant> renameParticipant(
            @PathVariable("id") UUID meetingId,
            @PathVariable("participantId") UUID participantId,
            @RequestBody Map<String, String> body
    ) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        Participant participant = participantRepository.findById(participantId)
                .orElseThrow(() -> new IllegalArgumentException("Participant not found"));

        if (!participant.getMeeting().getId().equals(meetingId)) {
            throw new IllegalArgumentException("Participant does not belong to this meeting");
        }

        String displayName = body.get("displayName");
        if (displayName != null) {
            participant.setDisplayName(displayName);
            participant = participantRepository.save(participant);
        }

        return ResponseEntity.ok(participant);
    }

    public record TranscriptSegmentDto(
            UUID id,
            UUID meetingId,
            String speakerKey,
            String speakerName,
            String text,
            Long startMs,
            Long endMs,
            Boolean isFinal,
            Float confidence
    ) {}

    public record MeetingSummaryDto(
            UUID id,
            String summary,
            String generatedAt
    ) {}
}
