# Subcontractor Chat and Daily Logs

Implemented locally, 2026-10-20. No database migration, production write, deployment, EAS update, invitation or live message was executed by this implementation.

## Business rules

- Each request requires an enabled external account and a currently active, version-matching selected subcontractor access in an active company. Account-only sessions cannot use collaboration.
- Contacts are enabled internal Users in the selected company. The external account never becomes a User and cannot discover other subcontractors as contacts.
- Private conversations contain one internal User and one selected external access. A deterministic unique key prevents duplicate conversations under concurrent creation.
- Existing company managers can create/edit mixed groups in the Web. One subcontractor access per group keeps external representatives separated; multiple internal Users are allowed. App group creation stays unavailable, matching the worker app. Removed external members lose access while their historic message authors remain intact.
- An internal recipient must still belong to that company and be a chat member. Sender, company and external author identifiers come from authentication/resource membership, never from submitted IDs.
- External Daily Logs are visible only to their author in the selected access. Another representative of the same subcontractor does not inherit them. Switching companies cannot expose the previous company's posts.
- Publishing and editing require a current direct service or subservice assignment with removed_at NULL, a non-canceled service and an active project status (Pre-Start, In Progress, Final walkthrough), all inside the selected company. A schedule-only assignment does not grant every service in a project.
- Removing an assignment blocks new publication/editing there. The author can still read/delete their previous posts and discuss those posts while their company access remains active.
- External comments/reactions are restricted to those own posts. Internal users see the new reports through existing project/service/admin feeds, with the representative and subcontractor displayed as author. Existing validated public-feed links retain their existing service scope.

## Data and compatibility

Migration: prisma/migrations/20261020150000_add_subcontractor_collaboration/migration.sql.

The migration creates chat_external_members, chat_external_messages, feed_external_comments and feed_external_likes. It adds nullable external author/access columns to Activities, a nullable unique private-chat key and nullable external-device registration fields. There are no User column changes, legacy author replacements, backfills, data updates, deletes, drops or CHECK expressions involving foreign-key columns.

User IDs, ChatMember.userId, ChatMessage.senderId, Activities.authorId, internal comments/likes and their foreign keys remain unchanged. External sender rows use the separate message table and Participant identity; external posts use only externalAuthorId/externalAccessId. Old records need no Participant backfill.

Legacy public gallery reads exclude the newly external-authored photos unless the caller is a verified internal member of the matching company. Legacy photo records keep their previous behavior. Alternate activity/gallery mutation paths also authorize the new authors and keep deletion/attachment cleanup consistent.

Existing employee HTTP routes retain their shapes. Only conversations/reports with external participants use the additive authorization/serialization bridge. New contacts carry identityType, participantId and accessId; their selectable contact ID is external:<accessId>, never a fabricated User ID. Existing internal contacts keep their IDs.

The app reuses the worker ChatList, ChatConversation, DailyLog composer and FeedPostCard, with injected identity/client. Worker wrappers keep existing services/providers. The external client has separate Bearer credentials, routes, Socket.IO namespace and device registration; no attendance/tracking or worker permission runtime is mounted.

## Endpoints

All paths below require the selected-context external token:

- GET /subcontractor/chat/contacts, GET /subcontractor/chat; POST /subcontractor/chat/private.
- GET/POST /subcontractor/chat/:chatId/messages; DELETE /subcontractor/chat/:chatId/messages/:messageId.
- PATCH /subcontractor/chat/:chatId/archive and /unarchive.
- GET /subcontractor/report-services; GET/POST /subcontractor/reports.
- PUT/DELETE /subcontractor/reports/:postId.
- GET/POST /subcontractor/reports/:postId/comments; DELETE /subcontractor/report-comments/:commentId.
- POST/DELETE /subcontractor/reports/:postId/like.
- POST /subcontractor/report-ai/enhance-description and /transcribe-and-enhance, with serviceProjectId query parameter and a current assignment. These reuse the existing AI integration.
- POST/DELETE /subcontractor/device. Device leases prevent cleanup from an old context clearing a newer registration of the same push token.

Uploads are bounded to 25 MB/file and 50 report photos. Failed new uploads are cleaned up. Publication rechecks the grant and assignment in its transaction after upload. Mutation requests have a process-local per-access budget of 60/minute; deployment may enforce a shared ingress budget.

## Realtime and push

The /subcontractor Socket.IO namespace validates the external token and derives its room from account/access/version. Clients cannot choose User or company rooms. Live grants/expiration are rechecked; revocation disconnects the selected access. Company switching disposes its socket and selected API client.

New mixed-chat events to internal users use an authenticated verified-user room joined via join_verified. Legacy worker rooms/events remain available for employee-only functionality. Internal room leases expire with the JWT. App and Web both join the verified room in addition to their existing room.

External push is stored against the selected access, with a seven-day lease, not User.expoPushToken. Revocation clears it; context cleanup unregisters it. Permission is requested only by the account Notifications action. Selecting a notification in another context sends the user to company selection instead of opening the other company's content.

## Homologation rollout and verification

1. Review the exact new SQL against a restored isolated MySQL database and back up homologation. The previous 20261019120000 migration is not rewritten by this feature; retain its reconciled history and failed audit row.
2. Apply the additive migration in homologation before running the new Prisma client/API. Even when the feature flag is off, Prisma scalar selections and employee bridges require the new schema. No reset, db push, destructive repair or production operation is part of this rollout.
3. Deploy the API, then enable SUBCONTRACTOR_ACCESS_ENABLED=true and SUBCONTRACTOR_COLLABORATION_ENABLED=true only in homologation. Collaboration defaults off independently of login. Disabling it blocks external endpoints and hides/blocks external resources in employee bridges without deleting records.
4. Run the local Web and app against https://apismartbuild.codelabsusa.com. No frontend publication is necessary for this test.
5. Use the activated test representative: select a company, start/reply to a private chat from both identities, test images/audio, archive/unarchive and own-message deletion. Verify another internal nonmember and another company cannot read/send by guessing IDs.
6. Create/edit a mixed group in Web, remove the representative, verify history remains internally but the removed representative stops receiving/opening that group. Existing employee-only chats/read cursors must remain unchanged.
7. Assign the subcontractor to one service/subservice. Confirm only eligible services appear. Publish text/photo logs and verify author/attachments in the employee feed; confirm old worker reports/authors remain unchanged. Reactions/comments must retain real author identities and totals.
8. Try another representative's report ID, another access/company, a canceled service, removed assignment and revoked grant. Repeat the removed assignment case while photos are uploading. All unauthorized operations must fail without creating records/uploads.
9. Switch companies/logout and verify previous chat/report content, sockets and device leases cannot continue in the new context. Test both Android and iOS permission/notification/navigation behavior on devices.

Automated validation uses mocked Prisma/storage/provider calls and loopback HTTP. It does not prove real MySQL locking/DDL behavior, S3/Expo delivery or native device behavior; those remain homologation/device checks.

## Local verification result (2026-10-20)

- API: 94 tests passed across seven suites (identity/access, HTTP routes, collaboration authorization, legacy chat/feed compatibility and additive SQL checks). TypeScript and Prisma schema validation passed.
- App: 58 tests passed across eight suites, including worker/external isolation and foreground refresh/draft preservation. ESLint passed for the changed shared/external components. Comparing TypeScript against HEAD found the same 183 existing diagnostics and no introduced diagnostics.
- Web: TypeScript and Vite build passed. Android and iOS Metro/Hermes exports passed; these are offline bundles, not native device tests or publications.
- No migration was applied. Existing corrected migration SQL is unchanged; its LF-normalized SHA-256 remains 1cb3ffb40084e78b8344d250204bcb165f3360db7792077fae9765433e8cb7d6. The new collaboration SQL LF SHA-256 is c10ba9eb6833a58ec32b8994420aa3f26ea52a621a0f5706b5361acfd00bd66c.
