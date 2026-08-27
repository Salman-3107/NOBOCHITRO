-- ============================================================
-- Adds the UserFollow table -- a self-referencing many-to-many
-- relationship on AppUser (a user can follow many users, and be
-- followed by many users). This is what feature #15 in the
-- NOBOCHITRO spec needed but was missing from the original schema.
--
-- Run this ONCE against your local Oracle 19c database.
-- ============================================================

CREATE TABLE UserFollow (
    FollowerID  NUMBER(10)  NOT NULL,   -- the user doing the following
    FollowedID  NUMBER(10)  NOT NULL,   -- the user being followed
    FollowDate  DATE
);

-- Composite primary key: one user can only follow another user once.
ALTER TABLE UserFollow
    ADD CONSTRAINT pk_userfollow PRIMARY KEY (FollowerID, FollowedID);

-- A user cannot follow themself.
ALTER TABLE UserFollow
    ADD CONSTRAINT ck_userfollow_no_self_follow
    CHECK (FollowerID <> FollowedID);

-- Foreign keys back to AppUser. ON DELETE CASCADE means: if a user
-- account is deleted, all their follow relationships (as follower
-- AND as followed) disappear automatically -- no orphaned rows.
ALTER TABLE UserFollow
    ADD CONSTRAINT fk_userfollow_follower
    FOREIGN KEY (FollowerID) REFERENCES AppUser (UserID)
    ON DELETE CASCADE;

ALTER TABLE UserFollow
    ADD CONSTRAINT fk_userfollow_followed
    FOREIGN KEY (FollowedID) REFERENCES AppUser (UserID)
    ON DELETE CASCADE;

COMMIT;

