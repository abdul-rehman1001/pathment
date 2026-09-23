import axios from 'axios';
import { apiConfig } from '../config/api';
import { refreshAccessToken } from './auth-session';
import { tokenStore } from './token-store';
import { legacyWorkspaceFromHostname, logicalPathname, workspacePath, workspaceSlugFromPathname } from './workspace-scope';

const PENDING = 'pathment-handoff-v1';
const PROOF = /^[A-Za-z0-9_-]{43}$/;
const appOrigin = () => new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://app.pathment.me').origin;
const appUrl = (workspace: string) => `${appOrigin()}/w/${workspace}/session-handoff`;
const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function safeHandoffDestination(value: string | null, role?: string): string {
  const fallback = `/${['admin', 'mentor', 'mentee'].includes(role || '') ? role : 'mentee'}/dashboard`;
  if (!value || !value.startsWith('/') || /[\\\u0000-\u0020]/.test(value)) return fallback;
  const parsed = new URL(value, window.location.origin);
  if (parsed.origin !== window.location.origin) return fallback;
  const path = logicalPathname(parsed.pathname);
  if (path === '/login' || path.startsWith('/session-handoff') || path.startsWith('//')) return fallback;
  return `${path}${parsed.search}${parsed.hash}`;
}

export class HandoffAccountConflictError extends Error {
  constructor() {
    super('Another account is already signed in here. Your session was kept. Sign out explicitly before transferring a different account.');
  }
}

// Transfer requests bypass the global logout interceptor. Only issuance may
// renew an expired access token, using the same single-flight renewal as auth.
async function post<T>(path: string, workspace: string, body: unknown, token?: string): Promise<T> {
  const response = await axios.post<T>(`${apiConfig.baseUrl.replace(/\/$/, '')}/auth/domain-handoff${path}`, body, {
    timeout: apiConfig.timeout,
    headers: { 'X-Pathment-Workspace': workspace, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return response.data;
}

async function transfer() {
  const legacy = legacyWorkspaceFromHostname(window.location.hostname);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (legacy) {
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (!tokenStore.getToken()) {
      window.location.replace(`${appOrigin()}${workspacePath(current === '/' ? '/login' : current, legacy)}`);
      return;
    }
    if (window.location.pathname !== '/session-handoff' || !fragment.has('challenge')) {
      window.location.replace(`${appUrl(legacy)}#${new URLSearchParams({ start: '1', next: current })}`);
      return;
    }
    const challenge = fragment.get('challenge') || '';
    const state = fragment.get('state') || '';
    if (!PROOF.test(challenge) || !PROOF.test(state)) throw new Error('Invalid transfer request');
    window.history.replaceState(null, '', window.location.pathname);
    const body = { codeChallenge: challenge, rememberSession: tokenStore.isRememberedSession() };
    const originalToken = tokenStore.getToken() || undefined;
    let result: { data: { token: string } };
    try {
      result = await post('', legacy, body, originalToken);
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status !== 401) throw error;
      // A proactive renewal may have completed while issuance was in flight.
      const latest = tokenStore.getToken();
      const renewed = latest && latest !== originalToken ? latest : await refreshAccessToken();
      result = await post('', legacy, body, renewed);
    }
    window.location.replace(`${appUrl(legacy)}#${new URLSearchParams({ code: result.data.token, state })}`);
    return;
  }

  if (window.location.origin !== appOrigin()) throw new Error('Invalid transfer origin');
  const workspace = workspaceSlugFromPathname(window.location.pathname);
  if (!workspace) throw new Error('Missing workspace');
  window.history.replaceState(null, '', window.location.pathname);
  if (fragment.get('start') === '1') {
    const verifier = random();
    const state = random();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state, workspace, next: fragment.get('next'), destinationUserId: tokenStore.getToken() ? tokenStore.getUser<{ id?: string }>()?.id : null, expires: Date.now() + 120000 }));
    window.location.replace(`https://${workspace}.pathment.me/session-handoff#${new URLSearchParams({ challenge, state })}`);
    return;
  }
  const pending = JSON.parse(sessionStorage.getItem(PENDING) || 'null');
  const code = fragment.get('code');
  if (!pending || !code || pending.workspace !== workspace || pending.state !== fragment.get('state') || pending.expires < Date.now() || !PROOF.test(pending.verifier)) {
    throw new Error('This transfer was not started in this browser tab or has expired.');
  }
  const result = await post<{ data: { user: { id: string; role?: string }; tokens: { accessToken: string; refreshToken: string }; rememberSession: boolean } }>('/consume', workspace, { token: code, workspace, codeVerifier: pending.verifier });
  const { user, tokens, rememberSession } = result.data;
  const existingUser = tokenStore.getToken() ? tokenStore.getUser<{ id?: string }>() : null;
  if ((tokenStore.getToken() && (!existingUser?.id || existingUser.id !== user.id)) ||
      (pending.destinationUserId && pending.destinationUserId !== user.id)) {
    throw new HandoffAccountConflictError();
  }
  tokenStore.setSession({ token: tokens.accessToken, refreshToken: tokens.refreshToken, user }, rememberSession);
  sessionStorage.removeItem(PENDING);
  window.location.replace(workspacePath(safeHandoffDestination(pending.next, user.role), workspace));
}

// One document, one transfer. Both mounted components and StrictMode replay
// subscribe to the same result, including failure, without redeeming twice.
let flight: Promise<void> | undefined;
export function runDomainHandoff(): Promise<void> {
  return flight ??= transfer();
}
