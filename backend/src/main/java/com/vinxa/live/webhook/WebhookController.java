package com.vinxa.live.webhook;

import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.common.SecurityUtils;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import com.vinxa.live.user.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class WebhookController {

    private final WebhookDispatcherService webhookDispatcherService;
    private final MeetingService meetingService;
    private final ActionItemRepository actionItemRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final UserRepository userRepository;

    public WebhookController(
            WebhookDispatcherService webhookDispatcherService,
            MeetingService meetingService,
            ActionItemRepository actionItemRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            UserRepository userRepository
    ) {
        this.webhookDispatcherService = webhookDispatcherService;
        this.meetingService = meetingService;
        this.actionItemRepository = actionItemRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.userRepository = userRepository;
    }

    @GetMapping("/webhooks/config")
    public ResponseEntity<Map<String, Object>> getWebhookConfig() {
        User currentUser = SecurityUtils.getCurrentUser();
        User fresh = userRepository.findById(currentUser.getId()).orElse(currentUser);
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("webhookUrl", fresh.getWebhookUrl() != null ? fresh.getWebhookUrl() : "");
        res.put("webhookSecret", fresh.getWebhookSecret() != null ? fresh.getWebhookSecret() : "");
        res.put("webhookAutoPush", fresh.getWebhookAutoPush());
        res.put("recentLoopbackDeliveries", webhookDispatcherService.getLoopbackReceivedPayloads());
        return ResponseEntity.ok(res);
    }

    @PutMapping("/webhooks/config")
    public ResponseEntity<Map<String, Object>> updateWebhookConfig(@RequestBody Map<String, Object> body) {
        User currentUser = SecurityUtils.getCurrentUser();
        User fresh = userRepository.findById(currentUser.getId()).orElse(currentUser);

        if (body.containsKey("webhookUrl")) {
            String url = body.get("webhookUrl") != null ? String.valueOf(body.get("webhookUrl")).trim() : "";
            fresh.setWebhookUrl(url);
        }
        if (body.containsKey("webhookSecret")) {
            String secret = body.get("webhookSecret") != null ? String.valueOf(body.get("webhookSecret")).trim() : "";
            fresh.setWebhookSecret(secret);
        }
        if (body.containsKey("webhookAutoPush")) {
            Boolean auto = Boolean.valueOf(String.valueOf(body.get("webhookAutoPush")));
            fresh.setWebhookAutoPush(auto);
        }
        userRepository.save(fresh);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("webhookUrl", fresh.getWebhookUrl() != null ? fresh.getWebhookUrl() : "");
        res.put("webhookSecret", fresh.getWebhookSecret() != null ? fresh.getWebhookSecret() : "");
        res.put("webhookAutoPush", fresh.getWebhookAutoPush());
        return ResponseEntity.ok(res);
    }

    @PostMapping("/webhooks/test")
    public ResponseEntity<WebhookDispatcherService.WebhookDispatchResult> sendTestWebhook(
            @RequestBody(required = false) Map<String, Object> body
    ) {
        User currentUser = SecurityUtils.getCurrentUser();
        User fresh = userRepository.findById(currentUser.getId()).orElse(currentUser);

        String targetUrl = (body != null && body.get("webhookUrl") != null && !String.valueOf(body.get("webhookUrl")).isBlank())
                ? String.valueOf(body.get("webhookUrl")).trim()
                : fresh.getWebhookUrl();
        String secret = (body != null && body.get("webhookSecret") != null && !String.valueOf(body.get("webhookSecret")).isBlank())
                ? String.valueOf(body.get("webhookSecret")).trim()
                : fresh.getWebhookSecret();

        Map<String, Object> samplePayload = new LinkedHashMap<>();
        samplePayload.put("event", "action_item.created");
        samplePayload.put("meetingId", "aqw-zfux-irm");
        samplePayload.put("meetingTitle", "Odd Project Product Conversion");
        samplePayload.put("task", "Finalize Q4 roadmap and deploy migration PR");
        samplePayload.put("assignee", "Akash Yadav");
        samplePayload.put("priority", "HIGH");
        samplePayload.put("deadline", LocalDate.now().plusDays(7).toString());
        samplePayload.put("source", "Vinxa AI Meeting Assistant");
        samplePayload.put("transcriptContext", "Speaker 1: Akash, make sure the migration PR is deployed by end of November.");
        samplePayload.put("dispatchedAt", OffsetDateTime.now().toString());

        WebhookDispatcherService.WebhookDispatchResult result = webhookDispatcherService.dispatchPayload(targetUrl, secret, samplePayload);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/meetings/{id}/actions/{actionId}/webhook")
    public ResponseEntity<WebhookDispatcherService.WebhookDispatchResult> pushSingleActionItemToWebhook(
            @PathVariable("id") UUID meetingId,
            @PathVariable("actionId") UUID actionId,
            @RequestBody(required = false) Map<String, String> body
    ) {
        User currentUser = SecurityUtils.getCurrentUser();
        User freshUser = userRepository.findById(currentUser.getId()).orElse(currentUser);
        Meeting meeting = meetingService.getMeetingAndVerifyOwnership(freshUser, meetingId);

        String overrideUrl = body != null ? body.get("webhookUrl") : null;
        String overrideSecret = body != null ? body.get("webhookSecret") : null;
        WebhookDispatcherService.WebhookDispatchResult result =
                webhookDispatcherService.dispatchActionItem(freshUser, meeting, actionId, overrideUrl, overrideSecret);

        return ResponseEntity.ok(result);
    }

    @PostMapping("/meetings/{id}/actions/webhook-all")
    public ResponseEntity<Map<String, Object>> pushAllMeetingActionsToWebhook(
            @PathVariable("id") UUID meetingId,
            @RequestBody(required = false) Map<String, String> body
    ) {
        User currentUser = SecurityUtils.getCurrentUser();
        User freshUser = userRepository.findById(currentUser.getId()).orElse(currentUser);
        Meeting meeting = meetingService.getMeetingAndVerifyOwnership(freshUser, meetingId);

        String targetUrl = (body != null && body.get("webhookUrl") != null && !body.get("webhookUrl").isBlank())
                ? body.get("webhookUrl").trim()
                : freshUser.getWebhookUrl();
        String secret = (body != null && body.get("webhookSecret") != null && !body.get("webhookSecret").isBlank())
                ? body.get("webhookSecret").trim()
                : freshUser.getWebhookSecret();

        List<ActionItem> items = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);

        List<WebhookDispatcherService.WebhookDispatchResult> results = new ArrayList<>();
        for (ActionItem item : items) {
            Map<String, Object> payload = webhookDispatcherService.buildActionItemPayload("action_item.created", meeting, item, segments);
            results.add(webhookDispatcherService.dispatchPayload(targetUrl, secret, payload));
        }

        long succeeded = results.stream().filter(WebhookDispatcherService.WebhookDispatchResult::success).count();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("total", results.size());
        response.put("succeeded", succeeded);
        response.put("results", results);
        return ResponseEntity.ok(response);
    }

    /**
     * Built-in loopback receiver endpoint so users can test end-to-end webhook payloads immediately
     * using http://localhost:8080/api/v1/webhooks/test-receiver before connecting Jira or Azure DevOps.
     */
    @PostMapping("/webhooks/test-receiver")
    public ResponseEntity<Map<String, Object>> receiveLoopbackWebhook(@RequestBody Map<String, Object> payload) {
        webhookDispatcherService.recordLoopbackPayload(payload);
        Map<String, Object> ack = new LinkedHashMap<>();
        ack.put("status", "received");
        ack.put("receiver", "Vinxa DevOps/Jira Webhook Test Receiver");
        ack.put("event", payload.get("event"));
        ack.put("task", payload.get("task"));
        return ResponseEntity.ok(ack);
    }
}
