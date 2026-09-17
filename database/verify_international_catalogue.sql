-- Verify the international catalogue after running:
-- npm run seed:international
SELECT COUNT(*) AS TOTAL_MOVIES FROM Movie;

SELECT COUNT(DISTINCT Country) AS COUNTRIES_REPRESENTED
FROM Movie
WHERE Country IS NOT NULL;

SELECT Country, COUNT(*) AS MOVIE_COUNT
FROM Movie
WHERE Country IS NOT NULL
GROUP BY Country
ORDER BY MOVIE_COUNT DESC, Country;

SELECT g.GenreName, COUNT(DISTINCT mg.MovieID) AS MOVIE_COUNT
FROM Genre g
LEFT JOIN MovieGenre mg ON mg.GenreID = g.GenreID
GROUP BY g.GenreName
ORDER BY g.GenreName;



SELECT COUNT(*)
FROM AppUser
WHERE Email LIKE '%@demo.nobochitro.local';

SELECT Username, COUNT(*) AS total
FROM AppUser
WHERE Email LIKE '%@demo.nobochitro.local'
GROUP BY Username
HAVING COUNT(*) > 1
ORDER BY Username;

SELECT UserID, Username, Email
FROM AppUser
WHERE Email LIKE '%@demo.nobochitro.local'
ORDER BY Username, UserID;

SELECT
    MIN(UserID) AS min_id,
    MAX(UserID) AS max_id,
    COUNT(*) AS total
FROM AppUser
WHERE Email LIKE '%@demo.nobochitro.local';

SELECT
    CASE
        WHEN UserID BETWEEN 17 AND 116 THEN 'FIRST 100'
        WHEN UserID BETWEEN 117 AND 216 THEN 'SECOND 100'
        ELSE 'OTHER'
    END AS batch,
    COUNT(*) AS total
FROM AppUser
WHERE Email LIKE '%@demo.nobochitro.local'
GROUP BY
    CASE
        WHEN UserID BETWEEN 17 AND 116 THEN 'FIRST 100'
        WHEN UserID BETWEEN 117 AND 216 THEN 'SECOND 100'
        ELSE 'OTHER'
    END
ORDER BY batch;

SELECT
    CASE
        WHEN UserID BETWEEN 17 AND 116 THEN 'FIRST 100'
        WHEN UserID BETWEEN 117 AND 216 THEN 'SECOND 100'
    END AS batch,
    COUNT(*) AS total_reviews
FROM Review
WHERE UserID BETWEEN 17 AND 216
GROUP BY
    CASE
        WHEN UserID BETWEEN 17 AND 116 THEN 'FIRST 100'
        WHEN UserID BETWEEN 117 AND 216 THEN 'SECOND 100'
    END
ORDER BY batch;

SELECT
    CASE
        WHEN UserID BETWEEN 17 AND 116 THEN 'FIRST 100'
        WHEN UserID BETWEEN 117 AND 216 THEN 'SECOND 100'
    END AS batch,
    COUNT(*) AS total_posts
FROM Post
WHERE UserID BETWEEN 17 AND 216
GROUP BY
    CASE
        WHEN UserID BETWEEN 17 AND 116 THEN 'FIRST 100'
        WHEN UserID BETWEEN 117 AND 216 THEN 'SECOND 100'
    END
ORDER BY batch;

DELETE FROM Review
WHERE UserID BETWEEN 117 AND 216;

DELETE FROM Post
WHERE UserID BETWEEN 117 AND 216;

DELETE FROM AppUser
WHERE UserID BETWEEN 117 AND 216
AND Email LIKE '%@demo.nobochitro.local';
SELECT COUNT(*) AS demo_users
FROM AppUser
WHERE Email LIKE '%@demo.nobochitro.local';

SELECT COUNT(*) AS reviews
FROM Review
WHERE UserID BETWEEN 17 AND 116;

SELECT COUNT(*) AS posts
FROM Post
WHERE UserID BETWEEN 17 AND 116;

SELECT COUNT(*) AS original_users
FROM AppUser
WHERE UserID BETWEEN 1 AND 16;

COMMIT;