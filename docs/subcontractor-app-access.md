# Subcontractor app access — first phase

This phase adds external accounts, invitations, access management and API authentication. It does not add the subcontractor environment to the employee app or enable chat/reports for external identities.

## Data preservation

- `Subcontractor` remains the company-owned business record. Existing IDs, costs, assignments, files and project history are unchanged.
- `SubcontractorAccount` stores external credentials. It never creates an employee `User`, `Office` or `UserCompany`, and does not consume an employee seat.
- `SubcontractorAccess` connects an account to an existing subcontractor. Company scope is derived from that subcontractor, not a company ID submitted by the caller.
- `SubcontractorInvite` has one invitation slot per subcontractor/email; resending rotates its token, invalidates the old link and records the latest inviter. This is not a full invitation audit log.
- `Participant` is a future shared authorship reference. Acceptance creates an external participant only. The optional inverse `User.participant` is schema metadata, not a new column on `User`. No internal participants, chat members or feed authors are backfilled.
- Foreign keys restrict deletion of subcontractors with access/invitation history. Revocation preserves the business record, account and history. Legacy subcontractors without these new links keep their existing deletion behavior.
- External login email is normalized independently. Changing a subcontractor's commercial email does not change credentials, invitations or grants.

## Configuration (disabled by default)

```dotenv
SUBCONTRACTOR_ACCESS_ENABLED=false
SUBCONTRACTOR_WEB_URL=https://your-existing-smartbuild-web-origin.example
```

`SUBCONTRACTOR_WEB_URL` must be an HTTPS URL (HTTP is accepted only for localhost/127.0.0.1). Invitations use `/subcontractor-invite#token=...`; the raw token is absent from HTTP request URLs. Existing `SENDGRID_KEY`, sender configuration and `SECRET_JWT` are required. Secrets and `.env` files are not modified by this change.

Keep the feature disabled until schema deployment and controlled testing are complete. Disabled routes return `503 SUBCONTRACTOR_ACCESS_DISABLED` before querying the new tables. The Web shows a non-blocking unavailable message; existing subcontractor operations remain usable.

## Deployment procedure — not executed by this implementation

1. Review `prisma/migrations/20261019120000_add_subcontractor_app_access/migration.sql` against a representative restored copy of the database. It creates four new tables and only alters those new tables for keys/checks. It does not update/delete existing rows or alter legacy table columns.
2. Confirm MySQL version (8.0.16+ for enforced CHECK constraints), existing migration history and a usable backup/restore procedure. Validate the migration on the restored copy first.
3. Generate the Prisma client and deploy compatible API and Web with the feature disabled.
4. Have the database operator apply the reviewed migration through the normal controlled deployment process. Do not use `db push`, `migrate reset` or `migrate dev` against production.
5. Configure the Web origin and email delivery, then explicitly enable the feature in the test environment. Test one legacy and one newly created subcontractor before any production enablement.
6. Enable production separately when approved. No bulk invitations or account conversion job is supplied.

Rollback is to disable the feature and leave the additive tables/history in place. Do not drop tables to roll back an application release.

### MySQL compatibility and manually repaired deployments

The participant identity CHECK was removed because it references `userId` and `subcontractorAccountId`, whose foreign keys use `ON UPDATE CASCADE`. MySQL prohibits this combination. Foreign keys, unique indexes, the participant type enum and all three status/delivery CHECKs remain. The database does not enforce the exclusive choice between participant identities; creation code must supply the identity matching its type (invitation acceptance creates a subcontractor participant with only `subcontractorAccountId`).

If an environment already repaired this migration manually, compare its exact executed SQL, `SHOW CREATE TABLE` for all four new tables and its `_prisma_migrations` record with this repository before another migration deployment. A local file correction does not reconcile an already recorded migration checksum. Do not rerun the CREATE TABLE statements, reset the database or edit migration history blindly. Preserve the backup and document the actual repair before choosing the appropriate reconciliation procedure.

## Management authorization

All management endpoints require the existing employee `checkToken`, an enabled company and a verified company membership. The company-specific office takes precedence over the legacy office. Allowed managers are Owner/Administrator or offices explicitly granted both `Subcontractors` and `User Management` within the company's plan. An empty office permission list does not grant management access. Being a subcontractor itself never grants management rights.

Authorization uses the office assigned by the `UserCompany` membership for the subcontractor's company, matching existing company login. Historical company creation can reuse an `Office` record from another company; its `company_id` is therefore not an additional membership requirement. Without a `UserCompany` record, only a matching legacy `User.company_id` permits using the legacy office. An existing company membership never inherits a more privileged global role.

## Endpoints

Management, scoped to an existing subcontractor:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/subcontractors/:id/app-access` | Lists representatives and invitations, without credentials/token hashes |
| POST | `/subcontractors/:id/app-access/invites` | `{name,email}`; creates or rotates a seven-day invitation and sends email |
| POST | `/subcontractors/:id/app-access/invites/:inviteId/revoke` | Cancels a pending invitation |
| POST | `/subcontractors/:id/app-access/accesses/:accessId/revoke` | Revokes one grant, increments its version and cancels pending invites for it |

External authentication, independent from `/auth`:

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/subcontractor-auth/invites/preview` | `{token}`; resolves the capability and whether an external account already exists |
| POST | `/subcontractor-auth/invites/accept` | `{token,password}`; accepts once, creates/reuses an external account and grants access |
| POST | `/subcontractor-auth/login` | `{email,password}`; returns account session and active contexts |
| GET | `/subcontractor-auth/me` | External Bearer session; safe account details and active contexts |
| POST | `/subcontractor-auth/context` | External Bearer session plus `{accessId}`; issues a session bound to that grant/version |

Acceptance of an existing account requires its current password; it never replaces credentials. Acceptance does not log the browser into the employee Web or overwrite employee cookies/storage. New passwords need at least 12 characters and at most 72 UTF-8 bytes (bcrypt limit). Tokens are random 32-byte capabilities, stored only as SHA-256 hashes; consumption and grant creation are one database transaction. Uniqueness/transaction conflicts return `409` for retry instead of silently merging identities.

Invite delivery failures are visible and retryable; no successful-delivery message is returned when SendGrid fails. Resend has a one-minute cooldown except after delivery failure. A timeout may mean the provider delivered the message even though the API could not confirm delivery; resending invalidates that previous link.

## Session isolation and next phase

External JWTs have a dedicated type, audience and issuer. Existing `checkToken` rejects their `type` claim. `checkSubcontractorToken` never populates `req.userId`; it checks account disable/version and, for selected contexts, active grant/version/company on every request. Regranting cannot revive a revoked context token. Account-only tokens may list/select the account's remaining active contexts but grant no project/chat/report access by themselves.

Auth endpoints have a bounded per-source, process-local rate limit (30 requests / 15 minutes). It shares a budget across login/invitation exchanges. Before broad rollout, configure an appropriate shared ingress limit and trusted proxy policy; with an unconfigured reverse proxy, the backend may see all clients as one source. No caller-supplied forwarded header is trusted here.

External Chat and Daily Logs are implemented through separate selected-context endpoints and additive tables; see [subcontractor-collaboration.md](subcontractor-collaboration.md) for rules, compatibility and the new migration/flag. Employee tracking and attendance remain unavailable to external identities. Password recovery and account editing remain outside this scope.

## Validation

Prisma validation/client generation and migration diff generation are offline operations here; no migration is applied. Tests mock Prisma and SendGrid, including cross-company denial, token separation, single-use acceptance, resend/revocation and legacy ID preservation. Cypress checks the Web invitation exchange using intercepted HTTP responses and a loopback API URL. These checks do not substitute for applying/testing the migration on an isolated restored MySQL database.
