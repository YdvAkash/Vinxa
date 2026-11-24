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
    private final com.vinxa.live.ai.AiSummaryService aiSummaryService;
    private final com.vinxa.live.participant.ParticipantRepository participantRepository;
    private final com.vinxa.live.transcript.TranscriptSegmentRepository transcriptSegmentRepository;
    private final com.vinxa.live.actionitem.ActionItemRepository actionItemRepository;
    private final com.vinxa.live.summary.MeetingSummaryRepository meetingSummaryRepository;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();

    @org.springframework.beans.factory.annotation.Autowired
    public MeetingService(
            MeetingRepository meetingRepository,
            ConsentEventRepository consentEventRepository,
            JwtTokenProvider jwtTokenProvider,
            com.vinxa.live.ai.AiSummaryService aiSummaryService,
            com.vinxa.live.participant.ParticipantRepository participantRepository,
            com.vinxa.live.transcript.TranscriptSegmentRepository transcriptSegmentRepository,
            com.vinxa.live.actionitem.ActionItemRepository actionItemRepository,
            com.vinxa.live.summary.MeetingSummaryRepository meetingSummaryRepository
    ) {
        this.meetingRepository = meetingRepository;
        this.consentEventRepository = consentEventRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.aiSummaryService = aiSummaryService;
        this.participantRepository = participantRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.actionItemRepository = actionItemRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
    }

    public MeetingService(
            MeetingRepository meetingRepository,
            ConsentEventRepository consentEventRepository,
            JwtTokenProvider jwtTokenProvider,
            com.vinxa.live.ai.AiSummaryService aiSummaryService
    ) {
        this(meetingRepository, consentEventRepository, jwtTokenProvider, aiSummaryService, null, null, null, null);
    }

    private MeetingResponse toEnrichedResponse(Meeting m) {
        try {
            if (participantRepository == null || transcriptSegmentRepository == null) {
                return MeetingResponse.fromEntity(m);
            }
            UUID mId = m.getId();
            int pCount = participantRepository.findByMeetingIdOrderByCreatedAtAsc(mId).size();
            int sCount = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(mId).size();
            int aCount = actionItemRepository.findByMeetingIdOrderByCreatedAtAsc(mId).size();
            int dCount = 0;
            com.vinxa.live.summary.MeetingSummary sum = meetingSummaryRepository.findByMeetingId(mId).orElse(null);
            if (sum != null && sum.getSummary() != null) {
                com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(sum.getSummary());
                if (root.has("decisions") && root.get("decisions").isArray()) {
                    dCount = root.get("decisions").size();
                }
            }
            if (pCount == 0 && sCount > 0) pCount = 1;
            return MeetingResponse.fromEntityWithCounts(m, pCount, sCount, aCount, dCount);
        } catch (Exception e) {
            return MeetingResponse.fromEntity(m);
        }
    }

    public MeetingResponse createMeeting(User user, CreateMeetingRequest request) {
        UUID meetingId = UUID.randomUUID();
        String initialTitle = resolveInitialMeetingTitle(
                request.title(),
                request.platform(),
                request.meetingUrl(),
                meetingId
        );
        Meeting meeting = new Meeting(
                meetingId,
                user,
                initialTitle,
                request.platform(),
                request.meetingUrl()
        );
        meeting = meetingRepository.save(meeting);
        return MeetingResponse.fromEntity(meeting);
    }

    public static String extractMeetingCode(String title, String meetingUrl, UUID fallbackId) {
        // 1. Check Google Meet pattern xxx-xxxx-xxx in URL or title
        java.util.regex.Pattern meetCodePattern = java.util.regex.Pattern.compile("\\b([a-z]{3}-[a-z]{4}-[a-z]{3})\\b", java.util.regex.Pattern.CASE_INSENSITIVE);
        if (meetingUrl != null) {
            java.util.regex.Matcher m = meetCodePattern.matcher(meetingUrl);
            if (m.find()) return m.group(1).toLowerCase();
        }
        if (title != null) {
            java.util.regex.Matcher m = meetCodePattern.matcher(title);
            if (m.find()) return m.group(1).toLowerCase();
        }

        // 2. Check Zoom numeric meeting ID in URL (/j/123456789 or /wc/123456789)
        if (meetingUrl != null) {
            java.util.regex.Matcher zoomMatcher = java.util.regex.Pattern.compile("/(?:j|wc)/(\\d{8,12})").matcher(meetingUrl);
            if (zoomMatcher.find()) return zoomMatcher.group(1);

            // 3. Last path segment of URL if meaningful
            try {
                java.net.URI uri = java.net.URI.create(meetingUrl.trim());
                String path = uri.getPath();
                if (path != null && path.length() > 1) {
                    String[] parts = path.split("/");
                    String last = parts[parts.length - 1].trim();
                    if (!last.isEmpty() && last.length() <= 24) {
                        return last;
                    }
                }
            } catch (Exception ignored) {
            }
        }

        // 4. Fallback deterministic short code from meeting UUID
        if (fallbackId != null) {
            String hex = fallbackId.toString().replace("-", "");
            return hex.substring(0, 3) + "-" + hex.substring(3, 7) + "-" + hex.substring(7, 10);
        }
        return "live-session";
    }

    public static String formatDefaultCodeTitle(Platform platform, String code) {
        String prefix = switch (platform != null ? platform : Platform.GOOGLE_MEET) {
            case GOOGLE_MEET -> "Meet";
            case MICROSOFT_TEAMS -> "Teams";
            case ZOOM -> "Zoom";
            default -> "Meeting";
        };
        return prefix + " • " + code;
    }

    public static boolean isGenericOrCodeOnlyTitle(String title) {
        if (title == null || title.isBlank()) return true;
        String t = title.trim().toLowerCase();
        return t.equals("google meet")
                || t.equals("meet")
                || t.equals("meeting tab")
                || t.equals("live meeting session")
                || t.equals("microsoft teams")
                || t.equals("zoom")
                || t.startsWith("meet -")
                || t.startsWith("meet –")
                || t.startsWith("meet •")
                || t.startsWith("teams •")
                || t.startsWith("zoom •");
    }

    private String resolveInitialMeetingTitle(String requestedTitle, Platform platform, String meetingUrl, UUID meetingId) {
        String code = extractMeetingCode(requestedTitle, meetingUrl, meetingId);
        if (isGenericOrCodeOnlyTitle(requestedTitle)) {
            return formatDefaultCodeTitle(platform, code);
        }
        return requestedTitle.trim();
    }

    @Transactional(readOnly = true)
    public Page<MeetingResponse> listMeetings(User user, Pageable pageable) {
        return meetingRepository.findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(user.getId(), pageable)
                .map(this::toEnrichedResponse);
    }

    @Transactional(readOnly = true)
    public MeetingResponse getMeeting(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        return toEnrichedResponse(meeting);
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
        return toEnrichedResponse(meeting);
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

    @org.springframework.beans.factory.annotation.Value("${vinxa.audio.ws-url:ws://api.vinxa.ogakash.xyz/ws/audio}")
    private String audioWsUrl = "ws://api.vinxa.ogakash.xyz/ws/audio";

    public StreamTicketResponse generateStreamTicket(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        String ticket = jwtTokenProvider.generateStreamTicket(user.getId(), meeting.getId());
        return new StreamTicketResponse(ticket, audioWsUrl, 60);
    }

    public MeetingResponse stopMeeting(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        if (meeting.getStatus() == MeetingStatus.RECORDING || meeting.getStatus() == MeetingStatus.READY) {
            if (meeting.getStatus() == MeetingStatus.READY) {
                meeting.updateStatus(MeetingStatus.RECORDING);
            }
            meeting.updateStatus(MeetingStatus.STOPPING);
            meeting.updateStatus(MeetingStatus.FINALIZING);
            meeting.updateStatus(MeetingStatus.COMPLETED);
            meeting = meetingRepository.save(meeting);

            // Trigger AI intelligence analysis
            aiSummaryService.generateMeetingAnalysisAsync(meeting.getId());
        }
        return toEnrichedResponse(meeting);
    }

    public MeetingResponse reanalyzeMeeting(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        aiSummaryService.generateMeetingAnalysisAsync(meeting.getId());
        return toEnrichedResponse(meeting);
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

    public MeetingResponse enablePublicShare(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        if (meeting.getShareToken() == null || meeting.getShareToken().isBlank()) {
            String token = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            meeting.setShareToken(token);
        }
        meeting.setPublicShared(true);
        meeting = meetingRepository.save(meeting);
        return toEnrichedResponse(meeting);
    }

    public MeetingResponse disablePublicShare(User user, UUID meetingId) {
        Meeting meeting = getMeetingAndVerifyOwnership(user, meetingId);
        meeting.setPublicShared(false);
        meeting = meetingRepository.save(meeting);
        return toEnrichedResponse(meeting);
    }
}
