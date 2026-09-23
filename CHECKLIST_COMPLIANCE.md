# CSE216 Project Checklist — where each requirement lives in NOBOCHITRO

Use this as a map for the viva. Every entry names the file and function so you can open it and walk through it.

## 1. User authentication (own code, no third party)
- `backend/controllers/authController.js` — `register` (bcrypt hash, server-side validation), `login` (bcrypt compare, issues a JWT with a unique `jti`), `logout` (stores the `jti` in `RevokedToken`), `getCurrentUser`.
- `backend/middleware/auth.js` — `requireAuth` verifies the JWT signature/expiry **and** checks the `jti` is not in `RevokedToken`. `requireAdmin` re-reads `IsAdmin` from the database instead of trusting the token.

## 2. Authentication check on every page
- `backend/server.js` — `app.use('/api', requireAuth)` is mounted **before every router except `/api/auth`**. Every API route is therefore protected by where it is mounted, not by someone remembering to add a middleware. Only `POST /api/auth/register` and `POST /api/auth/login` are reachable without a token.
- Frontend: `frontend/src/App.jsx` — `useUrlMatchesRole` sends a signed-out visitor to `/` (the landing page, which calls no API); `api/client.js` clears the session on any 401.
- Verified: all 113 declared routes were requested without a token; every one except register/login returned 401.

## 3. Explicit transaction control
Every DML statement runs with `autoCommit` off and is followed by an explicit `connection.commit()`; every `catch` block calls `connection.rollback()` first. No `autoCommit: true` remains anywhere in `controllers/`.
- Multi-step example: `movieController.createMovie` — the `Movie` row and all its `MovieGenre` rows are one transaction.
- Multi-step example: `journalController.createEntry` — journal insert + `challengeController.evaluateChallengeProgress` share one transaction.
- Two helpers (`notificationController.createNotification`, `challengeController.evaluateChallengeProgress`) deliberately don't commit: they run on the **caller's** connection and the caller commits or rolls back.
- Stored procedures commit/rollback inside themselves (see §6).

## 4. Triggers (`database/plsql_objects.sql`)
| Trigger | Table / timing | Purpose |
|---|---|---|
| `TRG_LOG_REVIEW_DELETE` | `Review`, BEFORE DELETE | shadow-table log of removed reviews → `ReviewHistory` |
| `TRG_LOG_REVIEW_UPDATE` | `Review`, AFTER UPDATE | shadow-table log of the previous rating/text |
| `TRG_NOTIFY_ON_FOLLOW` | `UserFollow`, AFTER INSERT | writes the "started following you" notification |
| `TRG_NOTIFY_ON_POST_LIKE` | `PostLike`, AFTER INSERT | "liked your post" (skips self-likes) |
| `TRG_NOTIFY_ON_POST_COMMENT` | `PostComment`, AFTER INSERT | "commented on your post" (skips self-comments) |
| `TRG_UCP_AUTOCOMPLETE` | `UserChallengeProgress`, BEFORE UPDATE OF CurrentProgress | sets `Completed`/`CompletionDate` when progress reaches the target |

The three notification triggers and the completion trigger are the **only** writers of those rows now — the duplicate JS code in `followController`, `postController` and `challengeController` was removed.

## 5. Functions
| Function | Called from | Purpose |
|---|---|---|
| `FN_MOVIE_AVG_RATING(movieId)` | `movieController.getMovie` | average rating of a movie |
| `FN_TASTE_MATCH_SCORE(userA, userB)` | `tasteMatchController.getTasteMatch` | 0–100 compatibility from the average rating gap |
| `FN_USER_TOTAL_XP(userId)` | `adminEngagementController.getLeaderboard`, `leaderboardController` (`most_xp`) | total XP from completed challenges |

## 6. Procedures
| Procedure | Called from | Tables written in one transaction |
|---|---|---|
| `PROC_ADD_TO_WATCHLIST` | `bucketListController.addToWatchlist` | `BucketList` (get-or-create), `BucketListItem` |
| `PROC_PUBLISH_CHALLENGE` | `adminEngagementController.publishChallenge` | `Challenge`, `Notification` (one per user), `AdminActivityLog` |
| `PROC_SET_USER_ROLE` | `adminController.setUserRole` | `AppUser`, `AdminActivityLog` (also refuses to demote the last admin) |

Errors raised with `RAISE_APPLICATION_ERROR` (-20001 … -20006) are translated to HTTP 404/409/400 in the controller's `catch`.

## 7. Complex queries (≥ 3 — multiple tables and/or aggregation)
- `statsController.getUserStats` — genre / month / rating / country breakdowns (`JOIN` + `GROUP BY`) → **Stats** page.
- `leaderboardController.getLeaderboard` — three `JOIN … GROUP BY … ORDER BY COUNT` boards + XP board → **Leaderboard**.
- `recommendationController.getRecommendations` — favourite genres → unseen movies via `NOT IN` subquery and `AVG() OVER (PARTITION BY …)`.
- `passportController.getMoviePassport` — per-genre, per-director and per-country counts.
- `tasteMatchController.getTasteMatch` — self-join of `Review` plus an anti-join (`NOT EXISTS`).
- `adminInsightsController.getAnalytics` — platform-wide aggregates for the admin dashboard.

## 8. Appropriate use of database features
Each object replaces logic that would otherwise be repeated or could be bypassed:
- Notification triggers fire no matter which code path inserts a like/follow/comment.
- Review triggers are a genuine audit/shadow-table use case.
- Procedures are used only where several tables must change together.
- Functions are used only where a computed value is returned and reused in SQL.
- Deliberately **not** database objects: recommendation logic and challenge criteria matching (`evaluateChallengeProgress`) stay in JS because they are business rules, not data-integrity rules.

## Deploying the database objects
1. Run the base scripts in `database/` in the order given in the header comment of each file (tables → constraints → sequences → the `add_*` scripts → `admin_dashboard_extensions.sql`).
2. Run `database/plsql_objects.sql` **after** those. It is safe to run again — the supporting table/sequence are created only if missing and everything else is `CREATE OR REPLACE`. **Re-run it now**: `PROC_PUBLISH_CHALLENGE` gained an output parameter and an end-date check, and `PROC_SET_USER_ROLE` now logs `user.promote` / `user.demote`.
3. The backend now depends on these objects. Without step 2, follow/like/comment notifications, challenge completion, watchlist add, publish-challenge and role changes will not work.
