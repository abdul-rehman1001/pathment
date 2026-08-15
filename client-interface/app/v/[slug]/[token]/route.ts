import { tokenLink } from '@/app/_link/redirect';

/** links.pathment.me/v/<tenant>/<token> — an email verification. */
export const GET = tokenLink((token) => `/verify-email?token=${encodeURIComponent(token)}`);

// A token in the path. Never cached, never prerendered.
export const dynamic = 'force-dynamic';
