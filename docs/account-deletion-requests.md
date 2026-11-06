# Public account deletion requests

Scope: public bilingual page + durable manual-review requests only. No automatic
deletion, subscription cancellation, outbound emails, backoffice UI or mobile changes.

## Deployment

1. Review/apply the dedicated migration
   prisma/migrations/20261106000000_account_deletion_requests/migration.sql through
   the normal release procedure. Review other pending migrations before running
   prisma migrate deploy; this checkout also contains Android billing changes.
2. Generate Prisma client and build the API.
3. Configure ACCOUNT_DELETION_FORM_SECRET (or existing SECRET_JWT).
4. Define ACCOUNT_DELETION_RETENTION_EN and ACCOUNT_DELETION_RETENTION_PT with the
   actual retained data categories, purposes, and periods, including backups and
   request records. Until both are set, the route deliberately returns 503.
   The user approved handling within 7 days, not a retention schedule.
5. Deploy/restart API. Verify HTTPS GET and POST /account-deletion from outside,
   a real persisted test request, failure behavior, and access from a phone.
6. Only after verifying deployment use
   https://api.smartbuild4u.com/account-deletion in Play Console.
   Portuguese: /account-deletion?lang=pt. English is the default.

The page is served by Express, not the web frontend; no SPA rewrites or cross-origin
requests are needed. Mount before large body parsers. No secrets are sent to the
browser. The signed form token expires in one hour and provides a unique primary
key for retries. Upsert leaves existing requests unchanged.

## Manual operations

Requests are in AccountDeletionRequest, status pending_verification, ordered by
createdAt. Arrange daily monitoring via existing restricted database/support
operations; there is deliberately no public listing endpoint or new backoffice.
There are no email notifications in this scope.

Email is unverified and MUST NOT authorize deletion, disclose account existence,
or cancel a subscription. Verify ownership/authority through the established
support process. Distinguish personal account deletion from whole-company deletion
and protect other users' data. Track subscription handling separately. Contact
about reasons/alternatives is optional, not a prerequisite to honoring the request.
Manually update status after handling (e.g. completed or withdrawn), and apply the
approved retention schedule to the request records too.

## Abuse controls and limits

Small URL-encoded body, required confirmation, honeypot, signed expiring token,
idempotent primary key, generic responses, no account lookup, no PII in logs.
In-process throttle: 30 POST attempts/hour per Express req.ip, bounded map.
Production ingress must also rate-limit this route across replicas. This change
does not alter global trust-proxy settings; if behind a proxy without trusted
proxy configuration, requests share the proxy limit. Configure trusted proxy
ranges at ingress/application deployment deliberately, never trust arbitrary XFF.

This public page alone does not fulfill the separate Google Play requirement
for an accessible in-app account-deletion entry point.
