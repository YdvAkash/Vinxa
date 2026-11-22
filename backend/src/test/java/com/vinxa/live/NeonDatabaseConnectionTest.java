package com.vinxa.live;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("dev")
class NeonDatabaseConnectionTest {

    @Autowired
    private DataSource dataSource;

    @Test
    void testNeonPostgresConnectionAndSchema() throws Exception {
        assertNotNull(dataSource, "DataSource must be configured");

        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {

            assertFalse(conn.isClosed(), "Connection to Neon PostgreSQL must be open");

            // Verify current database and user
            try (ResultSet rs = stmt.executeQuery("SELECT current_database(), current_user, version()")) {
                assertTrue(rs.next());
                System.out.println("Connected to Neon DB: " + rs.getString(1) + ", User: " + rs.getString(2));
                System.out.println("PostgreSQL Version: " + rs.getString(3));
            }

            // Verify Flyway created tables
            try (ResultSet rs = stmt.executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")) {
                int tableCount = 0;
                while (rs.next()) {
                    System.out.println("Found table in Neon DB: " + rs.getString(1));
                    tableCount++;
                }
                assertTrue(tableCount > 0, "Flyway must have created tables in Neon PostgreSQL");
            }
        }
    }
}
