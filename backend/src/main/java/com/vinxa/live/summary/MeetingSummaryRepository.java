package com.vinxa.live.summary;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MeetingSummaryRepository extends JpaRepository<MeetingSummary, UUID> {
    Optional<MeetingSummary> findByMeetingId(UUID meetingId);

    @Query("SELECT s FROM MeetingSummary s WHERE s.meeting.id IN :meetingIds")
    List<MeetingSummary> findByMeetingIds(@Param("meetingIds") Collection<UUID> meetingIds);
}
