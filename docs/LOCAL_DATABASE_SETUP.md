# Existing local database: workspace upgrade

Run commands from `server/`. These instructions are for an existing pre-110
DevWeekends database with earlier migrations already applied. They are not an
empty-database bootstrap procedure.

1. Check that `server/.env` points to your intended local database. For PostgreSQL
   without TLS, set `DB_SSL=false`. Migration scripts read `server/.env`;
   exported environment variables take precedence. Do not paste database passwords
   into issue reports.
2. Back up that database. Stop the backend (`npm run dev` / `npm start`) and all
   separate workers/schedulers before running migration 110. The flag below is an
   acknowledgement; it does not stop processes for you.
3. Apply the workspace migrations in order:

```bash
MIGRATION_110_MAINTENANCE=true node scripts/migrations/110_multi_tenant_foundation.js
node scripts/migrations/111_domain_handoff_tokens.js
node scripts/migrations/112_handoff_pkce.js
```

Stop at the first error. Do not run later commands after a failure. For local
plain PostgreSQL, `DB_SSL=false` can also prefix each command if not in `.env`.
Keep `MULTI_TENANT_WORKSPACES_ENABLED=false`, then restart the backend after all
three migrations succeed and verify existing DevWeekends login and data.

## Understand common failures

| Error | Meaning and next action |
| --- | --- |
| `requires MIGRATION_110_MAINTENANCE=true` | No database connection was made. Stop writers, then run the command above. |
| `server does not support SSL` | Set `DB_SSL=false` for local PostgreSQL without TLS. |
| Existing organizations/tenant columns without completion marker | An earlier implementation or schema sync already changed the database. Preserve it and reconcile ownership; do not delete tables, fabricate the marker, or baseline around the error. |
| Missing relation/table | Earlier schema prerequisites are missing; inspect migration history before retrying. |
| Lock timeout | A connection may still be using the tables. Stop/drain the process and retry; do not remove the migration lock. |
| `role_assignments_organization_id_user_id_role_scope_type_scope_... already exists` during sync | The generated index name exceeded PostgreSQL's 63-byte limit. The model now uses `role_assignments_org_scope_uniq`; retrying local sync with the updated code handles an existing truncated index without deleting it or its data. This fixes schema sync only, not workspace initialization. |

`npm run db:migrate` (also `npm run migrate`) runs the tracked migration runner.
Use it only when its history accurately reflects your database. Direct execution
of a numbered script does not insert its name into `schema_migrations`, so status
may still list it as pending. Migration 110 has its own completion marker; 111/112
are idempotent. Do not replay all old migrations or use a blanket `--baseline`
to hide unknown history. `db:sync`, `db:sync:alter`, and `db:reset` are not upgrade
or repair commands for this migration.

## Seeders

Existing users need **no seeder**. Migration 110 backfills their DevWeekends
memberships and seeds plans and the legacy subscription.

- `npm run seed` prints available seeding commands; it does not write data.
- `npm run seed:skills` adds missing shared skills, if needed.
- `npm run seed:admin` is a legacy local bootstrap using fixed credentials. It
  skips an existing account; it is not a password reset or membership repair.
  Do not run it against production. Migrate first so the workspace exists.
- `npm run seed:schedules` is optional single-workspace sample schedule data.
- `npm run seed:demo` is for a dedicated demo database only. It refuses production,
  real accounts and other workspaces before clearing its demo namespace. It creates
  DevWeekends, missing catalog plans and a demo subscription before creating demo
  users, then runs all seed operations within that workspace. Reruns preserve
  existing plan/subscription settings and recreate demo records.

## Fresh disposable demo database

After configuring a separate local database in `server/.env`:

```bash
npm run db:sync
npm run seed:demo
npm run dev
```

Do not run `seed:admin` first: the demo seeder creates its own admin and refuses
non-demo accounts. Do not run migration 110 after this flow; 110 converts a legacy
schema, whereas this flow creates the current schema directly. No migration
completion marker or blanket migration baseline is fabricated by the demo seed.
The seed remains a development fixture, not a production migration or initializer.

For production backups, cutover checks and the full limitations, read
[WORKSPACE_PATH_ROLLOUT.md](WORKSPACE_PATH_ROLLOUT.md).
