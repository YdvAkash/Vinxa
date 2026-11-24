package com.vinxa.live.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.ai.dto.AiSummaryResponse;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.realtime.EventWebSocketHandler;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AiSummaryService {

    private static final Logger log = LoggerFactory.getLogger(AiSummaryService.class);

    private static final Pattern DECISION_PATTERN = Pattern.compile(
            "(?i)\\b(decided|agreed|approved|confirmed|finalized|consensus|we will proceed|locked in|officially decided|signed off|selected|chosen)\\b"
    );
    private static final Pattern ACTION_PATTERN = Pattern.compile(
            "(?i)\\b(action item|need to|needs to|should|will\\s+(?:prepare|deploy|review|complete|verify|send|schedule|update|create|fix|build|test|finalize|follow up|handle|investigate|write|share)|make sure|please\\s+\\w+|assigned to|responsible for|by\\s+(?:monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of))\\b"
    );
    private static final Pattern HIGH_PRIORITY_PATTERN = Pattern.compile(
            "(?i)\\b(urgent|critical|blocker|asap|immediately|highest priority|p0|today|must)\\b"
    );
    private static final Pattern ISO_DATE_PATTERN = Pattern.compile("\\b(\\d{4}-\\d{2}-\\d{2})\\b");

    private final MeetingRepository meetingRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;
    private final ActionItemRepository actionItemRepository;
    private final com.vinxa.live.webhook.WebhookDispatcherService webhookDispatcherService;
    private final EventWebSocketHandler eventWebSocketHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    private final String geminiApiKey;
    private final String geminiModel;

    @Autowired
    public AiSummaryService(
            MeetingRepository meetingRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            com.vinxa.live.webhook.WebhookDispatcherService webhookDispatcherService,
            EventWebSocketHandler eventWebSocketHandler,
            @Value("${vinxa.gemini.api-key:}") String geminiApiKey,
            @Value("${vinxa.gemini.model:gemini-flash-lite-latest}") String geminiModel
    ) {
        this.meetingRepository = meetingRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
        this.webhookDispatcherService = webhookDispatcherService;
        this.eventWebSocketHandler = eventWebSocketHandler;
        this.geminiApiKey = geminiApiKey != null ? geminiApiKey.trim() : "";
        this.geminiModel = geminiModel != null && !geminiModel.isBlank() ? geminiModel.trim() : "gemini-flash-lite-latest";
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    public AiSummaryService(
            MeetingRepository meetingRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            String geminiApiKey,
            String geminiModel
    ) {
        this(meetingRepository, transcriptSegmentRepository, meetingSummaryRepository, actionItemRepository, null, null, geminiApiKey, geminiModel);
    }

    private List<String> buildCandidateModels() {
        Set<String> models = new LinkedHashSet<>();
        models.add(geminiModel);
        models.add("gemini-flash-lite-latest");
        models.add("gemini-2.5-flash-lite");
        models.add("gemini-2.0-flash");
        models.add("gemini-1.5-flash");
        return new ArrayList<>(models);
    }

    @Async
    @Transactional
    public void generateMeetingAnalysisAsync(UUID meetingId) {
        Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
        if (meeting == null) return;

        if (meeting.getStatus().canTransitionTo(MeetingStatus.ANALYSIS_PENDING)) {
            meeting.updateStatus(MeetingStatus.ANALYSIS_PENDING);
            meetingRepository.save(meeting);
            broadcastStatusEvent(meetingId, MeetingStatus.ANALYSIS_PENDING, meeting.getTitle());
        }

        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);

        AiSummaryResponse response = null;

        if (segments.isEmpty()) {
            response = synthesizeTranscriptGroundedAnalysis(meeting, segments);
        } else if (!geminiApiKey.isEmpty()) {
            for (String modelToTry : buildCandidateModels()) {
                try {
                    log.info("Requesting meeting analysis from Google Gemini ({}) for meeting {} ({} segments)",
                            modelToTry, meetingId, segments.size());
                    response = callGeminiApiWithModel(meeting, segments, modelToTry);
                    if (response != null) {
                        break;
                    }
                } catch (Exception ex) {
                    log.warn("Gemini model {} failed for meeting {} ({}). Trying next candidate.",
                            modelToTry, meetingId, ex.getMessage());
                }
            }
        }

        if (response == null) {
            response = synthesizeTranscriptGroundedAnalysis(meeting, segments);
        }

        try {
            String summaryJson = objectMapper.writeValueAsString(response);
            MeetingSummary existingSummary = meetingSummaryRepository.findByMeetingId(meetingId).orElse(null);
            if (existingSummary != null) {
                existingSummary.setSummary(summaryJson);
                meetingSummaryRepository.save(existingSummary);
            } else {
                MeetingSummary summary = new MeetingSummary(UUID.randomUUID(), meeting, summaryJson);
                meetingSummaryRepository.save(summary);
            }

            List<ActionItem> oldActions = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
            if (!oldActions.isEmpty()) {
                actionItemRepository.deleteAll(oldActions);
            }

            List<ActionItem> savedActions = new ArrayList<>();
            List<AiSummaryResponse.ActionItemDto> actionDtos = response.actionItems() != null ? response.actionItems() : List.of();
            for (AiSummaryResponse.ActionItemDto dto : actionDtos) {
                if (dto.task() == null || dto.task().isBlank()) continue;
                String evidence = dto.evidenceSegmentIds() != null ? String.join(",", dto.evidenceSegmentIds()) : null;
                OffsetDateTime parsedDeadline = parseDeadline(dto.deadline(), meeting.getCreatedAt());
                String priority = normalizePriority(dto.priority(), dto.task());
                ActionItem actionItem = new ActionItem(
                        UUID.randomUUID(),
                        meeting,
                        dto.task().trim(),
                        dto.assignee() != null && !dto.assignee().isBlank() ? dto.assignee().trim() : null,
                        parsedDeadline,
                        priority,
                        evidence
                );
                savedActions.add(actionItemRepository.save(actionItem));
            }

            meeting.setTitle(resolveSmartMeetingTitle(meeting, segments, response));
            meeting.updateStatus(MeetingStatus.ANALYSIS_COMPLETED);
            meetingRepository.save(meeting);

            broadcastStatusEvent(meetingId, MeetingStatus.ANALYSIS_COMPLETED, meeting.getTitle());

            if (webhookDispatcherService != null && !savedActions.isEmpty()) {
                webhookDispatcherService.autoDispatchMeetingActionItemsIfEnabled(meeting, savedActions, segments);
            }
            log.info("Meeting analysis completed successfully for meeting {} [actions={}, decisions={}]",
                    meetingId,
                    savedActions.size(),
                    response.decisions() != null ? response.decisions().size() : 0);
        } catch (Exception e) {
            log.error("Failed to save meeting analysis for {}: {}", meetingId, e.getMessage());
            meeting.updateStatus(MeetingStatus.ERROR);
            meetingRepository.save(meeting);
            broadcastStatusEvent(meetingId, MeetingStatus.ERROR, meeting.getTitle());
        }
    }

    private void broadcastStatusEvent(UUID meetingId, MeetingStatus status, String title) {
        if (eventWebSocketHandler == null) return;
        try {
            eventWebSocketHandler.broadcastToMeeting(
                    meetingId,
                    Map.of(
                            "type", "MEETING_STATUS",
                            "meetingId", meetingId.toString(),
                            "status", status.name(),
                            "title", title != null ? title : ""
                    )
            );
        } catch (Exception ignored) {
        }
    }

    static OffsetDateTime parseDeadline(String rawDeadline, OffsetDateTime referenceTime) {
        if (rawDeadline == null || rawDeadline.isBlank() || "null".equalsIgnoreCase(rawDeadline.trim())) {
            return null;
        }
        String cleaned = rawDeadline.trim();
        try {
            return OffsetDateTime.parse(cleaned);
        } catch (Exception ignored) {
        }
        try {
            Matcher m = ISO_DATE_PATTERN.matcher(cleaned);
            if (m.find()) {
                LocalDate date = LocalDate.parse(m.group(1));
                return date.atTime(17, 0).atOffset(ZoneOffset.UTC);
            }
        } catch (Exception ignored) {
        }
        OffsetDateTime base = referenceTime != null ? referenceTime : OffsetDateTime.now();
        String lower = cleaned.toLowerCase();
        if (lower.contains("today") || lower.contains("eod")) {
            return base.withHour(18).withMinute(0).withSecond(0);
        }
        if (lower.contains("tomorrow")) {
            return base.plusDays(1).withHour(17).withMinute(0).withSecond(0);
        }
        if (lower.contains("next week")) {
            return base.plusDays(7).withHour(17).withMinute(0).withSecond(0);
        }
        if (lower.contains("friday")) {
            return base.plusDays(3).withHour(17).withMinute(0).withSecond(0);
        }
        if (lower.contains("monday")) {
            return base.plusDays(4).withHour(17).withMinute(0).withSecond(0);
        }
        return null;
    }

    private static String normalizePriority(String rawPriority, String taskText) {
        if (rawPriority != null) {
            String upper = rawPriority.trim().toUpperCase();
            if ("HIGH".equals(upper) || "MEDIUM".equals(upper) || "LOW".equals(upper)) {
                return upper;
            }
        }
        if (taskText != null && HIGH_PRIORITY_PATTERN.matcher(taskText).find()) {
            return "HIGH";
        }
        return "MEDIUM";
    }

    @jakarta.annotation.PostConstruct
    public void scheduleBackfillExistingMeetingTitles() {
        CompletableFuture.runAsync(this::backfillExistingMeetingTitles);
    }

    public void backfillExistingMeetingTitles() {
        try {
            List<Meeting> allMeetings = meetingRepository.findAll();
            for (Meeting m : allMeetings) {
                if (m.getDeletedAt() != null) continue;
                if (MeetingService.isGenericOrCodeOnlyTitle(m.getTitle())) {
                    List<TranscriptSegment> segs = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(m.getId());
                    if (segs.isEmpty()) continue;
                    MeetingSummary sum = meetingSummaryRepository.findByMeetingId(m.getId()).orElse(null);
                    AiSummaryResponse parsedSum = null;
                    if (sum != null && sum.getSummary() != null) {
                        try {
                            parsedSum = objectMapper.readValue(sum.getSummary(), AiSummaryResponse.class);
                        } catch (Exception ignored) {
                        }
                    }
                    String newTitle = resolveSmartMeetingTitle(m, segs, parsedSum);
                    if (!newTitle.equals(m.getTitle())) {
                        m.setTitle(newTitle);
                        meetingRepository.save(m);
                        log.info("Backfilled smart meeting title for {}", m.getId());
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not backfill meeting titles on startup: {}", e.getMessage());
        }
    }

    private String resolveSmartMeetingTitle(Meeting meeting, List<TranscriptSegment> segments, AiSummaryResponse response) {
        String code = MeetingService.extractMeetingCode(
                meeting.getTitle(),
                meeting.getMeetingUrl(),
                meeting.getId()
        );
        String defaultCodeTitle = MeetingService.formatDefaultCodeTitle(meeting.getPlatform(), code);

        if (segments == null || segments.isEmpty()) {
            return MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())
                    ? defaultCodeTitle
                    : meeting.getTitle();
        }

        // 1. Preserve custom user-provided title if it is already descriptive
        if (!MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())
                && !meeting.getTitle().endsWith("• " + code)) {
            return meeting.getTitle();
        }

        // 2. Use Gemini's suggestedTitle if provided and meaningful
        if (response != null && response.suggestedTitle() != null && !response.suggestedTitle().isBlank()) {
            String clean = response.suggestedTitle().trim();
            if (!MeetingService.isGenericOrCodeOnlyTitle(clean)) {
                return clean.contains(code) ? clean : clean + " • " + code;
            }
        }

        // 3. Derive topic from confirmed decision or action item if present
        if (response != null) {
            if (response.decisions() != null && !response.decisions().isEmpty()) {
                String dec = response.decisions().get(0).decision();
                if (dec != null && !dec.isBlank()) {
                    String shortTopic = shortenTopic(dec, 44);
                    return shortTopic + " • " + code;
                }
            }
            if (response.actionItems() != null && !response.actionItems().isEmpty()) {
                String task = response.actionItems().get(0).task();
                if (task != null && !task.isBlank()) {
                    String shortTopic = shortenTopic(task, 44);
                    return shortTopic + " • " + code;
                }
            }
        }

        // 4. Derive from actual spoken transcript segments
        for (TranscriptSegment seg : segments) {
            String text = seg.getContent() != null ? seg.getContent().trim() : "";
            if (text.length() > 12) {
                String shortTopic = shortenTopic(text, 42);
                return shortTopic + " • " + code;
            }
        }

        return defaultCodeTitle;
    }

    private String shortenTopic(String raw, int maxLen) {
        String clean = raw.replaceAll("^(?i)(welcome everyone to our|welcome everyone|today we need to|we have officially decided to|agreed\\.|hello team,?)\\s*", "").trim();
        if (clean.isEmpty()) clean = raw.trim();
        clean = Character.toUpperCase(clean.charAt(0)) + clean.substring(1);
        if (clean.endsWith(".")) clean = clean.substring(0, clean.length() - 1);
        if (clean.length() <= maxLen) return clean;
        int lastSpace = clean.lastIndexOf(' ', maxLen);
        return (lastSpace > 15 ? clean.substring(0, lastSpace) : clean.substring(0, maxLen)) + "…";
    }

    private AiSummaryResponse callGeminiApiWithModel(Meeting meeting, List<TranscriptSegment> segments, String modelName) throws Exception {
        StringBuilder transcriptText = new StringBuilder();
        for (TranscriptSegment seg : segments) {
            String speaker = seg.getParticipant() != null && seg.getParticipant().getDisplayName() != null
                    ? seg.getParticipant().getDisplayName()
                    : "Speaker";
            transcriptText.append("[Segment: ").append(seg.getId()).append("] ")
                    .append(speaker).append(": ").append(seg.getContent()).append("\n");
        }

        String meetingDateStr = meeting.getCreatedAt() != null
                ? meeting.getCreatedAt().toLocalDate().toString()
                : LocalDate.now().toString();

        String prompt = """
                You are the AI meeting intelligence engine for Vinxa Live.
                Analyze the following meeting transcript for "%s" (%s) recorded on %s.
                
                Rules:
                1. Never hallucinate or invent decisions, action items, assignees, or deadlines.
                2. Distinguish tentative proposals from confirmed agreements/decisions.
                3. Use null for any unknown assignee or deadline. When a deadline is mentioned, format `deadline` as an ISO-8601 date string (YYYY-MM-DD) relative to the meeting date (%s), or null if unspecified.
                4. Set action item `priority` to "HIGH", "MEDIUM", or "LOW".
                5. For each confirmed decision and action item, include the `evidenceSegmentIds` array referencing the exact Segment UUIDs from the transcript.
                6. Generate a concise, descriptive `suggestedTitle` (3 to 6 words, e.g., "Q4 Architecture & Launch Readiness") based on the actual discussion in the transcript. If the transcript has no substantive discussion, set `suggestedTitle` to null.
                7. Return valid JSON only with keys: suggestedTitle (string or null), overview (string), keyPoints (string array), decisions (array of {decision, reason, evidenceSegmentIds}), actionItems (array of {task, assignee, deadline, priority, evidenceSegmentIds}), openQuestions (string array).
                
                Transcript:
                %s
                """.formatted(
                meeting.getTitle(),
                meeting.getPlatform(),
                meetingDateStr,
                meetingDateStr,
                transcriptText.toString()
        );

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(Map.of("text", prompt)))
                ),
                "generationConfig", Map.of(
                        "response_mime_type", "application/json",
                        "temperature", 0.15
                )
        );

        String jsonPayload = objectMapper.writeValueAsString(requestBody);
        String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", geminiApiKey)
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode textNode = root.path("candidates").get(0).path("content").path("parts").get(0).path("text");
            String rawJson = textNode.asText("").trim();

            if (rawJson.startsWith("```json")) {
                rawJson = rawJson.substring(7);
            } else if (rawJson.startsWith("```")) {
                rawJson = rawJson.substring(3);
            }
            if (rawJson.endsWith("```")) {
                rawJson = rawJson.substring(0, rawJson.length() - 3);
            }
            rawJson = rawJson.trim();

            return objectMapper.readValue(rawJson, AiSummaryResponse.class);
        } else {
            throw new RuntimeException("Gemini API returned HTTP " + response.statusCode());
        }
    }

    /**
     * Deterministic transcript-grounded analyzer used when no external AI key is configured
     * or when the upstream AI provider is unreachable. Never returns hardcoded mock topics;
     * strictly extracts facts, decisions, action items, and questions from the actual transcript segments.
     */
    AiSummaryResponse synthesizeTranscriptGroundedAnalysis(Meeting meeting, List<TranscriptSegment> segments) {
        if (segments == null || segments.isEmpty()) {
            return new AiSummaryResponse(
                    null,
                    "No speech segments were recorded during this meeting session.",
                    List.of(),
                    List.of(),
                    List.of(),
                    List.of()
            );
        }

        Set<String> speakers = new LinkedHashSet<>();
        List<String> keyPoints = new ArrayList<>();
        List<AiSummaryResponse.DecisionDto> decisions = new ArrayList<>();
        List<AiSummaryResponse.ActionItemDto> actionItems = new ArrayList<>();
        List<String> openQuestions = new ArrayList<>();

        for (TranscriptSegment seg : segments) {
            String text = seg.getContent() != null ? seg.getContent().trim() : "";
            if (text.isEmpty()) continue;

            String speaker = seg.getParticipant() != null && seg.getParticipant().getDisplayName() != null
                    ? seg.getParticipant().getDisplayName().trim()
                    : "Speaker 1";
            speakers.add(speaker);
            String segId = seg.getId().toString();

            // Key points: substantive turns
            if (keyPoints.size() < 6 && text.length() >= 18) {
                keyPoints.add(speaker + ": " + text);
            }

            boolean isQuestion = text.endsWith("?")
                    || text.toLowerCase().startsWith("how ")
                    || text.toLowerCase().startsWith("what ")
                    || text.toLowerCase().startsWith("when ")
                    || text.toLowerCase().startsWith("who ");

            // Confirmed decisions detection
            if (!isQuestion && DECISION_PATTERN.matcher(text).find()) {
                decisions.add(new AiSummaryResponse.DecisionDto(
                        text,
                        "Confirmed by " + speaker + " during meeting discussion",
                        List.of(segId)
                ));
            }

            // Action items detection (exclude open questions)
            if (!isQuestion && ACTION_PATTERN.matcher(text).find()) {
                String priority = HIGH_PRIORITY_PATTERN.matcher(text).find() ? "HIGH" : "MEDIUM";
                String inferredDeadline = inferDeadlineString(text, meeting.getCreatedAt());
                actionItems.add(new AiSummaryResponse.ActionItemDto(
                        text,
                        speaker,
                        inferredDeadline,
                        priority,
                        List.of(segId)
                ));
            }

            // Open questions detection
            if (isQuestion) {
                openQuestions.add(speaker + ": " + text);
            }
        }

        if (keyPoints.isEmpty()) {
            TranscriptSegment first = segments.get(0);
            keyPoints.add(first.getContent());
        }

        String suggestedTitle = shortenTopic(segments.get(0).getContent(), 40);
        String speakerSummary = String.join(", ", speakers);
        String overview = String.format(
                "Meeting session with %d participant(s) (%s) across %d spoken turn(s). %d decision(s) and %d action item(s) were identified from the transcript.",
                speakers.size(),
                speakerSummary,
                segments.size(),
                decisions.size(),
                actionItems.size()
        );

        return new AiSummaryResponse(
                suggestedTitle,
                overview,
                keyPoints,
                decisions,
                actionItems,
                openQuestions
        );
    }

    private String inferDeadlineString(String text, OffsetDateTime referenceTime) {
        Matcher isoMatcher = ISO_DATE_PATTERN.matcher(text);
        if (isoMatcher.find()) {
            return isoMatcher.group(1);
        }
        OffsetDateTime parsed = parseDeadline(text, referenceTime);
        return parsed != null ? parsed.toLocalDate().toString() : null;
    }
}
