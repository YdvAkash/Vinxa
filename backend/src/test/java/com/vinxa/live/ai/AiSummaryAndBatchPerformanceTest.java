package com.vinxa.live.ai;

import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.ai.dto.AiSummaryResponse;
import com.vinxa.live.auth.JwtTokenProvider;
import com.vinxa.live.consent.ConsentEventRepository;
import com.vinxa.live.meeting.*;
import com.vinxa.live.meeting.dto.MeetingResponse;
import com.vinxa.live.participant.Participant;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.realtime.EventWebSocketHandler;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AiSummaryAndBatchPerformanceTest {

    @Mock
    private MeetingRepository meetingRepository;

    @Mock
    private ConsentEventRepository consentEventRepository;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Mock
    private ParticipantRepository participantRepository;

    @Mock
    private TranscriptSegmentRepository transcriptSegmentRepository;

    @Mock
    private ActionItemRepository actionItemRepository;

    @Mock
    private MeetingSummaryRepository meetingSummaryRepository;

    @Mock
    private EventWebSocketHandler eventWebSocketHandler;

    private AiSummaryService aiSummaryService;
    private MeetingService meetingService;
    private User user;

    @BeforeEach
    void setUp() {
        aiSummaryService = new AiSummaryService(
                meetingRepository,
                transcriptSegmentRepository,
                meetingSummaryRepository,
                actionItemRepository,
                null,
                eventWebSocketHandler,
                "", // Empty API key tests deterministic transcript-grounded analyzer
                "gemini-flash-lite-latest"
        );
        meetingService = new MeetingService(
                meetingRepository,
                consentEventRepository,
                jwtTokenProvider,
                aiSummaryService,
                participantRepository,
                transcriptSegmentRepository,
                actionItemRepository,
                meetingSummaryRepository
        );
        user = new User(UUID.randomUUID(), "eng@vinxa.live", "hash", OffsetDateTime.now());
    }

    @Test
    void testTranscriptGroundedAnalysisExtractsRealDecisionsActionsAndDeadlines() {
        UUID meetingId = UUID.randomUUID();
        Meeting meeting = new Meeting(meetingId, user, "Meet • xyz-abcd-efg", Platform.GOOGLE_MEET, "https://meet.google.com/xyz-abcd-efg");
        meeting.setStatus(MeetingStatus.COMPLETED);

        Participant p1 = new Participant(UUID.randomUUID(), meeting, "speaker-1", "Alex");
        Participant p2 = new Participant(UUID.randomUUID(), meeting, "speaker-2", "Priya");

        UUID seg1Id = UUID.randomUUID();
        UUID seg2Id = UUID.randomUUID();
        UUID seg3Id = UUID.randomUUID();

        List<TranscriptSegment> segments = List.of(
                new TranscriptSegment(seg1Id, meeting, p1, "1", "We have officially decided to ship the v2.4 release on PostgreSQL 18.", 1000L, 4000L, 0.98f, true),
                new TranscriptSegment(seg2Id, meeting, p2, "2", "Priya will deploy the Flyway V2 migration by 2026-12-01 as an urgent priority.", 4500L, 8000L, 0.97f, true),
                new TranscriptSegment(seg3Id, meeting, p1, "3", "What monitoring alerts should we configure for WebSocket latency?", 8500L, 11000L, 0.96f, true)
        );

        when(meetingRepository.findById(meetingId)).thenReturn(Optional.of(meeting));
        when(transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId)).thenReturn(segments);
        when(meetingSummaryRepository.findByMeetingId(meetingId)).thenReturn(Optional.empty());
        when(actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId)).thenReturn(List.of());
        when(actionItemRepository.save(any(ActionItem.class))).thenAnswer(i -> i.getArgument(0));

        aiSummaryService.generateMeetingAnalysisAsync(meetingId);

        ArgumentCaptor<ActionItem> actionCaptor = ArgumentCaptor.forClass(ActionItem.class);
        verify(actionItemRepository, atLeastOnce()).save(actionCaptor.capture());

        ActionItem savedAction = actionCaptor.getValue();
        assertTrue(savedAction.getTitle().startsWith("[TASK]"), "Action item must be formatted as a Jira task");
        assertTrue(savedAction.getTitle().contains("Flyway V2 migration"));
        assertEquals("Priya", savedAction.getAssignee());
        assertEquals("HIGH", savedAction.getPriority());
        assertNotNull(savedAction.getDeadline(), "Extracted ISO date 2026-12-01 must be parsed into a non-null deadline");
        assertEquals("2026-12-01", savedAction.getDeadline().toLocalDate().toString());
        assertEquals(seg2Id.toString(), savedAction.getEvidenceSegmentIds());

        AiSummaryResponse synth = aiSummaryService.synthesizeTranscriptGroundedAnalysis(meeting, segments);
        int wordCount = AiSummaryService.countWords(synth.overview());
        assertTrue(wordCount >= 100 && wordCount <= 1000,
                "Summary overview must be between 100 and 1000 words (was " + wordCount + " words)");

        assertEquals(MeetingStatus.ANALYSIS_COMPLETED, meeting.getStatus());
        assertFalse(MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle()), "Meeting title must be auto-upgraded from transcript");
    }

    @Test
    void testEmptyMeetingProducesHonestEmptyAnalysisWithoutFakePlaceholders() {
        UUID meetingId = UUID.randomUUID();
        Meeting meeting = new Meeting(meetingId, user, "Meet • emp-tyme-etg", Platform.GOOGLE_MEET, "https://meet.google.com/emp-tyme-etg");

        AiSummaryResponse res = aiSummaryService.synthesizeTranscriptGroundedAnalysis(meeting, List.of());

        assertTrue(res.decisions().isEmpty(), "Empty meeting must not invent fake decisions");
        assertTrue(res.actionItems().isEmpty(), "Empty meeting must not invent fake action items");
        assertTrue(res.keyPoints().isEmpty(), "Empty meeting must not invent fake key points");
    }

    @Test
    void testBatchEnrichedListMeetingsEliminatesNPlusOneQueries() {
        List<Meeting> twentyFiveMeetings = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            twentyFiveMeetings.add(new Meeting(UUID.randomUUID(), user, "Session " + i, Platform.GOOGLE_MEET, "https://meet.google.com/abc-defg-hij"));
        }

        PageRequest pageable = PageRequest.of(0, 25);
        when(meetingRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId(), pageable))
                .thenReturn(new PageImpl<>(twentyFiveMeetings, pageable, 25));

        when(participantRepository.countByMeetingIds(any())).thenReturn(List.<Object[]>of(
                new Object[]{twentyFiveMeetings.get(0).getId(), 3L}
        ));
        when(transcriptSegmentRepository.countByMeetingIds(any())).thenReturn(List.<Object[]>of(
                new Object[]{twentyFiveMeetings.get(0).getId(), 42L}
        ));
        when(actionItemRepository.countByMeetingIds(any())).thenReturn(List.<Object[]>of(
                new Object[]{twentyFiveMeetings.get(0).getId(), 5L}
        ));
        when(meetingSummaryRepository.findByMeetingIds(any())).thenReturn(List.of());

        long t0 = System.nanoTime();
        Page<MeetingResponse> result = meetingService.listMeetings(user, pageable);
        double elapsedMs = (System.nanoTime() - t0) / 1_000_000.0;

        assertEquals(25, result.getContent().size());
        assertEquals(3, result.getContent().get(0).participantCount());
        assertEquals(42, result.getContent().get(0).segmentCount());
        assertEquals(5, result.getContent().get(0).actionItemCount());

        // Verify batch queries were invoked ONCE each instead of 25 separate per-meeting queries
        verify(participantRepository, times(1)).countByMeetingIds(any());
        verify(transcriptSegmentRepository, times(1)).countByMeetingIds(any());
        verify(actionItemRepository, times(1)).countByMeetingIds(any());
        verify(meetingSummaryRepository, times(1)).findByMeetingIds(any());
        verify(transcriptSegmentRepository, never()).findByMeetingIdOrderByStartMsAsc(any());

        System.out.printf("[BENCHMARK] Batch listMeetings(25) executed in %.3fms with 5 queries (down from 101 N+1 queries)%n", elapsedMs);
    }
}
