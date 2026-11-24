package com.vinxa.live.stt;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class DeepgramStreamingProviderTest {

    @Test
    void testMultiSpeakerIntraUtteranceSplit() {
        SyntheticStreamingProvider fallback = new SyntheticStreamingProvider();
        DeepgramStreamingProvider provider = new DeepgramStreamingProvider("test-key-no-connect", fallback);

        UUID meetingId = UUID.randomUUID();
        List<TranscriptEvent> receivedEvents = new ArrayList<>();

        // Register consumer directly by starting session (will attempt async connect in background)
        provider.startSession(meetingId, "en", receivedEvents::add);

        // Simulate Deepgram final JSON containing two distinct speakers (0 and 1) in one utterance
        String multiSpeakerJson = """
                {
                  "type": "Results",
                  "is_final": true,
                  "start": 10.0,
                  "duration": 4.5,
                  "channel": {
                    "alternatives": [
                      {
                        "transcript": "Can we deploy the release today? Yes the migration tests passed.",
                        "confidence": 0.96,
                        "words": [
                          {"word": "can", "punctuated_word": "Can", "start": 10.0, "end": 10.3, "confidence": 0.98, "speaker": 0},
                          {"word": "we", "punctuated_word": "we", "start": 10.3, "end": 10.5, "confidence": 0.97, "speaker": 0},
                          {"word": "deploy", "punctuated_word": "deploy", "start": 10.5, "end": 10.9, "confidence": 0.99, "speaker": 0},
                          {"word": "the", "punctuated_word": "the", "start": 10.9, "end": 11.1, "confidence": 0.95, "speaker": 0},
                          {"word": "release", "punctuated_word": "release", "start": 11.1, "end": 11.5, "confidence": 0.96, "speaker": 0},
                          {"word": "today", "punctuated_word": "today?", "start": 11.5, "end": 12.0, "confidence": 0.97, "speaker": 0},
                          {"word": "yes", "punctuated_word": "Yes", "start": 12.4, "end": 12.7, "confidence": 0.94, "speaker": 1},
                          {"word": "the", "punctuated_word": "the", "start": 12.7, "end": 12.9, "confidence": 0.93, "speaker": 1},
                          {"word": "migration", "punctuated_word": "migration", "start": 12.9, "end": 13.5, "confidence": 0.96, "speaker": 1},
                          {"word": "tests", "punctuated_word": "tests", "start": 13.5, "end": 13.9, "confidence": 0.95, "speaker": 1},
                          {"word": "passed", "punctuated_word": "passed.", "start": 13.9, "end": 14.5, "confidence": 0.97, "speaker": 1}
                        ]
                      }
                    ]
                  }
                }
                """;

        provider.handleDeepgramMessage(meetingId, multiSpeakerJson);

        assertEquals(2, receivedEvents.size(), "Utterance with 2 speakers must be split into 2 distinct TranscriptEvents");

        TranscriptEvent turn1 = receivedEvents.get(0);
        assertEquals("speaker-1", turn1.speakerKey());
        assertEquals("Speaker 1", turn1.speakerName());
        assertEquals("Can we deploy the release today?", turn1.text());
        assertEquals(10000L, turn1.startMs());
        assertEquals(12000L, turn1.endMs());
        assertTrue(turn1.isFinal());

        TranscriptEvent turn2 = receivedEvents.get(1);
        assertEquals("speaker-2", turn2.speakerKey());
        assertEquals("Speaker 2", turn2.speakerName());
        assertEquals("Yes the migration tests passed.", turn2.text());
        assertEquals(12400L, turn2.startMs());
        assertEquals(14500L, turn2.endMs());
        assertTrue(turn2.isFinal());

        provider.stopSession(meetingId);
    }

    @Test
    void testInterimEventTracksLatestActiveSpeaker() {
        SyntheticStreamingProvider fallback = new SyntheticStreamingProvider();
        DeepgramStreamingProvider provider = new DeepgramStreamingProvider("test-key-no-connect", fallback);

        UUID meetingId = UUID.randomUUID();
        List<TranscriptEvent> receivedEvents = new ArrayList<>();
        provider.startSession(meetingId, "en", receivedEvents::add);

        String interimJson = """
                {
                  "type": "Results",
                  "is_final": false,
                  "start": 20.0,
                  "duration": 1.8,
                  "channel": {
                    "alternatives": [
                      {
                        "transcript": "I agree with that approach",
                        "confidence": 0.91,
                        "words": [
                          {"word": "i", "start": 20.0, "end": 20.2, "speaker": 2},
                          {"word": "agree", "start": 20.2, "end": 20.6, "speaker": 2}
                        ]
                      }
                    ]
                  }
                }
                """;

        provider.handleDeepgramMessage(meetingId, interimJson);

        assertEquals(1, receivedEvents.size());
        TranscriptEvent interim = receivedEvents.get(0);
        assertEquals("TRANSCRIPT_INTERIM", interim.type());
        assertFalse(interim.isFinal());
        assertEquals("speaker-3", interim.speakerKey());
        assertEquals("Speaker 3", interim.speakerName());
        assertEquals("I agree with that approach", interim.text());

        provider.stopSession(meetingId);
    }

    @Test
    void testResolveBestModelAndNoiseFiltering() {
        SyntheticStreamingProvider fallback = new SyntheticStreamingProvider();
        DeepgramStreamingProvider provider = new DeepgramStreamingProvider("test-key-no-connect", fallback);

        assertEquals("nova-3", provider.resolveBestModelForLanguage("multi"));
        assertEquals("nova-3", provider.resolveBestModelForLanguage("en"));
        assertEquals("nova-3", provider.resolveBestModelForLanguage("en-IN"));
        assertEquals("nova-2", provider.resolveBestModelForLanguage("hi"));

        UUID meetingId = UUID.randomUUID();
        List<TranscriptEvent> receivedEvents = new ArrayList<>();
        provider.startSession(meetingId, "multi", receivedEvents::add);

        // Low-confidence 2-char breath/cough noise token should be filtered out
        String noiseJson = """
                {
                  "type": "Results",
                  "is_final": true,
                  "start": 5.0,
                  "duration": 0.3,
                  "channel": {
                    "alternatives": [
                      {
                        "transcript": "uh",
                        "confidence": 0.18,
                        "words": []
                      }
                    ]
                  }
                }
                """;
        provider.handleDeepgramMessage(meetingId, noiseJson);
        assertTrue(receivedEvents.isEmpty(), "Low-confidence short noise tokens should be filtered out");

        provider.stopSession(meetingId);
    }
}
