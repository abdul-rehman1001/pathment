console.log(`Pathment uses explicit seed scripts; there is no all-data seeder.

Run migrations before seeding. Existing production users do not need reseeding.

  npm run seed:admin      Legacy local bootstrap account; creates a workspace admin
                         after migration. Uses fixed demo credentials: local use only.
  npm run seed:skills     Add missing entries to the shared skill catalog.
  npm run seed:schedules Add default schedule templates (single workspace only).

seed:demo initializes a dedicated demo workspace and refreshes its demo data.
It refuses production, real accounts and other workspaces. It is not a production initializer.
See docs/WORKSPACE_PATH_ROLLOUT.md and docs/LOCAL_DATABASE_SETUP.md.`);
