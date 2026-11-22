import { detectPlatformFromUrl } from '../adapters/detector';
import { ExtensionRecordingState, MeetingPlatform } from '../adapters/types';

let currentState: ExtensionRecordingState = 'IDLE';
let activeMeetingPlatform: MeetingPlatform = 'UNKNOWN';
let activeTabId: number | null = null;
let activeMeetingId: string | null = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      state: currentState,
      platform: activeMeetingPlatform,
      tabId: activeTabId,
      meetingId: activeMeetingId
    });
    return true;
  }

  if (message.type === 'START_CAPTURE') {
    handleStartCapture(message.tabId, message.platform, message.meetingId)
      .then((res) => sendResponse({ success: true, res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'STOP_CAPTURE') {
    handleStopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleStartCapture(tabId: number, platform: MeetingPlatform, meetingId: string) {
  currentState = 'STARTING';
  activeTabId = tabId;
  activeMeetingPlatform = platform;
  activeMeetingId = meetingId;

  // Obtain stream ID for tab audio capture
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(id);
      }
    });
  });

  // Ensure offscreen document exists
  await ensureOffscreenDocument();

  // Instruct offscreen document to start capture and streaming
  chrome.runtime.sendMessage({
    type: 'START_OFFSCREEN_CAPTURE',
    streamId,
    meetingId
  });

  currentState = 'RECORDING';
  return { streamId };
}

async function handleStopCapture() {
  currentState = 'STOPPING';
  chrome.runtime.sendMessage({ type: 'STOP_OFFSCREEN_CAPTURE' });
  currentState = 'COMPLETED';
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Capturing meeting tab audio for real-time transcription'
    });
  }
}

// Monitor active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url) {
      const platform = detectPlatformFromUrl(tab.url);
      if (currentState === 'IDLE' && platform !== 'UNKNOWN') {
        currentState = 'PLATFORM_DETECTED';
        activeMeetingPlatform = platform;
        activeTabId = tab.id ?? null;
      }
    }
  } catch {
    // tab access or closed tab
  }
});
