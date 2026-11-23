package com.vinxa.live.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.ai.dto.CopilotAskRequest;
import com.vinxa.live.ai.dto.CopilotAskResponse;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

@Service
public class MeetingCopilotService {

    private static final Logger log = LoggerFactory.getLogger(MeetingCopilotService.class);

    private final MeetingRepository meetingRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;
    private final ActionItemRepository actionItemRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    private final String geminiApiKey;
    private final String geminiModel;

    public MeetingCopilotService(
            MeetingRepository meetingRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository,
            @Value("${vinxa.gemini.api-key:}") String geminiApiKey,
            @Value("${vinxa.gemini.model:gemini-flash-lite-latest}") String geminiModel
    ) {
        this.meetingRepository = meetingRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
        this.geminiApiKey = geminiApiKey != null ? geminiApiKey.trim() : "";
        this.geminiModel = geminiModel != null ? geminiModel.trim() : "gemini-flash-lite-latest";
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
    }

    @Transactional(readOnly = true)
    public CopilotAskResponse askQuestion(User user, CopilotAskRequest request) {
        String question = request.question() != null ? request.question().trim() : "";
        if (question.isEmpty()) {
            throw new IllegalArgumentException("Question cannot be empty");
        }

        // 1. Gather target meetings
        List<Meeting> targetMeetings = new ArrayList<>();
        if (request.meetingId() != null) {
            Meeting single = meetingRepository.findByIdAndDeletedAtIsNull(request.meetingId())
                    .orElseThrow(() -> new IllegalArgumentException("Meeting not found: " + request.meetingId()));
            if (!single.getUser().getId().equals(user.getId())) {
                throw new AccessDeniedException("You do not have access to this meeting");
            }
            targetMeetings.add(single);
        } else {
            targetMeetings.addAll(
                    meetingRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(
                            user.getId(),
                            PageRequest.of(0, 25)
                    ).getContent()
            );
        }

        if (targetMeetings.isEmpty()) {
            return new CopilotAskResponse(
                    "You don't have any recorded meetings in your account yet. Start capturing a meeting using the Vinxa Chrome Extension or create a session on the Overview page, and I'll be able to answer any questions across your transcripts, decisions, and action items.",
                    "HIGH",
                    0,
                    0,
                    List.of(),
                    List.of(
                            "How do I start recording a Google Meet call?",
                            "What types of action items does Vinxa extract?",
                            "How does speaker diarization work?"
                    )
            );
        }

        // 2. Assemble structured knowledge base context from Neon PostgreSQL
        StringBuilder knowledgeContext = new StringBuilder();
        int totalSegmentsCount = 0;
        List<CopilotAskResponse.CitationDto> candidateCitations = new ArrayList<>();
        List<ActionItem> allActions = new ArrayList<>();
        Map<UUID, MeetingSummary> summaryByMeeting = new HashMap<>();

        for (Meeting m : targetMeetings) {
            UUID mId = m.getId();
            String mDate = m.getCreatedAt() != null ? m.getCreatedAt().toString() : "";

            knowledgeContext.append("\n========================================\n");
            knowledgeContext.append("MEETING_ID: ").append(mId).append("\n");
            knowledgeContext.append("MEETING_TITLE: ").append(m.getTitle()).append("\n");
            knowledgeContext.append("PLATFORM: ").append(m.getPlatform()).append("\n");
            knowledgeContext.append("DATE: ").append(mDate).append("\n");
            knowledgeContext.append("STATUS: ").append(m.getStatus()).append("\n");

            // Summary
            MeetingSummary summary = meetingSummaryRepository.findByMeetingId(mId).orElse(null);
            if (summary != null && summary.getSummary() != null) {
                summaryByMeeting.put(mId, summary);
                knowledgeContext.append("AI_SUMMARY_AND_DECISIONS_JSON: ").append(summary.getSummary()).append("\n");
            }

            // Action items
            List<ActionItem> actions = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(mId);
            if (!actions.isEmpty()) {
                allActions.addAll(actions);
                knowledgeContext.append("ACTION_ITEMS:\n");
                for (ActionItem ai : actions) {
                    knowledgeContext.append("  - [Task: ").append(ai.getTitle())
                            .append(" | Assignee: ").append(ai.getAssignee() != null ? ai.getAssignee() : "Unassigned")
                            .append(" | Priority: ").append(ai.getPriority())
                            .append(" | Status: ").append(ai.getStatus())
                            .append(" | Deadline: ").append(ai.getDeadline() != null ? ai.getDeadline() : "None")
                            .append("]\n");
                }
            }

            // Transcript segments
            List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(mId);
            totalSegmentsCount += segments.size();
            if (!segments.isEmpty()) {
                knowledgeContext.append("TRANSCRIPT_SEGMENTS:\n");
                for (TranscriptSegment seg : segments) {
                    String speaker = seg.getParticipant() != null ? seg.getParticipant().getDisplayName() : "Speaker";
                    knowledgeContext.append("  [SEGMENT_ID: ").append(seg.getId()).append("] ")
                            .append(speaker).append(": \"").append(seg.getContent()).append("\"\n");

                    candidateCitations.add(new CopilotAskResponse.CitationDto(
                            mId,
                            m.getTitle(),
                            mDate,
                            seg.getId(),
                            speaker,
                            seg.getContent()
                    ));
                }
            } else {
                knowledgeContext.append("TRANSCRIPT_SEGMENTS: (No raw transcript segments saved; refer to AI_SUMMARY_AND_DECISIONS_JSON above)\n");
            }
        }

        // 3. Build conversation history string
        StringBuilder historyText = new StringBuilder();
        if (request.history() != null && !request.history().isEmpty()) {
            int start = Math.max(0, request.history().size() - 6);
            for (int i = start; i < request.history().size(); i++) {
                CopilotAskRequest.ChatTurn turn = request.history().get(i);
                historyText.append(turn.role().toUpperCase()).append(": ").append(turn.content()).append("\n");
            }
        }

        // 4. Call Google Gemini AI with fallback chain
        if (!geminiApiKey.isEmpty()) {
            List<String> candidateModels = new ArrayList<>();
            candidateModels.add(geminiModel);
            if (!geminiModel.equals("gemini-flash-lite-latest")) candidateModels.add("gemini-flash-lite-latest");
            if (!geminiModel.equals("gemini-3.5-flash-lite")) candidateModels.add("gemini-3.5-flash-lite");

            for (String modelToTry : candidateModels) {
                try {
                    log.info("Asking Vinxa AI Copilot ({}) across {} meetings ({} segments): '{}'",
                            modelToTry, targetMeetings.size(), totalSegmentsCount, question);
                    CopilotAskResponse aiResp = callGeminiCopilot(
                            question,
                            knowledgeContext.toString(),
                            historyText.toString(),
                            targetMeetings.size(),
                            totalSegmentsCount,
                            modelToTry
                    );
                    if (aiResp != null && aiResp.answer() != null && !aiResp.answer().isBlank()) {
                        return aiResp;
                    }
                } catch (Exception ex) {
                    log.warn("Gemini Copilot model {} error ({}). Trying next candidate or local search synthesis.", modelToTry, ex.getMessage());
                }
            }
        }

        // 5. Resilient local database synthesis if Gemini is temporarily unavailable
        return synthesizeFromDatabase(
                question,
                targetMeetings,
                totalSegmentsCount,
                candidateCitations,
                allActions,
                summaryByMeeting
        );
    }

    private CopilotAskResponse callGeminiCopilot(
            String question,
            String knowledgeContext,
            String historyText,
            int meetingsCount,
            int segmentsCount,
            String modelName
    ) throws Exception {
        String prompt = """
                You are the Vinxa Live AI Meeting Copilot — an enterprise meeting intelligence assistant.
                The user is asking a question across their recorded meetings stored in Neon Cloud PostgreSQL.
                
                STRICT RULES:
                1. Base your answer STRICTLY on the provided MEETING KNOWLEDGE BASE below (transcripts, summaries, decisions, and action items).
                2. Mention specific meeting titles, speaker names, dates, decisions, and assignees when relevant.
                3. Format your `answer` cleanly using Markdown (bullet points, bold key terms) for readability.
                4. Provide verifiable `citations` referencing real `meetingId`, `meetingTitle`, `meetingDate`, `segmentId` (use null if citing summary-level data without a specific segment UUID), `speaker`, and `quote` from the knowledge base.
                5. Provide 3 relevant, smart `suggestedFollowUps` questions the user might want to ask next based on these meetings.
                6. Return valid JSON ONLY with keys:
                   - "answer" (string)
                   - "confidence" ("HIGH" | "MEDIUM" | "LOW")
                   - "citations" (array of { "meetingId": UUID, "meetingTitle": string, "meetingDate": string, "segmentId": UUID or null, "speaker": string, "quote": string })
                   - "suggestedFollowUps" (array of 3 strings)
                
                CONVERSATION HISTORY:
                %s
                
                MEETING KNOWLEDGE BASE (%d meetings, %d transcript segments):
                %s
                
                USER QUESTION:
                %s
                """.formatted(
                historyText.isEmpty() ? "(None)" : historyText,
                meetingsCount,
                segmentsCount,
                knowledgeContext,
                question
        );

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

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

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

            JsonNode parsed = objectMapper.readTree(rawJson);
            String answer = parsed.path("answer").asText("");
            String confidence = parsed.path("confidence").asText("HIGH").toUpperCase();

            List<CopilotAskResponse.CitationDto> citations = new ArrayList<>();
            JsonNode citationsNode = parsed.path("citations");
            if (citationsNode.isArray()) {
                for (JsonNode c : citationsNode) {
                    try {
                        UUID mId = c.hasNonNull("meetingId") && !c.path("meetingId").asText().isBlank()
                                ? UUID.fromString(c.path("meetingId").asText())
                                : null;
                        UUID sId = c.hasNonNull("segmentId") && !c.path("segmentId").asText().isBlank()
                                ? UUID.fromString(c.path("segmentId").asText())
                                : null;
                        if (mId != null) {
                            citations.add(new CopilotAskResponse.CitationDto(
                                    mId,
                                    c.path("meetingTitle").asText("Meeting Session"),
                                    c.path("meetingDate").asText(""),
                                    sId,
                                    c.path("speaker").asText("Speaker"),
                                    c.path("quote").asText("")
                            ));
                        }
                    } catch (Exception ignored) {
                    }
                }
            }

            List<String> followUps = new ArrayList<>();
            JsonNode followUpsNode = parsed.path("suggestedFollowUps");
            if (followUpsNode.isArray()) {
                for (JsonNode f : followUpsNode) {
                    String fText = f.asText("").trim();
                    if (!fText.isEmpty()) followUps.add(fText);
                }
            }
            if (followUps.isEmpty()) {
                followUps = List.of(
                        "What are the highest priority action items from these meetings?",
                        "What key decisions were confirmed?",
                        "Are there any open questions that still need follow-up?"
                );
            }

            return new CopilotAskResponse(
                    answer,
                    confidence,
                    meetingsCount,
                    segmentsCount,
                    citations,
                    followUps
            );
        } else {
            throw new RuntimeException("Gemini API status " + response.statusCode());
        }
    }

    private CopilotAskResponse synthesizeFromDatabase(
            String question,
            List<Meeting> meetings,
            int totalSegmentsCount,
            List<CopilotAskResponse.CitationDto> allCitations,
            List<ActionItem> allActions,
            Map<UUID, MeetingSummary> summaryByMeeting
    ) {
        String qLower = question.toLowerCase();
        StringBuilder answer = new StringBuilder();
        List<CopilotAskResponse.CitationDto> matchedCitations = new ArrayList<>();

        // Filter citations matching keywords in question
        String[] keywords = qLower.replaceAll("[^a-z0-9\\s]", "").split("\\s+");
        for (CopilotAskResponse.CitationDto c : allCitations) {
            String quoteLower = c.quote().toLowerCase();
            for (String kw : keywords) {
                if (kw.length() > 3 && quoteLower.contains(kw)) {
                    matchedCitations.add(c);
                    break;
                }
            }
            if (matchedCitations.size() >= 4) break;
        }
        if (matchedCitations.isEmpty() && !allCitations.isEmpty()) {
            matchedCitations.addAll(allCitations.subList(0, Math.min(3, allCitations.size())));
        }

        answer.append("Based on your **").append(meetings.size()).append(" recorded meeting(s)** in Neon PostgreSQL:\n\n");

        for (Meeting m : meetings) {
            answer.append("### 📌 ").append(m.getTitle()).append(" (").append(m.getPlatform()).append(")\n");
            MeetingSummary sum = summaryByMeeting.get(m.getId());
            if (sum != null && sum.getSummary() != null) {
                try {
                    JsonNode sumNode = objectMapper.readTree(sum.getSummary());
                    String overview = sumNode.path("overview").asText("");
                    if (!overview.isEmpty()) {
                        answer.append("- **Overview:** ").append(overview).append("\n");
                    }
                    JsonNode decisions = sumNode.path("decisions");
                    if (decisions.isArray() && !decisions.isEmpty()) {
                        for (JsonNode d : decisions) {
                            answer.append("- **Confirmed Decision:** ").append(d.path("decision").asText()).append("\n");
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        }

        if (!allActions.isEmpty()) {
            answer.append("\n### ✅ Extracted Action Items\n");
            for (ActionItem ai : allActions) {
                answer.append("- **").append(ai.getTitle()).append("** — Assigned to: `")
                        .append(ai.getAssignee() != null ? ai.getAssignee() : "Team")
                        .append("` (Priority: **").append(ai.getPriority()).append("**, Status: `").append(ai.getStatus()).append("`)\n");
            }
        }

        return new CopilotAskResponse(
                answer.toString(),
                "HIGH",
                meetings.size(),
                totalSegmentsCount,
                matchedCitations,
                List.of(
                        "What action items are still open?",
                        "What were the confirmed decisions and their reasons?",
                        "Summarize the key points from the latest meeting."
                )
        );
    }

    public List<String> translateTexts(List<String> texts, String targetLanguage) {
        if (texts == null || texts.isEmpty()) return List.of();
        if (targetLanguage == null || targetLanguage.isBlank() || "ORIGINAL".equalsIgnoreCase(targetLanguage)) {
            return texts;
        }

        if (!geminiApiKey.isEmpty()) {
            List<String> candidateModels = new ArrayList<>();
            candidateModels.add(geminiModel);
            if (!geminiModel.equals("gemini-flash-lite-latest")) candidateModels.add("gemini-flash-lite-latest");
            if (!geminiModel.equals("gemini-3.5-flash-lite")) candidateModels.add("gemini-3.5-flash-lite");

            for (String modelToTry : candidateModels) {
                try {
                    String prompt = """
                            Translate each string in the following JSON array into %s.
                            Preserve meaning, tone, and proper nouns.
                            Return ONLY a valid JSON object: { "translations": ["translated string 1", "translated string 2", ...] } with the exact same number of elements (%d).
                            
                            Input JSON array:
                            %s
                            """.formatted(
                            targetLanguage,
                            texts.size(),
                            objectMapper.writeValueAsString(texts)
                    );

                    Map<String, Object> requestBody = Map.of(
                            "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                            "generationConfig", Map.of(
                                    "response_mime_type", "application/json",
                                    "temperature", 0.1
                            )
                    );

                    String jsonPayload = objectMapper.writeValueAsString(requestBody);
                    String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + modelToTry + ":generateContent?key=" + geminiApiKey;

                    HttpRequest httpRequest = HttpRequest.newBuilder()
                            .uri(URI.create(endpoint))
                            .header("Content-Type", "application/json")
                            .timeout(Duration.ofSeconds(20))
                            .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                            .build();

                    HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
                    if (response.statusCode() >= 200 && response.statusCode() < 300) {
                        JsonNode root = objectMapper.readTree(response.body());
                        String rawJson = root.path("candidates").get(0).path("content").path("parts").get(0).path("text").asText("").trim();
                        if (rawJson.startsWith("```json")) rawJson = rawJson.substring(7);
                        else if (rawJson.startsWith("```")) rawJson = rawJson.substring(3);
                        if (rawJson.endsWith("```")) rawJson = rawJson.substring(0, rawJson.length() - 3);
                        JsonNode parsed = objectMapper.readTree(rawJson.trim());
                        JsonNode arr = parsed.isArray() ? parsed : parsed.path("translations");
                        if (arr.isArray() && !arr.isEmpty()) {
                            List<String> result = new ArrayList<>();
                            for (JsonNode n : arr) {
                                result.add(n.asText(""));
                            }
                            return result;
                        }
                    }
                } catch (Exception ex) {
                    log.warn("Gemini translation error ({}): {}", modelToTry, ex.getMessage());
                }
            }
        }
        return texts;
    }
}
