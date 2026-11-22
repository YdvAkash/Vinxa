let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let websocket: WebSocket | null = null;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'START_OFFSCREEN_CAPTURE') {
    await startCapture(message.streamId, message.meetingId);
  } else if (message.type === 'STOP_OFFSCREEN_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(streamId: string, meetingId: string) {
  try {
    // 1. Acquire MediaStream using the streamId from tabCapture
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      } as unknown as MediaTrackConstraints,
      video: false
    });

    // 2. Preserve audible playback to local speaker
    audioContext = new AudioContext({ sampleRate: 16000 });
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    sourceNode.connect(audioContext.destination);

    // 3. Setup WebSocket connection to Vinxa backend
    websocket = new WebSocket(`ws://localhost:8080/ws/audio?meetingId=${encodeURIComponent(meetingId)}`);
    websocket.binaryType = 'arraybuffer';

    websocket.onopen = () => {
      // Send session init frame
      websocket?.send(JSON.stringify({
        type: 'START_SESSION',
        meetingId,
        sampleRate: 16000,
        channels: 1,
        encoding: 'linear16'
      }));
    };

    // 4. Capture raw PCM16 audio via ScriptProcessorNode / AudioWorklet
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    sourceNode.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (websocket?.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16Buffer = new ArrayBuffer(inputData.length * 2);
      const view = new DataView(pcm16Buffer);

      for (let i = 0; i < inputData.length; i++) {
        // Clamp and convert float32 [-1.0, 1.0] to int16 [-32768, 32767]
        const s = Math.max(-1, Math.min(1, inputData[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // little-endian
      }

      websocket.send(pcm16Buffer);
    };
  } catch (err) {
    console.error('Audio capture failed:', err);
  }
}

function stopCapture() {
  if (websocket?.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ type: 'STOP_SESSION' }));
    websocket.close();
  }
  websocket = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
}
