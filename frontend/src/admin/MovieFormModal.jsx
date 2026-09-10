import { useState } from 'react';
import { createMovie, updateMovie } from '../api/movies';
import './MovieFormModal.css';

const EMPTY_FORM = {
  title: '',
  releaseYear: '',
  runtime: '',
  language: '',
  country: '',
  synopsis: '',
  posterUrl: '',
  trailerUrl: '',
  boxOfficeCollection: '',
};

export default function MovieFormModal({ mode, movie, genres, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (mode === 'edit' && movie) {
      return {
        title: movie.TITLE || '',
        releaseYear: movie.RELEASEYEAR || '',
        runtime: movie.RUNTIME || '',
        language: movie.LANGUAGE || '',
        country: movie.COUNTRY || '',
        synopsis: movie.SYNOPSIS || '',
        posterUrl: movie.POSTERURL || '',
        trailerUrl: movie.TRAILERURL || '',
        boxOfficeCollection: movie.BOX_OFFICE_COLLECTION || '',
      };
    }
    return EMPTY_FORM;
  });
  const [selectedGenreIds, setSelectedGenreIds] = useState(() => {
    if (mode === 'edit' && movie?.genres) {
      return movie.genres.map((g) => g.GENREID);
    }
    return [];
  });
  const [status, setStatus] = useState('idle'); // idle | saving | error
  const [errorMessage, setErrorMessage] = useState('');

  function updateField(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function toggleGenre(genreId) {
    setSelectedGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('saving');
    setErrorMessage('');

    const payload = {
      title: form.title.trim(),
      releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined,
      runtime: form.runtime ? Number(form.runtime) : undefined,
      language: form.language.trim() || undefined,
      country: form.country.trim() || undefined,
      synopsis: form.synopsis.trim() || undefined,
      posterUrl: form.posterUrl.trim() || undefined,
      trailerUrl: form.trailerUrl.trim() || undefined,
      boxOfficeCollection: form.boxOfficeCollection ? Number(form.boxOfficeCollection) : undefined,
      genreIds: selectedGenreIds,
    };

    try {
      if (mode === 'create') {
        await createMovie(payload);
      } else {
        await updateMovie(movie.MOVIEID, payload);
      }
      onSaved();
    } catch (err) {
      setStatus('error');
      // The backend includes the clashing movie's ID in a 409 -- but our
      // apiRequest wrapper only surfaces err.message (the string), so this
      // just shows the message. Good enough context either way.
      setErrorMessage(err.message);
    }
  }

  return (
    <div className="movie-form__backdrop" onClick={onClose}>
      <div className="movie-form__card" onClick={(e) => e.stopPropagation()}>
        <div className="movie-form__header">
          <h2>{mode === 'create' ? 'Add Movie' : `Edit "${movie.TITLE}"`}</h2>
          <button type="button" className="movie-form__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="movie-form__body">
          <fieldset className="movie-form__section">
            <legend>Basic Information</legend>

            <label className="movie-field">
              <span>Title *</span>
              <input
                type="text"
                required
                value={form.title}
                onChange={updateField('title')}
                placeholder="e.g. Interstellar"
              />
            </label>

            <div className="movie-field-row">
              <label className="movie-field">
                <span>Release Year *</span>
                <input
                  type="number"
                  required
                  min="1888"
                  max="2100"
                  value={form.releaseYear}
                  onChange={updateField('releaseYear')}
                  placeholder="2014"
                />
              </label>
              <label className="movie-field">
                <span>Runtime (min)</span>
                <input
                  type="number"
                  min="1"
                  value={form.runtime}
                  onChange={updateField('runtime')}
                  placeholder="169"
                />
              </label>
            </div>

            <div className="movie-field-row">
              <label className="movie-field">
                <span>Language</span>
                <input type="text" value={form.language} onChange={updateField('language')} placeholder="English" />
              </label>
              <label className="movie-field">
                <span>Country</span>
                <input type="text" value={form.country} onChange={updateField('country')} placeholder="USA" />
              </label>
            </div>

            <label className="movie-field">
              <span>Synopsis</span>
              <textarea
                rows={3}
                value={form.synopsis}
                onChange={updateField('synopsis')}
                placeholder="A short description of the film..."
              />
            </label>
          </fieldset>

          <fieldset className="movie-form__section">
            <legend>Media</legend>

            <label className="movie-field">
              <span>Poster URL</span>
              <input
                type="url"
                value={form.posterUrl}
                onChange={updateField('posterUrl')}
                placeholder="https://image.tmdb.org/t/p/w500/..."
              />
            </label>
            <label className="movie-field">
              <span>Trailer URL</span>
              <input
                type="url"
                value={form.trailerUrl}
                onChange={updateField('trailerUrl')}
                placeholder="https://youtube.com/watch?v=..."
              />
            </label>
            <label className="movie-field">
              <span>Box Office Collection</span>
              <input
                type="number"
                min="0"
                value={form.boxOfficeCollection}
                onChange={updateField('boxOfficeCollection')}
                placeholder="701729206"
              />
            </label>
          </fieldset>

          <fieldset className="movie-form__section">
            <legend>Classification</legend>
            {genres.length === 0 ? (
              <p className="movie-form__hint">No genres yet -- create some from the Genres page first.</p>
            ) : (
              <div className="movie-form__genre-grid">
                {genres.map((g) => (
                  <label key={g.GENREID} className="movie-form__genre-chip">
                    <input
                      type="checkbox"
                      checked={selectedGenreIds.includes(g.GENREID)}
                      onChange={() => toggleGenre(g.GENREID)}
                    />
                    {g.GENRENAME}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {status === 'error' && (
            <p className="movie-form__error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="movie-form__actions">
            <button type="button" className="movie-form__cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="movie-form__submit" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : mode === 'create' ? 'Add Movie' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
