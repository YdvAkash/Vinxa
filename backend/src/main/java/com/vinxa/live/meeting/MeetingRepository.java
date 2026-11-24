package com.vinxa.live.meeting;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface MeetingRepository extends JpaRepository<Meeting, UUID> {
    Page<Meeting> findByUserIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID userId, Pageable pageable);
    Optional<Meeting> findByIdAndDeletedAtIsNull(UUID id);
    Optional<Meeting> findByShareTokenAndPublicSharedTrueAndDeletedAtIsNull(String shareToken);

    @Query("SELECT m FROM Meeting m LEFT JOIN FETCH m.user WHERE m.id = :id")
    Optional<Meeting> findByIdWithUser(@Param("id") UUID id);
}
