# Multi-tenant release review

## Release decision

Keep `MULTI_TENANT_WORKSPACES_ENABLED=false`. This change is a hardened
DevWeekends foundation, not approval to onboard a second organization.
The HTTP/socket switch blocks other workspaces and workspace creation. It does
not isolate background processing if another tenant's data already exists.

Production was not migrated or deployed as part of this review. Rehearse the
[maintenance rollout](WORKSPACE_PATH_ROLLOUT.md) on a restored copy first.
Migration 110 preserves existing user identities and assigns the legacy cohort
to DevWeekends, with explicit legacy subscription overrides. It refuses an
ambiguous previously migrated database rather than guessing ownership.

## Product flow

- Public visitors see the published catalog at `pathment.me/pricing`.
- Existing workspace owners/admins use **Settings → Plans** to request a plan.
  The current plan remains active while the request is pending.
- A Pathment operator reviews the request and prepares an invoice externally.
  After invoice confirmation, the trusted billing CLI activates that plan and
  records the invoice reference, operator and coverage end date atomically.
- There is no online checkout, automatic invoice delivery, automatic collection,
  renewal scheduler, or self-service first-owner registration in this release.
  New customer onboarding remains assisted and is gated pending isolation work.
- Subscriptions belong to workspaces. The intended membership contract is one
  account with separate invitations, roles and access for each workspace.
  Creating another workspace must not copy DevWeekends mentors or mentees.

The billing commands and environment settings are in the rollout guide.
Do not expose the activation service as a workspace-admin HTTP endpoint.

## Security changes covered by this review

- ORM reads and joined tenant models use the selected workspace; identity/profile
  directories require workspace membership. Tenant writes reject foreign owners
  and validate supported related records.
- Global account roles no longer grant fallback authority in a second workspace.
- Suspension and removal change membership, not the global account. Workspace
  admins cannot alter global passwords, identity fields or two-factor settings.
- Realtime events use workspace rooms and authenticated request context, with
  membership revocation checks.
- Legacy-domain session transfer is bound to a destination-browser verifier,
  state, exact origins and a one-use code. Workspace auth caches cannot restore
  privileges after a forbidden response.
- Public pricing lists shipped entitlements. Manual activation is operator-only,
  transactional, audited and idempotent for the same invoice and activation.

## Remaining blockers before additional workspaces

1. Finish model/relationship ownership and raw SQL scoping, including the concrete
   model inventory in the rollout guide. ORM hooks are not database row security.
2. Persist tenant ownership on jobs and bind execution/retries to that ownership.
   Audit scheduler batches, certificate evaluation, RAG and email generation.
3. Separate workspace-specific mentor/mentee profiles, counters and role semantics
   from global account identity throughout legacy modules.
4. Verify workspace-bound navigation, caches, uploads and full browser flows with
   adversarial two-workspace scenarios. Unit/type/build checks cannot prove this.
5. Configure shared realtime infrastructure before promising immediate revocation
   and presence across multiple API processes.

See [realtime and worker audit](TENANT_SOCKET_WORKER_AUDIT.md),
[handoff audit](HANDOFF_SECURITY_AUDIT.md), and
[admin membership lifecycle](ADMIN_WORKSPACE_USER_LIFECYCLE.md).

## Validation performed

- 59 database-backed regressions passed across tenant isolation, portal scope,
  certificate mentor scope and generated links, against the local test database.
- 67 mocked backend tests passed across socket isolation, admin membership and
  directory behavior, handoff security and certificate socket delivery.
- 34 frontend unit regressions passed for auth caches and handoff routing.
- 5 handoff integration tests passed; migration 112 was applied only to the local
  test database for those tests.
- Migration 110 passed 9 scenarios using a private temporary PostgreSQL cluster,
  including a 1,601-user conversion and failure/rerun cases.
- Application and marketing production builds passed. Application TypeScript and
  focused changed-file lint checks passed; no claim of a clean whole-repo lint run.

These checks do not replace the required restored-production migration rehearsal,
browser end-to-end verification, or unfinished cross-workspace isolation audit.
