package com.vinxa.live.meeting;

import com.vinxa.live.auth.JwtTokenProvider;
import com.vinxa.live.consent.ConsentEventRepository;
import com.vinxa.live.meeting.dto.CreateMeetingRequest;
import com.vinxa.live.meeting.dto.MeetingResponse;
import com.vinxa.live.meeting.dto.UpdateMeetingRequest;
import com.vinxa.live.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MeetingServiceTest {

    @Mock
    private MeetingRepository meetingRepository;

    @Mock
    private ConsentEventRepository consentEventRepository;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    private MeetingService meetingService;

    private User user1;
    private User user2;

    @BeforeEach
    void setUp() {
        meetingService = new MeetingService(meetingRepository, consentEventRepository, jwtTokenProvider);
        user1 = new User(UUID.randomUUID(), "alice@example.com", "hash1", OffsetDateTime.now());
        user2 = new User(UUID.randomUUID(), "bob@example.com", "hash2", OffsetDateTime.now());
    }

    @Test
    void testCreateMeeting() {
        CreateMeetingRequest req = new CreateMeetingRequest("Team Sync", Platform.GOOGLE_MEET, "https://meet.google.com/xyz");
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(i -> i.getArgument(0));

        MeetingResponse res = meetingService.createMeeting(user1, req);
        assertNotNull(res);
        assertEquals("Team Sync", res.title());
        assertEquals(Platform.GOOGLE_MEET, res.platform());
        assertEquals(MeetingStatus.CREATED, res.status());
        assertEquals(user1.getId(), res.userId());
    }

    @Test
    void testOwnershipEnforcementDenied() {
        UUID meetingId = UUID.randomUUID();
        Meeting meeting = new Meeting(meetingId, user1, "Alice Meeting", Platform.GOOGLE_MEET, "https://meet.google.com/xyz");
        when(meetingRepository.findByIdAndDeletedAtIsNull(meetingId)).thenReturn(Optional.of(meeting));

        // User 2 attempts to access User 1's meeting
        assertThrows(AccessDeniedException.class, () -> meetingService.getMeeting(user2, meetingId));
    }

    @Test
    void testValidStateTransition() {
        UUID meetingId = UUID.randomUUID();
        Meeting meeting = new Meeting(meetingId, user1, "Recording Meeting", Platform.GOOGLE_MEET, "https://meet.google.com/xyz");
        meeting.setStatus(MeetingStatus.READY);
        when(meetingRepository.findByIdAndDeletedAtIsNull(meetingId)).thenReturn(Optional.of(meeting));
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(i -> i.getArgument(0));

        MeetingResponse res = meetingService.updateMeeting(user1, meetingId, new UpdateMeetingRequest(null, MeetingStatus.RECORDING));
        assertEquals(MeetingStatus.RECORDING, res.status());
        assertNotNull(res.startedAt());
    }

    @Test
    void testInvalidStateTransitionThrows() {
        UUID meetingId = UUID.randomUUID();
        Meeting meeting = new Meeting(meetingId, user1, "Created Meeting", Platform.GOOGLE_MEET, "https://meet.google.com/xyz");
        when(meetingRepository.findByIdAndDeletedAtIsNull(meetingId)).thenReturn(Optional.of(meeting));

        // Cannot jump directly from CREATED to COMPLETED
        assertThrows(IllegalStateException.class, () ->
                meetingService.updateMeeting(user1, meetingId, new UpdateMeetingRequest(null, MeetingStatus.COMPLETED))
        );
    }
}
