import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import MovieCard from '../components/MovieCard';
import { listMovies, listGenres } from '../api/movies';
import './BrowsePage.css';

const SORT_OPTIONS = [
  { value: '', label: 'A–Z' },
  { value: 'popular', label: 'Popular' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'recent', label: 'Recent' },
  { value: 'trending', label: 'Trending' },
];

export default function BrowsePage({ user, onLogout, onSelectMovie }) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [genres, setGenres] = useState([]);
  const [activeGenre, setActiveGenre] = useState('');
  const [activeSort, setActiveSort] = useState('');
  const [movies, setMovies] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    listGenres()
      .then(setGenres)
      .catch(() => {
        /* Non-critical -- browsing still works without the genre filter. */
      });
  }, []);

  const fetchMovies = useCallback(() => {
    setStatus('loading');
    listMovies({ genre: activeGenre, sort: activeSort, search: debouncedSearch })
      .then((data) => {
        setMovies(data);
        setStatus('ready');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [activeGenre, activeSort, debouncedSearch]);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  return (
    <div className="browse-page">
      <Header searchValue={searchInput} onSearchChange={setSearchInput} onLogout={onLogout} />

      <main className="browse-page__content">
        <div className="browse-page__intro">
          <h1>Welcome back, {user.displayName}</h1>
          <p>What are you watching next?</p>
        </div>

        <div className="browse-page__filters">
          <div className="filter-chips">
            <button
              type="button"
              className={`filter-chip ${activeGenre === '' ? 'filter-chip--active' : ''}`}
              onClick={() => setActiveGenre('')}
            >
              All Genres
            </button>
            {genres.map((g) => (
              <button
                key={g.GENREID}
                type="button"
                className={`filter-chip ${activeGenre === g.GENRENAME ? 'filter-chip--active' : ''}`}
                onClick={() => setActiveGenre(g.GENRENAME)}
              >
                {g.GENRENAME}
              </button>
            ))}
          </div>

          <div className="sort-select">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`sort-select__option ${activeSort === opt.value ? 'sort-select__option--active' : ''}`}
                onClick={() => setActiveSort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' && <p className="browse-page__status">Loading movies…</p>}

        {status === 'error' && (
          <p className="browse-page__status browse-page__status--error">{errorMessage}</p>
        )}

        {status === 'ready' && movies.length === 0 && (
          <p className="browse-page__status">No movies match that search yet.</p>
        )}

        {status === 'ready' && movies.length > 0 && (
          <div className="movie-grid">
            {movies.map((movie) => (
              <MovieCard
                key={movie.MOVIEID}
                movie={movie}
                onClick={() => onSelectMovie(movie.MOVIEID)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
