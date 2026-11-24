# Stage 1: Build Spring Boot 3 JAR with Java 21 & Maven
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Minimal Java 21 JRE Runtime
FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=builder /build/target/vinxa-live-backend-*.jar /app/vinxa-live-backend.jar
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-Xms256m", "-Xmx768m", "-XX:+UseG1GC", "-jar", "/app/vinxa-live-backend.jar"]
