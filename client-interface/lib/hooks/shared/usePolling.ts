'use client';

import { useEffect, useRef } from 'react';
import { getRateLimit } from '@/lib/utils/api-error';

interface PollingOptions {
  /** Milliseconds between attempts. Pass null to stop polling entirely. */
  intervalMs: number | null;
  /** Run once immediately as well as on the interval. Defaults to true. */
  immediate?: boolean;
}

/**
 * setInterval that backs off when the server says to.
 *
 * Every poll loop in the app used to swallow its error and fire again on the
 * next tick, so the moment a user hit the API rate limit all of them kept
 * hammering at full rate — which held the bucket open for the rest of the window
 * and turned a brief 429 into a several-minute lockout. Honouring `retryAfter`
 * lets the window actually drain.
 *
 * The callback is held in a ref, so callers do not have to memoise it and an
 * inline arrow will not restart the timer on every render.
 */
export function usePolling(fn: () => void | Promise<unknown>, { intervalMs, immediate = true }: PollingOptions) {
  // Latest-callback ref, updated in an effect (assigning during render is a
  // React rules violation). Lets callers pass an inline arrow without the timer
  // restarting on every render.
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; });

  useEffect(() => {
    if (intervalMs === null) return;

    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      // Default to the normal cadence; a 429 replaces it with the server's own
      // retry-after, so we wait exactly as long as we were asked to.
      let wait = intervalMs;
      try {
        await saved.current();
      } catch (error) {
        const { limited, retryAfterSec } = getRateLimit(error);
        if (limited) wait = Math.max(intervalMs, retryAfterSec * 1000);
      }
      if (!stopped) timer = setTimeout(tick, wait);
    };

    if (immediate) {
      tick();
    } else {
      timer = setTimeout(tick, intervalMs);
    }

    return () => { stopped = true; clearTimeout(timer); };
  }, [intervalMs, immediate]);
}
