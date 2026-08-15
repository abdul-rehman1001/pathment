import { tokenLink } from '@/app/_link/redirect';

/** links.pathment.me/m/<tenant>/<token> — a one-time sign-in link. */
export const GET = tokenLink((token) => `/login?link=${encodeURIComponent(token)}`);

// A token in the path. Never cached, never prerendered.
export const dynamic = 'force-dynamic';
