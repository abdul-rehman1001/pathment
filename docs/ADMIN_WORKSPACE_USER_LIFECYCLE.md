# Admin workspace user lifecycle

Admin mentor/mentee directory and detail responses expose the selected workspace's
OrganizationMembership.status in the existing user `status` field. Active and
suspended memberships remain visible through the User directory hooks; invited,
left, and other-workspace-only memberships are excluded. Status serialization
never falls back to User.status when a membership is absent. Response envelopes,
pagination, and existing fields retain their shape.

Suspend and reactivate change only workspace membership status. Remove sets the
membership to `left`; it preserves the account, global sessions, learning records,
and other memberships. Reactivation accepts suspended memberships only; removal
requires a separate joining/invitation flow to restore access. Workspace access
checks enforce the membership state on subsequent authenticated requests. After a
successful suspend/remove update, the service immediately calls
`disconnectWorkspaceUser(userId, organizationId)`; reactivation does not disconnect
sockets.

Global User.status remains an account-level authentication control. A workspace
reactivation does not override a global account suspension.

## Legacy account role

User.role and account capabilities remain global legacy identity fields. The
mentor/mentee directories still select their category using User.role. This does
not represent a workspace-local mentor/mentee role, and this change does not
migrate role or profile storage. OrganizationMembership.role (owner/admin/member/
guest) and scoped authorization assignments are separate access concepts.

Workspace admins cannot edit shared names, email, global account role, password,
or 2FA through admin user endpoints, nor trigger admin password-reset emails.
These endpoints return 403, including for single-membership DevWeekends accounts;
a membership-count exception would race with joining another workspace. Account
owners use profile/security settings or public password recovery. The shared
admin account drawer is read-only and explains this restriction.

The directory status lookup uses explicit organizationId predicates and batches
the current page's IDs. It requires no global scope bypass or cross-organization
membership count. Database index/hooks, authService, and migrations are unchanged
by this controller/UI work.
