package com.vinxa.live.actionitem;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface ActionItemRepository extends JpaRepository<ActionItem, UUID> {
    List<ActionItem> findByMeetingIdOrderByCreatedAtAsc(UUID meetingId);
    long countByMeetingId(UUID meetingId);

    @Query("SELECT a.meeting.id, COUNT(a) FROM ActionItem a WHERE a.meeting.id IN :meetingIds GROUP BY a.meeting.id")
    List<Object[]> countByMeetingIds(@Param("meetingIds") Collection<UUID> meetingIds);

    @Query("SELECT a FROM ActionItem a JOIN FETCH a.meeting m WHERE m.user.id = :userId AND m.deletedAt IS NULL ORDER BY a.createdAt DESC")
    List<ActionItem> findAllByUserIdOrderByCreatedAtDesc(@Param("userId") UUID userId);
}
