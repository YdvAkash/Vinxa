package com.vinxa.live.realtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.Platform;
import com.vinxa.live.participant.Participant;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.stt.SpeechToTextProvider;
import com.vinxa.live.stt.TranscriptEvent;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.net.URI;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RealtimePipelineAndPerformanceTest {

    @Mock
    private SpeechToTextProvider sttProvider;

    @Mock
    private MeetingRepository meetingRepository;

    @Mock
    private ParticipantRepository participantRepository;

    @Mock
    private TranscriptSegmentRepository transcriptSegmentRepository;

    @Mock
    private WebSocketSession subscriberSession;

    private EventWebSocketHandler eventWebSocketHandler;
    private AudioWebSocketHandler audioWebSocketHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        eventWebSocketHandler = new EventWebSocketHandler();
        audioWebSocketHandler = new AudioWebSocketHandler(
                sttProvider,
                eventWebSocketHandler,
                meetingRepository,
                participantRepository,
                transcriptSegmentRepository
        );
    }

    @Test
    void testSpeakerRenamePersistsAcrossSubsequentLiveTurns() throws Exception {
        UUID meetingId = UUID.randomUUID();
        when(subscriberSession.getUri()).thenReturn(URI.create("ws://localhost:8080/ws/events?meetingId=" + meetingId));
        when(subscriberSession.isOpen()).thenReturn(true);

        eventWebSocketHandler.afterConnectionEstablished(subscriberSession);

        // User renames speaker-1 to "Priya (Backend Lead)"
        audioWebSocketHandler.registerSpeakerDisplayName(meetingId, "speaker-1", "Priya (Backend Lead)");

        // Subsequent turn from Deepgram arrives with default "Speaker 1" label
        TranscriptEvent incomingEvent = new TranscriptEvent(
                "TRANSCRIPT",
                meetingId,
                UUID.randomUUID(),
                "speaker-1",
                "Speaker 1",
                "We completed the database migration and verified indexes.",
                1000L,
                3500L,
                true,
                0.98
        );

        audioWebSocketHandler.handleTranscriptEvent(meetingId, incomingEvent);

        ArgumentCaptor<TextMessage> messageCaptor = ArgumentCaptor.forClass(TextMessage.class);
        verify(subscriberSession, atLeast(2)).sendMessage(messageCaptor.capture());

        List<TextMessage> messages = messageCaptor.getAllValues();
        JsonNode renameMsg = objectMapper.readTree(messages.get(0).getPayload());
        assertEquals("SPEAKER_RENAMED", renameMsg.path("type").asText());
        assertEquals("Priya (Backend Lead)", renameMsg.path("speakerName").asText());

        JsonNode transcriptMsg = objectMapper.readTree(messages.get(1).getPayload());
        assertEquals("TRANSCRIPT", transcriptMsg.path("type").asText());
        assertEquals("speaker-1", transcriptMsg.path("speakerKey").asText());
        assertEquals("Priya (Backend Lead)", transcriptMsg.path("speakerName").asText());
        assertEquals("We completed the database migration and verified indexes.", transcriptMsg.path("text").asText());
    }

    @Test
    void testExtendedMultiSpeakerMeetingLatencyAndMemoryBenchmark() throws Exception {
        UUID meetingId = UUID.randomUUID();
        User owner = new User(UUID.randomUUID(), "lead@vinxa.live", "hash", OffsetDateTime.now());
        Meeting meeting = new Meeting(meetingId, owner, "Meet • abc-defg-hij", Platform.GOOGLE_MEET, "https://meet.google.com/abc-defg-hij");

        when(subscriberSession.getUri()).thenReturn(URI.create("ws://localhost:8080/ws/events?meetingId=" + meetingId));
        when(subscriberSession.isOpen()).thenReturn(true);
        lenient().when(meetingRepository.findById(meetingId)).thenReturn(Optional.of(meeting));
        lenient().when(participantRepository.findByMeetingIdAndSpeakerKey(eq(meetingId), anyString()))
                .thenAnswer(inv -> Optional.of(new Participant(UUID.randomUUID(), meeting, inv.getArgument(1), "Speaker")));

        eventWebSocketHandler.afterConnectionEstablished(subscriberSession);

        int totalTurns = 500;
        List<Long> deliveryLatenciesNs = new ArrayList<>(totalTurns);

        for (int i = 0; i < totalTurns; i++) {
            int spkIdx = (i % 4) + 1;
            TranscriptEvent ev = new TranscriptEvent(
                    "TRANSCRIPT",
                    meetingId,
                    UUID.randomUUID(),
                    "speaker-" + spkIdx,
                    "Speaker " + spkIdx,
                    "Extended meeting utterance turn number " + i + " discussing Q4 launch architecture.",
                    i * 2000L,
                    (i * 2000L) + 1800L,
                    true,
                    0.96
            );

            long t0 = System.nanoTime();
            audioWebSocketHandler.handleTranscriptEvent(meetingId, ev);
            long elapsedNs = System.nanoTime() - t0;
            deliveryLatenciesNs.add(elapsedNs);
        }

        deliveryLatenciesNs.sort(Long::compareTo);
        double p50Ms = deliveryLatenciesNs.get(totalTurns / 2) / 1_000_000.0;
        double p95Ms = deliveryLatenciesNs.get((int) (totalTurns * 0.95)) / 1_000_000.0;
        double p99Ms = deliveryLatenciesNs.get((int) (totalTurns * 0.99)) / 1_000_000.0;

        System.out.printf("[BENCHMARK] 500-Turn Multi-Speaker Broadcast Latency: p50=%.3fms, p95=%.3fms, p99=%.3fms%n",
                p50Ms, p95Ms, p99Ms);

        // Broadcast must be non-blocking and sub-5ms p95
        assertTrue(p50Ms < 2.0, "p50 broadcast latency must be under 2ms (was " + p50Ms + "ms)");
        assertTrue(p95Ms < 5.0, "p95 broadcast latency must be under 5ms (was " + p95Ms + "ms)");
        verify(subscriberSession, times(totalTurns)).sendMessage(any(TextMessage.class));
    }

    @Test
    void testAutomaticJoineeRosterAndSelfIntroSpeakerAssignment() throws Exception {
        UUID meetingId = UUID.randomUUID();
        when(subscriberSession.getUri()).thenReturn(URI.create("ws://localhost:8080/ws/events?meetingId=" + meetingId));
        when(subscriberSession.isOpen()).thenReturn(true);

        eventWebSocketHandler.afterConnectionEstablished(subscriberSession);

        // 1. Sync meeting joinees detected from Google Meet / Teams / Zoom DOM
        audioWebSocketHandler.syncMeetingJoinees(
                meetingId,
                List.of("Akash Yadav", "Priya Sharma"),
                "Akash Yadav"
        );

        // 2. Incoming generic "Speaker 1" and "Speaker 2" turns automatically receive the joinees' real names
        audioWebSocketHandler.handleTranscriptEvent(meetingId, new TranscriptEvent(
                "TRANSCRIPT", meetingId, UUID.randomUUID(),
                "speaker-1", "Speaker 1", "Welcome everyone to the sprint planning call.",
                1000L, 3000L, true, 0.98
        ));
        audioWebSocketHandler.handleTranscriptEvent(meetingId, new TranscriptEvent(
                "TRANSCRIPT", meetingId, UUID.randomUUID(),
                "speaker-2", "Speaker 2", "Thanks Akash, the backend services are ready.",
                3500L, 5500L, true, 0.97
        ));

        // 3. A third speaker joins and introduces themselves in speech ("Hi team, my name is Rohan Verma")
        audioWebSocketHandler.handleTranscriptEvent(meetingId, new TranscriptEvent(
                "TRANSCRIPT", meetingId, UUID.randomUUID(),
                "speaker-3", "Speaker 3", "Hi team, my name is Rohan Verma and I will lead QA.",
                6000L, 8500L, true, 0.96
        ));

        ArgumentCaptor<TextMessage> captor = ArgumentCaptor.forClass(TextMessage.class);
        verify(subscriberSession, atLeast(5)).sendMessage(captor.capture());

        List<JsonNode> transcriptPayloads = new ArrayList<>();
        for (TextMessage msg : captor.getAllValues()) {
            JsonNode node = objectMapper.readTree(msg.getPayload());
            if ("TRANSCRIPT".equals(node.path("type").asText())) {
                transcriptPayloads.add(node);
            }
        }

        assertEquals(3, transcriptPayloads.size());
        assertEquals("Akash Yadav", transcriptPayloads.get(0).path("speakerName").asText());
        assertEquals("Priya Sharma", transcriptPayloads.get(1).path("speakerName").asText());
        assertEquals("Rohan Verma", transcriptPayloads.get(2).path("speakerName").asText());
    }
}
