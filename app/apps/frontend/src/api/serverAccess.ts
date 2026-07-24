const SERVER_ACCESS_TOKEN_KEY = 'paper-agent-server-access-token';
let installed = false;

export function getServerAccessToken(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(SERVER_ACCESS_TOKEN_KEY) || '';
}

export function setServerAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  const normalized = token.trim();
  if (normalized) window.sessionStorage.setItem(SERVER_ACCESS_TOKEN_KEY, normalized);
  else window.sessionStorage.removeItem(SERVER_ACCESS_TOKEN_KEY);
}

export function clearServerAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SERVER_ACCESS_TOKEN_KEY);
}

export function installServerAccessFetch(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, window.location.href);
    const sameOriginApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    const token = getServerAccessToken();
    if (!sameOriginApi || !token) return originalFetch(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return originalFetch(input, { ...init, headers });
  };
}
