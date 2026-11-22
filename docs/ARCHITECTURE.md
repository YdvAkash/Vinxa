# Vinxa Live — Architecture Blueprint

## 1. System Topology
- **Chrome Extension (MV3)**: Content script platform detector, Popup control UI, Offscreen document running `chrome.tabCapture` & `AudioWorklet` for linear16 PCM conversion at 16 kHz.
- **Web Dashboard**: React 18/19 SPA built with Vite, TypeScript, and Tailwind CSS.
- **Backend Service**: Spring Boot 3 with Java 21 modular monolith providing REST APIs, JWT authentication, binary WebSocket audio ingestion, and LLM orchestration.
- **STT & Diarization**: Pluggable server-side streaming STT client (Deepgram Live streaming with synthetic local provider fallback).
- **Post-Meeting Intelligence**: LLM prompt pipeline yielding structured summaries, decisions with evidence segment IDs, and prioritized action items.
- **Data Layer**: PostgreSQL with Flyway migrations and GIN full-text index on transcript content (with automatic H2 in-memory dev profile support).
