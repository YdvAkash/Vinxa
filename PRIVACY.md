# Privacy Policy — Vinxa Live (AI Meeting Intelligence Extension & Web Workspace)

**Effective Date:** November 24, 2026  
**Product:** Vinxa Live Browser Extension & Web Dashboard (`vinxa.ogakash.xyz`)

## 1. Overview & Single Purpose
Vinxa Live is an AI meeting assistant designed for browser-based video meetings on Google Meet, Microsoft Teams Web, and Zoom Web. It captures meeting audio only when explicitly started by an authenticated user after confirming participant consent, provides real-time on-screen captions and translations, and generates post-meeting transcripts, summaries, and action items.

## 2. Data We Collect
When you use the Vinxa Live browser extension, we collect and process only the data strictly necessary to provide the service:

1. **Personally Identifiable Information (Email Address):**
   - Your email address is collected when you register or sign in to link your meeting transcripts and summaries to your Vinxa Live workspace account.
2. **Authentication Information:**
   - Your password (hashed with bcrypt on the backend) and JSON Web Token (JWT) session credentials stored locally in `chrome.storage.local` to authenticate API requests.
3. **Website Content (Audio & Meeting Transcripts):**
   - When you explicitly click **"Start Live Meeting Capture"** and confirm participant consent, the extension captures tab audio from the active meeting tab (`meet.google.com`, `teams.microsoft.com`, `teams.live.com`, or `zoom.us`) and optional microphone audio to stream to the Vinxa Live backend for real-time speech-to-text transcription and AI meeting summarization.
   - Raw audio streams are processed ephemerally in real time for speech-to-text transcription and are not permanently stored as raw audio files.

## 3. Data We Do Not Collect
- We do **not** collect health information, financial or payment information, physical location/GPS data, general web browsing history outside supported meeting platforms, or keystroke/mouse tracking data.
- The extension does **not** record or capture any audio automatically in the background without explicit user initiation and participant consent confirmation.

## 4. How We Use & Protect Your Data
- All data is transmitted strictly to the Vinxa Live backend (`api.vinxa.ogakash.xyz`) and authorized speech-to-text / AI summarization providers solely to deliver real-time transcription, translation, and meeting summaries to the user.
- **No Sale of Data:** We never sell, rent, or trade user data to third parties.
- **No Advertising or Credit Use:** We never use or transfer user data for personalized advertising, creditworthiness evaluation, or lending purposes.

## 5. Data Retention & Deletion
- Users can delete any meeting transcript, summary, or action item at any time from the Vinxa Live Web Dashboard (`vinxa.ogakash.xyz`), or configure automatic retention purge windows in Settings.

## 6. Contact
For privacy inquiries or data deletion requests, please contact the developer via the official repository at `https://github.com/YdvAkash/Vinxa`.
