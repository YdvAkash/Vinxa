package com.vinxa.live.participant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ParticipantRepository extends JpaRepository<Participant, UUID> {
    List<Participant> findByMeetingIdOrderByCreatedAtAsc(UUID meetingId);
    Optional<Participant> findByMeetingIdAndSpeakerKey(UUID meetingId, String speakerKey);
}
