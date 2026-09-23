# Session handoff security audit

The canonical app first creates a random verifier and state in its tab's sessionStorage. It sends only the SHA-256 challenge and state to the exact legacy workspace origin. That origin authenticates with its existing bearer session and obtains a short-lived, workspace-bound code. The canonical callback validates its locally stored state, workspace and expiry before redeeming with the verifier. Unsolicited bearer links and pre-PKCE codes fail closed.

Codes and challenges travel in URL fragments, which are scrubbed on processing. Both handoff components share one promise per document, including failures, so effect cleanup/replay never sends another redemption. HTTP calls bypass global logout interceptors. Issuance retries exactly once on an explicit 401, reusing a completed proactive token renewal or the shared single-flight refreshAccessToken helper. Redemption never retries. A new session is saved only after successful verification, and a different existing destination account is never replaced: the user must explicitly sign out before transferring another account. Neither source tokens nor an existing destination session are cleared on transfer failure. A lost successful response requires a fresh transfer from the legacy origin; codes remain one-use.

The API additionally requires an exact legacy workspace Origin for issuance and the canonical APP_URL Origin for consumption, independently of CORS. Missing and null origins are rejected. CORS CLIENT_URL must allow the canonical app and the legacy workspace origins during migration; wildcard CORS alone does not authorize a transfer. Both issuance and redemption call organizationService.assertWorkspaceAvailable, including the rollout gate for additional workspaces. The selected organization must match the code's workspace, membership must still be active, and the account must be active and verified. Redemption locks the code and issues the refresh token in one transaction. Response preparation failures occur before spending the code.

Frontend routing validates remembered and selected workspace slugs, excludes reserved service hosts, ignores untrusted x-forwarded-host, and prevents workspace rewrites into API/internal routes. Scoped dotted paths still undergo validation. The URL is the authoritative selection; membership remains server-enforced.

## Deployment prerequisites

- Apply migration `112_handoff_pkce.js` after `111_domain_handoff_tokens.js` on the intended non-production validation database before rollout. After explicit coordination, this audit applied migration 112 only on the verified local localhost:5432/pathment_test database. No production database was accessed.
- Server `APP_URL` and client `NEXT_PUBLIC_APP_URL` must identify the same canonical origin (default `https://app.pathment.me`). Set `CLIENT_URL` to permit that origin and the intended legacy origins.
- Deploy the frontend on both the canonical and legacy origins. Existing unbound transfer codes deliberately stop working; users can start a fresh transfer.

## Verification

Database-free commands:

```
node --test client-interface/tests/handoff-routing.test.cjs
cd server && ./node_modules/.bin/jest --config jest.handoff-unit.config.js --runInBand
```

Verification passed: 12 frontend routing/transfer tests, 12 database-free server security tests, and all 5 tests in `server/tests/organizations/domain-handoff.test.js`. Integration ran serially after explicit coordination and migration 112, with environment loaded explicitly from `.env.test`, NODE_ENV=test, and a pre-connection guard requiring a loopback host and a test database name. Frontend TypeScript and focused ESLint checks passed. The database has been released for other suites.

References: [OAuth security BCP: PKCE and CSRF](https://www.rfc-editor.org/rfc/rfc9700.html), [React StrictMode effect replay](https://react.dev/reference/react/StrictMode).
