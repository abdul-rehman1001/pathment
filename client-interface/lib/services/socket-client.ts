import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './token-store';
import { onAccessTokenRefreshed, refreshAccessToken } from './auth-session';

let socket: Socket | null = null;
let unsubscribeRefresh: (() => void) | null = null;

export function connectSocket(accessToken: string): Socket {
  if (socket && socket.connected) {
    return socket;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
  const baseUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;

  socket = io(baseUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    // `auth` as a CALLBACK, not a fixed object: socket.io re-invokes it on every
    // (re)connection attempt, so a reconnect after a network blip presents the
    // CURRENT access token. With a fixed object the socket replayed the token it
    // was created with — which is expired after ~15 minutes, so every reconnect
    // was rejected and real-time (live-review banners, messages) stayed dead
    // until a full page reload.
    auth: (cb: (data: Record<string, unknown>) => void) => {
      cb({ token: tokenStore.getToken() || accessToken });
    },
    withCredentials: true,
  });

  // If the handshake is rejected for auth, renew the token and try again — the
  // usual cause is an access token that expired while the tab was asleep.
  socket.on('connect_error', (err: Error) => {
    const message = String(err?.message || '').toLowerCase();
    if (!message.includes('unauthorized') && !message.includes('authentication')) return;
    refreshAccessToken()
      .then(() => { socket?.connect(); })
      .catch(() => { /* auth-session decides whether the session is really over */ });
  });

  // A fresh access token is a good moment to reattach if we're sitting disconnected.
  unsubscribeRefresh?.();
  unsubscribeRefresh = onAccessTokenRefreshed(() => {
    if (socket && !socket.connected) socket.connect();
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

/**
 * The shared socket, connecting it if nobody has yet.
 *
 * `getSocket` only ever returned an EXISTING connection, so anything outside the
 * messages page (which is the only caller of `connectSocket`) got null and went
 * off and called `io()` for itself — the notification bell did this twice over,
 * and those ad-hoc connections omitted `transports`, so they began on HTTP
 * long-polling and stayed there for good if the WebSocket upgrade failed.
 *
 * Callers get the one properly-configured connection instead. It is deliberately
 * NOT disconnected when an individual consumer unmounts: it is a session-lived
 * singleton shared with the messages page, so tearing it down on one component's
 * unmount would sever everyone else's realtime. `disconnectSocket()` on sign-out
 * remains the way it ends.
 */
export function acquireSocket(): Socket | null {
  if (socket) return socket;
  const token = tokenStore.getToken();
  if (!token) return null;
  return connectSocket(token);
}

export function disconnectSocket(): void {
  unsubscribeRefresh?.();
  unsubscribeRefresh = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
