# Workspace-path rollout

Pathment uses one product origin and carries the organization in the URL:

```text
https://app.pathment.me/w/<workspace>/<existing-route>
```

`pathment.me` remains the marketing site, `api.pathment.me` is the shared API,
and `links.pathment.me` remains the stable email/mobile-link host.

## Existing Dev Weekends data

Migration `110_multi_tenant_foundation.js` is a **single-tenant maintenance
conversion**, not evidence that the application is ready for multiple tenants.
All existing users (currently 1,500+) and business records belong to DevWeekends.
The migration fixes the target slug to `devweekends` and rejects conflicting
`DEFAULT_ORGANIZATION_SLUG` or `TENANT_SLUG` values.

1. Create the `devweekends` organization.
2. Create active memberships for the users present at cutover. Existing admins
   become owners; everyone else becomes a member. Review this owner mapping before
   release, because base roles remain global.
3. Backfill existing business records with the DevWeekends organization ID.
4. Add tenant indexes, foreign keys and NOT NULL constraints.
5. Seed an active Growth subscription with an explicit frozen legacy contract:
   `overrides.limits` sets `members`, `programs`, `clans`, `storageGb` and
   `aiEvaluationsPerMonth` to `-1` (unlimited). `overrides.features` enables
   `certificates`, `aiEvaluation`, `customBranding`, `customDomain`,
   `advancedAnalytics` and `sso`. These overrides preserve access independently of
   public plan changes; public Growth limits and features remain unchanged.
   Feature flags grant entitlement, not implementation or provider configuration.
   Future resource/feature keys require an explicit legacy compatibility decision.
6. Write `migration_110_completion` in the same transaction. Completed reruns
   return before seeding users, plans, subscriptions or tenant columns. Users added
   later are never automatically assigned to DevWeekends by rerunning migration 110.

It does not recreate users, change passwords, revoke sessions, or transform
feature data. It does change uniqueness constraints, so it is not purely additive.
It intentionally installs **no DevWeekends column default**: missing tenant scope
must fail rather than silently assign another tenant's records to DevWeekends.
Old application writes after commit can fail NOT NULL checks. Even old user-only
writes would lack organization memberships. A rolling deployment with old writers
remaining active is therefore unsupported.

### Maintenance procedure and locks

- Back up PostgreSQL and rehearse restore and this migration against a representative
  isolated copy. Measure runtime, disk/WAL headroom, and constraint compatibility.
- Put the product into maintenance mode. Stop/drain every API process, worker,
  scheduler, Socket.IO writer and administrative script. Coordinate other schema
  changes and test runners; do not point tests at this database. Record the legacy
  user count while writes are stopped.
- Keep all writers stopped until the tenant-aware API has been deployed and verified.
  The acknowledgement below is an operator assertion; it does not stop processes.

```bash
MIGRATION_110_MAINTENANCE=true node server/scripts/migrations/110_multi_tenant_foundation.js
node server/scripts/migrations/111_domain_handoff_tokens.js
node server/scripts/migrations/112_handoff_pkce.js
```

Migration `112_handoff_pkce.js` adds `domain_handoff_tokens.code_challenge`
(`VARCHAR(43)`). Run it after 111 even if the handoff table already exists; 111
alone is insufficient for the current API. Existing rows may retain NULL challenges,
but the API deliberately refuses to redeem these unbound codes. Restart the
handoff from the updated frontend to obtain a new verifier-bound code. This does
not invalidate the user's existing global session or credentials. Verify the column
exists before releasing either handoff endpoint:

```sql
SELECT data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'domain_handoff_tokens'
  AND column_name = 'code_challenge';
```

Expect one row: `character varying`, length `43`, nullable `YES`. The migration
110 regression suite below does not test migration 111/112 or the browser PKCE flow.

Migration 110 serializes its own runs using a transaction advisory lock, takes
ACCESS EXCLUSIVE locks on users and present business tables before the backfill,
and holds locks through commit. Reads as well as writes can be blocked. Indexes
are built normally, not concurrently, and backfills are not batched. This trades
availability for an atomic snapshot and all-or-nothing conversion. Lock waits
are limited to 5 seconds; each statement is limited to 15 minutes (not a total
transaction deadline). Any error rolls back the entire migration, including its
completion marker. Investigate blockers or data errors before retrying; do not
blindly increase timeouts. Queued old writers must not resume after commit.

Existing organizations or tenant columns **without** the completion marker cause
a refusal. This includes installations that ran the earlier version of migration
110 or used ORM schema sync. Do not delete tenant data, overwrite subscription or
plan settings, or insert a marker to bypass this guard. Such databases need a
separate reviewed reconciliation using a verified legacy user cohort and existing
ownership; a blanket users-to-DevWeekends sweep is unsafe. This script deliberately
does not repair them. A completed rerun also does not repair later schema drift or update older
members-only overrides. If a previous version has already committed, this change
requires a separately reviewed subscription reconciliation; do not delete the
completion marker or rerun the user backfill to apply the expanded legacy contract.

Verify before reopening traffic, while only DevWeekends exists:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM organization_memberships om
JOIN organizations o ON o.id = om.organization_id
WHERE o.slug = 'devweekends' AND om.status = 'active';

-- Must return zero; counts alone can conceal incorrect membership assignments.
SELECT COUNT(*) FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM organization_memberships om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = u.id AND o.slug = 'devweekends' AND om.status = 'active'
);

SELECT * FROM migration_110_completion;
SELECT o.slug, p.key, s.status, s.overrides
FROM organization_subscriptions s
JOIN organizations o ON o.id = s.organization_id
JOIN plans p ON p.id = s.plan_id WHERE o.slug = 'devweekends';

SELECT table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'organization_id'
ORDER BY table_name;
```

Both initial counts must match the recorded cutover cohort. Check every expected
business table against `TENANT_TABLES` in migration 110, including ownership,
row counts, validated foreign keys and indexes. Optional absent tables are skipped;
the migration does not establish coverage for tables outside its list. Missing
core settings/roles/badges tables cause failure. These checks and the count equality
are cutover checks, not invariants once other workspaces are enabled.

There is no automatic down migration. If deployment fails after commit, keep
maintenance mode active and fix forward with tenant-aware code, or execute the
rehearsed database/application restore plan. Do not simply restart the old API.

### Isolation gate and remaining limitations

Keep `MULTI_TENANT_WORKSPACES_ENABLED=false` on the shared API. The rollout switch
must reject nondefault workspace traffic and workspace creation while leaving
DevWeekends functional. Verify these behaviors in the deployed API before reopening
traffic; migration 110 does not implement or enforce this application switch.

Many modules and raw SQL paths still need a tenant isolation audit. Profiles and
base roles are globally shared. Organization foreign keys validate that an
organization exists; they do not prove that related parent/child records have the
same organization. Do not create or onboard another tenant until query/write
scoping, cross-tenant relationships, authorization, jobs, caches, uploads and
Socket.IO have appropriate isolation coverage. This release is a DevWeekends
foundation/canonical-path rollout, **not blanket multi-tenant readiness**.

### Concrete model coverage gaps

Source inspection at this rollout found the following existing models without an
`organizationId` attribute. These are missing workspace ownership/scoping coverage,
not missing model files. They are outside migration 110's tenant backfill. This is
a concrete, non-exhaustive blocker list, not a claim that every listed endpoint is
exploitable: some children may be protected through a scoped parent, which must be
verified for every access and mutation path.

| Area | Existing models without direct workspace ownership |
| --- | --- |
| Scheduling | `ScheduledMeeting`, `MeetingNote`, `AvailabilitySlot`, `AvailabilityRule`, `ReviewSchedule`, `MenteeSchedule`, `ScheduleTemplate`, `AdminMeeting`, `CohortReviewSession`, `CohortReviewEntry`, `CohortReviewUnlockGrant`, `CohortReviewUnlockRequest` |
| Interviews and quizzes | `InterviewKit`, `InterviewQuestion`, `InterviewAssignment`, `InterviewSession`, `InterviewAnswer`; `QuizKit`, `QuizQuestion`, `QuizAssignment`, `QuizSession`, `QuizAnswer` |
| Intake and program children | `Assessment`, `AssessmentQuestion`, `AssessmentSubmission`, `CohortAssessment`, `RubricSnippet`, `ClanJoinRequest`, `ClanChangeRequest`, `ClanMemberPermission`, `CrossClanAssignment`, `ProgramReview` |
| Task children | `TaskSubmissionFile`, `TaskFeedback`, `TaskProgressEntry`, `TaskResource`, `TaskSkill`, `DailyLogEntry`, `DelayEvent`, `RoadmapProgress`, `RoadmapLink`, `MentorMenteeMatch` |
| Messaging and community children | `MessageAttachment`, `MessageReaction`, `CommunityComment`, `CommunityReaction`, `CommunityReport`, `AnnouncementReaction` |
| Analytics and rewards | `AnalyticsEvent`, `ActivitySession`, `ProgramAnalytics`, `TaskAnalytics`, `MentorAnalytics`, `MenteeAnalytics`, `SkillAssessment`, `AdaptiveRecommendation`, `Challenge`, `UserChallenge`, `Gift`, `Redemption` |
| Files and background work | `FileUpload`, `FeedbackReport`, `ScheduledJob`, `EmailQueue`, `AIEvaluationQueue` |
| RAG (defined in `server/src/features/rag/models.js`) | `MentorStyleProfile`, `KnowledgeChunk`, `RagIngestionJob`, `MessageDraft`, `MentorEditHistory` |

The ORM scope installer uses explicit `organizationId` attributes, with special
membership-filtered reads for `User`, `MentorProfile` and `MenteeProfile`. It does
not automatically infer workspace ownership for all the models above, protect raw
SQL, or establish isolation for jobs without request context. Profiles, skills and
base roles remain shared identity data; adding a column alone is not a substitute
for deciding their ownership contract. Keep the rollout gate disabled until these
paths have reviewed scoping and adversarial cross-workspace tests.

### Preserved credentials and intentional admin behavior changes

The foundation migration preserves existing user IDs, password hashes, 2FA data,
and global session/refresh-token records. No blanket password reset or session
revocation is part of migration 110. Browser storage remains origin-specific; the
PKCE handoff establishes a session at the canonical origin, and ordinary expiry,
account status and membership checks still apply. Preserved records are not a
promise that every old browser can bypass these checks.

Admin behavior intentionally changes in `adminService`: suspend/reactivate/remove
now update the selected workspace's membership to `suspended`/`active`/`left`.
Removal does not delete the global account or learning records, and suspension
does not revoke global sessions. Non-active membership denies subsequent workspace
access and disconnects that workspace's sockets. These endpoints reject self-actions
and management of owner/admin memberships; reactivation requires a suspended member.

Workspace-admin support controls for editing global identity (including name,
email and base role), setting a password, sending an admin-triggered password-reset
email, and disabling 2FA are deliberately disabled—even for a user with only one
membership. Account owners must use account settings or public password recovery.
Do not describe this rollout as preserving every former admin operation: it
preserves credentials and data while narrowing admin authority to workspace
membership. Verify the UI communicates these restrictions before reopening traffic.

### Isolated migration regression tests

```bash
node --test server/tests/migrations/110-safety.test.cjs
```

This standalone suite starts and stops its own temporary PostgreSQL cluster with
a private Unix socket and no TCP listener. It never reads application dotenv files,
uses `DATABASE_URL`, or touches the shared Jest test database, so other suites can
run independently. It requires local PostgreSQL binaries (default
`/usr/lib/postgresql/16/bin`; override `MIGRATION_TEST_PG_BIN`) and a non-root user.
The migration 110 suite contains **9 regression subtests** inside one parent test
(Node reports **10 tests** total). It verifies conversion of 1,601 users, frozen
legacy entitlements, rerun isolation, rollback, concurrent migration runs, lock
contention and fail-closed legacy writes. They are not a production-sized rehearsal
or an end-to-end tenant-isolation test.

## Production configuration

Product Vercel project:

```text
NEXT_PUBLIC_APP_URL=https://app.pathment.me
NEXT_PUBLIC_APP_HOST=app.pathment.me
NEXT_PUBLIC_API_URL=https://api.pathment.me/api
DEFAULT_WORKSPACE_SLUG=devweekends
```

Shared API:

```text
APP_URL=https://app.pathment.me
CLIENT_URL=https://app.pathment.me,https://pathment.me,https://*.pathment.me
LINK_URL=https://links.pathment.me
TENANT_DOMAIN_SUFFIX=pathment.me
DEFAULT_WORKSPACE_SLUG=devweekends
DEFAULT_ORGANIZATION_SLUG=devweekends
DEFAULT_ORGANIZATION_NAME=Dev Weekends
MULTI_TENANT_WORKSPACES_ENABLED=false
```

`APP_URL` is the canonical product origin. Include the explicit marketing apex
`https://pathment.me` in `CLIENT_URL` so pricing requests pass CORS; the subdomain
wildcard does not cover the apex.

## Manual plan requests and invoice activation

There is no self-service workspace signup/purchase or integrated payment processor
in this rollout. Plan requests are handled by a trusted operator; submitting a
request does not collect payment or activate the requested plan. Keep the isolation
gate disabled regardless of billing status until isolation coverage is complete.

From the `server` directory, an operator can review pending requests:

```bash
node scripts/manageManualBilling.js list
```

After checking the pending request and confirming the invoice externally, activate
its plan with all required flags (example values; use the actual workspace, invoice,
operator identity and a future invoice coverage end timestamp):

```bash
node scripts/manageManualBilling.js activate --workspace devweekends --plan growth \
  --until 2026-12-01T00:00:00Z --operator operator@example.com --invoice INV-2026-001
```

These commands use the operator deployment's `DATABASE_URL`; verify the target
before running them. The script sends no email and processes no payment. Activation
requires the selected plan to match the pending request, records the invoice and
operator in an audit entry atomically with activation, and sets the coverage end.
An identical invoice/plan/end-date retry is idempotent; conflicting reuse is rejected.
Existing subscription overrides are preserved, including DevWeekends' legacy
contract. The command does not provision a workspace or bypass the isolation gate.

## Release order

1. Follow the maintenance procedure above: back up PostgreSQL, stop all writers,
   and run migrations **110 → 111 → 112** in that order. Migration 112 is mandatory
   before deploying the PKCE-aware API and handoff frontend.
2. Deploy the tenant-aware shared API with `MULTI_TENANT_WORKSPACES_ENABLED=false`,
   verify DevWeekends writes and rejection of nondefault tenant traffic/creation,
   and run its health check before lifting maintenance mode.
3. Add `app.pathment.me` to the product Vercel project.
4. Deploy the product frontend.
5. Update the marketing frontend.
6. Keep `devweekends.pathment.me` attached to the product project. Existing
   signed-in browsers use a two-minute, one-use, PKCE-bound handoff code to establish a
   session on `app.pathment.me`; access and refresh tokens never enter the URL.
7. Check login, refresh, invitations, password reset, role switching, messages,
   certificates, uploads, and Socket.IO from the canonical URL.

## Compatibility behavior

- `/w/devweekends/mentor/dashboard` is internally rewritten to the existing
  `/mentor/dashboard` route, so feature pages are not duplicated.
- `devweekends.pathment.me/mentor/dashboard` briefly renders the migration
  bridge and then opens `/w/devweekends/mentor/dashboard`. Browsers without a
  session are sent to the equivalent canonical public page or sign-in.
- An old unprefixed product link uses the last-workspace cookie and redirects to
  the corresponding `/w/<workspace>/...` URL.
- Email links keep the workspace in the `links.pathment.me` path and redirect to
  the shared app origin.

Do not remove the legacy Dev Weekends DNS record until old bookmarks and emails
have aged out.

After the migration window, when legacy-host traffic has fallen to zero, the
bridge can be replaced with a permanent redirect and migration 111's expired
rows can be deleted. Keep the table until then so an older open tab can still
move without forcing a login.
