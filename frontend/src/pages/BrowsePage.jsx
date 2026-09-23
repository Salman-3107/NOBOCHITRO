import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import MovieCard from '../components/MovieCard';
import { getRecommendations, listMovies, listGenres } from '../api/movies';
import './BrowsePage.css';

const SORT_OPTIONS = [
  { value: '', label: 'A–Z' },
  { value: 'popular', label: 'Popular' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'recent', label: 'Recent' },
  { value: 'trending', label: 'Trending' },
];

function MovieRow({ title, eyebrow, movies, onSelectMovie }) {
  if (!movies.length) return null;

  return (
    <section className="home-row">
      <div className="home-row__heading">
        <div>
          {eyebrow && <p className="home-row__eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        <button type="button" className="home-row__view-all">View all <span aria-hidden="true">→</span></button>
      </div>
      <div className="home-row__carousel">
        {movies.map((movie) => (
          <MovieCard key={`${title}-${movie.MOVIEID}`} movie={movie} onClick={() => onSelectMovie(movie.MOVIEID)} />
        ))}
      </div>
    </section>
  );
}

export default function BrowsePage({ user, onLogout, onSelectMovie, page, onNavigate }) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [genres, setGenres] = useState([]);
  const [activeGenre, setActiveGenre] = useState('');
  const [activeSort, setActiveSort] = useState('');
  const [activeYear, setActiveYear] = useState('');
  const [movies, setMovies] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const firstName = user.displayName?.split(' ')[0] || user.username || 'there';

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
    listMovies({ genre: activeGenre, year: activeYear, sort: activeSort, search: debouncedSearch })
      .then((data) => {
        setMovies(data);
        setStatus('ready');
      })
      .catch((err) => {
        setErrorMessage(err.message);
        setStatus('error');
      });
  }, [activeGenre, activeYear, activeSort, debouncedSearch]);

  const isDiscover = page === 'discover';
  const years = [...new Set(movies.map((movie) => movie.RELEASEYEAR).filter(Boolean))].sort((a, b) => b - a);
  const hasFilters = debouncedSearch || activeGenre || activeSort || activeYear;

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  // The API uses a user's highly rated genres first; new users receive the
  // strongest community-rated films. The loaded catalogue is a visual fallback.
  useEffect(() => {
    getRecommendations().then(setRecommendations).catch(() => setRecommendations([]));
  }, []);

  const featuredMovies = (recommendations.length >= 3 ? recommendations : [...movies].sort((a, b) => (b.AVGRATING || 0) - (a.AVGRATING || 0))).slice(0, 6);
  const featuredMovie = featuredMovies[featuredIndex % Math.max(featuredMovies.length, 1)];

  useEffect(() => {
    if (isHeroPaused || featuredMovies.length < 2) return undefined;
    const timer = setInterval(() => setFeaturedIndex((current) => (current + 1) % featuredMovies.length), 5000);
    return () => clearInterval(timer);
  }, [featuredMovies.length, isHeroPaused]);

  useEffect(() => { setFeaturedIndex(0); }, [featuredMovies.length]);

  function showPreviousFeature() {
    setFeaturedIndex((current) => (current - 1 + featuredMovies.length) % featuredMovies.length);
  }

  function showNextFeature() {
    setFeaturedIndex((current) => (current + 1) % featuredMovies.length);
  }

  function applyGenre(genre) {
    setActiveGenre(genre);
  }

  function applySort(sort) {
    setActiveSort(sort);
  }

  function applyYear(year) {
    setActiveYear(year);
  }

  function resetHomeFilters() {
    setSearchInput('');
    setActiveGenre('');
    setActiveYear('');
    setActiveSort('');
  }

  function handleHeaderNavigate(nextPage, targetId) {
    if (nextPage === 'home') resetHomeFilters();
    onNavigate(nextPage, targetId);
  }

  return (
    <div className="browse-page">
      <Header searchValue={searchInput} onSearchChange={setSearchInput} onLogout={onLogout} activePage={page} onNavigate={handleHeaderNavigate} hideEmptyMembers />

      <main className="browse-page__content">
        {featuredMovie && !isDiscover && (
          <section className="movie-hero" id="home" onMouseEnter={() => setIsHeroPaused(true)} onMouseLeave={() => setIsHeroPaused(false)}>
            <div className="movie-hero__art" aria-hidden="true">
              {featuredMovie.POSTERURL && <img src={featuredMovie.POSTERURL} alt="" />}
            </div>
            <div className="movie-hero__content" key={featuredMovie.MOVIEID}>
              <p className="movie-hero__eyebrow">{recommendations.length >= 3 ? 'Picked for your taste' : 'Featured tonight'}</p>
              <h1>{featuredMovie.TITLE}</h1>
              <p className="movie-hero__meta">
                {featuredMovie.RELEASEYEAR} {featuredMovie.RUNTIME ? ` · ${featuredMovie.RUNTIME} min` : ''}
                {featuredMovie.AVGRATING ? ` · ★ ${featuredMovie.AVGRATING}` : ''}
              </p>
              <p className="movie-hero__description">Your next unforgettable movie experience starts here. Discover, rate and remember the stories that move you.</p>
              <div className="movie-hero__actions">
                <button type="button" className="button button--primary" onClick={() => onSelectMovie(featuredMovie.MOVIEID)}>View details</button>
                <button type="button" className="button button--ghost">+ Watchlist</button>
              </div>
            </div>
            {featuredMovies.length > 1 && <><div className="movie-hero__controls"><button type="button" onClick={showPreviousFeature} aria-label="Previous featured movie">←</button><button type="button" onClick={showNextFeature} aria-label="Next featured movie">→</button></div><div className="movie-hero__dots">{featuredMovies.map((movie, index) => <button key={movie.MOVIEID} type="button" className={index === featuredIndex ? 'movie-hero__dot movie-hero__dot--active' : 'movie-hero__dot'} aria-label={`Show ${movie.TITLE}`} onClick={() => setFeaturedIndex(index)} />)}</div></>}
          </section>
        )}

        <div className={`browse-page__intro ${isDiscover ? 'browse-page__intro--discover' : ''}`}>
          <p className="browse-page__eyebrow">{isDiscover ? 'Find your next favourite' : 'Your cinema, your story'}</p>
          <h1>{debouncedSearch ? `Results for “${debouncedSearch}”` : isDiscover ? 'Discover movies' : `Welcome back, ${firstName}`}</h1>
          <p>{debouncedSearch ? 'Explore titles from the NOBOCHITRO collection.' : isDiscover ? 'Explore the collection with filters tailored to your mood.' : 'What will you discover today?'}</p>
        </div>

        <div className={`browse-page__filters ${isDiscover ? 'browse-page__filters--discover' : ''}`}>
          <div className="filter-chips">
            {isDiscover && <span className="filter-group-label">Genre</span>}
            <button
              type="button"
              className={`filter-chip ${activeGenre === '' ? 'filter-chip--active' : ''}`}
              onClick={() => applyGenre('')}
            >
              All Genres
            </button>
            {genres.map((g) => (
              <button
                key={g.GENREID}
                type="button"
                className={`filter-chip ${activeGenre === g.GENRENAME ? 'filter-chip--active' : ''}`}
                onClick={() => applyGenre(g.GENRENAME)}
              >
                {g.GENRENAME}
              </button>
            ))}
          </div>

          {isDiscover && (
            <label className="year-select">
              <span>Release year</span>
              <select value={activeYear} onChange={(event) => applyYear(event.target.value)}>
                <option value="">Any year</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          )}

          <div className="sort-select">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`sort-select__option ${activeSort === opt.value ? 'sort-select__option--active' : ''}`}
                onClick={() => applySort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isDiscover && hasFilters && <button type="button" className="clear-filters" onClick={resetHomeFilters}>Clear filters</button>}
        </div>

        {status === 'loading' && <p className="browse-page__status">Loading movies…</p>}

        {status === 'error' && (
          <p className="browse-page__status browse-page__status--error">{errorMessage}</p>
        )}

        {status === 'ready' && movies.length === 0 && (
          <p className="browse-page__status">No movies match that search yet.</p>
        )}

        {status === 'ready' && movies.length > 0 && (isDiscover || hasFilters) && (
          <section className="filtered-movies">
            {!isDiscover && <div className="filtered-movies__heading"><p className="browse-page__eyebrow">Filtered collection</p><h2>{activeGenre || activeYear || 'Matching movies'}</h2></div>}
          <div className="movie-grid">
            {movies.map((movie) => (
              <MovieCard
                key={movie.MOVIEID}
                movie={movie}
                onClick={() => onSelectMovie(movie.MOVIEID)}
              />
            ))}
          </div>
          </section>
        )}

        {status === 'ready' && movies.length > 0 && !isDiscover && !hasFilters && (
          <div className="home-rows">
            <MovieRow title="Trending now" eyebrow="Most talked about" movies={movies.slice(0, 8)} onSelectMovie={onSelectMovie} />
            <MovieRow title="Top rated" eyebrow="Community favourites" movies={[...movies].sort((a, b) => (b.AVGRATING || 0) - (a.AVGRATING || 0)).slice(0, 8)} onSelectMovie={onSelectMovie} />
            <MovieRow title="Explore more stories" eyebrow="Handpicked for you" movies={[...movies].reverse().slice(0, 8)} onSelectMovie={onSelectMovie} />
          </div>
        )}
      </main>
    </div>
  );
}
