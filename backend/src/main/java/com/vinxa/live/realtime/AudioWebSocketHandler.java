package com.vinxa.live.realtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.MeetingService;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.participant.Participant;
import com.vinxa.live.participant.ParticipantRepository;
import com.vinxa.live.stt.SpeechToTextProvider;
import com.vinxa.live.stt.TranscriptEvent;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.net.URI;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class AudioWebSocketHandler extends AbstractWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(AudioWebSocketHandler.class);

    private static final Pattern SELF_INTRO_PATTERN = Pattern.compile(
            "\\b(?:my name is|this is|i am|i'm)\\s+([A-Z][a-z]{2,18}(?:\\s+[A-Z][a-z]{2,18})?)\\b"
    );
    private static final Set<String> NON_NAME_WORDS = Set.of(
            "going", "ready", "here", "working", "happy", "sure", "calling", "sharing",
            "looking", "trying", "thinking", "talking", "saying", "asking", "doing",
            "fine", "good", "great", "able", "unable", "sorry", "glad", "excited",
            "starting", "joining", "presenting", "recording", "testing", "checking",
            "currently", "actually", "really", "just", "also", "still", "done", "back"
    );

    private final SpeechToTextProvider sttProvider;
    private final EventWebSocketHandler eventWebSocketHandler;
    private final MeetingRepository meetingRepository;
    private final ParticipantRepository participantRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, UUID> sessionToMeetingMap = new ConcurrentHashMap<>();
    private final Map<UUID, Long> frameCounters = new ConcurrentHashMap<>();
    private final Map<UUID, Map<String, String>> speakerDisplayNames = new ConcurrentHashMap<>();
    private final Map<UUID, CopyOnWriteArrayList<String>> meetingJoineesRoster = new ConcurrentHashMap<>();
    private final Map<UUID, String> activeDomSpeakerByMeeting = new ConcurrentHashMap<>();
    private final Map<UUID, Boolean> meetingTitleResolved = new ConcurrentHashMap<>();
    private final ExecutorService persistenceExecutor;

    public AudioWebSocketHandler(
            SpeechToTextProvider sttProvider,
            EventWebSocketHandler eventWebSocketHandler,
            MeetingRepository meetingRepository,
            ParticipantRepository participantRepository,
            TranscriptSegmentRepository transcriptSegmentRepository
    ) {
        this.sttProvider = sttProvider;
        this.eventWebSocketHandler = eventWebSocketHandler;
        this.meetingRepository = meetingRepository;
        this.participantRepository = participantRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.persistenceExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "transcript-db-writer");
            t.setDaemon(true);
            return t;
        });
    }

    @PreDestroy
    public void shutdown() {
        persistenceExecutor.shutdown();
    }

    public static boolean isGenericSpeakerLabel(String name) {
        if (name == null || name.isBlank()) return true;
        String trimmed = name.trim().toLowerCase();
        return trimmed.equals("speaker")
                || trimmed.matches("^speaker\\s*[-_]?\\s*\\d+$")
                || trimmed.equals("unknown")
                || trimmed.equals("participant")
                || trimmed.equals("user");
    }

    public static String deriveDisplayNameFromEmail(String email) {
        if (email == null || email.isBlank() || !email.contains("@")) return null;
        String local = email.substring(0, email.indexOf('@')).trim();
        local = local.replaceAll("\\d+$", "");
        String[] parts = local.split("[._-]+");
        StringBuilder sb = new StringBuilder();
        for (String part : parts) {
            String clean = part.replaceAll("[^a-zA-Z]", "").trim();
            if (clean.length() >= 2 && !clean.equalsIgnoreCase("user") && !clean.equalsIgnoreCase("test") && !clean.equalsIgnoreCase("e2e")) {
                if (!sb.isEmpty()) sb.append(' ');
                sb.append(Character.toUpperCase(clean.charAt(0))).append(clean.substring(1).toLowerCase());
            }
        }
        return sb.isEmpty() ? null : sb.toString();
    }

    public static String extractSelfIntroducedName(String text) {
        if (text == null || text.length() < 6) return null;
        Matcher matcher = SELF_INTRO_PATTERN.matcher(text);
        while (matcher.find()) {
            String candidate = matcher.group(1).trim();
            String[] tokens = candidate.split("\\s+");
            if (tokens.length == 0) continue;
            String firstLower = tokens[0].toLowerCase();
            if (NON_NAME_WORDS.contains(firstLower)) continue;
            if (tokens.length > 1 && NON_NAME_WORDS.contains(tokens[1].toLowerCase())) {
                candidate = tokens[0];
            }
            if (candidate.length() >= 3 && candidate.length() <= 35 && !isGenericSpeakerLabel(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    public void registerSpeakerDisplayName(UUID meetingId, String speakerKey, String displayName) {
        if (meetingId == null || speakerKey == null || displayName == null || displayName.isBlank()) return;
        String cleanName = displayName.trim();
        speakerDisplayNames
                .computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>())
                .put(speakerKey, cleanName);
        addJoineeToRoster(meetingId, cleanName);
        eventWebSocketHandler.broadcastToMeeting(
                meetingId,
                Map.of(
                        "type", "SPEAKER_RENAMED",
                        "meetingId", meetingId.toString(),
                        "speakerKey", speakerKey,
                        "speakerName", cleanName
                )
        );
    }

    private void addJoineeToRoster(UUID meetingId, String joineeName) {
        if (joineeName == null || joineeName.isBlank() || isGenericSpeakerLabel(joineeName)) return;
        String clean = joineeName.trim();
        CopyOnWriteArrayList<String> roster = meetingJoineesRoster.computeIfAbsent(meetingId, k -> new CopyOnWriteArrayList<>());
        boolean exists = roster.stream().anyMatch(existing -> existing.equalsIgnoreCase(clean));
        if (!exists) {
            roster.add(clean);
        }
    }

    /**
     * Synchronizes real meeting joinee names scraped from the active Google Meet, MS Teams, or Zoom call
     * and automatically assigns them to existing or incoming diarized speakers.
     */
    public Map<String, String> syncMeetingJoinees(UUID meetingId, List<String> joinees, String activeSpeaker) {
        if (meetingId == null) return Map.of();

        if (joinees != null) {
            for (String j : joinees) {
                if (j != null && !j.isBlank() && !isGenericSpeakerLabel(j)) {
                    addJoineeToRoster(meetingId, j.trim());
                }
            }
        }

        if (activeSpeaker != null && !activeSpeaker.isBlank() && !isGenericSpeakerLabel(activeSpeaker)) {
            String cleanActive = activeSpeaker.trim();
            activeDomSpeakerByMeeting.put(meetingId, cleanActive);
            addJoineeToRoster(meetingId, cleanActive);
        }

        CopyOnWriteArrayList<String> roster = meetingJoineesRoster.computeIfAbsent(meetingId, k -> new CopyOnWriteArrayList<>());
        Map<String, String> nameMap = speakerDisplayNames.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());

        if (!roster.isEmpty()) {
            // Pre-assign or upgrade generic speaker-1, speaker-2, ... to real joinees in order
            for (int i = 0; i < roster.size(); i++) {
                String speakerKey = "speaker-" + (i + 1);
                String currentAssigned = nameMap.get(speakerKey);
                if (currentAssigned == null || isGenericSpeakerLabel(currentAssigned)) {
                    String joineeName = findFirstUnassignedJoinee(roster, nameMap, roster.get(i));
                    if (joineeName != null) {
                        assignAndPersistJoineeToSpeaker(meetingId, speakerKey, joineeName);
                    }
                }
            }
        }

        return Map.copyOf(nameMap);
    }

    private String findFirstUnassignedJoinee(List<String> roster, Map<String, String> assignedMap, String preferred) {
        Set<String> usedLower = new HashSet<>();
        for (String val : assignedMap.values()) {
            if (val != null && !isGenericSpeakerLabel(val)) {
                usedLower.add(val.toLowerCase());
            }
        }
        if (preferred != null && !usedLower.contains(preferred.toLowerCase())) {
            return preferred;
        }
        for (String candidate : roster) {
            if (!usedLower.contains(candidate.toLowerCase())) {
                return candidate;
            }
        }
        return preferred;
    }

    private void assignAndPersistJoineeToSpeaker(UUID meetingId, String speakerKey, String joineeName) {
        if (joineeName == null || joineeName.isBlank() || isGenericSpeakerLabel(joineeName)) return;
        String cleanName = joineeName.trim();
        Map<String, String> nameMap = speakerDisplayNames.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());
        String previous = nameMap.put(speakerKey, cleanName);

        if (!cleanName.equals(previous)) {
            eventWebSocketHandler.broadcastToMeeting(
                    meetingId,
                    Map.of(
                            "type", "SPEAKER_RENAMED",
                            "meetingId", meetingId.toString(),
                            "speakerKey", speakerKey,
                            "speakerName", cleanName
                    )
            );
            CompletableFuture.runAsync(() -> {
                try {
                    Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
                    if (meeting == null) return;
                    Participant participant = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, speakerKey)
                            .orElseGet(() -> new Participant(UUID.randomUUID(), meeting, speakerKey, cleanName));
                    if (!cleanName.equals(participant.getDisplayName())) {
                        participant.setDisplayName(cleanName);
                    }
                    participantRepository.save(participant);
                } catch (Exception e) {
                    log.debug("Failed persisting auto-assigned joinee {} for {}: {}", cleanName, speakerKey, e.getMessage());
                }
            }, persistenceExecutor);
        }
    }

    private String resolveOrAutoAssignJoineeName(UUID meetingId, String speakerKey, String providerSpeakerName, String transcriptText) {
        Map<String, String> nameMap = speakerDisplayNames.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());
        String cachedName = nameMap.get(speakerKey);

        // 1. Check if the speaker introduced themselves in this utterance ("Hi, this is Rahul" / "My name is Priya")
        if (cachedName == null || isGenericSpeakerLabel(cachedName)) {
            String selfIntroName = extractSelfIntroducedName(transcriptText);
            if (selfIntroName != null) {
                addJoineeToRoster(meetingId, selfIntroName);
                assignAndPersistJoineeToSpeaker(meetingId, speakerKey, selfIntroName);
                return selfIntroName;
            }
        }

        // 2. If already assigned a real joinee name, return it
        if (cachedName != null && !isGenericSpeakerLabel(cachedName)) {
            return cachedName;
        }

        // 3. If the provider event itself already carries a real non-generic speaker name (e.g. "Alex (Tech Lead)"), cache and use it
        if (providerSpeakerName != null && !isGenericSpeakerLabel(providerSpeakerName)) {
            String cleanProviderName = providerSpeakerName.trim();
            nameMap.put(speakerKey, cleanProviderName);
            addJoineeToRoster(meetingId, cleanProviderName);
            return cleanProviderName;
        }

        // 4. Match against active speaking joinee detected in the meeting DOM
        String activeDomSpeaker = activeDomSpeakerByMeeting.get(meetingId);
        CopyOnWriteArrayList<String> roster = meetingJoineesRoster.get(meetingId);
        if (activeDomSpeaker != null && !isGenericSpeakerLabel(activeDomSpeaker)) {
            boolean alreadyUsedByOther = nameMap.entrySet().stream()
                    .anyMatch(e -> !e.getKey().equals(speakerKey) && activeDomSpeaker.equalsIgnoreCase(e.getValue()));
            if (!alreadyUsedByOther) {
                assignAndPersistJoineeToSpeaker(meetingId, speakerKey, activeDomSpeaker);
                return activeDomSpeaker;
            }
        }

        // 5. Match against the meeting joinees roster by speaker index or first unassigned joinee
        if (roster != null && !roster.isEmpty()) {
            int speakerIdx = parseSpeakerIndex(speakerKey);
            String preferred = (speakerIdx >= 1 && speakerIdx <= roster.size())
                    ? roster.get(speakerIdx - 1)
                    : null;
            String assigned = findFirstUnassignedJoinee(roster, nameMap, preferred);
            if (assigned != null && !isGenericSpeakerLabel(assigned)) {
                assignAndPersistJoineeToSpeaker(meetingId, speakerKey, assigned);
                return assigned;
            }
        }

        return cachedName != null ? cachedName : (providerSpeakerName != null ? providerSpeakerName : "Speaker 1");
    }

    private int parseSpeakerIndex(String speakerKey) {
        if (speakerKey == null) return 1;
        try {
            String digits = speakerKey.replaceAll("\\D+", "");
            if (!digits.isEmpty()) {
                return Integer.parseInt(digits);
            }
        } catch (Exception ignored) {
        }
        return 1;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        UUID meetingId = extractMeetingId(session.getUri());
        String language = extractLanguage(session.getUri());
        if (meetingId != null) {
            sessionToMeetingMap.put(session.getId(), meetingId);
            frameCounters.put(meetingId, 0L);
            log.info("Audio WebSocket connected for meeting {} [language={}]", meetingId, language);

            // Warm speaker display name cache, seed host joinee name, and transition meeting status asynchronously
            CompletableFuture.runAsync(() -> {
                try {
                    Meeting meeting = meetingRepository.findByIdWithUser(meetingId)
                            .or(() -> meetingRepository.findById(meetingId))
                            .orElse(null);
                    if (meeting != null) {
                        if (!MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())) {
                            meetingTitleResolved.put(meetingId, true);
                        }
                        if (meeting.getStatus().canTransitionTo(MeetingStatus.RECORDING)) {
                            meeting.updateStatus(MeetingStatus.RECORDING);
                            meetingRepository.save(meeting);
                        }
                        try {
                            if (meeting.getUser() != null && meeting.getUser().getEmail() != null) {
                                String hostName = deriveDisplayNameFromEmail(meeting.getUser().getEmail());
                                if (hostName != null) {
                                    addJoineeToRoster(meetingId, hostName);
                                }
                            }
                        } catch (Exception ignored) {
                        }
                    }
                    List<Participant> existingParticipants = participantRepository.findByMeetingIdOrderByCreatedAtAsc(meetingId);
                    Map<String, String> nameMap = speakerDisplayNames.computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>());
                    for (Participant p : existingParticipants) {
                        if (p.getSpeakerKey() != null && p.getDisplayName() != null) {
                            nameMap.put(p.getSpeakerKey(), p.getDisplayName());
                            if (!isGenericSpeakerLabel(p.getDisplayName())) {
                                addJoineeToRoster(meetingId, p.getDisplayName());
                            }
                        }
                    }
                } catch (Exception e) {
                    log.debug("Initial meeting status warm-up error: {}", e.getMessage());
                }
            }, persistenceExecutor);

            sttProvider.startSession(meetingId, language, (TranscriptEvent event) -> {
                handleTranscriptEvent(meetingId, event);
            });
        }
    }

    public void handleTranscriptEvent(UUID meetingId, TranscriptEvent event) {
        if (event == null) return;

        String speakerKey = event.speakerKey() != null ? event.speakerKey() : "speaker-1";
        String resolvedSpeakerName = resolveOrAutoAssignJoineeName(
                meetingId,
                speakerKey,
                event.speakerName(),
                event.text()
        );
        UUID segmentId = event.segmentId() != null ? event.segmentId() : UUID.randomUUID();

        TranscriptEvent enrichedEvent = new TranscriptEvent(
                event.type(),
                meetingId,
                segmentId,
                speakerKey,
                resolvedSpeakerName,
                event.text(),
                event.startMs(),
                event.endMs(),
                event.isFinal(),
                event.confidence()
        );

        // 1. Broadcast immediately to connected dashboard & extension clients (< 1ms delivery latency)
        eventWebSocketHandler.broadcastToMeeting(meetingId, enrichedEvent);

        // 2. Persist finalized segment asynchronously
        if (enrichedEvent.isFinal()) {
            persistenceExecutor.submit(() -> persistFinalTranscriptSegment(meetingId, enrichedEvent));
        }
    }

    void persistFinalTranscriptSegment(UUID meetingId, TranscriptEvent event) {
        try {
            Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
            if (meeting == null) return;

            boolean meetingDirty = false;
            if (meeting.getStatus() != MeetingStatus.RECORDING && meeting.getStatus().canTransitionTo(MeetingStatus.RECORDING)) {
                meeting.updateStatus(MeetingStatus.RECORDING);
                meetingDirty = true;
            }

            if (!Boolean.TRUE.equals(meetingTitleResolved.get(meetingId))) {
                if (MeetingService.isGenericOrCodeOnlyTitle(meeting.getTitle())) {
                    if (event.text() != null && event.text().trim().length() > 14) {
                        String code = MeetingService.extractMeetingCode(
                                meeting.getTitle(),
                                meeting.getMeetingUrl(),
                                meeting.getId()
                        );
                        String cleanTopic = event.text().trim()
                                .replaceAll("^(?i)(welcome everyone to our|welcome everyone|today we need to|we have officially decided to|hello team,?)\\s*", "")
                                .trim();
                        if (!cleanTopic.isEmpty()) {
                            cleanTopic = Character.toUpperCase(cleanTopic.charAt(0)) + cleanTopic.substring(1);
                            if (cleanTopic.endsWith(".")) cleanTopic = cleanTopic.substring(0, cleanTopic.length() - 1);
                            if (cleanTopic.length() > 40) {
                                int sp = cleanTopic.lastIndexOf(' ', 40);
                                cleanTopic = (sp > 14 ? cleanTopic.substring(0, sp) : cleanTopic.substring(0, 40)) + "…";
                            }
                            meeting.setTitle(cleanTopic + " • " + code);
                            meetingDirty = true;
                            meetingTitleResolved.put(meetingId, true);
                        }
                    }
                } else {
                    meetingTitleResolved.put(meetingId, true);
                }
            }

            if (meetingDirty) {
                meetingRepository.save(meeting);
            }

            Participant participant = participantRepository.findByMeetingIdAndSpeakerKey(meetingId, event.speakerKey())
                    .orElseGet(() -> {
                        Participant p = new Participant(UUID.randomUUID(), meeting, event.speakerKey(), event.speakerName());
                        return participantRepository.save(p);
                    });

            // Upgrade participant display name in DB if it was previously generic and is now resolved to a real joinee name
            if (isGenericSpeakerLabel(participant.getDisplayName()) && !isGenericSpeakerLabel(event.speakerName())) {
                participant.setDisplayName(event.speakerName());
                participant = participantRepository.save(participant);
            }

            if (participant.getDisplayName() != null) {
                speakerDisplayNames
                        .computeIfAbsent(meetingId, k -> new ConcurrentHashMap<>())
                        .put(event.speakerKey(), participant.getDisplayName());
            }

            TranscriptSegment segment = new TranscriptSegment(
                    event.segmentId(),
                    meeting,
                    participant,
                    event.segmentId().toString(),
                    event.text(),
                    event.startMs(),
                    event.endMs(),
                    (float) event.confidence(),
                    true
            );
            transcriptSegmentRepository.save(segment);
        } catch (Exception e) {
            log.warn("Failed saving transcript segment to DB for meeting {}: {}", meetingId, e.getMessage());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        UUID meetingId = sessionToMeetingMap.get(session.getId());
        if (meetingId == null) return;

        Map<?, ?> map = objectMapper.readValue(message.getPayload(), Map.class);
        String type = (String) map.get("type");

        if ("STOP_SESSION".equals(type)) {
            log.info("Received STOP_SESSION frame for meeting {}", meetingId);
            sttProvider.stopSession(meetingId);
        } else if ("CHANGE_LANGUAGE".equals(type) || ("START_SESSION".equals(type) && map.get("language") != null)) {
            String lang = (String) map.get("language");
            if (lang != null && !lang.isBlank()) {
                sttProvider.switchLanguage(meetingId, lang);
            }
        } else if ("SYNC_JOINEES".equals(type)) {
            Object rawJoinees = map.get("joinees");
            List<String> joinees = new ArrayList<>();
            if (rawJoinees instanceof List<?> list) {
                for (Object item : list) {
                    if (item != null) joinees.add(item.toString());
                }
            }
            String activeSpeaker = map.get("activeSpeaker") != null ? map.get("activeSpeaker").toString() : null;
            syncMeetingJoinees(meetingId, joinees, activeSpeaker);
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) {
        UUID meetingId = sessionToMeetingMap.get(session.getId());
        if (meetingId == null) return;

        java.nio.ByteBuffer buffer = message.getPayload();
        byte[] payload = new byte[buffer.remaining()];
        buffer.get(payload);

        frameCounters.compute(meetingId, (k, v) -> {
            long total = (v == null ? 0L : v) + payload.length;
            if (total % 320000 < payload.length) {
                log.debug("Received audio stream: total {} bytes for meeting {}", total, meetingId);
            }
            return total;
        });
        sttProvider.sendAudioChunk(meetingId, payload);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        UUID meetingId = sessionToMeetingMap.remove(session.getId());
        if (meetingId != null) {
            frameCounters.remove(meetingId);
            meetingTitleResolved.remove(meetingId);
            activeDomSpeakerByMeeting.remove(meetingId);
            log.info("Audio WebSocket closed for meeting {}", meetingId);
            sttProvider.stopSession(meetingId);
        }
    }

    private UUID extractMeetingId(URI uri) {
        if (uri == null || uri.getQuery() == null) return UUID.randomUUID();
        for (String param : uri.getQuery().split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && ("meetingId".equals(pair[0]) || "id".equals(pair[0]))) {
                try {
                    return UUID.fromString(pair[1]);
                } catch (IllegalArgumentException e) {
                    return UUID.nameUUIDFromBytes(pair[1].getBytes());
                }
            }
        }
        return UUID.randomUUID();
    }

    private String extractLanguage(URI uri) {
        if (uri == null || uri.getQuery() == null) return "multi";
        for (String param : uri.getQuery().split("&")) {
            String[] pair = param.split("=");
            if (pair.length == 2 && ("language".equals(pair[0]) || "lang".equals(pair[0]))) {
                return java.net.URLDecoder.decode(pair[1], java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return "multi";
    }
}
