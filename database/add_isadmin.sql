-- ============================================================
-- Adds the IsAdmin column to AppUser.
--
-- This column was being READ by the backend (requireAdmin, login)
-- and WRITTEN by admindeclaration.sql, but no script ever created
-- it -- create_tables.sql defines AppUser without it. Anyone
-- building the schema from the repository would hit ORA-00904
-- ("invalid identifier") on the first login attempt.
--
-- The role lives here, in the database, and is resolved from here
-- at login time. It is never accepted from the client.
--
-- Run this ONCE, after create_tables.sql and constraints.sql.
-- ============================================================

ALTER TABLE AppUser ADD IsAdmin NUMBER(1) DEFAULT 0 NOT NULL;

-- Only two legal values -- guards against a stray UPDATE setting it to 2.
ALTER TABLE AppUser
    ADD CONSTRAINT ck_appuser_isadmin CHECK (IsAdmin IN (0, 1));

-- requireAdmin runs this lookup on every admin-only request.
CREATE INDEX idx_appuser_isadmin ON AppUser (IsAdmin);

COMMIT;
