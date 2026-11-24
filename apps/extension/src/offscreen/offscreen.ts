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

    // 4. Apply 3-Stage Vocal Clarity EQ to Tab Audio on the STT path only (leaves speaker playback untouched):
    //    - 90Hz High-Pass: Removes room rumble, AC hum, and low-frequency boominess
    //    - 260Hz Peaking (-2.5dB): Removes lower-mid vocal muddiness from compressed WebRTC codecs
    //    - 3200Hz Peaking (+4.0dB): Boosts consonant and sibilant presence for higher word recognition accuracy
    const tabHighPass = audioContext.createBiquadFilter();
    tabHighPass.type = 'highpass';
    tabHighPass.frequency.value = 90;

    const tabMudCut = audioContext.createBiquadFilter();
    tabMudCut.type = 'peaking';
    tabMudCut.frequency.value = 260;
    tabMudCut.Q.value = 1.1;
    tabMudCut.gain.value = -2.5;

    const tabPresenceBoost = audioContext.createBiquadFilter();
    tabPresenceBoost.type = 'peaking';
    tabPresenceBoost.frequency.value = 3200;
    tabPresenceBoost.Q.value = 0.9;
    tabPresenceBoost.gain.value = 4.0;

    tabSource.connect(tabHighPass);
    tabHighPass.connect(tabMudCut);
    tabMudCut.connect(tabPresenceBoost);

    // 5. Use a 2-channel merger so Channel 0 = Vocal-EQ Tab Audio and Channel 1 = Vocal-EQ Mic Audio.
    //    This prevents open-mic room noise and speaker echo bleed from degrading remote participant speech accuracy!
    const merger = audioContext.createChannelMerger(2);
    tabPresenceBoost.connect(merger, 0, 0);

    // 6. Capture and condition user's local microphone (90Hz high-pass + 260Hz mud cut + 3.2kHz presence boost + compressor)
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

      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 90;

      const mudCut = audioContext.createBiquadFilter();
      mudCut.type = 'peaking';
      mudCut.frequency.value = 260;
      mudCut.Q.value = 1.1;
      mudCut.gain.value = -2.5;

      const presenceBoost = audioContext.createBiquadFilter();
      presenceBoost.type = 'peaking';
      presenceBoost.frequency.value = 3200;
      presenceBoost.Q.value = 0.9;
      presenceBoost.gain.value = 4.0;

      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 15;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.12;

      micSource.connect(highPass);
      highPass.connect(mudCut);
      mudCut.connect(presenceBoost);
      presenceBoost.connect(compressor);
      compressor.connect(merger, 0, 1);
      hasMicConnected = true;
    } catch (micErr) {
      console.warn('[Vinxa Offscreen] Local microphone not available or denied:', micErr);
    }

    // 7. Connect to Vinxa Backend Realtime Audio WebSocket & Live Event WebSocket immediately
    connectAudioWebSocket(meetingId, ticket, language);
    connectEventWebSocket(meetingId);

    // Adaptive Target-RMS Envelope Automatic Gain Control (AGC) state for smooth -16 dBFS (0.15 RMS) normalization
    let smoothedTabGain = 1.35;
    let smoothedMicGain = 1.45;
    const TARGET_SPEECH_RMS = 0.15;
    const MAX_AGC_GAIN = 4.8;

    const processDualChannelSamples = (tabData: Float32Array, micData: Float32Array | null) => {
      if (isStopping) return;
      const len = tabData.length;
      const pcm16Buffer = new ArrayBuffer(len * 2);

      if (isPaused) {
        framesSent++;
        if (framesSent % 45 === 0 && websocket && websocket.readyState === WebSocket.OPEN) {
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

      // Smooth Adaptive AGC for Tab Audio (normalizes quiet remote speakers towards -16 dBFS)
      let tabWeight = 0.0;
      if (tabRms >= 0.0012) {
        const desiredTabGain = Math.min(MAX_AGC_GAIN, Math.max(0.95, TARGET_SPEECH_RMS / (tabRms + 0.002)));
        // Fast attack (0.35) to prevent clipping when speaker gets loud, smooth release (0.12) to lift quiet voices
        const alpha = desiredTabGain < smoothedTabGain ? 0.35 : 0.12;
        smoothedTabGain = smoothedTabGain * (1 - alpha) + desiredTabGain * alpha;
        tabWeight = smoothedTabGain;
      }

      // Smart Anti-Echo Gate + Smooth Adaptive AGC for Local Microphone
      let micWeight = 0.0;
      if (micData && micRms >= 0.0025) {
        if (tabRms > 0.0045 && micRms < tabRms * 1.55) {
          // Suppress laptop speaker echo bleed during active remote speech
          micWeight = 0.0;
        } else {
          const desiredMicGain = Math.min(MAX_AGC_GAIN, Math.max(1.0, TARGET_SPEECH_RMS / (micRms + 0.002)));
          const alpha = desiredMicGain < smoothedMicGain ? 0.35 : 0.14;
          smoothedMicGain = smoothedMicGain * (1 - alpha) + desiredMicGain * alpha;
          micWeight = smoothedMicGain;
        }
      }

      const view = new DataView(pcm16Buffer);
      let combinedSumSq = 0;
      for (let i = 0; i < len; i++) {
        let sample = tabData[i] * tabWeight + (micData ? micData[i] * micWeight : 0);
        // Smooth soft-knee saturation prevents harmonic clipping distortion across Mel-spectrogram bins
        if (sample > 0.85 || sample < -0.85) {
          sample = Math.tanh(sample);
        }
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

      if (framesSent % 40 === 0) {
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

    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0.0;
    silentGain.connect(audioContext.destination);

    // 8. Prefer off-main-thread AudioWorkletProcessor (512 samples = 32ms ultra-low latency at 16kHz)
    //    with automatic fallback to 512-sample ScriptProcessorNode
    let workletActive = false;
    if (audioContext.audioWorklet) {
      try {
        const workletCode = `
          class VinxaCaptureWorklet extends AudioWorkletProcessor {
            constructor() {
              super();
              this.ch0 = new Float32Array(512);
              this.ch1 = new Float32Array(512);
              this.offset = 0;
            }
            process(inputs) {
              const input = inputs[0];
              if (!input || input.length === 0) return true;
              const in0 = input[0];
              const in1 = input.length > 1 ? input[1] : null;
              if (!in0) return true;
              const len = in0.length;
              for (let i = 0; i < len; i++) {
                this.ch0[this.offset] = in0[i];
                this.ch1[this.offset] = in1 ? in1[i] : 0;
                this.offset++;
                if (this.offset >= 512) {
                  const out0 = this.ch0.slice();
                  const out1 = this.ch1.slice();
                  this.port.postMessage({ ch0: out0, ch1: out1 }, [out0.buffer, out1.buffer]);
                  this.offset = 0;
                }
              }
              return true;
            }
          }
          registerProcessor('vinxa-capture-worklet', VinxaCaptureWorklet);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        const workletNode = new AudioWorkletNode(audioContext, 'vinxa-capture-worklet', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 2,
          channelCountMode: 'explicit'
        });
        workletNode.port.onmessage = (ev) => {
          const { ch0, ch1 } = ev.data;
          processDualChannelSamples(ch0, hasMicConnected ? ch1 : null);
        };
        merger.connect(workletNode);
        workletNode.connect(silentGain);
        workletActive = true;
      } catch (workletErr) {
        console.warn('[Vinxa Offscreen] AudioWorklet fallback to ScriptProcessor:', workletErr);
      }
    }

    if (!workletActive) {
      // Ultra-low-latency 512-sample processor (32ms per frame at 16kHz) with 2 input channels
      const processor = audioContext.createScriptProcessor(512, 2, 1);
      merger.connect(processor);
      processor.connect(silentGain);
      processor.onaudioprocess = (e) => {
        const tabData = e.inputBuffer.getChannelData(0);
        const micData =
          hasMicConnected && e.inputBuffer.numberOfChannels > 1
            ? e.inputBuffer.getChannelData(1)
            : null;
        processDualChannelSamples(tabData, micData);
      };
    }

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
