-- ============================================================
-- NOBOCHITRO -- PL/SQL objects (triggers, functions, procedures)
--
-- Run this ONCE, after create_tables.sql, constraints.sql,
-- sequences.sql, add_notifications.sql, add_userfollow.sql and
-- admin_dashboard_extensions.sql (it reads/writes AppUser,
-- Review, UserFollow, Notification, Challenge, AdminActivityLog,
-- BucketList and BucketListItem, so all of those must already exist).
--
-- Every object below backs a real feature that already exists in
-- the app (see the comment above each one) -- nothing here is
-- added just to tick a box. Where an object replaces logic that
-- currently lives in a controller, the comment says which file/
-- function to update so the same notification/log row isn't
-- written twice.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Supporting table: ReviewHistory
--    A shadow table for the two review triggers below. Nothing
--    currently records a review's PREVIOUS rating/text once it's
--    edited or removed -- this is exactly the "logging sensitive
--    actions to a shadow table" use case from the checklist.
-- ------------------------------------------------------------
CREATE SEQUENCE seq_reviewhistory START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE ReviewHistory (
    HistoryID    NUMBER(10)     NOT NULL,
    UserID       NUMBER(10)     NOT NULL,
    MovieID      NUMBER(10)     NOT NULL,
    OldRating    NUMBER(2),
    OldReviewText CLOB,
    ChangeType   VARCHAR2(10)   NOT NULL,  -- 'UPDATE' or 'DELETE'
    -- NOTE: ChangedBy stores Oracle's USER pseudo-column, which is the
    -- POOLED connection account (e.g. NOBOCHITRO_USER) for every request --
    -- not the individual app user who clicked delete. The backend logs in
    -- to Oracle once as one account and re-uses that connection for every
    -- HTTP request (see db.js/oracledb.createPool); WHO in the app sense
    -- only exists as req.user.userId from the JWT, which never reaches the
    -- database session. UserID above already identifies whose review this
    -- was; ChangedBy just tells you it went through the app's own service
    -- account rather than someone querying the table directly.
    ChangedBy    VARCHAR2(30),
    ChangedDate  DATE           DEFAULT SYSDATE NOT NULL
);

ALTER TABLE ReviewHistory ADD CONSTRAINT pk_reviewhistory PRIMARY KEY (HistoryID);

ALTER TABLE ReviewHistory
    ADD CONSTRAINT ck_reviewhistory_changetype
    CHECK (ChangeType IN ('UPDATE', 'DELETE'));

COMMIT;


-- ============================================================
-- TRIGGERS
-- ============================================================

-- ------------------------------------------------------------
-- 1. TRG_LOG_REVIEW_DELETE
--    BEFORE DELETE, FOR EACH ROW -- same shape as the textbook's
--    BACKUP_DELETED_STUDENTS example. Whoever calls
--    DELETE FROM Review (see reviewController.deleteReview) no
--    longer has to remember to archive the row themselves.
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER TRG_LOG_REVIEW_DELETE
BEFORE DELETE
ON Review
FOR EACH ROW
DECLARE
BEGIN
    INSERT INTO ReviewHistory (HistoryID, UserID, MovieID, OldRating, OldReviewText, ChangeType, ChangedBy)
    VALUES (seq_reviewhistory.NEXTVAL, :OLD.UserID, :OLD.MovieID, :OLD.RatingValue, :OLD.ReviewText, 'DELETE', USER);
END;
/


-- ------------------------------------------------------------
-- 2. TRG_LOG_REVIEW_UPDATE
--    AFTER UPDATE, FOR EACH ROW -- same shape as the textbook's
--    LOG_CGPA_UPDATE example. Fires from reviewController.upsertReview
--    whenever a user edits an existing rating/review.
--
--    NOTE: the textbook's "AFTER UPDATE OF <column>" restriction
--    clause can't be used here -- ReviewText is a CLOB, and Oracle
--    raises ORA-25006 ("cannot specify this column in UPDATE OF
--    clause") for any LOB column named there. So this fires on any
--    update to the row instead of being restricted to specific
--    columns; upsertReview always updates RatingValue, ReviewText
--    and ReviewDate together in one statement anyway, so nothing
--    is lost.
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER TRG_LOG_REVIEW_UPDATE
AFTER UPDATE
ON Review
FOR EACH ROW
DECLARE
BEGIN
    INSERT INTO ReviewHistory (HistoryID, UserID, MovieID, OldRating, OldReviewText, ChangeType, ChangedBy)
    VALUES (seq_reviewhistory.NEXTVAL, :OLD.UserID, :OLD.MovieID, :OLD.RatingValue, :OLD.ReviewText, 'UPDATE', USER);
END;
/


-- ------------------------------------------------------------
-- 3. TRG_NOTIFY_ON_FOLLOW
--    AFTER INSERT, FOR EACH ROW -- moves the "notify the user I
--    just followed" side effect out of followController.followUser
--    and into the database, so it can never be skipped by a
--    future code path that inserts into UserFollow directly.
--
--    IMPORTANT: if you add this trigger, DELETE the
--    createNotification(...) call in followController.js
--    (lines ~27-32) -- otherwise the followed user gets the
--    same "X started following you" notification twice.
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER TRG_NOTIFY_ON_FOLLOW
AFTER INSERT
ON UserFollow
FOR EACH ROW
DECLARE
    V_FOLLOWER_NAME AppUser.Username%TYPE;
BEGIN
    SELECT Username INTO V_FOLLOWER_NAME
    FROM AppUser
    WHERE UserID = :NEW.FollowerID;

    INSERT INTO Notification (NotificationID, UserID, NotifType, Message, RelatedID)
    VALUES (seq_notification.NEXTVAL, :NEW.FollowedID, 'Follow',
            V_FOLLOWER_NAME || ' started following you', :NEW.FollowerID);
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        NULL; -- follower row vanished mid-transaction; nothing sensible to notify
END;
/


-- ------------------------------------------------------------
-- 4. TRG_UCP_AUTOCOMPLETE
--    BEFORE UPDATE OF CurrentProgress, FOR EACH ROW -- a data-
--    validation/consistency trigger, not a re-implementation of
--    challengeController.evaluateChallengeProgress (that engine's
--    per-genre/per-director matching stays in JS on purpose --
--    it's business logic, not a data-integrity rule).
--
--    This trigger's ONLY job: whenever CurrentProgress is written,
--    guarantee Completed/CompletionDate are consistent with it,
--    even if some future code path updates progress without
--    remembering to also flip the flag.
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER TRG_UCP_AUTOCOMPLETE
BEFORE UPDATE OF CurrentProgress
ON UserChallengeProgress
FOR EACH ROW
DECLARE
    V_TARGET Challenge.TargetCount%TYPE;
BEGIN
    SELECT TargetCount INTO V_TARGET
    FROM Challenge
    WHERE ChallengeID = :NEW.ChallengeID;

    IF :NEW.CurrentProgress >= V_TARGET AND :OLD.Completed = 0 THEN
        :NEW.Completed := 1;
        :NEW.CompletionDate := SYSDATE;
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        NULL; -- orphaned challenge id; let the FK constraint be the one to complain
END;
/


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- ------------------------------------------------------------
-- 5. FN_MOVIE_AVG_RATING
--    Returns a statistical value computed from the database --
--    exactly the checklist's own "must return a computed value"
--    case. Usable directly inside a SELECT, e.g. for a
--    "Top Rated Movies" page:
--
--      SELECT MovieID, Title, FN_MOVIE_AVG_RATING(MovieID) AS AvgRating
--      FROM Movie
--      ORDER BY FN_MOVIE_AVG_RATING(MovieID) DESC NULLS LAST
--      FETCH FIRST 10 ROWS ONLY;
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION FN_MOVIE_AVG_RATING(P_MOVIEID IN Movie.MovieID%TYPE)
RETURN NUMBER IS
    V_AVG NUMBER;
BEGIN
    SELECT ROUND(AVG(RatingValue), 2) INTO V_AVG
    FROM Review
    WHERE MovieID = P_MOVIEID;

    RETURN V_AVG; -- NULL when the movie has no reviews yet
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
/


-- ------------------------------------------------------------
-- 6. FN_TASTE_MATCH_SCORE
--    Moves the compatibility-percentage calculation out of
--    tasteMatchController.getTasteMatch and into the database.
--    Same algorithm the controller already uses: average absolute
--    rating gap across every movie both users have rated (max gap
--    is 9, since RatingValue is 1-10), converted to a 0-100 score.
--    Returns NULL when the two users share no rated movies, same
--    as "no meaningful match yet" in the current JS version.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION FN_TASTE_MATCH_SCORE(
    P_USERID_A IN AppUser.UserID%TYPE,
    P_USERID_B IN AppUser.UserID%TYPE
)
RETURN NUMBER IS
    V_AVG_GAP NUMBER;
    V_SCORE   NUMBER;
BEGIN
    SELECT AVG(ABS(R1.RatingValue - R2.RatingValue))
    INTO V_AVG_GAP
    FROM Review R1
    JOIN Review R2 ON R2.MovieID = R1.MovieID
    WHERE R1.UserID = P_USERID_A
      AND R2.UserID = P_USERID_B;

    IF V_AVG_GAP IS NULL THEN
        RETURN NULL; -- no shared movies
    END IF;

    V_SCORE := ROUND(100 - (V_AVG_GAP / 9 * 100), 1);
    RETURN V_SCORE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
/


-- ============================================================
-- PROCEDURES
-- ============================================================

-- ------------------------------------------------------------
-- 7. PROC_PUBLISH_CHALLENGE
--    Exactly the checklist's own definition of when a procedure
--    is appropriate: one multi-step workflow that writes to
--    THREE tables in one transaction --
--      (a) Challenge          -- flips Status/PublishedDate
--      (b) Notification       -- one row per existing user
--      (c) AdminActivityLog   -- records which admin published it
--    Replaces the JS loop in
--    adminEngagementController.publishChallenge (one
--    createNotification() call per user) with a single INSERT
--    ... SELECT, and puts explicit COMMIT/ROLLBACK around all
--    three writes so a failure partway through can't leave the
--    challenge "Published" with nobody notified.
--
--    P_NOTIFIED is an OUT parameter so the caller can still show
--    "Notified N users" the way the current JSON response does.
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE PROC_PUBLISH_CHALLENGE(
    P_CHALLENGEID IN  Challenge.ChallengeID%TYPE,
    P_ADMINID     IN  AppUser.UserID%TYPE,
    P_NOTIFIED    OUT NUMBER
) IS
    V_TITLE         Challenge.Title%TYPE;
    V_PUBLISHEDDATE Challenge.PublishedDate%TYPE;
    V_MESSAGE       VARCHAR2(255);
BEGIN
    SELECT Title, PublishedDate INTO V_TITLE, V_PUBLISHEDDATE
    FROM Challenge
    WHERE ChallengeID = P_CHALLENGEID
    FOR UPDATE; -- same row lock the JS version takes, so two admins
                -- publishing at once can't both broadcast

    IF V_PUBLISHEDDATE IS NOT NULL THEN
        ROLLBACK;
        RAISE_APPLICATION_ERROR(-20001, 'This challenge has already been published.');
    END IF;

    UPDATE Challenge
       SET Status = 'Published', PublishedDate = SYSDATE
     WHERE ChallengeID = P_CHALLENGEID;

    V_MESSAGE := SUBSTR('New weekly challenge: ' || V_TITLE, 1, 255);

    INSERT INTO Notification (NotificationID, UserID, NotifType, Message, RelatedID)
    SELECT seq_notification.NEXTVAL, UserID, 'WeeklyChallenge', V_MESSAGE, P_CHALLENGEID
    FROM AppUser;

    P_NOTIFIED := SQL%ROWCOUNT; -- rows affected by the INSERT ... SELECT above

    INSERT INTO AdminActivityLog (LogID, AdminID, Action, TargetType, TargetID, TargetLabel, Details)
    VALUES (seq_adminactivitylog.NEXTVAL, P_ADMINID, 'challenge.publish', 'Challenge',
            P_CHALLENGEID, V_TITLE, 'Notified ' || P_NOTIFIED || ' user(s)');

    COMMIT;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        ROLLBACK;
        RAISE_APPLICATION_ERROR(-20002, 'Challenge not found.');
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE; -- let the Node error handler log/report the real Oracle error
END;
/


-- ------------------------------------------------------------
-- 8. PROC_ADD_TO_WATCHLIST
--    Wraps bucketListController.getOrCreateSystemList +
--    addToWatchlist's INSERT INTO BucketListItem into one
--    transaction across TWO tables:
--      (a) BucketList      -- get-or-create the user's
--                              'System-Watchlist' row
--      (b) BucketListItem  -- add the movie to it
--    so "Add to Watchlist" is one round trip and one commit
--    instead of two separate statements from the app.
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE PROC_ADD_TO_WATCHLIST(
    P_USERID  IN  AppUser.UserID%TYPE,
    P_MOVIEID IN  Movie.MovieID%TYPE,
    P_LISTID  OUT NUMBER
) IS
BEGIN
    BEGIN
        SELECT ListID INTO P_LISTID
        FROM BucketList
        WHERE UserID = P_USERID AND ListType = 'System-Watchlist';
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            INSERT INTO BucketList (ListID, UserID, Title, Visibility, ListType)
            VALUES (seq_bucketlist.NEXTVAL, P_USERID, 'Watchlist', 'Private', 'System-Watchlist')
            RETURNING ListID INTO P_LISTID;
    END;

    INSERT INTO BucketListItem (ListID, MovieID, DateAdded)
    VALUES (P_LISTID, P_MOVIEID, SYSDATE);

    COMMIT;
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        ROLLBACK;
        RAISE_APPLICATION_ERROR(-20003, 'This movie is already on your watchlist.');
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/


-- ============================================================
-- ADDITIONAL OBJECTS (round 2)
--
-- Same rule as above: each one replaces or backs something that
-- already exists in the app, called out by file/function. Not
-- added: a "who resolved this report" audit trigger on
-- ContentReport -- unlike Follow/PostLike/PostComment (where the
-- acting user is a column in the row itself, :NEW.FollowerID /
-- :NEW.UserID), the admin who resolves a report is only known from
-- the JWT (req.user.userId) in adminCommunityController.js, and
-- never reaches the DB session -- see the ChangedBy note on
-- ReviewHistory above. A trigger there could only log the pooled
-- service account, not which admin, so that logging correctly
-- stays in JS via logAdminAction().
-- ============================================================


-- ------------------------------------------------------------
-- 9. TRG_NOTIFY_ON_POST_LIKE
--    AFTER INSERT, FOR EACH ROW -- same pattern as
--    TRG_NOTIFY_ON_FOLLOW. Replaces the createNotification(...)
--    call in postController.likePost (~line 192).
--
--    IMPORTANT: delete that call if you adopt this trigger, or
--    the post's author gets notified twice per like.
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER TRG_NOTIFY_ON_POST_LIKE
AFTER INSERT
ON PostLike
FOR EACH ROW
DECLARE
    V_OWNER_ID   Post.UserID%TYPE;
    V_LIKER_NAME AppUser.Username%TYPE;
BEGIN
    SELECT UserID INTO V_OWNER_ID FROM Post WHERE PostID = :NEW.PostID;

    -- Don't notify yourself for liking your own post -- same rule
    -- postController.likePost already applies in JS.
    IF V_OWNER_ID != :NEW.UserID THEN
        SELECT Username INTO V_LIKER_NAME FROM AppUser WHERE UserID = :NEW.UserID;

        INSERT INTO Notification (NotificationID, UserID, NotifType, Message, RelatedID)
        VALUES (seq_notification.NEXTVAL, V_OWNER_ID, 'PostLike',
                V_LIKER_NAME || ' liked your post', :NEW.PostID);
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        NULL; -- post or liker row vanished mid-transaction
END;
/


-- ------------------------------------------------------------
-- 10. TRG_NOTIFY_ON_POST_COMMENT
--     Same pattern again, for PostComment. Replaces the
--     createNotification(...) call in postController.addComment
--     (~line 271) -- delete that call if you adopt this trigger.
-- ------------------------------------------------------------
CREATE OR REPLACE TRIGGER TRG_NOTIFY_ON_POST_COMMENT
AFTER INSERT
ON PostComment
FOR EACH ROW
DECLARE
    V_OWNER_ID       Post.UserID%TYPE;
    V_COMMENTER_NAME AppUser.Username%TYPE;
BEGIN
    SELECT UserID INTO V_OWNER_ID FROM Post WHERE PostID = :NEW.PostID;

    IF V_OWNER_ID != :NEW.UserID THEN
        SELECT Username INTO V_COMMENTER_NAME FROM AppUser WHERE UserID = :NEW.UserID;

        INSERT INTO Notification (NotificationID, UserID, NotifType, Message, RelatedID)
        VALUES (seq_notification.NEXTVAL, V_OWNER_ID, 'PostComment',
                V_COMMENTER_NAME || ' commented on your post', :NEW.PostID);
    END IF;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        NULL;
END;
/


-- ------------------------------------------------------------
-- 11. FN_USER_TOTAL_XP
--     A statistical value spanning two tables (UserChallengeProgress
--     joined to Challenge), the same shape as FN_MOVIE_AVG_RATING.
--     leaderboardController.js currently has three leaderboard
--     types (most_watched, most_reviewed, most_challenges) but none
--     based on XP earned -- this makes a 'most_xp' type a one-line
--     addition instead of a fourth hand-written JOIN/GROUP BY:
--
--       SELECT UserID, Username, FN_USER_TOTAL_XP(UserID) AS Score
--       FROM AppUser
--       ORDER BY FN_USER_TOTAL_XP(UserID) DESC
--       FETCH FIRST 10 ROWS ONLY;
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION FN_USER_TOTAL_XP(P_USERID IN AppUser.UserID%TYPE)
RETURN NUMBER IS
    V_TOTAL_XP NUMBER;
BEGIN
    SELECT NVL(SUM(c.XPReward), 0) INTO V_TOTAL_XP
    FROM UserChallengeProgress ucp
    JOIN Challenge c ON c.ChallengeID = ucp.ChallengeID
    WHERE ucp.UserID = P_USERID
      AND ucp.Completed = 1;

    RETURN V_TOTAL_XP;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 0;
END;
/


-- ------------------------------------------------------------
-- 12. PROC_SET_USER_ROLE
--     Wraps adminController.setUserRole's three steps -- (1) guard
--     against demoting the last remaining admin, (2) UPDATE
--     AppUser.IsAdmin, (3) INSERT AdminActivityLog -- into one
--     transaction across TWO tables, with the guard enforced by
--     the database itself (not just the JS check), so the rule
--     holds even if something else ever calls this procedure
--     directly.
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE PROC_SET_USER_ROLE(
    P_TARGETUSERID IN AppUser.UserID%TYPE,
    P_ISADMIN      IN NUMBER,   -- 1 or 0, matches AppUser.IsAdmin
    P_ADMINID      IN AppUser.UserID%TYPE
) IS
    V_ADMIN_COUNT NUMBER;
    V_ROWS        NUMBER;
BEGIN
    IF P_ISADMIN = 0 THEN
        SELECT COUNT(*) INTO V_ADMIN_COUNT FROM AppUser WHERE IsAdmin = 1;
        IF V_ADMIN_COUNT <= 1 THEN
            RAISE_APPLICATION_ERROR(-20004, 'Cannot demote the only remaining admin.');
        END IF;
    END IF;

    UPDATE AppUser SET IsAdmin = P_ISADMIN WHERE UserID = P_TARGETUSERID;
    V_ROWS := SQL%ROWCOUNT;

    IF V_ROWS = 0 THEN
        ROLLBACK;
        RAISE_APPLICATION_ERROR(-20005, 'User not found.');
    END IF;

    INSERT INTO AdminActivityLog (LogID, AdminID, Action, TargetType, TargetID, Details)
    VALUES (seq_adminactivitylog.NEXTVAL, P_ADMINID, 'user.role.update', 'User',
            P_TARGETUSERID, 'Set IsAdmin = ' || P_ISADMIN);

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/