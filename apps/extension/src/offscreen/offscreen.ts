import { resolveExtensionEndpoints } from '../config';

let mediaStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let websocket: WebSocket | null = null;
let eventWebsocket: WebSocket | null = null;
let audioReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let eventReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let framesSent = 0;
let isPaused = false;
let isStopping = false;
let activeWsBase = 'ws://localhost:8080';
let activeMeetingId = '';
let activeTicket = '';
let activeLanguage = 'multi';

// Bounded buffer of PCM16 frames during initial connect or transient WebSocket reconnection
const MAX_BUFFERED_FRAMES = 60;
const pendingPcmFrames: ArrayBuffer[] = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_CAPTURE') {
    isPaused = false;
    isStopping = false;
    startCapture(
      message.streamId,
      message.meetingId,
      message.ticket,
      message.language,
      message.wsBase
    )
      .then((res) => sendResponse({ success: true, res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.type === 'PAUSE_OFFSCREEN_CAPTURE') {
    isPaused = true;
    sendResponse({ success: true, isPaused: true });
    return true;
  } else if (message.type === 'RESUME_OFFSCREEN_CAPTURE') {
    isPaused = false;
    sendResponse({ success: true, isPaused: false });
    return true;
  } else if (message.type === 'SYNC_OFFSCREEN_JOINEES') {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      try {
        websocket.send(
          JSON.stringify({
            type: 'SYNC_JOINEES',
            joinees: message.joinees || [],
            activeSpeaker: message.activeSpeaker || null
          })
        );
      } catch {}
    }
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'STOP_OFFSCREEN_CAPTURE') {
    isPaused = false;
    isStopping = true;
    stopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

function connectAudioWebSocket(meetingId: string, ticket?: string, language: string = 'multi') {
  if (isStopping || !mediaStream) return;
  try {
    if (websocket) {
      websocket.onclose = null;
      websocket.onerror = null;
      try {
        websocket.close();
      } catch {}
    }

    const ticketParam = ticket ? `&ticket=${encodeURIComponent(ticket)}` : '';
    const langParam = `&language=${encodeURIComponent(language || 'multi')}`;
    const ws = new WebSocket(
      `${activeWsBase}/ws/audio?meetingId=${encodeURIComponent(meetingId)}${ticketParam}${langParam}`
    );
    ws.binaryType = 'arraybuffer';
    websocket = ws;

    ws.onopen = () => {
      if (isStopping) {
        ws.close();
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'START_SESSION',
          meetingId,
          language: language || 'multi',
          sampleRate: 16000,
          channels: 1,
          encoding: 'linear16'
        })
      );
      while (pendingPcmFrames.length > 0 && ws.readyState === WebSocket.OPEN) {
        const frame = pendingPcmFrames.shift();
        if (frame) ws.send(frame);
      }
    };

    ws.onclose = () => {
      if (isStopping || !mediaStream) return;
      if (audioReconnectTimer) clearTimeout(audioReconnectTimer);
      audioReconnectTimer = setTimeout(() => {
        if (!isStopping && mediaStream) {
          connectAudioWebSocket(activeMeetingId, activeTicket, activeLanguage);
        }
      }, 800);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  } catch (e) {
    console.warn('[Vinxa Offscreen] Audio WS connect error:', e);
  }
}

async function startCapture(
  streamId: string,
  meetingId: string,
  ticket?: string,
  language: string = 'multi',
  wsBase?: string
) {
  try {
    framesSent = 0;
    isPaused = false;
    isStopping = false;
    pendingPcmFrames.length = 0;
    activeMeetingId = meetingId;
    activeTicket = ticket || '';
    activeLanguage = language || 'multi';

    if (wsBase) {
      activeWsBase = wsBase;
    } else {
      const endpoints = await resolveExtensionEndpoints();
      activeWsBase = endpoints.wsBase;
    }

    // 1. Acquire MediaStream from target meeting tab
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      } as unknown as MediaTrackConstraints,
      video: false
    });

    // 2. Setup AudioContext at 16kHz with interactive latency hint
    audioContext = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // 3. Play tab audio directly to speakers so user hears remote meeting participants clearly
    const tabSource = audioContext.createMediaStreamSource(mediaStream);
    tabSource.connect(audioContext.destination);

    // 4. Use a 2-channel merger so Channel 0 = Pure Digital Tab Audio and Channel 1 = Filtered Mic Audio.
    // This prevents open-mic room noise and speaker echo bleed from degrading remote participant speech accuracy!
    const merger = audioContext.createChannelMerger(2);
    tabSource.connect(merger, 0, 0);

    // 5. Capture and condition user's local microphone (85Hz high-pass + vocal presence boost + compressor)
    let hasMicConnected = false;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
        video: false
      });
      const micSource = audioContext.createMediaStreamSource(micStream);

      // High-pass filter at 85Hz removes low-frequency hum, fan rumble, and desk vibration
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 85;

      // Presence boost at 2.8kHz improves consonant intelligibility for speech-to-text accuracy
      const presenceBoost = audioContext.createBiquadFilter();
      presenceBoost.type = 'peaking';
      presenceBoost.frequency.value = 2800;
      presenceBoost.Q.value = 1.0;
      presenceBoost.gain.value = 3.0;

      // Dynamics compressor levels quiet vs loud speech without clipping
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 18;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;

      micSource.connect(highPass);
      highPass.connect(presenceBoost);
      presenceBoost.connect(compressor);
      compressor.connect(merger, 0, 1);
      hasMicConnected = true;
    } catch (micErr) {
      console.warn('[Vinxa Offscreen] Local microphone not available or denied:', micErr);
    }

    // 6. Create ultra-low-latency 1024-sample processor (64ms per frame at 16kHz) with 2 input channels
    const processor = audioContext.createScriptProcessor(1024, 2, 1);
    merger.connect(processor);

    // 7. Connect processor to muted gain node to keep Web Audio graph active
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0.0;
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    // 8. Connect to Vinxa Backend Realtime Audio WebSocket & Live Event WebSocket
    connectAudioWebSocket(meetingId, ticket, language);
    connectEventWebSocket(meetingId);

    // 9. Smart Anti-Echo & Noise-Gated DSP Mixer -> 16-bit Linear PCM stream
    processor.onaudioprocess = (e) => {
      if (isStopping) return;

      const tabData = e.inputBuffer.getChannelData(0);
      const micData = hasMicConnected && e.inputBuffer.numberOfChannels > 1
        ? e.inputBuffer.getChannelData(1)
        : null;
      const len = tabData.length;
      const pcm16Buffer = new ArrayBuffer(len * 2);

      if (isPaused) {
        framesSent++;
        if (framesSent % 35 === 0 && websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.send(pcm16Buffer);
          chrome.runtime
            .sendMessage({
              type: 'AUDIO_STATS',
              framesSent,
              rms: 0,
              isTransmitting: false
            })
            .catch(() => {});
        }
        return;
      }

      // Compute independent RMS energy for Tab Audio vs Mic Audio
      let tabSumSq = 0;
      let micSumSq = 0;
      for (let i = 0; i < len; i++) {
        const t = tabData[i];
        tabSumSq += t * t;
        if (micData) {
          const m = micData[i];
          micSumSq += m * m;
        }
      }
      const tabRms = Math.sqrt(tabSumSq / len);
      const micRms = micData ? Math.sqrt(micSumSq / len) : 0;

      // Determine smart mixing weights to eliminate speaker echo bleed and mic background hiss:
      // - If remote tab audio is active (tabRms > 0.005) and mic is not significantly louder than tab audio,
      //   mute the mic channel so laptop speaker echo never double-records remote participants.
      // - If mic energy is below the noise floor (micRms < 0.0025), gate out mic background static.
      let micWeight = 0.0;
      if (micData && micRms >= 0.0025) {
        if (tabRms > 0.005 && micRms < tabRms * 1.45) {
          micWeight = 0.0; // Suppress acoustic echo bleed from speakers during remote speech
        } else {
          // Boost quiet local microphone voice cleanly towards optimal STT level
          micWeight = micRms < 0.04 ? 1.45 : 1.15;
        }
      }

      const tabWeight = tabRms > 0.001 && tabRms < 0.04 ? 1.25 : 1.0;

      const view = new DataView(pcm16Buffer);
      let combinedSumSq = 0;
      for (let i = 0; i < len; i++) {
        let sample = tabData[i] * tabWeight + (micData ? micData[i] * micWeight : 0);
        // Soft-knee limiter prevents harsh digital clipping
        if (sample > 1.0) sample = 1.0;
        else if (sample < -1.0) sample = -1.0;
        view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        combinedSumSq += sample * sample;
      }

      if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(pcm16Buffer);
      } else {
        if (pendingPcmFrames.length >= MAX_BUFFERED_FRAMES) {
          pendingPcmFrames.shift();
        }
        pendingPcmFrames.push(pcm16Buffer);
      }
      framesSent++;

      if (framesSent % 30 === 0) {
        const rms = Math.sqrt(combinedSumSq / len);
        chrome.runtime
          .sendMessage({
            type: 'AUDIO_STATS',
            framesSent,
            rms,
            isTransmitting: Boolean(websocket && websocket.readyState === WebSocket.OPEN)
          })
          .catch(() => {});
      }
    };

    return { framesSent: 0, status: 'STARTED' };
  } catch (err: any) {
    console.error('[Vinxa Offscreen] Audio capture initialization failed:', err);
    await stopCapture();
    throw err;
  }
}

function connectEventWebSocket(meetingId: string) {
  if (isStopping) return;
  try {
    if (eventWebsocket) {
      eventWebsocket.onclose = null;
      eventWebsocket.close();
    }
    eventWebsocket = new WebSocket(
      `${activeWsBase}/ws/events?meetingId=${encodeURIComponent(meetingId)}`
    );
    eventWebsocket.onmessage = (ev) => {
      if (isPaused) return;
      try {
        const data = JSON.parse(ev.data);
        if (
          data.type === 'TRANSCRIPT_INTERIM' ||
          data.type === 'TRANSCRIPT' ||
          data.type === 'SPEAKER_RENAMED'
        ) {
          chrome.runtime
            .sendMessage({
              type: 'LIVE_TRANSCRIPT_EVENT',
              meetingId,
              event: data
            })
            .catch(() => {});
        }
      } catch (e) {
        console.warn('[Vinxa Offscreen] Event parse error:', e);
      }
    };
    eventWebsocket.onclose = () => {
      if (!isStopping && mediaStream) {
        if (eventReconnectTimer) clearTimeout(eventReconnectTimer);
        eventReconnectTimer = setTimeout(() => {
          if (!isStopping && mediaStream) connectEventWebSocket(meetingId);
        }, 1000);
      }
    };
  } catch (e) {
    console.warn('[Vinxa Offscreen] Event WS connect error:', e);
  }
}

async function stopCapture(): Promise<void> {
  isStopping = true;
  pendingPcmFrames.length = 0;

  if (audioReconnectTimer) {
    clearTimeout(audioReconnectTimer);
    audioReconnectTimer = null;
  }
  if (eventReconnectTimer) {
    clearTimeout(eventReconnectTimer);
    eventReconnectTimer = null;
  }

  if (eventWebsocket) {
    try {
      eventWebsocket.onclose = null;
      eventWebsocket.close();
    } catch (e) {}
    eventWebsocket = null;
  }

  if (websocket) {
    try {
      websocket.onclose = null;
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'STOP_SESSION' }));
      }
      websocket.close();
    } catch (e) {}
    websocket = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (e) {}
    });
    mediaStream = null;
  }

  if (micStream) {
    micStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (e) {}
    });
    micStream = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    try {
      await audioContext.close();
    } catch (e) {}
    audioContext = null;
  }
}
