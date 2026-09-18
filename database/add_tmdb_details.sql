-- add_tmdb_details.sql
-- Columns needed so TMDB data can be synced repeatedly without creating
-- duplicate people or losing the billing order of a cast list.
-- Run once, as nobochitro_user, after create_tables.sql + constraints.sql.

-- 1. Remember which TMDB record a movie was matched to, so later syncs skip
--    the fuzzy title search entirely.
ALTER TABLE movie ADD tmdbid NUMBER(10);
CREATE UNIQUE INDEX uq_movie_tmdbid ON movie ( tmdbid );

-- 2. Same for people. Two actors can share a name; the TMDB id cannot.
ALTER TABLE person ADD tmdbid NUMBER(10);
CREATE UNIQUE INDEX uq_person_tmdbid ON person ( tmdbid );

-- 3. Billing order of a credit (0 = top billed). NULL for crew.
--    Without this the cast list comes back in arbitrary row order.
ALTER TABLE moviecredit ADD creditorder NUMBER(4);

-- 4. Lookups the details page does on every request.
CREATE INDEX idx_moviecredit_movie ON moviecredit ( movieid );

COMMIT;
