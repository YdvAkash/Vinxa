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
    public ResponseEntity<List<ActionItem>> getActionItems(@PathVariable("id") UUID meetingId) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        return ResponseEntity.ok(actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId));
    }

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
