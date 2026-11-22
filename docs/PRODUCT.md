# Vinxa Live — Product Specification

## 1. Product Overview
Vinxa Live is an enterprise AI meeting intelligence assistant designed for browser-based meetings (Google Meet, Microsoft Teams web, and Zoom web) in Google Chrome.

## 2. Core Value Proposition
- Seamless tab audio capture using Chrome Manifest V3 without bulky bot joins.
- Real-time streaming transcription with speaker diarization.
- Structured post-meeting intelligence (overview, decisions with evidence IDs, action items, open questions).
- Ethical consent workflow with persistent visible indicators and user-initiated controls.
- Full-text search, Markdown/PDF export, and verifiable multi-resource deletion.

## 3. Supported Platforms (Chrome Browser)
1. **Google Meet Web**: `meet.google.com`
2. **Microsoft Teams Web**: `teams.microsoft.com`
3. **Zoom Web**: `zoom.us` (web client)

## 4. Non-Goals for Initial Release
- Native desktop application capture (standalone Teams/Zoom desktop client).
- Video recording or computer vision processing.
- Voice biometric identity verification (diarization is acoustic turn tracking only).
- Automatic silent recording without participant notice.
