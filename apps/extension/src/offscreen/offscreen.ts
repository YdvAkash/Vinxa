import { resolveExtensionEndpoints } from '../config';

let mediaStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let websocket: WebSocket | null = null;
let eventWebsocket: WebSocket | null = null;
let framesSent = 0;
let isPaused = false;
let activeWsBase = 'ws://localhost:8080';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_CAPTURE') {
    isPaused = false;
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
  } else if (message.type === 'STOP_OFFSCREEN_CAPTURE') {
    isPaused = false;
    stopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

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

    // 2. Setup AudioContext at 16kHz
    audioContext = new AudioContext({ sampleRate: 16000 });
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // 3. Play tab audio to speakers so user hears other meeting participants
    const tabSource = audioContext.createMediaStreamSource(mediaStream);
    tabSource.connect(audioContext.destination);

    // 4. Create ScriptProcessorNode (4096 buffer size, 1 channel in, 1 channel out)
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    tabSource.connect(processor);

    // 5. Connect processor to muted gain node to satisfy Web Audio active graph requirement
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0.0;
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    // 6. Capture and mix user's local microphone so speech is transcribed even when alone or muted in Meet
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(processor);
    } catch (micErr) {
      console.warn('[Vinxa Offscreen] Local microphone not available or denied:', micErr);
    }

    // 7. Connect to Vinxa Backend Realtime Audio WebSocket
    const ticketParam = ticket ? `&ticket=${encodeURIComponent(ticket)}` : '';
    const langParam = `&language=${encodeURIComponent(language || 'multi')}`;
    websocket = new WebSocket(
      `${activeWsBase}/ws/audio?meetingId=${encodeURIComponent(meetingId)}${ticketParam}${langParam}`
    );
    websocket.binaryType = 'arraybuffer';

    websocket.onopen = () => {
      websocket?.send(
        JSON.stringify({
          type: 'START_SESSION',
          meetingId,
          language: language || 'multi',
          sampleRate: 16000,
          channels: 1,
          encoding: 'linear16'
        })
      );
    };

    // 8. Connect to Vinxa Backend Live Transcript Event WebSocket
    connectEventWebSocket(meetingId);

    // 9. Stream 16-bit Linear PCM audio frames (or silent keep-alive frames when paused)
    processor.onaudioprocess = (e) => {
      if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16Buffer = new ArrayBuffer(inputData.length * 2);

      if (isPaused) {
        // Send zeroed keep-alive buffer every ~2.5s so Deepgram connection stays open while paused
        framesSent++;
        if (framesSent % 10 === 0) {
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

      const view = new DataView(pcm16Buffer);
      let sumSquares = 0;
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        sumSquares += s * s;
      }

      websocket.send(pcm16Buffer);
      framesSent++;

      if (framesSent % 15 === 0) {
        const rms = Math.sqrt(sumSquares / inputData.length);
        chrome.runtime
          .sendMessage({
            type: 'AUDIO_STATS',
            framesSent,
            rms,
            isTransmitting: true
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
        if (data.type === 'TRANSCRIPT_INTERIM' || data.type === 'TRANSCRIPT') {
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
      if (mediaStream) {
        setTimeout(() => {
          if (mediaStream) connectEventWebSocket(meetingId);
        }, 1500);
      }
    };
  } catch (e) {
    console.warn('[Vinxa Offscreen] Event WS connect error:', e);
  }
}

async function stopCapture(): Promise<void> {
  if (eventWebsocket) {
    try {
      eventWebsocket.onclose = null;
      eventWebsocket.close();
    } catch (e) {}
    eventWebsocket = null;
  }

  if (websocket && websocket.readyState === WebSocket.OPEN) {
    try {
      websocket.send(JSON.stringify({ type: 'STOP_SESSION' }));
      websocket.close();
    } catch (e) {}
  }
  websocket = null;

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
