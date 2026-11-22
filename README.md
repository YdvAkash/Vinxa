# Vinxa Live — AI Meeting Intelligence for Browser Meetings

Vinxa Live is an enterprise-grade AI meeting assistant tailored for browser-based meetings in Google Chrome (Google Meet, Microsoft Teams Web, and Zoom Web). It captures meeting audio through Chrome's native APIs with participant consent, streams audio to a high-performance backend, displays real-time speaker-diarized transcripts, and generates structured post-meeting summaries with actionable evidence.

## Architecture

- **`apps/dashboard`**: Modern React 18/19 SPA powered by Vite, TypeScript, and Tailwind CSS.
- **`apps/extension`**: Chrome Manifest V3 extension featuring tab capture via Offscreen documents, AudioWorklet PCM resampling, platform adapters, and consent controls.
- **`backend`**: Spring Boot 3 + Java 21 modular monolith with JWT security, Flyway database migrations, WebSocket binary audio streaming, Deepgram STT integration, and Claude post-meeting intelligence.
- **`infrastructure`**: Docker Compose configurations for PostgreSQL and Redis.

## Quickstart Guide

### 1. Backend (Spring Boot 3 + Java 21)
```powershell
cd backend
# Set JAVA_HOME to Java 21 if not globally set
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.12.1"
mvn spring-boot:run
```
The backend starts at `http://localhost:8080`.

### 2. Frontend Dashboard
```powershell
cd apps/dashboard
npm install
npm run dev
```
The dashboard starts at `http://localhost:5173`.

### 3. Chrome Extension
```powershell
cd apps/extension
npm install
npm run build
```
Load the `apps/extension/dist` folder as an Unpacked Extension in Chrome (`chrome://extensions`).
