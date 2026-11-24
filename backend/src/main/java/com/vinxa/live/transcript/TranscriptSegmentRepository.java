package com.vinxa.live.transcript;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface TranscriptSegmentRepository extends JpaRepository<TranscriptSegment, UUID> {
    @Query("SELECT t FROM TranscriptSegment t LEFT JOIN FETCH t.participant WHERE t.meeting.id = :meetingId ORDER BY t.startMs ASC")
    List<TranscriptSegment> findByMeetingIdOrderByStartMsAsc(@Param("meetingId") UUID meetingId);

    long countByMeetingId(UUID meetingId);

    @Query("SELECT t.meeting.id, COUNT(t) FROM TranscriptSegment t WHERE t.meeting.id IN :meetingIds GROUP BY t.meeting.id")
    List<Object[]> countByMeetingIds(@Param("meetingIds") Collection<UUID> meetingIds);

    @Query("SELECT t FROM TranscriptSegment t JOIN FETCH t.meeting m LEFT JOIN FETCH t.participant WHERE m.id = :meetingId AND m.deletedAt IS NULL AND LOWER(t.content) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY t.startMs ASC")
    List<TranscriptSegment> searchByMeetingAndContent(@Param("meetingId") UUID meetingId, @Param("query") String query);

    @Query("SELECT t FROM TranscriptSegment t JOIN FETCH t.meeting m LEFT JOIN FETCH t.participant WHERE m.id = :meetingId AND m.user.id = :userId AND m.deletedAt IS NULL AND LOWER(t.content) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY t.startMs ASC")
    List<TranscriptSegment> searchByMeetingAndUserAndContent(@Param("meetingId") UUID meetingId, @Param("userId") UUID userId, @Param("query") String query);

    @Query("SELECT t FROM TranscriptSegment t JOIN FETCH t.meeting m LEFT JOIN FETCH t.participant WHERE m.user.id = :userId AND m.deletedAt IS NULL AND LOWER(t.content) LIKE LOWER(CONCAT('%', :query, '%')) ORDER BY t.startMs ASC")
    List<TranscriptSegment> searchByUserAndContent(@Param("userId") UUID userId, @Param("query") String query);
}
