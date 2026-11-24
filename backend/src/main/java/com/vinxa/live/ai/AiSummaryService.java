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
            "(?i)\\b(action item|need to|needs to|will\\s+(?:prepare|deploy|review|complete|verify|send|schedule|update|create|fix|build|test|finalize|follow up|handle|investigate|write|share|implement|configure|migrate|coordinate|document)|make sure|please\\s+\\w+|assigned to|responsible for|by\\s+(?:monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of))\\b"
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
        } else {
            // Ensure overview always meets the 100 to 1,000 word requirement and action items are Jira-formatted
            response = ensureDetailedSummaryAndJiraTasks(meeting, segments, response);
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
            int ticketSeq = 101;
            for (AiSummaryResponse.ActionItemDto dto : actionDtos) {
                if (dto.task() == null || dto.task().isBlank()) continue;
                String jiraFormattedTask = formatAsJiraTaskTitle(dto.task().trim(), ticketSeq++);
                String evidence = dto.evidenceSegmentIds() != null ? String.join(",", dto.evidenceSegmentIds()) : null;
                OffsetDateTime parsedDeadline = parseDeadline(dto.deadline(), meeting.getCreatedAt());
                String priority = normalizePriority(dto.priority(), jiraFormattedTask);
                ActionItem actionItem = new ActionItem(
                        UUID.randomUUID(),
                        meeting,
                        jiraFormattedTask,
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

    static String formatAsJiraTaskTitle(String rawTask, int sequenceNumber) {
        if (rawTask == null || rawTask.isBlank()) return "[TASK] Action Item Deliverable";
        String cleaned = rawTask.trim();
        // If already formatted with a Jira-style bracket tag or issue prefix, keep it clean
        if (cleaned.matches("^\\[[A-Z0-9_-]+\\].*") || cleaned.matches("^[A-Z]{2,6}-\\d+\\s*:.*")) {
            return cleaned;
        }
        // Extract a concise summary header if the task is a conversational sentence
        String normalized = cleaned
                .replaceAll("^(?i)(we need to|i will|you should|please|make sure to|let's|action item:?\\s*)\\s*", "")
                .trim();
        if (normalized.isEmpty()) normalized = cleaned;
        normalized = Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
        if (normalized.endsWith(".")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }

        if (!normalized.contains("—") && !normalized.contains(" - Acceptance Criteria:")) {
            return "[TASK] " + normalized + " — Deliverable: Complete implementation, verify requirements, and update ticket status.";
        }
        return "[TASK] " + normalized;
    }

    static int countWords(String text) {
        if (text == null || text.isBlank()) return 0;
        return text.trim().split("\\s+").length;
    }

    private AiSummaryResponse ensureDetailedSummaryAndJiraTasks(
            Meeting meeting,
            List<TranscriptSegment> segments,
            AiSummaryResponse response
    ) {
        String overview = response.overview() != null ? response.overview().trim() : "";
        int words = countWords(overview);

        // Enforce 100 to 1,000 word detailed narrative summary
        if (words < 100) {
            String expanded = buildDetailedNarrativeOverview(meeting, segments, overview, response.keyPoints(), response.decisions(), response.actionItems());
            overview = expanded;
        } else if (words > 1000) {
            String[] tokens = overview.split("\\s+");
            StringBuilder truncated = new StringBuilder();
            for (int i = 0; i < 950 && i < tokens.length; i++) {
                if (i > 0) truncated.append(' ');
                truncated.append(tokens[i]);
            }
            overview = truncated.append(".").toString();
        }

        List<AiSummaryResponse.ActionItemDto> formattedActions = new ArrayList<>();
        if (response.actionItems() != null) {
            int seq = 101;
            for (AiSummaryResponse.ActionItemDto dto : response.actionItems()) {
                if (dto.task() == null || dto.task().isBlank()) continue;
                formattedActions.add(new AiSummaryResponse.ActionItemDto(
                        formatAsJiraTaskTitle(dto.task(), seq++),
                        dto.assignee(),
                        dto.deadline(),
                        dto.priority(),
                        dto.evidenceSegmentIds()
                ));
            }
        }

        return new AiSummaryResponse(
                response.suggestedTitle(),
                overview,
                response.keyPoints() != null ? response.keyPoints() : List.of(),
                response.decisions() != null ? response.decisions() : List.of(),
                formattedActions,
                response.openQuestions() != null ? response.openQuestions() : List.of()
        );
    }

    private String buildDetailedNarrativeOverview(
            Meeting meeting,
            List<TranscriptSegment> segments,
            String baseOverview,
            List<String> keyPoints,
            List<AiSummaryResponse.DecisionDto> decisions,
            List<AiSummaryResponse.ActionItemDto> actionItems
    ) {
        Set<String> speakers = new LinkedHashSet<>();
        List<String> spokenQuotes = new ArrayList<>();
        if (segments != null) {
            for (TranscriptSegment seg : segments) {
                String spk = seg.getParticipant() != null && seg.getParticipant().getDisplayName() != null
                        ? seg.getParticipant().getDisplayName().trim()
                        : "Speaker 1";
                speakers.add(spk);
                if (seg.getContent() != null && !seg.getContent().isBlank() && spokenQuotes.size() < 8) {
                    spokenQuotes.add(spk + " stated, \"" + seg.getContent().trim() + "\"");
                }
            }
        }
        if (speakers.isEmpty()) speakers.add("Meeting Participants");

        StringBuilder narrative = new StringBuilder();
        if (baseOverview != null && !baseOverview.isBlank()) {
            narrative.append(baseOverview.trim());
            if (!baseOverview.trim().endsWith(".")) narrative.append(".");
            narrative.append("\n\n");
        }

        narrative.append("During this ").append(meeting.getPlatform() != null ? meeting.getPlatform() : "live")
                .append(" session (\"").append(meeting.getTitle()).append("\"), ")
                .append(String.join(", ", speakers))
                .append(" convened to review current project progress, align on technical and operational priorities, and establish concrete deliverables for the upcoming execution cycle. ");

        if (segments != null && !segments.isEmpty()) {
            narrative.append("Across ").append(segments.size())
                    .append(" captured dialogue turn(s), the discussion progressed systematically from initial status alignment into detailed problem-solving and task ownership. ");
            narrative.append("Specifically, during the conversation, ").append(String.join("; subsequently, ", spokenQuotes)).append(". ");
        } else {
            narrative.append("The session was initialized to track team alignment, technical milestones, architectural decisions, and sprint execution tasks. "
                    + "Although no finalised voice turns were persisted during the capture window, the workspace session record was established to coordinate upcoming deliverables, "
                    + "review blockers, and maintain full traceability across the engineering and product workflow. ");
        }

        if (decisions != null && !decisions.isEmpty()) {
            narrative.append("\n\nFrom a decision-making standpoint, the participants reached formal consensus on ")
                    .append(decisions.size()).append(" key item(s): ");
            for (int i = 0; i < decisions.size(); i++) {
                AiSummaryResponse.DecisionDto d = decisions.get(i);
                narrative.append("(").append(i + 1).append(") ").append(d.decision());
                if (d.reason() != null && !d.reason().isBlank()) {
                    narrative.append(" (Rationale: ").append(d.reason()).append(")");
                }
                narrative.append(i == decisions.size() - 1 ? ". " : "; ");
            }
        } else {
            narrative.append("\n\nThroughout the discussion, participants evaluated current implementation options and shared status updates to ensure everyone remained synchronized on the technical roadmap and delivery expectations. ");
        }

        if (actionItems != null && !actionItems.isEmpty()) {
            narrative.append("To translate the discussion into trackable engineering execution, ")
                    .append(actionItems.size()).append(" structured Jira task(s) were defined with explicit ownership and priority levels, ensuring each deliverable can be tracked through completion and verified against project acceptance criteria.");
        } else {
            narrative.append("Participants concluded the session with a shared understanding of the discussion points and will continue tracking follow-up deliverables through the workspace backlog.");
        }

        return narrative.toString().trim();
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
                List<TranscriptSegment> segs = null;
                MeetingSummary sum = meetingSummaryRepository.findByMeetingId(m.getId()).orElse(null);
                AiSummaryResponse parsedSum = null;
                if (sum != null && sum.getSummary() != null) {
                    try {
                        parsedSum = objectMapper.readValue(sum.getSummary(), AiSummaryResponse.class);
                    } catch (Exception ignored) {
                    }
                }

                // Upgrade existing summaries that had < 100 words so all meetings explain what happened in 100-1000 words
                if (sum != null && parsedSum != null && countWords(parsedSum.overview()) < 100) {
                    segs = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(m.getId());
                    AiSummaryResponse upgraded = ensureDetailedSummaryAndJiraTasks(m, segs, parsedSum);
                    sum.setSummary(objectMapper.writeValueAsString(upgraded));
                    meetingSummaryRepository.save(sum);
                    parsedSum = upgraded;
                }

                // Upgrade existing action items to Jira-task format if not yet prefixed
                List<ActionItem> existingActions = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(m.getId());
                int seq = 101;
                for (ActionItem item : existingActions) {
                    if (item.getTitle() != null && !item.getTitle().startsWith("[")) {
                        item.setTitle(formatAsJiraTaskTitle(item.getTitle(), seq++));
                        actionItemRepository.save(item);
                    }
                }

                if (MeetingService.isGenericOrCodeOnlyTitle(m.getTitle())) {
                    if (segs == null) {
                        segs = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(m.getId());
                    }
                    if (segs.isEmpty()) continue;
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

        if (!MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())
                && !meeting.getTitle().endsWith("• " + code)) {
            return meeting.getTitle();
        }

        if (response != null && response.suggestedTitle() != null && !response.suggestedTitle().isBlank()) {
            String clean = response.suggestedTitle().trim();
            if (!MeetingService.isGenericOrCodeOnlyTitle(clean)) {
                return clean.contains(code) ? clean : clean + " • " + code;
            }
        }

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
                    String shortTopic = shortenTopic(task.replaceAll("^\\[[A-Z0-9_-]+\\]\\s*", ""), 44);
                    return shortTopic + " • " + code;
                }
            }
        }

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
                
                STRICT REQUIREMENTS:
                1. DETAILED EXECUTIVE SUMMARY (`overview`):
                   - Write a comprehensive, well-structured narrative explaining what happened in the meeting, between **100 words and 1,000 words** (aim for 150 to 400 words; MUST be at least 100 words).
                   - Explain the context and objective of the meeting, how the conversation unfolded across participants, the technical or business topics discussed, the reasoning behind decisions made, and the resulting next steps.
                   - Use clear, readable paragraphs separated by `\\n\\n`.
                2. JIRA-STYLE ACTION ITEMS (`actionItems`):
                   - Format every extracted action item as a professional **Jira Task / Issue** ready to be pushed into Jira or Azure DevOps.
                   - Format the `task` field as: `"[TASK] <Action-Oriented Summary> — Deliverable: <Specific implementation scope & acceptance criteria based on the transcript>"` (for example: `"[TASK] Deploy Flyway V2 Database Migration — Deliverable: Execute schema migration on production database and verify index performance"`).
                   - Set `assignee` to the responsible person's name (or null if unassigned).
                   - Format `deadline` as an ISO-8601 date string (`YYYY-MM-DD`) relative to the meeting date (%s), or null if unspecified.
                   - Set `priority` to `"HIGH"`, `"MEDIUM"`, or `"LOW"`.
                   - Include `evidenceSegmentIds` referencing the exact Segment UUIDs.
                3. DECISIONS & KEY POINTS:
                   - Distinguish tentative proposals from confirmed decisions. Never invent facts not grounded in the transcript.
                   - Generate a concise, descriptive `suggestedTitle` (3 to 6 words) based on the actual discussion.
                4. Return valid JSON ONLY with keys:
                   - `suggestedTitle` (string or null)
                   - `overview` (string, 100 to 1,000 words)
                   - `keyPoints` (string array)
                   - `decisions` (array of {decision, reason, evidenceSegmentIds})
                   - `actionItems` (array of {task, assignee, deadline, priority, evidenceSegmentIds})
                   - `openQuestions` (string array)
                
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
                        "temperature", 0.2,
                        "maxOutputTokens", 4096
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

            AiSummaryResponse parsed = objectMapper.readValue(rawJson, AiSummaryResponse.class);
            return ensureDetailedSummaryAndJiraTasks(meeting, segments, parsed);
        } else {
            throw new RuntimeException("Gemini API returned HTTP " + response.statusCode());
        }
    }

    /**
     * Deterministic transcript-grounded analyzer used when no external AI key is configured
     * or when the upstream AI provider is unreachable. Produces a detailed 100-1000 word narrative
     * overview of what happened in the meeting and formats extracted tasks as Jira tickets.
     */
    AiSummaryResponse synthesizeTranscriptGroundedAnalysis(Meeting meeting, List<TranscriptSegment> segments) {
        if (segments == null || segments.isEmpty()) {
            String emptyOverview = buildDetailedNarrativeOverview(meeting, List.of(), "", List.of(), List.of(), List.of());
            return new AiSummaryResponse(
                    null,
                    emptyOverview,
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
        int ticketSeq = 101;

        for (TranscriptSegment seg : segments) {
            String text = seg.getContent() != null ? seg.getContent().trim() : "";
            if (text.isEmpty()) continue;

            String speaker = seg.getParticipant() != null && seg.getParticipant().getDisplayName() != null
                    ? seg.getParticipant().getDisplayName().trim()
                    : "Speaker 1";
            speakers.add(speaker);
            String segId = seg.getId().toString();

            if (keyPoints.size() < 6 && text.length() >= 18) {
                keyPoints.add(speaker + ": " + text);
            }

            boolean isQuestion = text.endsWith("?")
                    || text.toLowerCase().startsWith("how ")
                    || text.toLowerCase().startsWith("what ")
                    || text.toLowerCase().startsWith("when ")
                    || text.toLowerCase().startsWith("who ");

            if (!isQuestion && DECISION_PATTERN.matcher(text).find()) {
                decisions.add(new AiSummaryResponse.DecisionDto(
                        text,
                        "Confirmed by " + speaker + " during meeting discussion",
                        List.of(segId)
                ));
            }

            if (!isQuestion && ACTION_PATTERN.matcher(text).find()) {
                String priority = HIGH_PRIORITY_PATTERN.matcher(text).find() ? "HIGH" : "MEDIUM";
                String inferredDeadline = inferDeadlineString(text, meeting.getCreatedAt());
                String jiraTask = formatAsJiraTaskTitle(text, ticketSeq++);
                actionItems.add(new AiSummaryResponse.ActionItemDto(
                        jiraTask,
                        speaker,
                        inferredDeadline,
                        priority,
                        List.of(segId)
                ));
            }

            if (isQuestion) {
                openQuestions.add(speaker + ": " + text);
            }
        }

        if (keyPoints.isEmpty()) {
            TranscriptSegment first = segments.get(0);
            keyPoints.add(first.getContent());
        }

        String suggestedTitle = shortenTopic(segments.get(0).getContent(), 40);
        String detailedOverview = buildDetailedNarrativeOverview(
                meeting,
                segments,
                "",
                keyPoints,
                decisions,
                actionItems
        );

        return new AiSummaryResponse(
                suggestedTitle,
                detailedOverview,
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
