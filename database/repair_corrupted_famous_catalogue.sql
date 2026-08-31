-- Repairs ONLY the faulty first run of famous_movies_seed.sql, where all
-- 100 inserted films were assigned MovieID = 4 by Oracle INSERT ALL.
-- It refuses to run unless that exact corrupt state is present.
DECLARE
  corrupt_movie_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO corrupt_movie_count FROM Movie WHERE MovieID = 4;
  IF corrupt_movie_count != 100 THEN
    RAISE_APPLICATION_ERROR(-20001, 'Expected exactly 100 corrupted rows with MovieID 4; repair cancelled.');
  END IF;

  DELETE FROM PostLike WHERE PostID IN (SELECT PostID FROM Post WHERE MovieID = 4);
  DELETE FROM PostComment WHERE PostID IN (SELECT PostID FROM Post WHERE MovieID = 4);
  DELETE FROM Post WHERE MovieID = 4;
  DELETE FROM Review WHERE MovieID = 4;
  DELETE FROM JournalEntry WHERE MovieID = 4;
  DELETE FROM BucketListItem WHERE MovieID = 4;
  DELETE FROM MovieCredit WHERE MovieID = 4;
  DELETE FROM MovieGenre WHERE MovieID = 4;
  DELETE FROM Movie WHERE MovieID = 4;
  COMMIT;
END;
/
