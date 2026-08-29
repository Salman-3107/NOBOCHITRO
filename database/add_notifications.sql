-- ============================================================
-- Adds Notification support. Not in the original schema --
-- needed for "someone followed you", "liked your post",
-- "commented on your post" alerts (feature #27 in the spec,
-- marked optional there, but implemented here).
-- ============================================================

CREATE SEQUENCE seq_notification START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE Notification (
    NotificationID  NUMBER(10)      NOT NULL,
    UserID          NUMBER(10)      NOT NULL,  -- who RECEIVES this notification
    NotifType       VARCHAR2(30)    NOT NULL,  -- 'Follow', 'PostLike', 'PostComment'
    Message         VARCHAR2(255)   NOT NULL,
    RelatedID       NUMBER(10),                -- e.g. the PostID or UserID that triggered it
    IsRead          NUMBER(1)       DEFAULT 0,
    CreatedDate     DATE            DEFAULT SYSDATE
);

ALTER TABLE Notification ADD CONSTRAINT pk_notification PRIMARY KEY (NotificationID);

ALTER TABLE Notification ADD CONSTRAINT ck_notification_isread CHECK (IsRead IN (0, 1));

ALTER TABLE Notification
    ADD CONSTRAINT fk_notification_appuser
    FOREIGN KEY (UserID) REFERENCES AppUser (UserID)
    ON DELETE CASCADE;

COMMIT;
