-- ============================================================
-- Adds the RevokedToken table -- makes logout actually invalidate
-- a JWT server-side, instead of the frontend just deleting it from
-- localStorage while the token stays valid until it expires.
--
-- Each JWT is now issued with a unique "jti" (JWT ID) claim. On
-- logout, that jti gets inserted here. requireAuth checks this
-- table on every request and rejects any token whose jti shows up,
-- even if the signature and expiry are still otherwise valid.
--
-- Run this ONCE against your local Oracle 19c database.
-- ============================================================

CREATE TABLE RevokedToken (
    TokenJTI    VARCHAR2(36)  NOT NULL,   -- the JWT's unique "jti" claim (a UUID)
    UserID      NUMBER(10)    NOT NULL,   -- whose token this was, for auditing
    RevokedAt   DATE          DEFAULT SYSDATE,
    ExpiresAt   DATE          NOT NULL    -- copy of the token's own expiry
);

ALTER TABLE RevokedToken
    ADD CONSTRAINT pk_revokedtoken PRIMARY KEY (TokenJTI);

ALTER TABLE RevokedToken
    ADD CONSTRAINT fk_revokedtoken_user
    FOREIGN KEY (UserID) REFERENCES AppUser (UserID)
    ON DELETE CASCADE;

-- Speeds up the cleanup query that deletes rows whose token would
-- have expired naturally anyway (see cleanupExpiredRevocations in
-- authController.js) -- ExpiresAt is unindexed by default here.
CREATE INDEX idx_revokedtoken_expiresat ON RevokedToken (ExpiresAt);

COMMIT;
