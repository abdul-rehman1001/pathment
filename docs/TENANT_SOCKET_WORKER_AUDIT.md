# Realtime and background tenant audit

Socket changes bind connection work and each event to a fresh authenticated AsyncLocalStorage context, reject temporary 2FA JWTs and unverified/inactive accounts, call `organizationService.assertWorkspaceAvailable` before membership, and recheck active membership on incoming events. User rooms, conversation rooms, and presence are organization-scoped. Context-free emissions are dropped, and context-free presence returns false. No global user-room compatibility fallback remains.

The availability gate is owned by the organization service: `MULTI_TENANT_WORKSPACES_ENABLED` defaults false, rejects nondefault workspaces, and should only be enabled for isolated multi-tenant validation until the blockers below are resolved. Socket unit tests mock this boundary and verify it is invoked before membership. This gate does not isolate existing mixed-tenant background data.

## Worker blockers (not fixed by socket context binding)

- `server/src/db/index.js`: tenant hooks apply only to models with organizationId. Missing context leaves reads unscoped and assigns writes to the default workspace. Raw SQL bypasses those hooks. Wrapping an entire global batch in one tenant context would misattribute other tenants' rows.
- `server/src/services/notificationScheduler.js`: global startup/interval execution, task and clan scans, global User selection for weekly reports, enrollment aggregation, and notification/standup writes have no per-tenant execution context. This can aggregate across organizations and assign resulting notifications/posts to the default organization. Review, admin meeting, recurring-slot, and reengagement ticks need their model coverage, joins, recipient membership, dedupe keys, and generated URLs audited before tenant iteration is safe.
- `server/src/workers/certificateWorker.js`: global claims and micro-batches grouped by runId, raw SQL run counts, template lookup, evaluation persistence, and completion aggregation have no tenant execution context. Queue rows must carry validated organization ownership; claims, batching, retries, completion and results must include it. Progress (including failure) and completion delivery now resolves the persisted CertificateTemplate.organizationId, verifies the triggering user still has active membership, and enters that context only for emission. Completion aggregation is restricted to run/template/triggering user. Missing ownership or membership drops the event without retrying persisted work. This restores default-workspace progress without a global fallback, but does not isolate the execution, claims, raw counts, or evaluation persistence described above.
- `server/src/features/rag/workers/{ingestionWorker,learningWorker}.js`: raw global claims/reapers and execution resolve AI credentials by mentor without re-entering a tenant context. Persist job ownership, validate document/edit/mentor membership and AI-connection ownership, scope vector/style stores and raw SQL, and bind each execution/retry to its own tenant. `features/rag/index.js` starts both workers unconditionally.
- `server/src/workers/emailWorker.js` / `services/emailService.js`: raw global queue claims/reapers and per-row delivery have no tenant context. Global transport of already rendered mail is not itself proof of wrong-recipient delivery, but queue ownership, idempotency namespaces, branding/links, suppression policy, and recipient authorization need an explicit tenant contract. The worker cannot repair content incorrectly generated upstream.

## Safe rollout prerequisites

Keep nondefault workspace traffic gated. Before enabling it, migrate/backfill required tenant ownership (including queues and related models), quarantine ambiguous jobs instead of defaulting them, enforce tenant predicates on raw SQL, and run each job under its persisted, validated organization context. Scheduler enumeration should explicitly select eligible organizations and execute scoped work separately. Recheck recipient membership and namespace dedupe/cache/vector keys. Account-level authentication emails need an explicit global category rather than an inferred default tenant.

If mixed-tenant rows already exist, the HTTP/socket gate alone is insufficient: pause affected background execution through reviewed controls. Existing controls include `NOTIFICATION_SCHEDULER_DISABLED`, `CERTIFICATE_WORKER_DISABLED`, and `AI_EVAL_WORKER_DISABLED`. Email and RAG startup do not currently expose equivalent disable flags; add explicit worker gates before relying on a pause strategy. No deployment configuration was changed in this audit.

Socket lifecycle revocation: `disconnectWorkspaceUser(userId, organizationId)` removes all sockets in the workspace user room through the Socket.IO adapter, including their conversation rooms. Admin membership suspension/removal must call this immediately after the successful update (after commit for transactional updates). Incoming events recheck membership; a 60-second timer also checks idle sockets, disconnecting on denial or lookup failure and clearing on disconnect. Changes bypassing the mutation hook retain a detection window of up to 60 seconds plus query latency. Immediate revocation across multiple processes requires a shared Socket.IO adapter; the current in-memory adapter and presence are process-local. The timer is fallback protection, not a guarantee of immediate revocation for out-of-band database writes.

## Validation

Standalone mocked socket tests exercise temporary-token denial, membership/availability denial, gate ordering, connection context, concurrent event isolation across an await, tenant rooms/emits/presence, context-free worker emission suppression, revoked membership blocking the next event, immediate workspace-only removal of multiple sockets/private rooms, idle revalidation with timer cleanup, and an event blocked when disconnected during its membership check. Run without repository DB setup:

```sh
cd server
./node_modules/.bin/jest --config '{"testEnvironment":"node","testMatch":["**/tests/socket/tenant-isolation.test.js"]}' --runInBand
```

No DB tests, migrations, external sends, or production DB access were performed. Database-backed authorization, worker retries and mixed-tenant integration scenarios remain unverified.

Certificate delivery validation: four additional DB-free tests cover context-free progress/completion routing, failure routing despite conflicting ambient context, missing ownership, and revoked recipients without job retries. Newton’s adminService suspension/removal disconnect hook was verified in the working tree.
