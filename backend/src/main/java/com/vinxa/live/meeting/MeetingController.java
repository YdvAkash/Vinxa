package com.vinxa.live.meeting;

import com.vinxa.live.common.SecurityUtils;
import com.vinxa.live.meeting.dto.*;
import com.vinxa.live.user.User;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/meetings")
public class MeetingController {

    private final MeetingService meetingService;

    public MeetingController(MeetingService meetingService) {
        this.meetingService = meetingService;
    }

    @PostMapping
    public ResponseEntity<MeetingResponse> createMeeting(@Valid @RequestBody CreateMeetingRequest request) {
        User user = SecurityUtils.getCurrentUser();
        return ResponseEntity.status(HttpStatus.CREATED).body(meetingService.createMeeting(user, request));
    }

    @GetMapping
    public ResponseEntity<Page<MeetingResponse>> listMeetings(@PageableDefault(size = 20) Pageable pageable) {
        User user = SecurityUtils.getCurrentUser();
        return ResponseEntity.ok(meetingService.listMeetings(user, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<MeetingResponse> getMeeting(@PathVariable UUID id) {
        User user = SecurityUtils.getCurrentUser();
        return ResponseEntity.ok(meetingService.getMeeting(user, id));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<MeetingResponse> updateMeeting(@PathVariable UUID id, @RequestBody UpdateMeetingRequest request) {
        User user = SecurityUtils.getCurrentUser();
        return ResponseEntity.ok(meetingService.updateMeeting(user, id, request));
    }

    @PostMapping("/{id}/consent")
    public ResponseEntity<Void> recordConsent(@PathVariable UUID id, @Valid @RequestBody ConsentEventRequest request) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.recordConsent(user, id, request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PostMapping("/{id}/stream-ticket")
    public ResponseEntity<StreamTicketResponse> generateStreamTicket(@PathVariable UUID id) {
        User user = SecurityUtils.getCurrentUser();
        return ResponseEntity.ok(meetingService.generateStreamTicket(user, id));
    }

    @PostMapping("/{id}/stop")
    public ResponseEntity<MeetingResponse> stopMeeting(@PathVariable UUID id) {
        User user = SecurityUtils.getCurrentUser();
        return ResponseEntity.ok(meetingService.stopMeeting(user, id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMeeting(@PathVariable UUID id) {
        User user = SecurityUtils.getCurrentUser();
        meetingService.deleteMeeting(user, id);
        return ResponseEntity.noContent().build();
    }
}
