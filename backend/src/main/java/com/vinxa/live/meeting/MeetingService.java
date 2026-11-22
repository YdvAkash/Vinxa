package com.vinxa.live.meeting;

import com.vinxa.live.auth.JwtTokenProvider;
import com.vinxa.live.consent.ConsentEvent;
import com.vinxa.live.consent.ConsentEventRepository;
import com.vinxa.live.meeting.dto.*;
import com.vinxa.live.user.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
@Transactional
public class MeetingService {

    private final MeetingRepository meetingRepository;
    private final ConsentEventRepository consentEventRepository;
    private final JwtTokenProvider jwtTokenProvider;

    public MeetingService(
            MeetingRepository meetingRepository,
            ConsentEventRepository consentEventRepository,
            JwtTokenProvider jwtTokenProvider
    ) {
        this.meetingRepository = meetingRepository;
        this.consentEventRepository = consentEventRepository;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    public MeetingResponse createMeeting(User user, CreateMeetingRequest request) {
        Meeting meeting = new Meeting(
                UUID.randomUUID(),
                user,
                request.title(),
                request.platform(),
                request.meetingUrl()
        );
        meeting = meetingRepository.save(meeting);
        return MeetingResponse.fromEntity(meeting);
    }

    @Transactional(readOnly = true)
    public Page<MeetingResponse> listMeetings(User user, Pageable pageable) {
        return meetingRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId(), pageable)
                .map(MeetingResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    public MeetingResponse getMeeting(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        return MeetingResponse.fromEntity(meeting);
    }

    public MeetingResponse updateMeeting(User user, UUID meetingId, UpdateMeetingRequest request) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);

        if (request.title() != null && !request.title().isBlank()) {
            meeting.setTitle(request.title());
        }
        if (request.status() != null) {
            meeting.updateStatus(request.status());
        }

        meeting = meetingRepository.save(meeting);
        return MeetingResponse.fromEntity(meeting);
    }

    public void recordConsent(User user, UUID meetingId, ConsentEventRequest request) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        ConsentEvent event = new ConsentEvent(
                UUID.randomUUID(),
                meeting,
                request.eventType(),
                request.participantReference(),
                request.details()
        );
        consentEventRepository.save(event);

        if (meeting.getStatus() == MeetingStatus.CREATED || meeting.getStatus() == MeetingStatus.CONSENT_REQUIRED) {
            meeting.updateStatus(MeetingStatus.READY);
            meetingRepository.save(meeting);
        }
    }

    public StreamTicketResponse generateStreamTicket(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        String ticket = jwtTokenProvider.generateStreamTicket(user.getId(), meeting.getId());
        return new StreamTicketResponse(ticket, "ws://localhost:8080/ws/audio", 60);
    }

    public MeetingResponse stopMeeting(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        if (meeting.getStatus() == MeetingStatus.RECORDING) {
            meeting.updateStatus(MeetingStatus.STOPPING);
            meeting.updateStatus(MeetingStatus.FINALIZING);
            meeting.updateStatus(MeetingStatus.COMPLETED);
            meeting = meetingRepository.save(meeting);
        }
        return MeetingResponse.fromEntity(meeting);
    }

    public void deleteMeeting(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        meeting.setDeletedAt(OffsetDateTime.now());
        meeting.updateStatus(MeetingStatus.DELETION_PENDING);
        meeting.updateStatus(MeetingStatus.DELETED);
        meetingRepository.save(meeting);
    }

    public Meeting getMeetingAndVerifyOwnership(User user, UUID meetingId) {
        Meeting meeting = meetingRepository.findByIdAndDeletedAtIsNull(meetingId)
                .orElseThrow(() -> new IllegalArgumentException("Meeting not found: " + meetingId));

        if (!meeting.getUser().getId().equals(user.getId())) {
            throw new AccessDeniedException("You do not have access to this meeting");
        }
        return meeting;
    }
}
