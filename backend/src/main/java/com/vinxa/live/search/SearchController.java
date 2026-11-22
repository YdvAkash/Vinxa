package com.vinxa.live.search;

import com.vinxa.live.common.SecurityUtils;
import com.vinxa.live.transcript.TranscriptSegment;
import com.vinxa.live.transcript.TranscriptSegmentRepository;
import com.vinxa.live.user.User;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/search")
public class SearchController {

    private final TranscriptSegmentRepository transcriptSegmentRepository;

    public SearchController(TranscriptSegmentRepository transcriptSegmentRepository) {
        this.transcriptSegmentRepository = transcriptSegmentRepository;
    }

    @GetMapping
    public ResponseEntity<List<SearchResultDto>> search(
            @RequestParam("q") String query,
            @RequestParam(value = "meetingId", required = false) UUID meetingId
    ) {
        User user = SecurityUtils.getCurrentUser();

        List<TranscriptSegment> segments;
        if (meetingId != null) {
            segments = transcriptSegmentRepository.searchByMeetingAndContent(meetingId, query);
        } else {
            segments = transcriptSegmentRepository.searchByUserAndContent(user.getId(), query);
        }

        List<SearchResultDto> results = segments.stream()
                .map(s -> new SearchResultDto(
                        s.getId(),
                        s.getMeeting().getId(),
                        s.getMeeting().getTitle(),
                        s.getContent(),
                        s.getStartMs()
                ))
                .toList();

        return ResponseEntity.ok(results);
    }

    public record SearchResultDto(
            UUID segmentId,
            UUID meetingId,
            String meetingTitle,
            String content,
            Long startMs
    ) {}
}
