const requestBtn = document.getElementById('requestBtn') as HTMLButtonElement;
const closeTabBtn = document.getElementById('closeTabBtn') as HTMLButtonElement;
const statusContainer = document.getElementById('statusContainer') as HTMLDivElement;
const meterBox = document.getElementById('meterBox') as HTMLDivElement;
const meterFill = document.getElementById('meterFill') as HTMLDivElement;
const meterText = document.getElementById('meterText') as HTMLSpanElement;

async function checkCurrentPermission() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (res.state === 'granted') {
        await startMicCapture();
      }
    }
  } catch (e) {
    console.debug('Permissions API query fallback', e);
  }
}

async function startMicCapture() {
  try {
    requestBtn.disabled = true;
    requestBtn.textContent = 'Requesting Microphone Access...';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    await chrome.storage.local.set({ micPermissionGranted: true });
    onPermissionGranted();
    startAudioMeter(stream);
  } catch (err: any) {
    requestBtn.disabled = false;
    requestBtn.textContent = 'Retry Microphone Permission';
    statusContainer.innerHTML = `
      <div class="status-pill status-error">
        <span>Permission Denied or Microphone Unavailable</span>
      </div>
      <p style="margin-top: 12px; margin-bottom: 0; font-size: 12.5px; color: #fca5a5;">
        Click the site settings icon in the Chrome address bar and set Microphone to "Allow".
      </p>
    `;
  }
}

function onPermissionGranted() {
  requestBtn.style.display = 'none';
  meterBox.style.display = 'block';
  if (closeTabBtn) {
    closeTabBtn.style.display = 'block';
  }
  statusContainer.innerHTML = `
    <div class="status-pill status-granted">
      <span>✓ Microphone Access Verified &amp; Enabled</span>
    </div>
    <p style="margin-top: 14px; margin-bottom: 6px; font-size: 13px; color: #94a3b8;">
      Speak now to test your input meter above. Your voice will be automatically mixed with tab audio during live meetings.
    </p>
  `;
}

function startAudioMeter(stream: MediaStream) {
  try {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function update() {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      const pct = Math.min(100, Math.round((avg / 110) * 100));
      meterFill.style.width = `${pct}%`;
      meterText.textContent = pct > 4 ? `Voice Detected (${pct}%)` : 'Listening...';
      requestAnimationFrame(update);
    }
    update();
  } catch (e) {
    console.warn('Meter init error:', e);
  }
}

requestBtn.addEventListener('click', startMicCapture);
if (closeTabBtn) {
  closeTabBtn.addEventListener('click', () => {
    window.close();
  });
}
checkCurrentPermission();
