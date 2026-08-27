-- ============================================================
-- FIX: AppUser was missing its primary key constraint.
--
-- constraints.sql already contains this line:
--   alter table appuser add constraint pk_appuser primary key ( userid );
-- but it silently failed (or was skipped) when constraints.sql was
-- first run, so AppUser has had NO primary key this whole time.
--
-- This was only discovered on 27 Aug 2026 while adding the
-- UserFollow table -- Oracle refused to create foreign keys
-- pointing at AppUser.UserID with error ORA-02270, because there
-- was no unique/primary key on that column for it to reference.
--
-- Run this ONCE against your local database if you already ran
-- the original create_tables.sql + constraints.sql before this date.
-- ============================================================

ALTER TABLE AppUser ADD CONSTRAINT pk_appuser PRIMARY KEY (UserID);

COMMIT;

-- After running this, also check whether any OTHER foreign keys
-- referencing AppUser silently failed for the same reason. Run:
--
--   SELECT table_name, constraint_name, constraint_type, status
--   FROM user_constraints
--   WHERE constraint_type IN ('P', 'R')
--   ORDER BY table_name;
--
-- and compare against constraints.sql to see if anything referencing
-- AppUser (Review, Post, BucketList, JournalEntry, etc.) is missing
-- its FK. If so, re-run just that specific ALTER TABLE line from
-- constraints.sql -- it will now succeed since the PK exists.
