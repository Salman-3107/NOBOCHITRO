-- ============================================================
-- NOBOCHITRO -- schema additions required by the Admin Dashboard
--
-- Run ONCE, after create_tables.sql, constraints.sql,
-- add_isadmin.sql and add_notifications.sql.
--
-- Nothing here changes an existing column's meaning and nothing
-- here is required by the user-facing app: without this script
-- the admin dashboard still runs, but the Reports page, the
-- Activity Log page and the Draft -> Publish challenge flow
-- report themselves as unavailable instead of silently
-- pretending to work. The backend probes USER_TAB_COLUMNS /
-- USER_TABLES at startup of each request batch and degrades
-- rather than throwing ORA-00942 / ORA-00904.
--
-- Three additions, and why each one is unavoidable:
--
--   1. ContentReport   -- section 17 of the brief asks for a
--      report queue. The original 17-table schema has no place
--      to record "user A reported post B for reason C", so the
--      queue cannot be derived from anything that exists.
--
--   2. AdminActivityLog -- section 25 asks for an audit trail of
--      administrative actions. Again, nothing existing records
--      WHO deleted a review, only that it is gone.
--
--   3. Challenge.Status / PublishedDate -- section 20 asks for
--      Draft -> Publish -> Active. The Challenge table only has
--      StartDate/EndDate, so "created but not yet announced" is
--      not expressible, and the old createChallenge notified
--      every user the instant a row was inserted -- there was no
--      way to draft one. Status makes the draft state real and
--      PublishedDate is what stops a second Publish click from
--      sending a duplicate notification to every account.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ContentReport -- the moderation queue
-- ------------------------------------------------------------
CREATE SEQUENCE seq_contentreport START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE ContentReport (
    ReportID      NUMBER(10)    NOT NULL,
    ReporterID    NUMBER(10)    NOT NULL,   -- who raised it
    TargetType    VARCHAR2(20)  NOT NULL,   -- 'Post' | 'Comment' | 'Review' | 'User'
    TargetID      NUMBER(10)    NOT NULL,   -- PostID / CommentID / UserID
    TargetUserID  NUMBER(10),               -- author of the reported content, if known
    Reason        VARCHAR2(60)  NOT NULL,
    Details       CLOB,
    Status        VARCHAR2(12)  DEFAULT 'Pending' NOT NULL,
    CreatedDate   DATE          DEFAULT SYSDATE NOT NULL,
    ResolvedDate  DATE,
    ResolvedBy    NUMBER(10),               -- the admin who closed it
    ResolutionNote VARCHAR2(500)
);

ALTER TABLE ContentReport ADD CONSTRAINT pk_contentreport PRIMARY KEY (ReportID);

ALTER TABLE ContentReport
    ADD CONSTRAINT ck_contentreport_targettype
    CHECK (TargetType IN ('Post', 'Comment', 'Review', 'User'));

ALTER TABLE ContentReport
    ADD CONSTRAINT ck_contentreport_status
    CHECK (Status IN ('Pending', 'Reviewed', 'Resolved', 'Rejected'));

-- Reporter and target-author rows follow the account. ResolvedBy is
-- SET NULL instead: an audit row should survive the admin's account
-- being removed, it just stops naming them.
ALTER TABLE ContentReport
    ADD CONSTRAINT fk_contentreport_reporter
    FOREIGN KEY (ReporterID) REFERENCES AppUser (UserID)
    ON DELETE CASCADE;

ALTER TABLE ContentReport
    ADD CONSTRAINT fk_contentreport_targetuser
    FOREIGN KEY (TargetUserID) REFERENCES AppUser (UserID)
    ON DELETE CASCADE;

ALTER TABLE ContentReport
    ADD CONSTRAINT fk_contentreport_resolver
    FOREIGN KEY (ResolvedBy) REFERENCES AppUser (UserID)
    ON DELETE SET NULL;

-- The queue is almost always filtered by Status and sorted by date.
CREATE INDEX idx_contentreport_status ON ContentReport (Status, CreatedDate);


-- ------------------------------------------------------------
-- 2. AdminActivityLog -- who did what, and to which row
-- ------------------------------------------------------------
CREATE SEQUENCE seq_adminactivitylog START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE AdminActivityLog (
    LogID       NUMBER(10)    NOT NULL,
    AdminID     NUMBER(10),               -- SET NULL on delete, see below
    Action      VARCHAR2(40)  NOT NULL,   -- 'movie.create', 'review.delete', ...
    TargetType  VARCHAR2(20),             -- 'Movie' | 'User' | 'Review' | ...
    TargetID    NUMBER(10),
    TargetLabel VARCHAR2(200),            -- human-readable snapshot, e.g. the movie title
    Details     VARCHAR2(500),
    CreatedDate DATE          DEFAULT SYSDATE NOT NULL
);

ALTER TABLE AdminActivityLog ADD CONSTRAINT pk_adminactivitylog PRIMARY KEY (LogID);

-- Deliberately ON DELETE SET NULL rather than CASCADE: deleting an
-- admin account must not erase the record of what that account did.
-- TargetLabel exists for the same reason -- the target row may be
-- long gone, but "deleted movie 'Rashomon'" still has to read
-- correctly afterwards.
ALTER TABLE AdminActivityLog
    ADD CONSTRAINT fk_adminactivitylog_admin
    FOREIGN KEY (AdminID) REFERENCES AppUser (UserID)
    ON DELETE SET NULL;

CREATE INDEX idx_adminactivitylog_date ON AdminActivityLog (CreatedDate DESC);


-- ------------------------------------------------------------
-- 3. Challenge lifecycle
-- ------------------------------------------------------------
ALTER TABLE Challenge ADD Status VARCHAR2(12) DEFAULT 'Draft' NOT NULL;
ALTER TABLE Challenge ADD PublishedDate DATE;

ALTER TABLE Challenge
    ADD CONSTRAINT ck_challenge_status
    CHECK (Status IN ('Draft', 'Published', 'Archived'));

-- Every challenge that already existed before this script ran was
-- visible to users the moment it was inserted (the old code notified
-- everyone on create), so backfilling them as Draft would retroactively
-- hide live challenges from the user-facing /api/challenges list.
-- They are Published, and their PublishedDate is their StartDate.
UPDATE Challenge
   SET Status = 'Published',
       PublishedDate = NVL(StartDate, SYSDATE);

CREATE INDEX idx_challenge_status ON Challenge (Status);

COMMIT;


-- ------------------------------------------------------------
-- Sanity check -- all three should come back.
-- ------------------------------------------------------------
SELECT table_name FROM user_tables
 WHERE table_name IN ('CONTENTREPORT', 'ADMINACTIVITYLOG');

SELECT column_name FROM user_tab_columns
 WHERE table_name = 'CHALLENGE' AND column_name IN ('STATUS', 'PUBLISHEDDATE');
