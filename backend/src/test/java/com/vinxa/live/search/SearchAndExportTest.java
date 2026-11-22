package com.vinxa.live.search;

import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.export.ExportController;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.meeting.Platform;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SearchAndExportTest {

    @Mock
    private MeetingService meetingService;

    @Mock
    private TranscriptSegmentRepository transcriptSegmentRepository;

    @Mock
    private MeetingSummaryRepository meetingSummaryRepository;

    @Mock
    private ActionItemRepository actionItemRepository;

    private ExportController exportController;
    private SearchController searchController;
    private User testUser;
    private Meeting testMeeting;

    @BeforeEach
    void setUp() {
        exportController = new ExportController(meetingService, transcriptSegmentRepository, meetingSummaryRepository, actionItemRepository);
        searchController = new SearchController(transcriptSegmentRepository);

        testUser = new User(UUID.randomUUID(), "test@vinxa.live", "pass", OffsetDateTime.now());
        testMeeting = new Meeting(UUID.randomUUID(), testUser, "Quarterly Strategy", Platform.GOOGLE_MEET, "https://meet.google.com/xyz");

        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(testUser, null, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    void testExportMarkdownGeneration() {
        when(meetingService.getMeetingAndVerifyOwnership(eq(testUser), eq(testMeeting.getId()))).thenReturn(testMeeting);
        when(transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(testMeeting.getId()))
                .thenReturn(List.of(new TranscriptSegment(UUID.randomUUID(), testMeeting, null, "seg-1", "We decided on the roadmap.", 1000L, 3000L, 0.95f, true)));
        when(meetingSummaryRepository.findByMeetingId(testMeeting.getId()))
                .thenReturn(Optional.of(new MeetingSummary(UUID.randomUUID(), testMeeting, "All items agreed.")));
        when(actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(testMeeting.getId()))
                .thenReturn(List.of(new ActionItem(UUID.randomUUID(), testMeeting, "Prepare launch slides", "David", null, "HIGH", "seg-1")));

        ResponseEntity<String> response = exportController.exportMeeting(testMeeting.getId(), "md");

        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("# Quarterly Strategy"));
        assertTrue(response.getBody().contains("## Executive Summary"));
        assertTrue(response.getBody().contains("Prepare launch slides"));
        assertTrue(response.getBody().contains("We decided on the roadmap."));
    }

    @Test
    void testSearchReturnsMatches() {
        TranscriptSegment seg = new TranscriptSegment(UUID.randomUUID(), testMeeting, null, "seg-1", "Authentication roadmap approved", 1000L, 3000L, 0.95f, true);
        when(transcriptSegmentRepository.searchByUserAndContent(eq(testUser.getId()), eq("roadmap")))
                .thenReturn(List.of(seg));

        ResponseEntity<List<SearchController.SearchResultDto>> response = searchController.search("roadmap", null);

        assertNotNull(response.getBody());
        assertEquals(1, response.getBody().size());
        assertEquals("Authentication roadmap approved", response.getBody().get(0).content());
    }
}
