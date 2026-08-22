-- ============================================================
-- NOBOCHITRO seed data
-- Run this AFTER create_tables.sql, constraints.sql, sequences.sql
-- Safe to re-run only if you first clear the tables (see bottom note).
-- ============================================================

-- ---------- GENRES ----------
INSERT INTO Genre (GenreID, GenreName) VALUES (seq_genre.NEXTVAL, 'Action');
INSERT INTO Genre (GenreID, GenreName) VALUES (seq_genre.NEXTVAL, 'Drama');
INSERT INTO Genre (GenreID, GenreName) VALUES (seq_genre.NEXTVAL, 'Sci-Fi');
INSERT INTO Genre (GenreID, GenreName) VALUES (seq_genre.NEXTVAL, 'Thriller');
INSERT INTO Genre (GenreID, GenreName) VALUES (seq_genre.NEXTVAL, 'Crime');

-- ---------- PEOPLE ----------
INSERT INTO Person (PersonID, FullName, DateOfBirth) VALUES (seq_person.NEXTVAL, 'Christopher Nolan', DATE '1970-07-30');
INSERT INTO Person (PersonID, FullName, DateOfBirth) VALUES (seq_person.NEXTVAL, 'Leonardo DiCaprio', DATE '1974-11-11');
INSERT INTO Person (PersonID, FullName, DateOfBirth) VALUES (seq_person.NEXTVAL, 'Cillian Murphy', DATE '1976-05-25');
INSERT INTO Person (PersonID, FullName, DateOfBirth) VALUES (seq_person.NEXTVAL, 'Bong Joon-ho', DATE '1969-09-14');
INSERT INTO Person (PersonID, FullName, DateOfBirth) VALUES (seq_person.NEXTVAL, 'Song Kang-ho', DATE '1967-01-17');

-- ---------- MOVIES ----------
INSERT INTO Movie (MovieID, Title, ReleaseYear, Runtime, Language, Country, Synopsis)
VALUES (seq_movie.NEXTVAL, 'Inception', 2010, 148, 'English', 'USA',
        'A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.');

INSERT INTO Movie (MovieID, Title, ReleaseYear, Runtime, Language, Country, Synopsis)
VALUES (seq_movie.NEXTVAL, 'Oppenheimer', 2023, 180, 'English', 'USA',
        'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.');

INSERT INTO Movie (MovieID, Title, ReleaseYear, Runtime, Language, Country, Synopsis)
VALUES (seq_movie.NEXTVAL, 'Parasite', 2019, 132, 'Korean', 'South Korea',
        'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.');

-- ---------- MOVIE <-> GENRE (many-to-many) ----------
-- Inception: Sci-Fi, Action, Thriller
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Inception' AND g.GenreName = 'Sci-Fi';
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Inception' AND g.GenreName = 'Action';
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Inception' AND g.GenreName = 'Thriller';

-- Oppenheimer: Drama, Thriller
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Oppenheimer' AND g.GenreName = 'Drama';
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Oppenheimer' AND g.GenreName = 'Thriller';

-- Parasite: Drama, Thriller, Crime
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Parasite' AND g.GenreName = 'Drama';
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Parasite' AND g.GenreName = 'Thriller';
INSERT INTO MovieGenre (MovieID, GenreID) SELECT m.MovieID, g.GenreID FROM Movie m, Genre g WHERE m.Title = 'Parasite' AND g.GenreName = 'Crime';

-- ---------- MOVIE <-> PERSON (credits) ----------
-- Inception
INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
SELECT m.MovieID, p.PersonID, 'Director', NULL FROM Movie m, Person p WHERE m.Title = 'Inception' AND p.FullName = 'Christopher Nolan';
INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
SELECT m.MovieID, p.PersonID, 'Actor', 'Dom Cobb' FROM Movie m, Person p WHERE m.Title = 'Inception' AND p.FullName = 'Leonardo DiCaprio';

-- Oppenheimer
INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
SELECT m.MovieID, p.PersonID, 'Director', NULL FROM Movie m, Person p WHERE m.Title = 'Oppenheimer' AND p.FullName = 'Christopher Nolan';
INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
SELECT m.MovieID, p.PersonID, 'Actor', 'J. Robert Oppenheimer' FROM Movie m, Person p WHERE m.Title = 'Oppenheimer' AND p.FullName = 'Cillian Murphy';

-- Parasite
INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
SELECT m.MovieID, p.PersonID, 'Director', NULL FROM Movie m, Person p WHERE m.Title = 'Parasite' AND p.FullName = 'Bong Joon-ho';
INSERT INTO MovieCredit (MovieID, PersonID, RoleType, CharacterName)
SELECT m.MovieID, p.PersonID, 'Actor', 'Kim Ki-taek' FROM Movie m, Person p WHERE m.Title = 'Parasite' AND p.FullName = 'Song Kang-ho';

-- ---------- SAMPLE REVIEWS (uses the 2 users you already registered: salman, testuser2) ----------
-- Adjust usernames below if yours differ.
INSERT INTO Review (UserID, MovieID, RatingValue, ReviewText, ReviewDate)
SELECT u.UserID, m.MovieID, 9, 'Mind-bending and rewatchable.', SYSDATE
FROM AppUser u, Movie m WHERE u.Username = 'salman' AND m.Title = 'Inception';

INSERT INTO Review (UserID, MovieID, RatingValue, ReviewText, ReviewDate)
SELECT u.UserID, m.MovieID, 10, 'One of the best of the decade.', SYSDATE
FROM AppUser u, Movie m WHERE u.Username = 'testuser2' AND m.Title = 'Parasite';

COMMIT;

-- ============================================================
-- To wipe and re-seed later, run this first (order matters due to FKs):
--   DELETE FROM Review; DELETE FROM MovieCredit; DELETE FROM MovieGenre;
--   DELETE FROM Movie; DELETE FROM Person; DELETE FROM Genre;
--   COMMIT;
-- ============================================================
