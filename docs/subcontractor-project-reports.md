# Subcontractor project reports

The updated external app publishes Daily Logs directly to a project. It no longer asks the subcontractor to select an ordinary service as the report target. Workers and their existing endpoints/composer behavior remain unchanged.

## Authorization

Reuse active SubContractorServiceProject assignments (removed_at NULL) for the selected subcontractor access. A qualifying project can be reached through an ordinary service, a subservice of an ordinary service, a Custom Service, or a subservice of a Custom Service. The project must belong to the selected company and have status Pre-Start, In Progress or Final walkthrough. Canceled ordinary services, canceled subservices, orphan Custom Services and assignments to another company do not authorize publication. Schedule completion alone does not remove an assignment.

GET /subcontractor/report-projects returns each qualifying project once, including projects with no ordinary services. It accepts no caller identity/company override. POST /subcontractor/reports now accepts a projectId target; passing projectId and serviceProjectId together is rejected. AI endpoints accept the same projectId query target and revalidate assignment before calling the existing AI integration.

The older report-services endpoint, serviceProjectId publication and service-target AI remain available with their original validation for installed older external clients. Worker endpoints and User/author contracts have not been repurposed.

Publication checks authorization before uploading and rechecks current account/grant version and a live assignment inside its database transaction after uploading. Reports are still readable only by their author and selected access. Removing all project assignments blocks new project posts/edits while preserving previously published history; revoking company access blocks the external context entirely. Internal company users continue to see posts in project/admin feeds. Existing validated project sharing links include the new reports only for their own authorized projects.

## Data preservation

New optional Activities columns: externalProjectId (Project FK), externalAssignmentId, externalAssignmentType and externalAssignmentTargetId. New optional GalleryAfter.externalProjectId associates photos to that project. Existing authorId and serviceProjectId values, old photos, schedule links and User IDs are unchanged; there is no backfill. No fake ordinary service is created.

Assignment fields capture the qualifying assignment ID/type/target at publication. They intentionally are snapshots without a cascading assignment FK: deleting a Custom Service or removing the schedule assignment must not erase a project report or its history. The existing Project deletion lifecycle cascades the new project-owned rows. Report deletion still removes its linked photos.

Project and global feeds, validated public project feeds, external history, photos, comments/reactions and Web export rendering support both old service-target records and new project-target records. Service-specific feeds keep their service scope and do not mislabel project posts as belonging to an arbitrary service.

## Migration and rollout

New additive migration: 20261020180000_add_subcontractor_project_reports. It adds nullable columns, two indexes and two Project foreign keys. It contains no destructive statements, data rewriting or changes to applied migration files. No migration was applied locally, in homologation or in production during implementation.

Back up homologation and review pending migrations. Apply this migration BEFORE starting the new API/Prisma client, including when the collaboration flag is off (Prisma reads the new scalar columns). Preserve the prior migration files/history/checksums. Reuse SUBCONTRACTOR_ACCESS_ENABLED=true and SUBCONTRACTOR_COLLABORATION_ENABLED=true in homologation; there is no additional flag. Test with local Web and Expo against the homologation API; do not publish or change production as part of this work.

Manual checks: create an active Custom Service assignment in a project with no ordinary services; confirm the project appears in the external app, publish text/photos, verify the company project/admin feeds, old worker posts and Web exports. Repeat using each of the other assignment types. Remove the assignment while photos upload and verify publication fails without persisted report/uploads. With another active assignment in the same project publication remains allowed. Removing all assignments preserves history but prevents new project publication/editing. Also test foreign project/other representative IDs and a revoked selected access. Verify existing project sharing links include only their own posts/photos.

Automated checks mock Prisma/provider calls. Native exports validate bundling, not device navigation, actual MySQL DDL/locking or S3/Expo delivery. Those need homologation/device verification after migration and API deployment.

## Local verification

117 API tests passed across eight suites; 61 app tests passed across eight suites. API/Web TypeScript checks and the Web build passed. The app retains its 183 pre-existing TypeScript diagnostics with no introduced diagnostics. ESLint and Android/iOS Metro/Hermes exports passed. Applied migration files are unchanged. New migration SHA-256: 17a65bae7358a15c1bddfe52c8bce51eadfd4ee9b52bf9fb370c488ced4bf3d0. These checks did not apply a migration or exercise real production/homologation data.
