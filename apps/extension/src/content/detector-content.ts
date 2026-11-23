// Vinxa Live — Production On-Screen Live Transcript HUD & Web Dashboard Auth Synchronization Bridge
// 1. On localhost:5173 (Vinxa Web Dashboard): Synchronizes Login / Logout / Settings with the Chrome Extension
// 2. On Google Meet / MS Teams / Zoom: Renders the TrustedTypes-Safe VisionOS Frosted Glass Live Transcript HUD

(function initVinxaContentScript() {
  const currentHref = window.location.href;
  const isVinxaDashboard =
    currentHref.startsWith('http://localhost:5173') ||
    currentHref.startsWith('http://127.0.0.1:5173');

  // ============================================================================
  // MODE 1: VINXA WEB DASHBOARD AUTH & SETTINGS SYNCHRONIZATION BRIDGE
  // ============================================================================
  if (isVinxaDashboard) {
    if ((window as any).__VINXA_AUTH_BRIDGE_ACTIVE__) return;
    (window as any).__VINXA_AUTH_BRIDGE_ACTIVE__ = true;

    function syncDashboardAuthToExtension() {
      try {
        const token = localStorage.getItem('vinxa_token');
        const userRaw = localStorage.getItem('vinxa_user');
        const loggedOut = localStorage.getItem('vinxa_logged_out');

        if (token && userRaw) {
          const user = JSON.parse(userRaw);
          if (user?.email) {
            chrome.runtime
              .sendMessage({
                type: 'SYNC_EXTENSION_AUTH',
                token,
                email: user.email
              })
              .catch(() => {});
            return;
          }
        }

        if (loggedOut === 'true' || !token) {
          chrome.runtime.sendMessage({ type: 'REVOKE_EXTENSION_AUTH' }).catch(() => {});
        }
      } catch {
        // Ignore parse errors
      }
    }

    syncDashboardAuthToExtension();

    window.addEventListener('vinxa-auth-changed', (ev: any) => {
      const detail = ev?.detail;
      if (detail?.token && detail?.user?.email) {
        chrome.runtime
          .sendMessage({
            type: 'SYNC_EXTENSION_AUTH',
            token: detail.token,
            email: detail.user.email
          })
          .catch(() => {});
      } else {
        chrome.runtime.sendMessage({ type: 'REVOKE_EXTENSION_AUTH' }).catch(() => {});
      }
    });

    window.addEventListener('vinxa-settings-changed', (ev: any) => {
      if (ev?.detail) {
        chrome.runtime
          .sendMessage({
            type: 'SYNC_EXTENSION_SETTINGS',
            settings: ev.detail
          })
          .catch(() => {});
      }
    });

    window.addEventListener('storage', () => {
      syncDashboardAuthToExtension();
    });

    return;
  }

  // ============================================================================
  // MODE 2: VISIONOS FROSTED GLASS LIVE TRANSCRIPT & BILINGUAL HUD
  // ============================================================================
  function detectPlatformFromUrl(urlString: string): string {
    try {
      const parsed = new URL(urlString);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'meet.google.com') return 'GOOGLE_MEET';
      if (
        hostname === 'teams.microsoft.com' ||
        hostname.endsWith('.teams.microsoft.com') ||
        hostname === 'teams.live.com'
      ) {
        return 'MICROSOFT_TEAMS';
      }
      if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) return 'ZOOM';
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  const platform = detectPlatformFromUrl(currentHref);
  if (platform === 'UNKNOWN') return;

  // Clean up any previous HUD instance on re-injection
  window.dispatchEvent(new CustomEvent('vinxa-hud-cleanup'));
  const existingHost = document.getElementById('vinxa-live-hud-host');
  if (existingHost) {
    existingHost.remove();
  }

  chrome.runtime
    .sendMessage({
      type: 'TAB_PLATFORM_DETECTED',
      platform,
      url: currentHref,
      title: document.title
    })
    .catch(() => {});

  const SPOKEN_LANGUAGES = [
    { code: 'multi', label: '🌐 Auto Multi-Language' },
    { code: 'hi', label: '🇮🇳 Hindi (हिन्दी)' },
    { code: 'en-IN', label: '🇮🇳 English (India)' },
    { code: 'en-US', label: '🇺🇸 English (US)' },
    { code: 'ja', label: '🇯🇵 Japanese (日本語)' },
    { code: 'es', label: '🇪🇸 Spanish (Español)' },
    { code: 'fr', label: '🇫🇷 French (Français)' },
    { code: 'de', label: '🇩🇪 German (Deutsch)' },
    { code: 'pt', label: '🇧🇷 Portuguese' },
    { code: 'it', label: '🇮🇹 Italian' },
    { code: 'ru', label: '🇷🇺 Russian' },
    { code: 'zh', label: '🇨🇳 Chinese (中文)' },
    { code: 'ko', label: '🇰🇷 Korean (한국어)' }
  ];

  const TRANSLATION_LANGUAGES = [
    { code: 'ORIGINAL', label: '✨ Original Speech' },
    { code: 'Hindi (हिन्दी)', label: '🇮🇳 → Hindi (हिन्दी)' },
    { code: 'English', label: '🇺🇸 → English' },
    { code: 'Japanese (日本語)', label: '🇯🇵 → Japanese' },
    { code: 'Spanish (Español)', label: '🇪🇸 → Spanish' },
    { code: 'French (Français)', label: '🇫🇷 → French' },
    { code: 'German (Deutsch)', label: '🇩🇪 → German' },
    { code: 'Portuguese (Português)', label: '🇧🇷 → Portuguese' },
    { code: 'Arabic (العربية)', label: '🇸🇦 → Arabic' },
    { code: 'Chinese (中文)', label: '🇨🇳 → Chinese' },
    { code: 'Russian (Русский)', label: '🇷🇺 → Russian' }
  ];

  interface Segment {
    id: string;
    speakerKey: string;
    speakerName: string;
    text: string;
    startMs: number;
  }

  type GlassTheme = 'frost' | 'daylight' | 'clear';

  let isRecording = false;
  let isPaused = false;
  let isMinimized = false;
  let dockMode: 'bottom' | 'side' = 'bottom';
  let glassTheme: GlassTheme = 'frost';
  let isAuthenticated = false;
  let userScrolledUp = false;
  let activeMeetingId: string | null = null;
  let startTime: number | null = null;
  let segments: Segment[] = [];
  let interimText = '';
  let spokenLanguage = 'multi';
  let targetTranslation = 'ORIGINAL';
  const translationsCache: Record<string, string> = {};
  const pendingTranslations = new Set<string>();

  const host = document.createElement('div');
  host.id = 'vinxa-live-hud-host';

  function applyDockPosition() {
    if (dockMode === 'side') {
      host.style.cssText =
        'position: fixed; top: 72px; right: 20px; bottom: auto; left: auto; transform: none; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif; pointer-events: auto;';
    } else {
      host.style.cssText =
        'position: fixed; bottom: 86px; left: 50%; top: auto; right: auto; transform: translateX(-50%); z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif; pointer-events: auto;';
    }
  }
  applyDockPosition();

  const mountTarget = document.body || document.documentElement;
  mountTarget.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    /* =========================================================
       VISIONOS LIGHT TRANSPARENT FROSTED GLASS DESIGN SYSTEM
       ========================================================= */
    .hud-card {
      width: min(800px, 92vw);
      /* Default: Light Transparent Frosted Acrylic Glass */
      --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.10) 100%);
      --glass-header-bg: rgba(255, 255, 255, 0.10);
      --glass-border: rgba(255, 255, 255, 0.34);
      --glass-divider: rgba(255, 255, 255, 0.18);
      --glass-pill-bg: rgba(255, 255, 255, 0.16);
      --glass-pill-hover: rgba(255, 255, 255, 0.28);
      --glass-pill-border: rgba(255, 255, 255, 0.30);
      --glass-turn-bg: rgba(255, 255, 255, 0.14);
      --glass-turn-border: rgba(255, 255, 255, 0.24);
      --text-main: #ffffff;
      --text-sub: rgba(255, 255, 255, 0.88);
      --text-muted: rgba(255, 255, 255, 0.72);
      --text-shadow: 0 1px 3px rgba(0, 0, 0, 0.42);
      --glass-blur: blur(22px) saturate(180%);
      --glass-shadow: 0 16px 42px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.45);

      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: 22px;
      color: var(--text-main);
      box-shadow: var(--glass-shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Theme 2: Daylight Pearl (Bright White Translucent Glass) */
    .hud-card.theme-daylight {
      --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.76) 0%, rgba(248, 250, 252, 0.62) 100%);
      --glass-header-bg: rgba(255, 255, 255, 0.45);
      --glass-border: rgba(255, 255, 255, 0.85);
      --glass-divider: rgba(15, 23, 42, 0.09);
      --glass-pill-bg: rgba(255, 255, 255, 0.68);
      --glass-pill-hover: rgba(255, 255, 255, 0.92);
      --glass-pill-border: rgba(15, 23, 42, 0.14);
      --glass-turn-bg: rgba(255, 255, 255, 0.66);
      --glass-turn-border: rgba(255, 255, 255, 0.9);
      --text-main: #0f172a;
      --text-sub: #1e293b;
      --text-muted: #475569;
      --text-shadow: none;
      --glass-shadow: 0 16px 40px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }

    /* Theme 3: Ultra-Clear Ghost Glass (Maximum Video Visibility) */
    .hud-card.theme-clear {
      --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.04) 100%);
      --glass-header-bg: rgba(255, 255, 255, 0.05);
      --glass-border: rgba(255, 255, 255, 0.22);
      --glass-divider: rgba(255, 255, 255, 0.12);
      --glass-pill-bg: rgba(255, 255, 255, 0.12);
      --glass-pill-hover: rgba(255, 255, 255, 0.22);
      --glass-pill-border: rgba(255, 255, 255, 0.24);
      --glass-turn-bg: rgba(255, 255, 255, 0.09);
      --glass-turn-border: rgba(255, 255, 255, 0.18);
      --glass-blur: blur(10px) saturate(140%);
      --glass-shadow: 0 10px 30px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }

    .hud-card.side-mode {
      width: 390px;
      max-width: 90vw;
    }

    .hud-card.minimized {
      width: auto;
      min-width: 320px;
      max-width: 86vw;
      border-radius: 999px;
    }

    /* Single Streamlined Floating Glass Control Bar */
    .hud-header {
      padding: 9px 14px;
      background: var(--glass-header-bg);
      border-bottom: 1px solid var(--glass-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      cursor: move;
      user-select: none;
      flex-wrap: wrap;
    }
    .hud-card.minimized .hud-header {
      border-bottom: none;
      padding: 8px 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text-main);
      text-shadow: var(--text-shadow);
      letter-spacing: -0.01em;
    }

    .dot-wrap {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.22);
      border: 1px solid rgba(16, 185, 129, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .dot-wrap.recording {
      background: rgba(239, 68, 68, 0.24);
      border-color: rgba(239, 68, 68, 0.55);
    }
    .dot-wrap.paused {
      background: rgba(245, 158, 11, 0.24);
      border-color: rgba(245, 158, 11, 0.55);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.8);
    }
    .dot.recording {
      background: #ef4444;
      box-shadow: 0 0 10px #ef4444;
      animation: pulse 1.25s infinite;
    }
    .dot.paused {
      background: #f59e0b;
      box-shadow: 0 0 8px #f59e0b;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.45; transform: scale(1.22); }
    }

    .status-tag {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      backdrop-filter: blur(8px);
    }
    .tag-live {
      background: rgba(239, 68, 68, 0.22);
      color: #fecaca;
      border: 1px solid rgba(239, 68, 68, 0.45);
    }
    .hud-card.theme-daylight .tag-live {
      background: rgba(239, 68, 68, 0.15);
      color: #b91c1c;
    }
    .tag-paused {
      background: rgba(245, 158, 11, 0.22);
      color: #fde68a;
      border: 1px solid rgba(245, 158, 11, 0.45);
    }
    .hud-card.theme-daylight .tag-paused {
      background: rgba(245, 158, 11, 0.18);
      color: #b45309;
    }
    .tag-ready {
      background: rgba(16, 185, 129, 0.22);
      color: #a7f3d0;
      border: 1px solid rgba(16, 185, 129, 0.45);
    }
    .hud-card.theme-daylight .tag-ready {
      background: rgba(16, 185, 129, 0.16);
      color: #047857;
    }

    .timer {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-main);
      background: var(--glass-pill-bg);
      border: 1px solid var(--glass-pill-border);
      padding: 2px 8px;
      border-radius: 999px;
      text-shadow: var(--text-shadow);
    }

    .controls-cluster {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .lang-select {
      background: var(--glass-pill-bg);
      color: var(--text-main);
      text-shadow: var(--text-shadow);
      border: 1px solid var(--glass-pill-border);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      outline: none;
      cursor: pointer;
      max-width: 175px;
      transition: all 0.15s ease;
      backdrop-filter: blur(12px);
    }
    .lang-select:hover, .lang-select:focus {
      background: var(--glass-pill-hover);
      border-color: rgba(16, 185, 129, 0.65);
    }
    .lang-select option {
      background: #0f172a;
      color: #f8fafc;
      text-shadow: none;
    }

    .btn {
      background: var(--glass-pill-bg);
      border: 1px solid var(--glass-pill-border);
      color: var(--text-main);
      text-shadow: var(--text-shadow);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      backdrop-filter: blur(12px);
    }
    .btn:hover {
      background: var(--glass-pill-hover);
      transform: translateY(-0.5px);
    }
    .btn-warn {
      background: rgba(245, 158, 11, 0.25);
      border-color: rgba(245, 158, 11, 0.5);
      color: #fef3c7;
    }
    .hud-card.theme-daylight .btn-warn {
      color: #92400e;
    }
    .btn-danger {
      background: rgba(239, 68, 68, 0.25);
      border-color: rgba(239, 68, 68, 0.5);
      color: #fee2e2;
    }
    .hud-card.theme-daylight .btn-danger {
      color: #991b1b;
    }

    /* Transcript Feed Area */
    .feed-box {
      max-height: 185px;
      overflow-y: auto;
      padding: 10px 14px 12px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    }
    .hud-card.side-mode .feed-box {
      max-height: 390px;
    }

    /* Compact, Sleek Idle/Waiting Banner */
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 8px 14px;
      color: var(--text-sub);
      text-shadow: var(--text-shadow);
      font-size: 12.5px;
      font-weight: 500;
      line-height: 1.45;
      text-align: center;
    }
    .wave-bars {
      display: inline-flex;
      align-items: center;
      gap: 2.5px;
      height: 14px;
      flex-shrink: 0;
    }
    .wave-bar {
      width: 2.5px;
      height: 6px;
      border-radius: 999px;
      background: #10b981;
      animation: waveAnim 1.2s ease-in-out infinite;
    }
    .wave-bar:nth-child(2) {
      height: 12px;
      animation-delay: 0.2s;
    }
    .wave-bar:nth-child(3) {
      height: 8px;
      animation-delay: 0.4s;
    }
    @keyframes waveAnim {
      0%, 100% { transform: scaleY(0.6); opacity: 0.65; }
      50% { transform: scaleY(1.15); opacity: 1; }
    }

    /* Frosted Speech Turn Bubble */
    .turn-item {
      background: var(--glass-turn-bg);
      border: 1px solid var(--glass-turn-border);
      border-left: 3.5px solid #10b981;
      border-radius: 14px;
      padding: 8px 13px;
      font-size: 13.5px;
      line-height: 1.45;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      transition: background 0.15s ease;
    }
    .turn-item.spk-2 { border-left-color: #38bdf8; }
    .turn-item.spk-3 { border-left-color: #fbbf24; }
    .turn-item.spk-4 { border-left-color: #c084fc; }

    .turn-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .turn-speaker {
      color: #6ee7b7;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-shadow: var(--text-shadow);
    }
    .hud-card.theme-daylight .turn-speaker { color: #047857; }
    .turn-item.spk-2 .turn-speaker { color: #7dd3fc; }
    .hud-card.theme-daylight .turn-item.spk-2 .turn-speaker { color: #0369a1; }
    .turn-item.spk-3 .turn-speaker { color: #fde68a; }
    .hud-card.theme-daylight .turn-item.spk-3 .turn-speaker { color: #b45309; }
    .turn-item.spk-4 .turn-speaker { color: #e9d5ff; }
    .hud-card.theme-daylight .turn-item.spk-4 .turn-speaker { color: #7e22ce; }

    .turn-time {
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      font-weight: 600;
    }
    .turn-text {
      color: var(--text-main);
      text-shadow: var(--text-shadow);
      font-weight: 500;
      word-break: break-word;
    }
    .turn-trans {
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px dashed rgba(16, 185, 129, 0.4);
      color: #a7f3d0;
      text-shadow: var(--text-shadow);
      font-size: 13px;
      font-weight: 600;
    }
    .hud-card.theme-daylight .turn-trans {
      color: #065f46;
    }

    .interim-box {
      background: rgba(16, 185, 129, 0.18);
      border: 1px solid rgba(16, 185, 129, 0.45);
      border-radius: 14px;
      padding: 8px 13px;
      font-size: 13.5px;
      color: var(--text-main);
      text-shadow: var(--text-shadow);
      font-weight: 600;
    }

    .scroll-resume-btn {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(16, 185, 129, 0.9);
      backdrop-filter: blur(10px);
      color: #022c22;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 999px;
      padding: 5px 14px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
    }
  `;
  shadow.appendChild(style);

  const card = document.createElement('div');
  card.className = 'hud-card';
  shadow.appendChild(card);

  // Unified Single-Row Floating Glass Header Bar
  const header = document.createElement('div');
  header.className = 'hud-header';

  const brand = document.createElement('div');
  brand.className = 'brand';

  const dotWrap = document.createElement('div');
  dotWrap.className = 'dot-wrap';
  const dot = document.createElement('div');
  dot.className = 'dot';
  dotWrap.appendChild(dot);

  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'Vinxa Live';

  const statusTag = document.createElement('span');
  statusTag.className = 'status-tag tag-ready';
  statusTag.textContent = 'Ready';

  const timerSpan = document.createElement('span');
  timerSpan.className = 'timer';
  timerSpan.style.display = 'none';
  timerSpan.textContent = '00:00';

  brand.append(dotWrap, titleSpan, statusTag, timerSpan);

  const controlsCluster = document.createElement('div');
  controlsCluster.className = 'controls-cluster';

  const themeBtn = document.createElement('button');
  themeBtn.className = 'btn';
  themeBtn.title = 'Cycle Glass Transparency Style (Frost Glass / Daylight Pearl / Ultra Clear)';
  themeBtn.textContent = '✨ Frost';
  themeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (glassTheme === 'frost') {
      glassTheme = 'daylight';
    } else if (glassTheme === 'daylight') {
      glassTheme = 'clear';
    } else {
      glassTheme = 'frost';
    }
    applyGlassTheme();
    chrome.storage.local.set({ hudGlassTheme: glassTheme });
  });

  function applyGlassTheme() {
    card.classList.remove('theme-daylight', 'theme-clear');
    if (glassTheme === 'daylight') {
      card.classList.add('theme-daylight');
      themeBtn.textContent = '☀️ Light';
    } else if (glassTheme === 'clear') {
      card.classList.add('theme-clear');
      themeBtn.textContent = '💧 Clear';
    } else {
      themeBtn.textContent = '✨ Frost';
    }
  }

  const pauseResumeBtn = document.createElement('button');
  pauseResumeBtn.className = 'btn btn-warn';
  pauseResumeBtn.style.display = 'none';
  pauseResumeBtn.textContent = '⏸ Pause';
  pauseResumeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  pauseResumeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const actionType = isPaused ? 'RESUME_CAPTURE' : 'PAUSE_CAPTURE';
    chrome.runtime.sendMessage({ type: actionType }, (res) => {
      if (res && typeof res.isPaused === 'boolean') {
        isPaused = res.isPaused;
        renderOverlay();
      }
    });
  });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'btn btn-danger';
  stopBtn.style.display = 'none';
  stopBtn.textContent = '⏹ Stop';
  stopBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopBtn.textContent = 'Saving...';
    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE_FROM_OVERLAY' });
  });

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.title = 'Copy Live Transcript to Clipboard';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (segments.length === 0) return;
    const text = segments
      .map((s) => {
        const tr =
          targetTranslation !== 'ORIGINAL' && translationsCache[s.id]
            ? `\n  [${targetTranslation}]: ${translationsCache[s.id]}`
            : '';
        return `[${formatTime(s.startMs)}] ${s.speakerName}: ${s.text}${tr}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 1500);
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn';
  downloadBtn.title = 'Download Live Transcript (.MD)';
  downloadBtn.textContent = '↓ .MD';
  downloadBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  downloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (segments.length === 0) return;
    const lines = [
      `# ${document.title || 'Live Meeting Transcript'}`,
      `- **Platform:** ${platform}`,
      `- **Exported:** ${new Date().toLocaleString()}`,
      '',
      '## Diarized Transcript',
      ...segments.map((s) => {
        const tr =
          targetTranslation !== 'ORIGINAL' && translationsCache[s.id]
            ? `\n  - *${targetTranslation}:* ${translationsCache[s.id]}`
            : '';
        return `- **[${formatTime(s.startMs)}] ${s.speakerName}:** ${s.text}${tr}`;
      })
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vinxa-live-transcript-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const dockBtn = document.createElement('button');
  dockBtn.className = 'btn';
  dockBtn.title = 'Switch between Bottom Subtitle Bar and Right Side Panel';
  dockBtn.textContent = '◫ Side';
  dockBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  dockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dockMode = dockMode === 'bottom' ? 'side' : 'bottom';
    if (dockMode === 'side') {
      card.classList.add('side-mode');
      dockBtn.textContent = '◓ Bottom';
    } else {
      card.classList.remove('side-mode');
      dockBtn.textContent = '◫ Side';
    }
    applyDockPosition();
  });

  const dashBtn = document.createElement('button');
  dashBtn.className = 'btn';
  dashBtn.title = 'Open Vinxa Web Workspace';
  dashBtn.textContent = '↗';
  dashBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  dashBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD_TAB', meetingId: activeMeetingId });
  });

  const minBtn = document.createElement('button');
  minBtn.className = 'btn';
  minBtn.title = 'Minimize / Expand On-Screen Captions';
  minBtn.textContent = '—';
  minBtn.addEventListener('mousedown', (e) => e.stopPropagation());
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    renderOverlay();
  });

  controlsCluster.append(
    themeBtn,
    pauseResumeBtn,
    stopBtn,
    copyBtn,
    downloadBtn,
    dockBtn,
    dashBtn,
    minBtn
  );
  header.append(brand, controlsCluster);
  card.appendChild(header);

  // Transcript Feed Area
  const feedBox = document.createElement('div');
  feedBox.className = 'feed-box';
  feedBox.addEventListener('scroll', () => {
    const dist = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight;
    userScrolledUp = dist > 45;
    resumeScrollBtn.style.display = userScrolledUp && segments.length > 0 ? 'block' : 'none';
  });
  card.appendChild(feedBox);

  const resumeScrollBtn = document.createElement('button');
  resumeScrollBtn.className = 'scroll-resume-btn';
  resumeScrollBtn.style.display = 'none';
  resumeScrollBtn.textContent = '↓ Latest Live Speech';
  resumeScrollBtn.addEventListener('click', () => {
    userScrolledUp = false;
    resumeScrollBtn.style.display = 'none';
    feedBox.scrollTop = feedBox.scrollHeight;
  });
  card.appendChild(resumeScrollBtn);

  // Dragging logic for header
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = host.getBoundingClientRect();
    host.style.transform = 'none';
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.bottom = 'auto';
    host.style.right = 'auto';
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    host.style.left = `${Math.max(10, e.clientX - dragOffsetX)}px`;
    host.style.top = `${Math.max(10, e.clientY - dragOffsetY)}px`;
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  function clearChildren(el: HTMLElement) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function formatTime(ms: number) {
    const totalSec = Math.floor((ms || 0) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getSpeakerColorClass(speakerKey: string): string {
    if (speakerKey === 'speaker-2') return 'spk-2';
    if (speakerKey === 'speaker-3') return 'spk-3';
    if (speakerKey === 'speaker-4') return 'spk-4';
    return 'spk-1';
  }

  function triggerLiveTranslations() {
    if (targetTranslation === 'ORIGINAL' || segments.length === 0) return;
    const untranslated = segments.filter(
      (s) => !translationsCache[s.id] && !pendingTranslations.has(s.id)
    );
    if (untranslated.length === 0) return;

    untranslated.forEach((s) => pendingTranslations.add(s.id));
    const texts = untranslated.map((s) => s.text);

    chrome.runtime.sendMessage(
      {
        type: 'TRANSLATE_LIVE_TEXT',
        texts,
        targetLanguage: targetTranslation
      },
      (res) => {
        if (res?.success && Array.isArray(res.translations)) {
          untranslated.forEach((s, idx) => {
            translationsCache[s.id] = res.translations[idx] || s.text;
            pendingTranslations.delete(s.id);
          });
          renderFeed();
        } else {
          untranslated.forEach((s) => pendingTranslations.delete(s.id));
        }
      }
    );
  }

  function createWaveIndicator(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'wave-bars';
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('span');
      b.className = 'wave-bar';
      wrap.appendChild(b);
    }
    return wrap;
  }

  function renderFeed() {
    clearChildren(feedBox);

    if (segments.length === 0 && !interimText) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.appendChild(createWaveIndicator());

      const msg = document.createElement('span');
      if (!isAuthenticated && !isRecording) {
        msg.textContent =
          'Sign in via the Vinxa toolbar icon to enable live on-screen captions & translations.';
      } else if (isRecording && isPaused) {
        msg.textContent = 'Live transcription paused — Click "▶ Resume" above to continue.';
      } else if (isRecording) {
        msg.textContent =
          'Listening live — Speak in your meeting and real-time captions will stream right here.';
      } else {
        msg.textContent =
          'Ready for live captions — Click the Vinxa toolbar icon and press "Start Meeting Capture".';
      }
      empty.appendChild(msg);
      feedBox.appendChild(empty);
      return;
    }

    const sliceCount = dockMode === 'side' ? -25 : -12;
    segments.slice(sliceCount).forEach((seg) => {
      const item = document.createElement('div');
      item.className = `turn-item ${getSpeakerColorClass(seg.speakerKey || 'speaker-1')}`;

      const turnHeader = document.createElement('div');
      turnHeader.className = 'turn-header';

      const spk = document.createElement('span');
      spk.className = 'turn-speaker';
      spk.textContent = seg.speakerName || 'Speaker 1';

      const tm = document.createElement('span');
      tm.className = 'turn-time';
      tm.textContent = formatTime(seg.startMs);

      turnHeader.append(spk, tm);

      const txt = document.createElement('div');
      txt.className = 'turn-text';
      txt.textContent = seg.text;

      item.append(turnHeader, txt);

      if (targetTranslation !== 'ORIGINAL' && translationsCache[seg.id]) {
        const trans = document.createElement('div');
        trans.className = 'turn-trans';
        trans.textContent = `🌐 ${translationsCache[seg.id]}`;
        item.appendChild(trans);
      }

      feedBox.appendChild(item);
    });

    if (interimText && !isPaused) {
      const interim = document.createElement('div');
      interim.className = 'interim-box';
      interim.textContent = `🎙️ ${interimText}`;
      feedBox.appendChild(interim);
    }

    if (!userScrolledUp) {
      feedBox.scrollTop = feedBox.scrollHeight;
    }
  }

  function renderOverlay() {
    if (isMinimized) {
      card.classList.add('minimized');
      feedBox.style.display = 'none';
      dockBtn.style.display = 'none';
      minBtn.textContent = 'Expand ▢';
      const latestText =
        interimText ||
        (segments.length > 0 ? segments[segments.length - 1].text : 'Vinxa Live');
      titleSpan.textContent =
        latestText.length > 42 ? latestText.substring(0, 42) + '…' : latestText;
    } else {
      card.classList.remove('minimized');
      feedBox.style.display = 'flex';
      dockBtn.style.display = 'inline-flex';
      minBtn.textContent = '—';
      titleSpan.textContent = 'Vinxa Live';
    }

    if (isRecording) {
      timerSpan.style.display = 'inline-block';
      pauseResumeBtn.style.display = 'inline-flex';
      stopBtn.style.display = 'inline-flex';
      stopBtn.textContent = '⏹ Stop';

      if (isPaused) {
        dotWrap.className = 'dot-wrap paused';
        dot.className = 'dot paused';
        statusTag.className = 'status-tag tag-paused';
        statusTag.textContent = 'Paused';
        pauseResumeBtn.textContent = '▶ Resume';
      } else {
        dotWrap.className = 'dot-wrap recording';
        dot.className = 'dot recording';
        statusTag.className = 'status-tag tag-live';
        statusTag.textContent = 'LIVE';
        pauseResumeBtn.textContent = '⏸ Pause';
      }
    } else {
      dotWrap.className = 'dot-wrap';
      dot.className = 'dot';
      timerSpan.style.display = 'none';
      pauseResumeBtn.style.display = 'none';
      stopBtn.style.display = 'none';
      statusTag.className = 'status-tag tag-ready';
      statusTag.textContent = isAuthenticated ? 'Ready' : 'Sign In';
    }

    copyBtn.style.display = !isMinimized && segments.length > 0 ? 'inline-flex' : 'none';
    downloadBtn.style.display = !isMinimized && segments.length > 0 ? 'inline-flex' : 'none';

    renderFeed();
  }

  const timerInterval = setInterval(() => {
    if (isRecording && !isPaused && startTime) {
      const totalSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const m = Math.floor(totalSec / 60)
        .toString()
        .padStart(2, '0');
      const s = (totalSec % 60).toString().padStart(2, '0');
      timerSpan.textContent = `${m}:${s}`;
    }
  }, 1000);

  window.addEventListener(
    'vinxa-hud-cleanup',
    () => {
      clearInterval(timerInterval);
    },
    { once: true }
  );

  chrome.storage.local.get(['hudGlassTheme'], (data) => {
    if (
      data.hudGlassTheme === 'frost' ||
      data.hudGlassTheme === 'daylight' ||
      data.hudGlassTheme === 'clear'
    ) {
      glassTheme = data.hudGlassTheme;
      applyGlassTheme();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'LIVE_TRANSCRIPT_UPDATE') {
      isRecording = msg.state === 'RECORDING';
      if (typeof msg.isPaused === 'boolean') isPaused = msg.isPaused;
      activeMeetingId = msg.meetingId || activeMeetingId;
      startTime = msg.startTime || startTime;
      if (typeof msg.isAuthenticated === 'boolean') isAuthenticated = msg.isAuthenticated;
      if (Array.isArray(msg.segments)) segments = msg.segments;
      if (typeof msg.interimText === 'string') interimText = msg.interimText;
      if (msg.selectedLanguage) {
        spokenLanguage = msg.selectedLanguage;
      }
      if (msg.targetTranslation && msg.targetTranslation !== targetTranslation) {
        targetTranslation = msg.targetTranslation;
        Object.keys(translationsCache).forEach((k) => delete translationsCache[k]);
        pendingTranslations.clear();
      }
      triggerLiveTranslations();
      renderOverlay();
    } else if (msg.type === 'RESET_HUD_POSITION_ON_SCREEN') {
      isMinimized = false;
      dockMode = 'bottom';
      card.classList.remove('side-mode');
      dockBtn.textContent = '◫ Side';
      applyDockPosition();
      renderOverlay();
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    let changed = false;
    if (changes.recordingState) {
      isRecording = changes.recordingState.newValue === 'RECORDING';
      changed = true;
    }
    if (changes.isPaused !== undefined) {
      isPaused = Boolean(changes.isPaused.newValue);
      changed = true;
    }
    if (changes.authToken) {
      isAuthenticated = Boolean(changes.authToken.newValue);
      changed = true;
    }
    if (changes.activeMeetingId) {
      activeMeetingId = changes.activeMeetingId.newValue;
      changed = true;
    }
    if (changes.activeStartTime) {
      startTime = changes.activeStartTime.newValue;
      changed = true;
    }
    if (changes.liveSegments && Array.isArray(changes.liveSegments.newValue)) {
      segments = changes.liveSegments.newValue;
      triggerLiveTranslations();
      changed = true;
    }
    if (changes.liveInterimText !== undefined) {
      interimText = changes.liveInterimText.newValue || '';
      changed = true;
    }
    if (changes.selectedLanguage && changes.selectedLanguage.newValue) {
      spokenLanguage = changes.selectedLanguage.newValue;
    }
    if (changes.targetTranslation && changes.targetTranslation.newValue) {
      targetTranslation = changes.targetTranslation.newValue;
      Object.keys(translationsCache).forEach((k) => delete translationsCache[k]);
      pendingTranslations.clear();
      triggerLiveTranslations();
      changed = true;
    }
    if (changed) renderOverlay();
  });

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (res) {
      isRecording = res.state === 'RECORDING';
      isPaused = Boolean(res.isPaused);
      activeMeetingId = res.meetingId || null;
      startTime = res.startTime || null;
      isAuthenticated = Boolean(res.isAuthenticated);
      if (Array.isArray(res.segments)) segments = res.segments;
      if (typeof res.interimText === 'string') interimText = res.interimText;
      if (res.selectedLanguage) {
        spokenLanguage = res.selectedLanguage;
      }
      if (res.targetTranslation) {
        targetTranslation = res.targetTranslation;
      }
      triggerLiveTranslations();
      renderOverlay();
    }
  });

  renderOverlay();
})();
