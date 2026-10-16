# App Analytics - TASK-40

## Delivery

Internal product telemetry for the admin app, displayed at /master/app-analytics.
No changes to Stripe, Apple billing rules, operational documents or existing web API contracts.
Schema and migration add only AppAnalyticsEvent. Migration has NOT been applied by this change.

## Activation order

1. Review the pending Prisma migrations and take the normal production backup.
2. Deploy only 20261009180000_add_app_analytics using the regular reviewed migration pipeline. Do not use db push. It creates app_analytics_events directly, including nullable flow and interactionId columns and all three indexes. The pending migrations were consolidated after confirmation that none had been applied.
3. Generate Prisma Client and deploy the API and web.
4. Set APP_ANALYTICS_ENABLED=true in the API environment.
5. Review the app's privacy disclosures and analytics policy before enabling collection.
6. Set EXPO_PUBLIC_APP_ANALYTICS_ENABLED=true in the environment used for the app build/EAS Update. Preserve the correct API URL and other public variables.
7. Verify development events first, then verify a real release using the Production filter.

No dependency was added. App changes are JavaScript-only, subject to the release's existing OTA/runtime compatibility.
The default is OFF. This implementation has not published an OTA or applied a production migration.

## Event contract

- POST /mobile/analytics/events: authenticated, company membership verified, user identity derived from the JWT.
- POST /mobile/analytics/auth-events: anonymous login/registration only, IP rate-limited in memory. IP is not stored in the analytics table. Not linked to a subsequent account.
- GET /master/app-analytics: authenticated and requireMaster protected.
- Only allowlisted actions, modules and semantic screens. Dynamic route/document IDs, URLs, headers, payloads, emails, typed text and error messages are not recorded.
- Metadata: random session/event IDs, user/company IDs for authenticated activity, platform, app version, OTA release ID, environment, timestamps, optional duration/status.
- Events are client telemetry, not authoritative financial/audit records. A successful send means the application/API confirmed sending, not delivery or an email open.

## Interpretation

- Session changes after 30 minutes without telemetry or when the account/company changes.
- Journey Reach counts sessions reaching each stage. It is NOT a strict ordered funnel: editing and sending existing documents can bypass creation.
- Save attempts include clicks that fail local validation. Save success is recorded after the editor's awaited save/PDF work. A later send failure does not undo a successful edit save.
- Project creation is counted only after services and its estimate complete.
- Unconfirmed means a save attempt without a success event in the selected period/session. It is not proven abandonment: the user can resume later, an app can terminate, or telemetry can be lost.
- The create-and-send endpoints report emailSent; false is not counted as send success.
- Login diagnostics count anonymous sessions, not unique people. Social flows requiring registration are not successful logins. Successful registration does not imply a paid subscription.
- Tutorial events are separate; automated tutorial traffic is excluded from real usage metrics. Tutorial completion uses persisted tutorial progress (including flows that mark a skipped tutorial as completed).
- Request p95 includes network, server and response parsing time, not just database time. Screen durations exclude background time but are collected for future drill-downs.
- Daily active users use UTC dates and identified users only. This is not a cohort-retention report.
- Development is separate from production; release builds use Production even when pointed at a homologation API. Keep homologation and production databases separate.

## Volume and reliability

- App: 30 events per batch, every 15 seconds and on background/navigation.
- Memory queue: at most 300 authenticated events and 30 anonymous auth events. No sensitive disk queue; app termination can lose unsent events.
- 8-second transport timeout, exponential retry backoff (up to 5 minutes), auth retry after 1 minute, 24-hour maximum event age.
- Ingestion: 20 authenticated requests/minute/user, 10 anonymous requests/minute/IP, per API process. Configure shared edge limits if scaling across processes. Do not blindly trust forwarded IP headers.
- UUID primary key plus createMany skipDuplicates prevents retries from duplicating rows.
- Reports limited to 31 days and 20,000 events. Exceeding that returns a request to narrow filters instead of misleading partial totals.
- Hourly retention deletes up to 10 batches of 1,000 events older than 90 days. It touches only AppAnalyticsEvent.
- For higher volume, move aggregation to daily/session summary tables or a separate analytics store before raising report limits.

## Validation

- API: service tests for validation, privacy projection, company/session boundaries and tutorial exclusion; route tests for auth, master access, membership, batch limits, anonymous contract and bounded reports.
- App: node --test scripts/analytics.test.cjs (isolated transport, no production requests).
- API build, Prisma validation, web typecheck/build and app lint/typecheck.
- npm run validate additionally runs Expo Doctor; current repository has pre-existing Expo SDK patch-version mismatches. No dependency upgrade is included in this feature.

## Not included

TASK-41 expands important workflows across the app. See the app's docs/analytics-coverage.md for the surface-by-surface coverage. The catalog in AppAnalyticsFlows.ts must stay identical to the app's flow-catalog.ts.

Workflow events add fixed semantic flow IDs and random interaction IDs. Each operation attempt is paired with its success/error/cancel within the same user, company and flow. Older events without these fields remain accepted. Period boundaries and dropped telemetry can leave an attempt unconfirmed.

Opened/closed measure component visibility, not task completion. Feedback counts transitions into a visible error state, without its message. Clicks can fail local validation before an API attempt. Results record the wrapped service operation; they do not prove email delivery, bank settlement or completion of background QBO jobs. stripe-connect/qbo-connect mean authorization URL requests; stripe-oauth/qbo-oauth mean the browser callback reported success. billing.purchase requires the purchase callback and successful server verification, but is not a paid-customer classification (trials still exist).

Heatmaps, screen recording, input capture, crash reporting, true cross-session abandonment attribution, ordered per-document funnels and cohort retention are not part of this first delivery.
Production end-to-end ingestion requires the reviewed migration and activation above; local tests use isolated mocks and never write to the production database.
