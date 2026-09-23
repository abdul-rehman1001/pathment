import { NextResponse } from 'next/server';

/**
 * links.pathment.me — one host every email link goes through.
 *
 * Why it exists: Android verifies app links per host. If invites came from
 * devweekends.pathment.me and reset links from microtechx.pathment.me, every
 * new customer would need a new mobile build before their links could open the
 * app. Through one host, a new customer costs nothing in the app.
 *
 * On a phone with the app installed and verified, the OS takes these URLs
 * before the network does and none of this code runs. What is here is the
 * browser path: a desktop, or a phone without the app. Both end up on the
 * the shared app host with the workspace encoded in the path.
 *
 * The tenant is carried in the link rather than looked up, so a redirect never
 * waits on the API. Someone resetting a password should not be held up by a
 * round trip, and a link host that breaks when the API is down is a link host
 * that breaks at exactly the wrong moment.
 */

/**
 * Where a customer's web app lives, by convention.
 *
 * Every workspace uses the same frontend deployment. Nothing is deployed and
 * no DNS record is created when a customer joins.
 */
const site = (slug: string) => `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.pathment.me'}/w/${slug}`;

/**
 * Anything outside this is refused.
 *
 * Without it the slug is a redirect target under our control, on a domain
 * people have been taught to trust, in emails that carry auth tokens. That is
 * an open redirect, and it is the one way this small file could do real harm.
 */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type TokenParams = Promise<{ slug: string; token: string }>;

/** A handler for the three token links: invite, reset, verify. */
export function tokenLink(path: (token: string) => string) {
  return async (_request: Request, context: { params: TokenParams }) => {
    const { slug, token } = await context.params;
    if (!SLUG.test(slug) || !token) return new NextResponse('Not found', { status: 404 });

    return NextResponse.redirect(`${site(slug)}${path(token)}`, 302);
  };
}

/**
 * The notification link: a path rather than a token.
 *
 * `to` is checked as strictly as the slug. A single leading slash and nothing
 * else, so `//evil.com` cannot smuggle a host past it. Anything else lands on
 * the dashboard, which is somewhere real rather than a dead end.
 */
export async function goLink(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!SLUG.test(slug)) return new NextResponse('Not found', { status: 404 });

  const to = new URL(request.url).searchParams.get('to') ?? '';
  const safe = to.startsWith('/') && !to.startsWith('//') ? to : '/dashboard';

  return NextResponse.redirect(`${site(slug)}${safe}`, 302);
}
