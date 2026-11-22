import { detectPlatformFromUrl } from '../adapters/detector';

const platform = detectPlatformFromUrl(window.location.href);

if (platform !== 'UNKNOWN') {
  // Notify extension of detected meeting tab
  chrome.runtime.sendMessage({
    type: 'TAB_PLATFORM_DETECTED',
    platform,
    url: window.location.href,
    title: document.title
  });
}
