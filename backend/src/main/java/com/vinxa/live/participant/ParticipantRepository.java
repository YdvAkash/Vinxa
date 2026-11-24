package com.vinxa.live.participant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ParticipantRepository extends JpaRepository<Participant, UUID> {
    List<Participant> findByMeetingIdOrderByCreatedAtAsc(UUID meetingId);
    Optional<Participant> findByMeetingIdAndSpeakerKey(UUID meetingId, String speakerKey);
    long countByMeetingId(UUID meetingId);

    @Query("SELECT p.meeting.id, COUNT(p) FROM Participant p WHERE p.meeting.id IN :meetingIds GROUP BY p.meeting.id")
    List<Object[]> countByMeetingIds(@Param("meetingIds") Collection<UUID> meetingIds);
}
