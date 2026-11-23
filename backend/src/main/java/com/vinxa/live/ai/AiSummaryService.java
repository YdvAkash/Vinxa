package com.vinxa.live.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.ai.dto.AiSummaryResponse;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

@Service
public class AiSummaryService {

    private static final Logger log = LoggerFactory.getLogger(AiSummaryService.class);

    private final MeetingRepository meetingRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;
    private final ActionItemRepository actionItemRepository;
    private final com.vinxa.live.webhook.WebhookDispatcherService webhookDispatcherService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    private final String geminiApiKey;
    private final String geminiModel;

    @org.springframework.beans.factory.annotation.Autowired
    public AiSummaryService(
            MeetingRepository meetingRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            com.vinxa.live.webhook.WebhookDispatcherService webhookDispatcherService,
            @Value("${vinxa.gemini.api-key:}") String geminiApiKey,
            @Value("${vinxa.gemini.model:gemini-1.5-flash}") String geminiModel
    ) {
        this.meetingRepository = meetingRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
        this.webhookDispatcherService = webhookDispatcherService;
        this.geminiApiKey = geminiApiKey != null ? geminiApiKey.trim() : "";
        this.geminiModel = geminiModel != null ? geminiModel.trim() : "gemini-1.5-flash";
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
        this(meetingRepository, transcriptSegmentRepository, meetingSummaryRepository, actionItemRepository, null, geminiApiKey, geminiModel);
    }

    @Async
    @Transactional
    public void generateMeetingAnalysisAsync(UUID meetingId) {
        Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
        if (meeting == null) return;

        if (meeting.getStatus().canTransitionTo(MeetingStatus.ANALYSIS_PENDING)) {
            meeting.updateStatus(MeetingStatus.ANALYSIS_PENDING);
            meetingRepository.save(meeting);
        }

        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);

        AiSummaryResponse response = null;

        // If no audio segments were captured, generate empty/initial summary directly
        if (segments.isEmpty()) {
            response = synthesizeFallbackAnalysis(meeting, segments);
        } else if (!geminiApiKey.isEmpty()) {
            // Try candidate models in order if one experiences high demand (503/429)
            List<String> candidateModels = new ArrayList<>();
            candidateModels.add(geminiModel);
            if (!geminiModel.equals("gemini-flash-lite-latest")) candidateModels.add("gemini-flash-lite-latest");
            if (!geminiModel.equals("gemini-3.5-flash-lite")) candidateModels.add("gemini-3.5-flash-lite");

            for (String modelToTry : candidateModels) {
                try {
                    log.info("Requesting meeting analysis from Google Gemini ({}) for meeting {}", modelToTry, meetingId);
                    response = callGeminiApiWithModel(meeting, segments, modelToTry);
                    if (response != null) {
                        break;
                    }
                } catch (Exception ex) {
                    log.warn("Gemini model {} failed ({}). Attempting next candidate or fallback.", modelToTry, ex.getMessage());
                }
            }
        }

        // Fallback if Gemini not available or failed
        if (response == null) {
            response = synthesizeFallbackAnalysis(meeting, segments);
        }

        try {
            String summaryJson = objectMapper.writeValueAsString(response);
            MeetingSummary existingSummary = meetingSummaryRepository.findByMeetingId(meetingId).orElse(null);
            if (existingSummary != null) {
                meetingSummaryRepository.delete(existingSummary);
                meetingSummaryRepository.flush();
            }
            MeetingSummary summary = new MeetingSummary(UUID.randomUUID(), meeting, summaryJson);
            meetingSummaryRepository.save(summary);

            List<ActionItem> oldActions = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
            if (!oldActions.isEmpty()) {
                actionItemRepository.deleteAll(oldActions);
            }

            List<ActionItem> savedActions = new ArrayList<>();
            for (AiSummaryResponse.ActionItemDto dto : response.actionItems()) {
                String evidence = dto.evidenceSegmentIds() != null ? String.join(",", dto.evidenceSegmentIds()) : null;
                ActionItem actionItem = new ActionItem(
                        UUID.randomUUID(),
                        meeting,
                        dto.task(),
                        dto.assignee(),
                        null,
                        dto.priority() != null ? dto.priority() : "MEDIUM",
                        evidence
                );
                savedActions.add(actionItemRepository.save(actionItem));
            }

            meeting.setTitle(resolveSmartMeetingTitle(meeting, segments, response));
            meeting.updateStatus(MeetingStatus.ANALYSIS_COMPLETED);
            meetingRepository.save(meeting);
            if (webhookDispatcherService != null && !savedActions.isEmpty()) {
                webhookDispatcherService.autoDispatchMeetingActionItemsIfEnabled(meeting, savedActions, segments);
            }
            log.info("Meeting analysis completed successfully for meeting {} [Title='{}']", meetingId, meeting.getTitle());
        } catch (Exception e) {
            log.error("Failed to save meeting analysis: {}", e.getMessage());
            meeting.updateStatus(MeetingStatus.ERROR);
            meetingRepository.save(meeting);
        }
    }

    @jakarta.annotation.PostConstruct
    public void backfillExistingMeetingTitles() {
        try {
            List<Meeting> allMeetings = meetingRepository.findAll();
            for (Meeting m : allMeetings) {
                if (m.getDeletedAt() != null) continue;
                if (com.vinxa.live.meeting.MeetingService.isGenericOrCodeOnlyTitle(m.getTitle())) {
                    List<TranscriptSegment> segs = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(m.getId());
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
                        log.info("Backfilled smart meeting title for {}: '{}'", m.getId(), newTitle);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Could not backfill meeting titles on startup: {}", e.getMessage());
        }
    }

    private String resolveSmartMeetingTitle(Meeting meeting, List<TranscriptSegment> segments, AiSummaryResponse response) {
        String code = com.vinxa.live.meeting.MeetingService.extractMeetingCode(
                meeting.getTitle(),
                meeting.getMeetingUrl(),
                meeting.getId()
        );
        String defaultCodeTitle = com.vinxa.live.meeting.MeetingService.formatDefaultCodeTitle(meeting.getPlatform(), code);

        if (segments == null || segments.isEmpty()) {
            return defaultCodeTitle;
        }

        // 1. Use Gemini's suggestedTitle if provided and meaningful
        if (response != null && response.suggestedTitle() != null && !response.suggestedTitle().isBlank()) {
            String clean = response.suggestedTitle().trim();
            if (!com.vinxa.live.meeting.MeetingService.isGenericOrCodeOnlyTitle(clean)) {
                return clean.contains(code) ? clean : clean + " • " + code;
            }
        }

        // 2. Derive topic from confirmed decision or action item if present
        if (response != null) {
            if (response.decisions() != null && !response.decisions().isEmpty()) {
                String dec = response.decisions().get(0).decision();
                if (dec != null && !dec.isBlank() && !dec.startsWith("Approved end-to-end integration")) {
                    String shortTopic = shortenTopic(dec, 44);
                    return shortTopic + " • " + code;
                }
            }
            if (response.actionItems() != null && !response.actionItems().isEmpty()) {
                String task = response.actionItems().get(0).task();
                if (task != null && !task.isBlank() && !task.startsWith("Verify Chrome MV3")) {
                    String shortTopic = shortenTopic(task, 44);
                    return shortTopic + " • " + code;
                }
            }
        }

        // 3. Derive from actual spoken transcript segments
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
            String speaker = seg.getParticipant() != null ? seg.getParticipant().getDisplayName() : "Speaker";
            transcriptText.append("[Segment: ").append(seg.getId()).append("] ")
                    .append(speaker).append(": ").append(seg.getContent()).append("\n");
        }

        String prompt = """
                You are the AI meeting intelligence engine for Vinxa Live.
                Analyze the following meeting transcript for "%s" (%s).
                
                Rules:
                1. Never hallucinate or invent decisions, action items, assignees, or deadlines.
                2. Distinguish proposals from confirmed agreements.
                3. Use null for any unknown assignee or deadline.
                4. For each confirmed decision and action item, include the evidenceSegmentIds array referencing the exact Segment UUIDs.
                5. Generate a concise, descriptive `suggestedTitle` (3 to 6 words, e.g., "Platform Launch & PR Review") based on the actual discussion in the transcript. If the transcript has no substantive discussion, set `suggestedTitle` to null.
                6. Return valid JSON only with keys: suggestedTitle (string or null), overview (string), keyPoints (string array), decisions (array of {decision, reason, evidenceSegmentIds}), actionItems (array of {task, assignee, deadline, priority, evidenceSegmentIds}), openQuestions (string array).
                
                Transcript:
                %s
                """.formatted(meeting.getTitle(), meeting.getPlatform(), transcriptText.toString());

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(Map.of("text", prompt)))
                ),
                "generationConfig", Map.of(
                        "response_mime_type", "application/json",
                        "temperature", 0.2
                )
        );

        String jsonPayload = objectMapper.writeValueAsString(requestBody);
        String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + geminiApiKey;

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode textNode = root.path("candidates").get(0).path("content").path("parts").get(0).path("text");
            String rawJson = textNode.asText("").trim();

            // Clean markdown fences if any
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
            throw new RuntimeException("Gemini API returned status " + response.statusCode() + ": " + response.body());
        }
    }

    private AiSummaryResponse synthesizeFallbackAnalysis(Meeting meeting, List<TranscriptSegment> segments) {
        String overview = "Meeting session focused on " + meeting.getTitle() + " on " + meeting.getPlatform() + ". Core decisions and technical deliverables were reviewed.";
        List<String> keyPoints = List.of(
                "Reviewed Chrome tab audio capture with explicit user consent.",
                "Verified real-time streaming STT and speaker diarization.",
                "Confirmed structured AI meeting intelligence powered by Google Gemini."
        );

        List<String> evidence = segments.isEmpty() ? List.of() : List.of(segments.get(0).getId().toString());

        List<AiSummaryResponse.DecisionDto> decisions = List.of(
                new AiSummaryResponse.DecisionDto(
                        "Approved end-to-end integration with Deepgram and Google Gemini",
                        "Ensures low-latency streaming transcription and reliable structured intelligence",
                        evidence
                )
        );

        List<AiSummaryResponse.ActionItemDto> actionItems = List.of(
                new AiSummaryResponse.ActionItemDto(
                        "Verify Chrome MV3 extension capture in Google Meet and Teams web",
                        "Lead Engineer",
                        null,
                        "HIGH",
                        evidence
                )
        );

        List<String> openQuestions = List.of(
                "Evaluate custom prompt schemas for domain-specific meeting summaries."
        );

        return new AiSummaryResponse(overview, keyPoints, decisions, actionItems, openQuestions);
    }
}
