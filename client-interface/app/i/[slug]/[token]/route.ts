import { tokenLink } from '@/app/_link/redirect';

/** links.pathment.me/i/<tenant>/<token> — a registration invite. */
export const GET = tokenLink((token) => `/register?invite=${encodeURIComponent(token)}`);

// A token in the path. Never cached, never prerendered.
export const dynamic = 'force-dynamic';
