/**
 * Role-scoping for notifications: a notification's `audience` (set server-side)
 * says which role's "hat" it concerns, so the bell + list can show only what's
 * relevant to the portal the viewer is currently in. A dual-role mentor/mentee
 * sees only the active role's items; single-role users are unaffected (they never
 * receive the other role's notifications). 'any' is always shown.
 */
export type NotificationRole = 'mentor' | 'mentee' | 'admin';

/** The portal role from a pathname prefix (`/mentor/...`), or null on a neutral page. */
export function roleFromPathname(pathname: string | null | undefined): NotificationRole | null {
  const seg = (pathname || '').split('/').filter(Boolean)[0];
  return seg === 'mentor' || seg === 'mentee' || seg === 'admin' ? seg : null;
}

/**
 * Does a notification belong in the given role's view? A null role (unknown /
 * neutral page) or an 'any'/missing audience always matches — we never hide a
 * notification we can't confidently classify.
 */
export function matchesRole(audience: string | null | undefined, role: NotificationRole | null): boolean {
  if (!role) return true;
  if (!audience || audience === 'any') return true;
  return audience === role;
}
