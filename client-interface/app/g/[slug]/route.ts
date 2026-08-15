import { goLink } from '@/app/_link/redirect';

/** links.pathment.me/g/<tenant>?to=/mentee/tasks/123 — a notification's target. */
export const GET = goLink;

// Derived from the URL alone, but a redirect carrying an auth token is not
// something to leave to a cache heuristic.
export const dynamic = 'force-dynamic';
