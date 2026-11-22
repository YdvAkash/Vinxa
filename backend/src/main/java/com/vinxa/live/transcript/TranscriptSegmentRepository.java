package com.vinxa.live.transcript;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TranscriptSegmentRepository extends JpaRepository<TranscriptSegment, UUID> {
    List<TranscriptSegment> findByMeetingIdOrderByStartMsAsc(UUID meetingId);

    @Query("SELECT t FROM TranscriptSegment t WHERE t.meeting.id = :meetingId AND LOWER(t.content) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY t.startMs ASC")
    List<TranscriptSegment> searchByMeetingAndContent(@Param("meetingId") UUID meetingId, @Param("query") String query);

    @Query("SELECT t FROM TranscriptSegment t WHERE t.meeting.user.id = :userId AND LOWER(t.content) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY t.startMs ASC")
    List<TranscriptSegment> searchByUserAndContent(@Param("userId") UUID userId, @Param("query") String query);
}
