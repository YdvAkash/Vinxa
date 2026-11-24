package com.vinxa.live;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.ai.dto.CopilotAskRequest;
import com.vinxa.live.ai.dto.CopilotAskResponse;
import com.vinxa.live.auth.dto.AuthResponse;
import com.vinxa.live.auth.dto.RegisterRequest;
import com.vinxa.live.meeting.Platform;
import com.vinxa.live.meeting.dto.ConsentEventRequest;
import com.vinxa.live.meeting.dto.CreateMeetingRequest;
import com.vinxa.live.meeting.dto.MeetingResponse;
import com.vinxa.live.meeting.dto.StreamTicketResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class FullStackEndToEndIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void testCompleteRealTimeMeetingLifecycleAndPerformance() throws Exception {
        String baseUrl = "http://localhost:" + port + "/api/v1";

        // 1. Register User
        String uniqueEmail = "e2e-" + UUID.randomUUID().toString().substring(0, 8) + "@vinxa.live";
        ResponseEntity<AuthResponse> regRes = restTemplate.postForEntity(
                baseUrl + "/auth/register",
                new RegisterRequest(uniqueEmail, "Password123!"),
                AuthResponse.class
        );
        assertEquals(HttpStatus.CREATED, regRes.getStatusCode());
        assertNotNull(regRes.getBody());
        String jwt = regRes.getBody().token();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(jwt);
        headers.setContentType(MediaType.APPLICATION_JSON);

        // 2. Create Meeting Session
        ResponseEntity<MeetingResponse> createRes = restTemplate.exchange(
                baseUrl + "/meetings",
                HttpMethod.POST,
                new HttpEntity<>(new CreateMeetingRequest("Google Meet", Platform.GOOGLE_MEET, "https://meet.google.com/kqx-vbnm-pqr"), headers),
                MeetingResponse.class
        );
        assertEquals(HttpStatus.CREATED, createRes.getStatusCode());
        MeetingResponse meeting = createRes.getBody();
        assertNotNull(meeting);
        UUID meetingId = meeting.id();
        assertEquals("Meet • kqx-vbnm-pqr", meeting.title());

        // 3. Record Participant Consent & Request Stream Ticket
        ResponseEntity<Void> consentRes = restTemplate.exchange(
                baseUrl + "/meetings/" + meetingId + "/consent",
                HttpMethod.POST,
                new HttpEntity<>(new ConsentEventRequest("CONSENT_GRANTED", "E2E Test", "Verified consent"), headers),
                Void.class
        );
        assertEquals(HttpStatus.CREATED, consentRes.getStatusCode());

        ResponseEntity<StreamTicketResponse> ticketRes = restTemplate.exchange(
                baseUrl + "/meetings/" + meetingId + "/stream-ticket",
                HttpMethod.POST,
                new HttpEntity<>(null, headers),
                StreamTicketResponse.class
        );
        assertEquals(HttpStatus.OK, ticketRes.getStatusCode());
        assertNotNull(ticketRes.getBody().ticket());

        // 4. Connect Dashboard Event WebSocket (/ws/events) and Extension Audio WebSocket (/ws/audio)
        StandardWebSocketClient wsClient = new StandardWebSocketClient();
        List<JsonNode> receivedWsEvents = new CopyOnWriteArrayList<>();
        CountDownLatch fourTurnsLatch = new CountDownLatch(4);

        WebSocketSession eventSession = wsClient.execute(
                new TextWebSocketHandler() {
                    @Override
                    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
                        JsonNode node = objectMapper.readTree(message.getPayload());
                        receivedWsEvents.add(node);
                        if ("TRANSCRIPT".equals(node.path("type").asText())) {
                            fourTurnsLatch.countDown();
                        }
                    }
                },
                new WebSocketHttpHeaders(),
                URI.create("ws://localhost:" + port + "/ws/events?meetingId=" + meetingId)
        ).get(5, TimeUnit.SECONDS);

        WebSocketSession audioSession = wsClient.execute(
                new TextWebSocketHandler(),
                new WebSocketHttpHeaders(),
                URI.create("ws://localhost:" + port + "/ws/audio?meetingId=" + meetingId + "&language=multi")
        ).get(5, TimeUnit.SECONDS);

        // Stream 4 x 32KB PCM16 audio frames to trigger 4 multi-speaker turns
        byte[] pcmChunk = new byte[32000];
        for (int i = 0; i < 4; i++) {
            audioSession.sendMessage(new BinaryMessage(pcmChunk));
        }

        assertTrue(fourTurnsLatch.await(5, TimeUnit.SECONDS), "Must receive all 4 real-time diarized turns over WebSocket");

        // 5. Rename Speaker-1 Live using Java 21 HttpClient (supports HTTP PATCH natively) and Verify Persistence + Broadcast
        java.net.http.HttpClient jdkHttpClient = java.net.http.HttpClient.newHttpClient();
        java.net.http.HttpRequest patchReq = java.net.http.HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/meetings/" + meetingId + "/speakers/speaker-1"))
                .header("Authorization", "Bearer " + jwt)
                .header("Content-Type", "application/json")
                .method("PATCH", java.net.http.HttpRequest.BodyPublishers.ofString("{\"displayName\":\"Akash (Lead Architect)\"}"))
                .build();
        java.net.http.HttpResponse<String> renameRes = jdkHttpClient.send(patchReq, java.net.http.HttpResponse.BodyHandlers.ofString());
        assertEquals(200, renameRes.statusCode());

        // Append an explicit decision & action item turn via REST to test end-to-end analysis & webhook
        restTemplate.exchange(
                baseUrl + "/meetings/" + meetingId + "/transcript",
                HttpMethod.POST,
                new HttpEntity<>(Map.of(
                        "speakerKey", "speaker-1",
                        "speakerName", "Akash (Lead Architect)",
                        "text", "We have officially decided to launch Vinxa 2.0 on 2026-12-15. Akash will prepare the production deployment checklist by 2026-12-10.",
                        "startMs", 15000,
                        "endMs", 19000
                ), headers),
                String.class
        );

        audioSession.close();
        eventSession.close();

        // 6. Stop Meeting & Wait for Async AI Analysis Completion
        ResponseEntity<MeetingResponse> stopRes = restTemplate.exchange(
                baseUrl + "/meetings/" + meetingId + "/stop",
                HttpMethod.POST,
                new HttpEntity<>(null, headers),
                MeetingResponse.class
        );
        assertEquals(HttpStatus.OK, stopRes.getStatusCode());

        MeetingResponse analyzedMeeting = null;
        for (int attempt = 0; attempt < 25; attempt++) {
            Thread.sleep(200);
            ResponseEntity<MeetingResponse> pollRes = restTemplate.exchange(
                    baseUrl + "/meetings/" + meetingId,
                    HttpMethod.GET,
                    new HttpEntity<>(null, headers),
                    MeetingResponse.class
            );
            if (pollRes.getBody() != null && "ANALYSIS_COMPLETED".equals(pollRes.getBody().status().name())) {
                analyzedMeeting = pollRes.getBody();
                break;
            }
        }
        assertNotNull(analyzedMeeting, "Meeting analysis must complete and transition to ANALYSIS_COMPLETED");
        assertTrue(analyzedMeeting.segmentCount() >= 5, "All 5 transcript segments must be persisted");
        assertTrue(analyzedMeeting.actionItemCount() >= 1, "Action items must be extracted and counted");
        assertTrue(analyzedMeeting.decisionCount() >= 1, "Confirmed decisions must be extracted and counted");

        // 7. Verify Batch Workspace Action Items Endpoint (/api/v1/meetings/actions/all)
        ResponseEntity<JsonNode> allActionsRes = restTemplate.exchange(
                baseUrl + "/meetings/actions/all",
                HttpMethod.GET,
                new HttpEntity<>(null, headers),
                JsonNode.class
        );
        assertEquals(HttpStatus.OK, allActionsRes.getStatusCode());
        assertTrue(allActionsRes.getBody().isArray() && !allActionsRes.getBody().isEmpty());

        // 8. Verify Security Ownership Enforcement on Search
        ResponseEntity<AuthResponse> otherUserRes = restTemplate.postForEntity(
                baseUrl + "/auth/register",
                new RegisterRequest("other-" + UUID.randomUUID().toString().substring(0, 8) + "@vinxa.live", "Password123!"),
                AuthResponse.class
        );
        HttpHeaders otherHeaders = new HttpHeaders();
        otherHeaders.setBearerAuth(otherUserRes.getBody().token());

        ResponseEntity<JsonNode> unauthorizedSearch = restTemplate.exchange(
                baseUrl + "/search?q=Vinxa&meetingId=" + meetingId,
                HttpMethod.GET,
                new HttpEntity<>(null, otherHeaders),
                JsonNode.class
        );
        assertEquals(HttpStatus.OK, unauthorizedSearch.getStatusCode());
        assertEquals(0, unauthorizedSearch.getBody().size(), "Other user must not be able to search private meeting transcripts by meetingId");

        // Owner search succeeds
        ResponseEntity<JsonNode> ownerSearch = restTemplate.exchange(
                baseUrl + "/search?q=Vinxa&meetingId=" + meetingId,
                HttpMethod.GET,
                new HttpEntity<>(null, headers),
                JsonNode.class
        );
        assertEquals(HttpStatus.OK, ownerSearch.getStatusCode());
        assertTrue(ownerSearch.getBody().size() >= 1, "Owner must find matching transcript segments");

        // 9. Verify Public Share Link Enable / Fetch / Disable
        ResponseEntity<MeetingResponse> shareRes = restTemplate.exchange(
                baseUrl + "/meetings/" + meetingId + "/share",
                HttpMethod.POST,
                new HttpEntity<>(null, headers),
                MeetingResponse.class
        );
        assertEquals(HttpStatus.OK, shareRes.getStatusCode());
        String shareToken = shareRes.getBody().shareToken();
        assertNotNull(shareToken);

        ResponseEntity<JsonNode> publicViewRes = restTemplate.getForEntity(
                baseUrl + "/public/share/" + shareToken,
                JsonNode.class
        );
        assertEquals(HttpStatus.OK, publicViewRes.getStatusCode());
        assertTrue(publicViewRes.getBody().path("transcript").size() >= 5);

        // 10. Verify AI Copilot Ask & Webhook Loopback Dispatch
        ResponseEntity<CopilotAskResponse> copilotRes = restTemplate.exchange(
                baseUrl + "/copilot/ask",
                HttpMethod.POST,
                new HttpEntity<>(new CopilotAskRequest("What decisions and action items were confirmed?", meetingId, List.of()), headers),
                CopilotAskResponse.class
        );
        assertEquals(HttpStatus.OK, copilotRes.getStatusCode());
        assertNotNull(copilotRes.getBody());
        assertFalse(copilotRes.getBody().answer().isBlank());

        ResponseEntity<JsonNode> webhookRes = restTemplate.exchange(
                baseUrl + "/meetings/" + meetingId + "/actions/webhook-all",
                HttpMethod.POST,
                new HttpEntity<>(Map.of("webhookUrl", baseUrl + "/webhooks/test-receiver"), headers),
                JsonNode.class
        );
        assertEquals(HttpStatus.OK, webhookRes.getStatusCode());
        assertTrue(webhookRes.getBody().path("succeeded").asInt() >= 1);
    }
}
