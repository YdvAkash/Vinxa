function detectPlatformFromUrl(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'meet.google.com') {
      return 'GOOGLE_MEET';
    }

    if (hostname === 'teams.microsoft.com' || hostname.endsWith('.teams.microsoft.com') || hostname === 'teams.live.com') {
      return 'MICROSOFT_TEAMS';
    }

    if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) {
      return 'ZOOM';
    }

    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

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
