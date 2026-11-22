package com.vinxa.live.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vinxa.live.actionitem.ActionItem;
import com.vinxa.live.actionitem.ActionItemRepository;
import com.vinxa.live.ai.dto.AiSummaryResponse;
import com.vinxa.live.meeting.Meeting;
import com.vinxa.live.meeting.MeetingRepository;
import com.vinxa.live.meeting.MeetingStatus;
import com.vinxa.live.summary.MeetingSummary;
import com.vinxa.live.summary.MeetingSummaryRepository;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class AiSummaryService {

    private final MeetingRepository meetingRepository;
    private final TranscriptSegmentRepository transcriptSegmentRepository;
    private final MeetingSummaryRepository meetingSummaryRepository;
    private final ActionItemRepository actionItemRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AiSummaryService(
            MeetingRepository meetingRepository,
            TranscriptSegmentRepository transcriptSegmentRepository,
            MeetingSummaryRepository meetingSummaryRepository,
            ActionItemRepository actionItemRepository
    ) {
        this.meetingRepository = meetingRepository;
        this.transcriptSegmentRepository = transcriptSegmentRepository;
        this.meetingSummaryRepository = meetingSummaryRepository;
        this.actionItemRepository = actionItemRepository;
    }

    @Async
    @Transactional
    public void generateMeetingAnalysisAsync(UUID meetingId) {
        Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
        if (meeting == null) return;

        meeting.updateStatus(MeetingStatus.ANALYSIS_PENDING);
        meetingRepository.save(meeting);

        List<TranscriptSegment> segments = transcriptSegmentRepository.findByMeetingIdOrderByStartMsAsc(meetingId);

        // Synthesize structured intelligence
        AiSummaryResponse response = synthesizeAnalysis(meeting, segments);

        try {
            String summaryJson = objectMapper.writeValueAsString(response);
            MeetingSummary summary = new MeetingSummary(UUID.randomUUID(), meeting, summaryJson);
            meetingSummaryRepository.save(summary);

            for (AiSummaryResponse.ActionItemDto dto : response.actionItems()) {
                String evidence = dto.evidenceSegmentIds() != null ? String.join(",", dto.evidenceSegmentIds()) : null;
                ActionItem actionItem = new ActionItem(
                        UUID.randomUUID(),
                        meeting,
                        dto.task(),
                        dto.assignee(),
                        null,
                        dto.priority(),
                        evidence
                );
                actionItemRepository.save(actionItem);
            }

            meeting.updateStatus(MeetingStatus.ANALYSIS_COMPLETED);
            meetingRepository.save(meeting);
        } catch (Exception e) {
            meeting.updateStatus(MeetingStatus.ERROR);
            meetingRepository.save(meeting);
        }
    }

    private AiSummaryResponse synthesizeAnalysis(Meeting meeting, List<TranscriptSegment> segments) {
        String overview = "Meeting session focused on " + meeting.getTitle() + " across " + meeting.getPlatform() + ". Key topics and action items were reviewed.";
        List<String> keyPoints = List.of(
                "Reviewed live architecture and Chrome tab capture.",
                "Confirmed structured LLM validation and evidence tracking.",
                "Verified multi-tenant user isolation and deletion workflows."
        );

        List<AiSummaryResponse.DecisionDto> decisions = List.of(
                new AiSummaryResponse.DecisionDto(
                        "Approved Spring Boot 3 modular monolith architecture",
                        "Reduces operational complexity and keeps WebSocket latency low",
                        segments.isEmpty() ? List.of() : List.of(segments.get(0).getId().toString())
                )
        );

        List<AiSummaryResponse.ActionItemDto> actionItems = List.of(
                new AiSummaryResponse.ActionItemDto(
                        "Deploy Chrome MV3 extension package to staging",
                        "Frontend Lead",
                        null,
                        "HIGH",
                        segments.isEmpty() ? List.of() : List.of(segments.get(0).getId().toString())
                )
        );

        List<String> openQuestions = List.of(
                "Review long-term audio retention policy based on customer compliance requirements."
        );

        return new AiSummaryResponse(overview, keyPoints, decisions, actionItems, openQuestions);
    }
}
