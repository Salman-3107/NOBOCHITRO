import { useEffect, useState, useCallback } from 'react';
import { listMovies, getMovie, deleteMovie, listGenres } from '../api/movies';
import MovieFormModal from './MovieFormModal';
import './MoviesPage.css';

export default function MoviesPage() {
  const [movies, setMovies] = useState([]);
  const [genres, setGenres] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');

  const [formState, setFormState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', movie }
  const [deletingId, setDeletingId] = useState(null);

  const loadMovies = useCallback(async (searchTerm) => {
    setStatus('loading');
    try {
      const [movieRows, genreRows] = await Promise.all([listMovies(searchTerm), listGenres()]);
      setMovies(movieRows);
      setGenres(genreRows);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  }, []);

  useEffect(() => {
    loadMovies('');
  }, [loadMovies]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    loadMovies(search);
  }

  async function openEdit(movieId) {
    try {
      const fullMovie = await getMovie(movieId);
      // getMovie returns MovieID etc. in the same uppercase-key shape the
      // form expects, plus a `genres` array -- reuse it directly.
      setFormState({ mode: 'edit', movie: { ...fullMovie, MOVIEID: fullMovie.MOVIEID ?? movieId } });
    } catch (err) {
      alert(`Couldn't load movie details: ${err.message}`);
    }
  }

  async function handleDelete(movie) {
    const confirmed = window.confirm(
      `Delete "${movie.TITLE}" (${movie.RELEASEYEAR})? This can't be undone.`
    );
    if (!confirmed) return;

    setDeletingId(movie.MOVIEID);
    try {
      await deleteMovie(movie.MOVIEID);
      setMovies((prev) => prev.filter((m) => m.MOVIEID !== movie.MOVIEID));
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleSaved() {
    setFormState(null);
    loadMovies(search);
  }

  return (
    <div className="movies-page">
      <div className="movies-page__toolbar">
        <div>
          <h1>Movies</h1>
          <p className="movies-page__count">
            {status === 'ready' ? `${movies.length} movie${movies.length === 1 ? '' : 's'}` : '\u00A0'}
          </p>
        </div>

        <div className="movies-page__toolbar-right">
          <form onSubmit={handleSearchSubmit} className="movies-page__search">
            <input
              type="text"
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>

          <button
            type="button"
            className="movies-page__add"
            onClick={() => setFormState({ mode: 'create' })}
          >
            + Add Movie
          </button>
        </div>
      </div>

      {status === 'loading' && <p className="movies-page__status">Loading movies…</p>}
      {status === 'error' && <p className="movies-page__status movies-page__status--error">{errorMessage}</p>}

      {status === 'ready' && movies.length === 0 && (
        <p className="movies-page__status">No movies found{search ? ` for "${search}"` : ''}.</p>
      )}

      {status === 'ready' && movies.length > 0 && (
        <div className="movies-table__wrap">
          <table className="movies-table">
            <thead>
              <tr>
                <th>Poster</th>
                <th>Title</th>
                <th>Year</th>
                <th>Runtime</th>
                <th>Language</th>
                <th>Country</th>
                <th>Rating</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movies.map((movie) => (
                <tr key={movie.MOVIEID}>
                  <td>
                    {movie.POSTERURL ? (
                      <img className="movies-table__poster" src={movie.POSTERURL} alt="" />
                    ) : (
                      <div className="movies-table__poster movies-table__poster--empty">
                        {movie.TITLE?.charAt(0) || '?'}
                      </div>
                    )}
                  </td>
                  <td className="movies-table__title">{movie.TITLE}</td>
                  <td>{movie.RELEASEYEAR}</td>
                  <td>{movie.RUNTIME ? `${movie.RUNTIME} min` : '—'}</td>
                  <td>{movie.LANGUAGE || '—'}</td>
                  <td>{movie.COUNTRY || '—'}</td>
                  <td>{movie.AVGRATING ? `★ ${movie.AVGRATING}` : '—'}</td>
                  <td className="movies-table__actions">
                    <button type="button" onClick={() => openEdit(movie.MOVIEID)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="movies-table__delete"
                      disabled={deletingId === movie.MOVIEID}
                      onClick={() => handleDelete(movie)}
                    >
                      {deletingId === movie.MOVIEID ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formState && (
        <MovieFormModal
          mode={formState.mode}
          movie={formState.movie}
          genres={genres}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
