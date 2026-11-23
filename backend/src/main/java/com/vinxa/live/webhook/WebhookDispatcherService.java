package com.vinxa.live.webhook;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import com.vinxa.live.user.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class WebhookDispatcherService {

    private static final Logger log = LoggerFactory.getLogger(WebhookDispatcherService.class);

    private final ActionItemRepository actionItemRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    // In-memory loopback log for instant testing & verification
    private final List<Map<String, Object>> loopbackReceivedPayloads = new CopyOnWriteArrayList<>();

    public WebhookDispatcherService(
            ActionItemRepository actionItemRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            UserRepository userRepository
    ) {
        this.actionItemRepository = actionItemRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.userRepository = userRepository;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    public Map<String, Object> buildActionItemPayload(
            String eventType,
            Meeting meeting,
            ActionItem actionItem,
            List<TranscriptSegment> allSegments
    ) {
        String code = MeetingService.extractMeetingCode(
                meeting.getTitle(),
                meeting.getMeetingUrl(),
                meeting.getId()
        );

        String transcriptContext = resolveTranscriptContext(actionItem, allSegments);
        String deadlineStr = actionItem.getDeadline() != null
                ? actionItem.getDeadline().toLocalDate().toString()
                : LocalDate.now().plusDays(7).toString();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", eventType != null ? eventType : "action_item.created");
        payload.put("meetingId", code);
        payload.put("meetingUuid", meeting.getId().toString());
        payload.put("meetingTitle", meeting.getTitle());
        payload.put("task", actionItem.getTitle());
        payload.put("assignee", actionItem.getAssignee() != null && !actionItem.getAssignee().isBlank()
                ? actionItem.getAssignee()
                : "Unassigned");
        payload.put("priority", actionItem.getPriority() != null ? actionItem.getPriority().toUpperCase() : "MEDIUM");
        payload.put("deadline", deadlineStr);
        payload.put("status", actionItem.getStatus() != null ? actionItem.getStatus() : "OPEN");
        payload.put("source", "Vinxa AI Meeting Assistant");
        payload.put("transcriptContext", transcriptContext);
        payload.put("dispatchedAt", OffsetDateTime.now().toString());
        return payload;
    }

    private String resolveTranscriptContext(ActionItem item, List<TranscriptSegment> segments) {
        if (segments == null || segments.isEmpty()) {
            return "Extracted from meeting discussion: " + item.getTitle();
        }

        String rawEvidence = item.getEvidenceSegmentIds();
        if (rawEvidence != null && !rawEvidence.isBlank()) {
            List<String> matchedQuotes = new ArrayList<>();
            for (String token : rawEvidence.replace("[", "").replace("]", "").split(",")) {
                String cleanId = token.replace("\"", "").replace("'", "").trim();
                if (cleanId.isEmpty()) continue;
                for (TranscriptSegment seg : segments) {
                    if (seg.getId().toString().equalsIgnoreCase(cleanId)) {
                        String speaker = seg.getParticipant() != null
                                ? seg.getParticipant().getDisplayName()
                                : "Speaker 1";
                        matchedQuotes.add(speaker + ": " + seg.getContent());
                    }
                }
            }
            if (!matchedQuotes.isEmpty()) {
                return String.join(" | ", matchedQuotes);
            }
        }

        // Fallback to first substantive transcript segment
        TranscriptSegment first = segments.get(0);
        String speaker = first.getParticipant() != null ? first.getParticipant().getDisplayName() : "Speaker 1";
        return speaker + ": " + first.getContent();
    }

    public WebhookDispatchResult dispatchPayload(String targetWebhookUrl, String webhookSecret, Map<String, Object> payload) {
        if (targetWebhookUrl == null || targetWebhookUrl.isBlank()) {
            throw new IllegalArgumentException("Webhook URL is required. Configure your Webhook URL in Settings first.");
        }

        String trimmedUrl = targetWebhookUrl.trim();
        try {
            String jsonBody = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);

            // If user points to the local loopback test receiver, handle directly or via HTTP
            if (trimmedUrl.contains("/api/v1/webhooks/test-receiver")) {
                recordLoopbackPayload(payload);
                return new WebhookDispatchResult(
                        true,
                        200,
                        "200 OK (Vinxa Loopback Receiver)",
                        trimmedUrl,
                        payload
                );
            }

            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(trimmedUrl))
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "Vinxa-AI-Webhook-Dispatcher/1.0")
                    .header("X-Vinxa-Event", String.valueOf(payload.getOrDefault("event", "action_item.created")))
                    .timeout(Duration.ofSeconds(12))
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody));

            if (webhookSecret != null && !webhookSecret.isBlank()) {
                reqBuilder.header("X-Automation-Webhook-Token", webhookSecret.trim());
            }

            HttpRequest request = reqBuilder.build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            boolean ok = status >= 200 && status < 300;
            String respSnippet = response.body() != null && response.body().length() > 300
                    ? response.body().substring(0, 300) + "..."
                    : response.body();

            log.info("Dispatched webhook to {} -> HTTP {}", trimmedUrl, status);

            return new WebhookDispatchResult(
                    ok,
                    status,
                    respSnippet != null && !respSnippet.isBlank() ? respSnippet : ("HTTP " + status),
                    trimmedUrl,
                    payload
            );
        } catch (Exception e) {
            log.warn("Webhook dispatch to {} failed: {}", trimmedUrl, e.getMessage());
            return new WebhookDispatchResult(
                    false,
                    502,
                    "Failed to reach webhook endpoint: " + e.getMessage(),
                    trimmedUrl,
                    payload
            );
        }
    }

    public WebhookDispatchResult dispatchActionItem(
            User user,
            Meeting meeting,
            UUID actionItemId,
            String overrideWebhookUrl,
            String overrideSecret
    ) {
        ActionItem actionItem = actionItemRepository.findById(actionItemId)
                .orElseThrow(() -> new IllegalArgumentException("Action item not found: " + actionItemId));

        if (!actionItem.getMeeting().getId().equals(meeting.getId())) {
            throw new IllegalArgumentException("Action item does not belong to meeting " + meeting.getId());
        }

        String targetUrl = (overrideWebhookUrl != null && !overrideWebhookUrl.isBlank())
                ? overrideWebhookUrl.trim()
                : user.getWebhookUrl();
        String secret = (overrideSecret != null && !overrideSecret.isBlank())
                ? overrideSecret.trim()
                : user.getWebhookSecret();

        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meeting.getId());
        Map<String, Object> payload = buildActionItemPayload("action_item.created", meeting, actionItem, segments);
        return dispatchPayload(targetUrl, secret, payload);
    }

    public void autoDispatchMeetingActionItemsIfEnabled(Meeting meeting, List<ActionItem> items, List<TranscriptSegment> segments) {
        try {
            User owner = meeting.getUser();
            if (owner == null) return;
            User freshUser = userRepository.findById(owner.getId()).orElse(owner);
            if (!Boolean.TRUE.equals(freshUser.getWebhookAutoPush())) {
                return;
            }
            String url = freshUser.getWebhookUrl();
            if (url == null || url.isBlank()) {
                return;
            }
            for (ActionItem item : items) {
                Map<String, Object> payload = buildActionItemPayload("action_item.created", meeting, item, segments);
                dispatchPayload(url, freshUser.getWebhookSecret(), payload);
            }
        } catch (Exception e) {
            log.warn("Auto webhook dispatch failed for meeting {}: {}", meeting.getId(), e.getMessage());
        }
    }

    public void recordLoopbackPayload(Map<String, Object> payload) {
        Map<String, Object> entry = new LinkedHashMap<>(payload);
        entry.put("_receivedAt", OffsetDateTime.now().toString());
        loopbackReceivedPayloads.add(0, entry);
        while (loopbackReceivedPayloads.size() > 25) {
            loopbackReceivedPayloads.remove(loopbackReceivedPayloads.size() - 1);
        }
    }

    public List<Map<String, Object>> getLoopbackReceivedPayloads() {
        return List.copyOf(loopbackReceivedPayloads);
    }

    public record WebhookDispatchResult(
            boolean success,
            int statusCode,
            String responseMessage,
            String webhookUrl,
            Map<String, Object> payloadSent
    ) {}
}
