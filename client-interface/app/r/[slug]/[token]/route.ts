import { tokenLink } from '@/app/_link/redirect';

/** links.pathment.me/r/<tenant>/<token> — a password reset. */
export const GET = tokenLink((token) => `/reset-password?token=${encodeURIComponent(token)}`);

// A token in the path. Never cached, never prerendered.
export const dynamic = 'force-dynamic';
