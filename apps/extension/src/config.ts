export interface ExtensionEndpoints {
  serverOrigin: string;
  apiBase: string;
  wsBase: string;
  dashboardBase: string;
  isLocal: boolean;
}

export const EC2_FRONTEND_ORIGIN = 'http://vinxa.ogakash.xyz';
export const EC2_API_ORIGIN = 'http://api.vinxa.ogakash.xyz';
export const EC2_IP_ORIGIN = 'http://13.237.88.27';
export const LOCAL_ORIGIN = 'http://localhost:8080';

const ENV_EC2_HOST = ((import.meta as any).env?.VITE_EC2_HOST || 'api.vinxa.ogakash.xyz').trim();

export function getDefaultServerOrigin(): string {
  if (ENV_EC2_HOST) {
    if (ENV_EC2_HOST.startsWith('http://') || ENV_EC2_HOST.startsWith('https://')) {
      return ENV_EC2_HOST.replace(/\/+$/, '');
    }
    return `http://${ENV_EC2_HOST}`;
  }
  return EC2_API_ORIGIN;
}

export function normalizeServerOrigin(rawInput?: string | null): ExtensionEndpoints {
  let raw = (rawInput || '').trim();
  if (!raw) {
    raw = getDefaultServerOrigin();
  }
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    raw = `http://${raw}`;
  }

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocal) {
      return {
        serverOrigin: LOCAL_ORIGIN,
        apiBase: 'http://localhost:8080/api/v1',
        wsBase: 'ws://localhost:8080',
        dashboardBase: 'http://localhost:5173',
        isLocal: true
      };
    }

    const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';

    // When connected to ogakash.xyz (vinxa.ogakash.xyz or api.vinxa.ogakash.xyz),
    // route Web Dashboard tabs to vinxa.ogakash.xyz and API/WebSockets to api.vinxa.ogakash.xyz
    if (hostname.endsWith('ogakash.xyz')) {
      return {
        serverOrigin: `${protocol}//api.vinxa.ogakash.xyz`,
        apiBase: `${protocol}//api.vinxa.ogakash.xyz/api/v1`,
        wsBase: `${wsProtocol}//api.vinxa.ogakash.xyz`,
        dashboardBase: `${protocol}//vinxa.ogakash.xyz`,
        isLocal: false
      };
    }

    // Direct IP or custom host fallback (e.g. http://13.237.88.27)
    const hostWithPort = parsed.port === '8080' ? parsed.hostname : parsed.host;
    const origin = `${protocol}//${hostWithPort}`;

    return {
      serverOrigin: origin,
      apiBase: `${origin}/api/v1`,
      wsBase: `${wsProtocol}//${hostWithPort}`,
      dashboardBase: origin,
      isLocal: false
    };
  } catch {
    return {
      serverOrigin: EC2_API_ORIGIN,
      apiBase: `${EC2_API_ORIGIN}/api/v1`,
      wsBase: 'ws://api.vinxa.ogakash.xyz',
      dashboardBase: EC2_FRONTEND_ORIGIN,
      isLocal: false
    };
  }
}

export async function resolveExtensionEndpoints(): Promise<ExtensionEndpoints> {
  try {
    const stored = await chrome.storage.local.get(['vinxaServerOrigin']);
    return normalizeServerOrigin(stored.vinxaServerOrigin || getDefaultServerOrigin());
  } catch {
    return normalizeServerOrigin(getDefaultServerOrigin());
  }
}

export async function setStoredServerOrigin(origin: string): Promise<ExtensionEndpoints> {
  const endpoints = normalizeServerOrigin(origin);
  await chrome.storage.local.set({ vinxaServerOrigin: endpoints.serverOrigin });
  return endpoints;
}
