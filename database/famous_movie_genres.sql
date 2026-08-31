-- Classify the 100-film worldwide catalogue from famous_movies_seed.sql.
-- Run this after database/famous_movies_seed.sql. Each genre receives 20
-- curated titles, and the NOT EXISTS clause makes the mapping safe to re-run.

INSERT INTO MovieGenre (MovieID, GenreID)
SELECT m.MovieID, g.GenreID FROM Movie m CROSS JOIN Genre g
WHERE g.GenreName = 'Action'
  AND m.Title IN ('The Dark Knight', 'The Lord of the Rings: The Return of the King', 'The Lord of the Rings: The Fellowship of the Ring', 'Gladiator', 'Raiders of the Lost Ark', 'Avengers: Endgame', 'The Dark Knight Rises', 'Terminator 2: Judgment Day', 'Die Hard', 'Star Wars', 'Django Unchained', 'The Departed', 'Top Gun: Maverick', 'Spider-Man: No Way Home', 'The Batman', 'The Matrix', 'The Good, the Bad and the Ugly', 'The Thing', 'Apocalypse Now', 'Dune: Part Two')
  AND NOT EXISTS (SELECT 1 FROM MovieGenre mg WHERE mg.MovieID = m.MovieID AND mg.GenreID = g.GenreID);

INSERT INTO MovieGenre (MovieID, GenreID)
SELECT m.MovieID, g.GenreID FROM Movie m CROSS JOIN Genre g
WHERE g.GenreName = 'Drama'
  AND m.Title IN ('The Shawshank Redemption', 'The Godfather', 'Schindler''s List', 'Forrest Gump', 'Life Is Beautiful', 'The Green Mile', 'The Pianist', 'The Lives of Others', 'Dead Poets Society', 'The Intouchables', 'Cinema Paradiso', 'To Kill a Mockingbird', 'Lawrence of Arabia', 'The Apartment', 'All About Eve', 'Bicycle Thieves', 'It''s a Wonderful Life', 'Oppenheimer: The Story', 'Whiplash', 'The Truman Show')
  AND NOT EXISTS (SELECT 1 FROM MovieGenre mg WHERE mg.MovieID = m.MovieID AND mg.GenreID = g.GenreID);

INSERT INTO MovieGenre (MovieID, GenreID)
SELECT m.MovieID, g.GenreID FROM Movie m CROSS JOIN Genre g
WHERE g.GenreName = 'Sci-Fi'
  AND m.Title IN ('Interstellar', 'The Matrix', 'Alien', 'WALL-E', 'Eternal Sunshine of the Spotless Mind', '2001: A Space Odyssey', 'A Clockwork Orange', 'Back to the Future', 'Your Name', 'Everything Everywhere All at Once', 'Spider-Man: Into the Spider-Verse', 'Coco', 'Up', 'Toy Story 3', 'The Sixth Sense', 'The Nightmare Before Christmas', 'The Kid', 'The Great Dictator', 'Modern Times', 'The Lion King')
  AND NOT EXISTS (SELECT 1 FROM MovieGenre mg WHERE mg.MovieID = m.MovieID AND mg.GenreID = g.GenreID);

INSERT INTO MovieGenre (MovieID, GenreID)
SELECT m.MovieID, g.GenreID FROM Movie m CROSS JOIN Genre g
WHERE g.GenreName = 'Thriller'
  AND m.Title IN ('Se7en', 'The Silence of the Lambs', 'The Prestige', 'Memento', 'The Usual Suspects', 'Rear Window', 'Vertigo', 'Psycho', 'The Sixth Sense', 'The Exorcist', 'North by Northwest', 'Double Indemnity', 'The Third Man', 'The Departed', 'The Dark Knight', 'Fight Club', 'American History X', 'The Truman Show', 'The Matrix', 'The Batman')
  AND NOT EXISTS (SELECT 1 FROM MovieGenre mg WHERE mg.MovieID = m.MovieID AND mg.GenreID = g.GenreID);

INSERT INTO MovieGenre (MovieID, GenreID)
SELECT m.MovieID, g.GenreID FROM Movie m CROSS JOIN Genre g
WHERE g.GenreName = 'Crime'
  AND m.Title IN ('Pulp Fiction', 'Goodfellas', 'The Departed', 'City of God', 'American History X', 'L.A. Confidential', 'Reservoir Dogs', 'Snatch', 'Trainspotting', 'Chinatown', 'The Godfather Part II', 'The Usual Suspects', 'The Silence of the Lambs', 'Django Unchained', 'Inglourious Basterds', 'The Godfather', 'The Dark Knight', 'Apocalypse Now', 'The Third Man', 'Double Indemnity')
  AND NOT EXISTS (SELECT 1 FROM MovieGenre mg WHERE mg.MovieID = m.MovieID AND mg.GenreID = g.GenreID);

COMMIT;
