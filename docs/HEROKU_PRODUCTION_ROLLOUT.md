# Heroku production cutover: DevWeekends only

Do not test this release for the first time on production. The additional-workspace
gate must remain disabled. Read WORKSPACE_PATH_ROLLOUT.md for schema prerequisites
and remaining isolation limitations. Local demo success is not a production rehearsal.

## 1. Before committing/deploying

- Disable automatic deployments of the backend and frontend during the cutover.
  Committing/pushing must not unexpectedly start new code against old tables.
- Rehearse these migrations against an isolated restored production backup, with
  outbound mail and all workers disabled. Check runtime, data counts, disk space,
  login, roles, tasks, messages, certificates and workspace settings.
- Prepare/rehearse a full database restore with the matching old application release.
  Heroku application rollback does not undo a database migration.
- Verify earlier migrations through 109 are present. An existing tenant schema
  without migration_110_completion needs reconciliation, not a blanket baseline.
- Confirm frontend canonical/legacy domains and DNS are ready before setting APP_URL.

## 2. Inventory (read-only)

From the repository root:

```bash
export PATHMENT_APP=pathment-api
heroku ps --app "$PATHMENT_APP"
heroku releases --app "$PATHMENT_APP" --num 5
heroku pg:info --app "$PATHMENT_APP"
```

Record the old release and exact dyno formation. Inspection on 2026-09-23 showed
one Basic web dyno, release v117, PostgreSQL 17.9, and about 750 MB used of 1 GB.
These values can change: recheck them. Leave enough storage for the conversion;
measure with a representative restore rather than assuming remaining space suffices.

Read-only schema inspection found 1,088 users, no organizations table, no
migration_110_completion table, and zero organization_id columns. The reported
user count differs from the expected 1,500+: confirm the app/database is the
intended production target before any write. This inspection is not a rehearsal
and does not verify that all prerequisite migrations through 109 are present.

## 3. Enter maintenance and stop writers

```bash
heroku maintenance:on --app "$PATHMENT_APP"
heroku ps:scale web=0 --app "$PATHMENT_APP"
heroku ps --app "$PATHMENT_APP"
```

The web process starts email, RAG, certificate and scheduler workers. Maintenance
mode alone does not stop them. Also stop any separate worker dynos, Scheduler jobs,
one-off jobs, external services or scripts writing to this database. Verify they
are stopped. Do not set the acknowledgement flag until this is true.

Capture the final backup after writers stop:

```bash
heroku pg:backups:capture DATABASE_URL --app "$PATHMENT_APP"
heroku pg:backups --app "$PATHMENT_APP"
```

Record the completed backup ID. Stop if the backup fails. Backup restore must
already have been rehearsed before this outage.

## 4. Deploy the reviewed commit while web remains at zero

Deploy that exact commit using the app's existing GitHub deployment integration.
The repository's heroku.yml builds the root Dockerfile; it copies server/ into
/app. Wait for a successful release. Check `heroku releases` and `heroku ps` again
to ensure the intended commit is deployed and no web process restarted.

Alternatively, with GitHub auto-deploy disabled, deploy the committed HEAD from
the repository root via the CLI (choose one deployment method):

```bash
heroku git:remote --app "$PATHMENT_APP" --remote production-heroku
git push production-heroku HEAD:main
heroku releases --app "$PATHMENT_APP" --num 3
heroku ps --app "$PATHMENT_APP"
```

Do not force-push if rejected; inspect the remote/release state first. These
commands deploy committed files only, so all reviewed new migration files,
middleware, models, scripts and frontend changes must be included in your commit.

Set these reviewed backend values (only after canonical domains are ready):

```bash
heroku config:set --app "$PATHMENT_APP" \
  DEFAULT_ORGANIZATION_SLUG=devweekends \
  MULTI_TENANT_WORKSPACES_ENABLED=false \
  APP_URL=https://app.pathment.me \
  CLIENT_URL=https://app.pathment.me,https://pathment.me,https://*.pathment.me
```

If TENANT_SLUG is already configured, it must also be devweekends. Preserve
DATABASE_URL, JWT secrets, encryption keys and provider credentials. Do not copy
local .env or DB_SSL=false to Heroku. Config changes create releases, so recheck
web is still zero afterwards.

## 5. Run migrations in the new image

Container CLI caveat verified on staging: Heroku CLI 11.8.1 `run --exit-code`
injects a shell status wrapper that this image rejects with `command parsing
error`. Avoid that flag and chained shell commands. Use direct one-off commands
and verify each migration's database postconditions; CLI exit 0 alone is not proof.

```bash
heroku run --no-tty --app "$PATHMENT_APP" --env MIGRATION_110_MAINTENANCE=true 'node /app/scripts/migrations/110_multi_tenant_foundation.js'
# Verify migration_110_completion and membership/data checks before continuing.
heroku run --no-tty --app "$PATHMENT_APP" 'node /app/scripts/migrations/111_domain_handoff_tokens.js'
# Verify domain_handoff_tokens exists before continuing.
heroku run --no-tty --app "$PATHMENT_APP" 'node /app/scripts/migrations/112_handoff_pkce.js'
# Verify code_challenge exists before continuing.
```

Alternatively, start one interactive shell:

```bash
heroku run bash --app "$PATHMENT_APP"
```

Inside the dyno, run individually, stopping immediately if any fails:

```bash
cd /app
MIGRATION_110_MAINTENANCE=true node scripts/migrations/110_multi_tenant_foundation.js
node scripts/migrations/111_domain_handoff_tokens.js
node scripts/migrations/112_handoff_pkce.js
exit
```

The /app working directory contains scripts/, not server/scripts/. Do not use
db:sync, db:sync:alter, db:reset, --baseline, seed:admin or seed:demo in production.
Migration 110 seeds plans/subscription and backfills existing memberships; no
production user seeder is required. Direct scripts do not update the generic
schema_migrations ledger; review that ledger separately before later runner use.

## 6. Validate data before restarting

Open `heroku pg:psql --app "$PATHMENT_APP"` and run the SQL checks in
WORKSPACE_PATH_ROLLOUT.md. Verify the pre-cutover user count is unchanged, every
existing user has the correct DevWeekends membership, every listed tenant table
has correct ownership, the completion marker exists, legacy subscription overrides
are correct, and domain_handoff_tokens.code_challenge exists. Stop on any mismatch.

Frontend production build variables:

```text
NEXT_PUBLIC_API_URL=https://api.pathment.me/api
NEXT_PUBLIC_APP_URL=https://app.pathment.me
NEXT_PUBLIC_APP_HOST=app.pathment.me
DEFAULT_WORKSPACE_SLUG=devweekends
```

Use the actual verified API hostname if it differs. Rebuild/deploy the frontend
with these values; NEXT_PUBLIC variables are embedded at build time. Keep the
legacy DevWeekends domain available for the secure session handoff. Deploy the
marketing pricing changes with the matching API endpoint as well.

## 7. Restore service and smoke-test immediately

Restore the exact previous formation (web=1 was observed; use your recorded count):

```bash
heroku ps:scale web=1 --app "$PATHMENT_APP"
heroku logs --tail --app "$PATHMENT_APP"
```

Check startup errors before reopening traffic. /api/health only proves the API
responds; it does not prove tenant migration correctness. With maintenance on,
Heroku's public router will show its maintenance response. After DB validation
and clean startup, reopen for the controlled smoke test:

```bash
heroku maintenance:off --app "$PATHMENT_APP"
```

Test an existing admin, mentor/co-mentor and mentee; legacy-domain session handoff;
workspace membership; role/clan-scoped pages; tasks/messages; certificate review
and issuance visibility; plans/settings. Additional workspace creation must fail.
Watch logs. Re-enable scheduled external jobs only after successful checks.

## If anything fails

Keep/re-enable maintenance and stop writers. Preserve logs and the backup ID.
If migration 110 failed, its own transaction rolls back, but separately run
migrations may have committed. Do not blindly retry, edit the completion marker,
or run schema sync. After a committed schema migration, prefer a reviewed fix
forward; otherwise execute the rehearsed full DB-and-code restore procedure.
`heroku rollback` alone is unsafe after this schema conversion.

References: https://devcenter.heroku.com/articles/maintenance-mode
and https://devcenter.heroku.com/articles/heroku-postgres-backups
