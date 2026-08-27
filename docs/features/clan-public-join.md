# Public Clan Joining Link

**What it is:** a shareable, multi-use clan URL. A visitor opens `/clan/join/<slug>`,
registers or logs in, and submits a **join request**. Membership is created only when the
current **Lead Mentor** approves (apply-then-approve — not auto-join).

**Why it exists:** classic email invites (`RegistrationInvite`) are single-use and
email-locked. Public join links let a Lead Mentor share one URL (chat, social, cohort page)
without minting a new invite per person, while admin still gates the feature per clan and
the Lead still approves who gets in.

> Classic `POST /clans/:id/invite` is **unchanged**. This feature runs beside it, not
> instead of it. See also [Programs, Cohorts & Clans](./programs-cohorts-clans.md) and
> [Authentication](./authentication.md).

## Data model
`Clan` gains three fields: `publicJoinAllowed` (admin, default `false`),
`publicJoinEnabled` (Lead Mentor, default `false`), `publicJoinSlug` (opaque token for
`/clan/join/<slug>`). A link is usable only when **allowed ∧ enabled ∧ slug present ∧ clan
`status === active`** (and the clan is not at mentee capacity).

`ClanJoinRequest` (`clan_join_requests`): `clanId`, `userId`, `status`
(`pending|approved|rejected|cancelled`), `source` (`public_link`), optional `message` /
`resolutionNote`, `reviewedBy`, `reviewedAt`. Partial unique index: one **pending** row
per `(clanId, userId)`.

Distinct from `RegistrationInvite` (email-locked register/placement) and
`ClanChangeRequest` (permanent move between clans). Migration:
`096_clan_public_join.js`.

## Backend
Service: `clanPublicJoinService`. Controller: `clanPublicJoinController`. Approving a
request calls existing **`clanService.addMember(clanId, { userId, role: 'mentee' })`** —
same membership path as manual add.

- **Clan API (`/api/clans`, authenticated):** `GET /:id/public-join` (Lead or admin state);
  `PATCH /:id/public-join/access` (**admin only** — grant/remove `publicJoinAllowed`);
  `POST|DELETE /:id/public-join/link`, `POST /:id/public-join/regenerate` (**current Lead
  Mentor**); `GET /:id/join-requests`, `POST .../approve`, `POST .../reject` (Lead).
- **Public (`/api/public`):** `GET /clans/join/:token` (`optionalAuth` — preview +
  `viewerStatus`); `POST /clans/join/:token/request` (auth required — create pending
  request; rate-limited like other public writes).
- **Auth (`/api/auth`):** `GET /clan-join/:token` (register preload); `POST /register`
  accepts **either** `inviteToken` **or** `clanJoinSlug` (Joi xor). Clan-slug register
  (`authService._registerViaClanJoinSlug`) creates mentee + `Enrollment(pending_match)`
  and does **not** create `ClanMembership` until Lead approval.
- **Notifications:** `CLAN_JOIN_REQUEST_RECEIVED` (Lead, in-app + email);
  `CLAN_JOIN_REQUEST_DECIDED` (applicant, in-app + email).

## Frontend
- **Admin:** `/admin/clans` drawer — “Allow public joining links” toggle
  (`clanApi.setPublicJoinAccess`).
- **Lead Mentor:** `/mentor/clan-team` — `PublicJoinLeadPanel` (lead only): generate /
  copy / disable / regenerate link; list pending requests; approve / reject.
- **Public:** `app/(public)/clan/join/[token]` — clan/program preview; Login /
  Register; Request to join; status for pending / already member / elsewhere / unavailable.
- **Auth continuation:** `/register?clanJoin=<token>` (email not locked); after signup →
  `/login?next=/clan/join/<token>`. Existing users: `/login?next=/clan/join/<token>`.
- **Clients:** `lib/services/clan-api.ts`, `lib/services/public-api.ts`;
  `AuthContext.register` returns `clanJoin.joinPath` for redirect.

## Role flows
- **Admin:** opens a clan → grants public joining access (default off). Revoking access
  makes the public URL unusable immediately; Lead may still resolve requests that were
  already pending.
- **Lead Mentor:** only the current `leadMentorId` (not co-mentors) generates the shareable
  URL, disables or regenerates it, and approves/rejects join requests. Approve → mentee
  membership via `addMember`; reject → request closed, no membership.
- **Visitor (no account):** opens the link → Register with `?clanJoin=` → log in → return
  to the join page → Request to join → wait for approval (notification on decide).
- **Existing user:** opens the link (or logs in with `?next=`) → Request to join if
  eligible; blocked if already a mentee of this or another clan, or if they mentor this clan.

## Rules & edge cases
- Public joining is **off** per clan until an admin sets `publicJoinAllowed`.
- Usable link requires allowed + enabled + slug + active clan (+ capacity).
- Lead-only for link lifecycle and approve/reject; co-mentors cannot manage this panel.
- Regenerating the slug invalidates the old URL; existing requests and memberships stay.
- One mentee placement at a time already in another clan → request blocked.
- Full clan → create/approve blocked.
- Registration stays gated: invite token **or** clan join slug, never open signup.
- Email invite flow (`POST /clans/:id/invite` + `RegistrationInvite`) is untouched.

## Related
[Programs, Cohorts & Clans](./programs-cohorts-clans.md) ·
[Authentication](./authentication.md) ·
[Matching & Placement](./matching-and-placement.md) ·
[Notifications & Email](./notifications-and-email.md) ·
[Authorization (RBAC)](./authorization-rbac.md)
