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
    private final com.vinxa.live.stt.SpeechToTextProvider sttProvider;
    private final com.vinxa.live.realtime.AudioWebSocketHandler audioWebSocketHandler;

    @org.springframework.beans.factory.annotation.Autowired
    public TranscriptController(
            MeetingService meetingService,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            ParticipantRepository participantRepository,
            com.vinxa.live.stt.SpeechToTextProvider sttProvider,
            com.vinxa.live.realtime.AudioWebSocketHandler audioWebSocketHandler
    ) {
        this.meetingService = meetingService;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
        this.participantRepository = participantRepository;
        this.sttProvider = sttProvider;
        this.audioWebSocketHandler = audioWebSocketHandler;
    }

    public TranscriptController(
            MeetingService meetingService,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            ParticipantRepository participantRepository,
            com.vinxa.live.stt.SpeechToTextProvider sttProvider
    ) {
        this(meetingService, transcriptSegmentRepository, meetingSummaryRepository, actionItemRepository, participantRepository, sttProvider, null);
    }

    @PostMapping("/language")
    public ResponseEntity<Map<String, String>> changeMeetingLanguage(
            @PathVariable("id") UUID meetingId,
            @RequestBody Map<String, String> body
    ) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);
        String language = body.getOrDefault("language", "multi");
        sttProvider.switchLanguage(meetingId, language);
        return ResponseEntity.ok(Map.of("meetingId", meetingId.toString(), "language", language));
    }

    @GetMapping("/transcript")
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
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
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public ResponseEntity<List<ActionItemDto>> getActionItems(@PathVariable("id") UUID meetingId) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        List<ActionItem> items = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
        List<ActionItemDto> dtos = items.stream()
                .map(i -> new ActionItemDto(
                        i.getId(),
                        i.getMeeting().getId(),
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

        return ResponseEntity.ok(dtos);
    }

    @PatchMapping("/actions/{actionId}")
    public ResponseEntity<ActionItemDto> toggleActionItem(
            @PathVariable("id") UUID meetingId,
            @PathVariable("actionId") UUID actionId,
            @RequestBody(required = false) Map<String, String> body
    ) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        ActionItem item = actionItemRepository.findById(actionId)
                .orElseThrow(() -> new IllegalArgumentException("Action item not found: " + actionId));

        if (!item.getMeeting().getId().equals(meetingId)) {
            throw new IllegalArgumentException("Action item does not belong to meeting: " + meetingId);
        }

        String newStatus = body != null && body.containsKey("status")
                ? body.get("status")
                : ("DONE".equalsIgnoreCase(item.getStatus()) ? "OPEN" : "DONE");

        item.setStatus(newStatus);
        item = actionItemRepository.save(item);

        return ResponseEntity.ok(new ActionItemDto(
                item.getId(),
                item.getMeeting().getId(),
                item.getTitle(),
                item.getTitle(),
                item.getAssignee(),
                item.getDeadline() != null ? item.getDeadline().toString() : null,
                item.getPriority() != null ? item.getPriority().toUpperCase() : "MEDIUM",
                item.getStatus(),
                parseEvidenceList(item.getEvidenceSegmentIds()),
                item.getCreatedAt() != null ? item.getCreatedAt().toString() : null
        ));
    }

    private static List<String> parseEvidenceList(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        String trimmed = raw.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return java.util.Arrays.stream(trimmed.split(","))
                .map(s -> s.replace("\"", "").replace("'", "").trim())
                .filter(s -> !s.isEmpty())
                .toList();
    }

    public record ActionItemDto(
            UUID id,
            UUID meetingId,
            String task,
            String title,
            String assignee,
            String deadline,
            String priority,
            String status,
            List<String> evidenceSegmentIds,
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
        if (displayName != null && !displayName.isBlank()) {
            participant.setDisplayName(displayName.trim());
            participant = participantRepository.save(participant);
            if (audioWebSocketHandler != null) {
                audioWebSocketHandler.registerSpeakerDisplayName(meetingId, participant.getSpeakerKey(), participant.getDisplayName());
            }
        }

        return ResponseEntity.ok(participant);
    }

    @PatchMapping("/speakers/{speakerKey}")
    public ResponseEntity<Participant> renameSpeakerByKey(
            @PathVariable("id") UUID meetingId,
            @PathVariable("speakerKey") String speakerKey,
            @RequestBody Map<String, String> body
    ) {
        User user = SecurityUtils.getCurrentUser();
        Meeting meeting = meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        String displayName = body.get("displayName");
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Display name cannot be blank");
        }

        Participant participant = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, speakerKey)
                .orElseGet(() -> new Participant(UUID.randomUUID(), meeting, speakerKey, displayName.trim()));
        participant.setDisplayName(displayName.trim());
        participant = participantRepository.save(participant);
        if (audioWebSocketHandler != null) {
            audioWebSocketHandler.registerSpeakerDisplayName(meetingId, speakerKey, participant.getDisplayName());
        }

        return ResponseEntity.ok(participant);
    }

    @PostMapping("/joinees")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Map<String, Object>> syncMeetingJoinees(
            @PathVariable("id") UUID meetingId,
            @RequestBody Map<String, Object> body
    ) {
        User user = SecurityUtils.getCurrentUser();
        Meeting meeting = meetingService.getMeetingAndVerifyOwnership(user, meetingId);

        List<String> joinees = new java.util.ArrayList<>();
        Object rawList = body != null ? body.get("joinees") : null;
        if (rawList instanceof List<?> list) {
            for (Object item : list) {
                if (item != null && !item.toString().isBlank()) {
                    joinees.add(item.toString().trim());
                }
            }
        }
        String activeSpeaker = body != null && body.get("activeSpeaker") != null
                ? body.get("activeSpeaker").toString().trim()
                : null;

        // Also seed authenticated user's derived display name as fallback joinee if roster is empty
        if (joinees.isEmpty() && user.getEmail() != null) {
            String derived = com.vinxa.live.realtime.AudioWebSocketHandler.deriveDisplayNameFromEmail(user.getEmail());
            if (derived != null) joinees.add(derived);
        }

        Map<String, String> assigned = audioWebSocketHandler != null
                ? audioWebSocketHandler.syncMeetingJoinees(meetingId, joinees, activeSpeaker)
                : Map.of();

        // Synchronously persist assigned joinee names into Participant entities in PostgreSQL
        // so immediate GET /transcript queries return the resolved joinee names
        for (Map.Entry<String, String> entry : assigned.entrySet()) {
            String spkKey = entry.getKey();
            String spkName = entry.getValue();
            if (spkKey != null && spkName != null && !com.vinxa.live.realtime.AudioWebSocketHandler.isGenericSpeakerLabel(spkName)) {
                Participant p = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, spkKey)
                        .orElseGet(() -> new Participant(UUID.randomUUID(), meeting, spkKey, spkName));
                if (!spkName.equals(p.getDisplayName())) {
                    p.setDisplayName(spkName);
                }
                participantRepository.save(p);
            }
        }

        return ResponseEntity.ok(Map.of(
                "meetingId", meetingId.toString(),
                "joinees", joinees,
                "assignedSpeakers", assigned
        ));
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
