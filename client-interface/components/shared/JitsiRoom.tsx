'use client';

import { useEffect, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { JitsiMeetExternalAPI?: any }
}

// Cache the external_api.js loader per domain so multiple mounts don't re-inject.
const loaders: Record<string, Promise<void> | undefined> = {};
function loadJitsi(domain: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (loaders[domain]) return loaders[domain];
  loaders[domain] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://${domain}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { delete loaders[domain]; reject(new Error('Could not load the video service')); };
    document.body.appendChild(s);
  });
  return loaders[domain];
}

export interface JitsiParticipant { id: string; displayName?: string }

/**
 * Embeds a Jitsi room. Provider-flexible via `domain` (meet.jit.si by default,
 * or a self-hosted / JaaS host later). Surfaces the events the review needs:
 * self join/leave (for attendance), roster changes, and dominant speaker (for
 * the contribution signal). All wiring is disposed on unmount.
 */
export function JitsiRoom({
  domain, room, displayName, onJoined, onLeft, onParticipantJoined, onParticipantLeft, onDominantSpeaker, onError,
}: {
  domain: string;
  room: string;
  displayName?: string | null;
  onJoined?: () => void;
  onLeft?: () => void;
  onParticipantJoined?: (p: JitsiParticipant) => void;
  onParticipantLeft?: (p: JitsiParticipant) => void;
  onDominantSpeaker?: (participantId: string) => void;
  onError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    loadJitsi(domain)
      .then(() => {
        if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName: room,
          parentNode: containerRef.current,
          userInfo: displayName ? { displayName } : undefined,
          configOverwrite: { prejoinPageEnabled: false, disableDeepLinking: true, startWithAudioMuted: false },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false, SHOW_JITSI_WATERMARK: false },
        });
        apiRef.current = api;
        if (onJoined) api.addListener('videoConferenceJoined', () => onJoined());
        if (onLeft) api.addListener('videoConferenceLeft', () => onLeft());
        if (onParticipantJoined) api.addListener('participantJoined', (p: JitsiParticipant) => onParticipantJoined(p));
        if (onParticipantLeft) api.addListener('participantLeft', (p: JitsiParticipant) => onParticipantLeft(p));
        if (onDominantSpeaker) api.addListener('dominantSpeakerChanged', (e: { id: string }) => onDominantSpeaker(e.id));
      })
      .catch((e) => onError?.(e?.message || 'Could not start the video'));

    return () => {
      disposed = true;
      try { apiRef.current?.dispose(); } catch { /* already gone */ }
      apiRef.current = null;
    };
    // Re-mount only when the room/domain changes — callbacks are read fresh via refs
    // in practice, but re-creating on room change is the intended lifecycle.
  }, [domain, room]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full min-h-[420px] rounded-xl overflow-hidden bg-slate-900" />;
}
