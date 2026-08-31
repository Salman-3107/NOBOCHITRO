import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { addToWatchlist, getMovie, getMovieReviews, saveMovieReview } from '../api/movies';
import './MovieDetailsPage.css';

function Poster({ movie }) {
  if (movie.POSTERURL) return <img className="movie-details__poster" src={movie.POSTERURL} alt={`${movie.TITLE} poster`} />;
  return <div className="movie-details__poster movie-details__poster--placeholder"><span>{movie.TITLE?.charAt(0)}</span></div>;
}

function RatingControl({ movieId, onSaved }) {
  const [rating, setRating] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    if (!rating) return;
    setIsSaving(true);
    setMessage('');
    try {
      await saveMovieReview(movieId, { rating });
      setMessage(`Your ${rating}/10 rating is saved.`);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rating-control">
      <p className="rating-control__label">Rate this movie</p>
      <div className="rating-control__numbers" aria-label="Choose a rating out of ten">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
          <button key={value} type="button" className={value <= rating ? 'rating-number rating-number--selected' : 'rating-number'} onClick={() => setRating(value)}>{value}</button>
        ))}
      </div>
      <button type="button" className="details-button details-button--gold" disabled={!rating || isSaving} onClick={submit}>{isSaving ? 'Saving…' : 'Save rating'}</button>
      {message && <p className="rating-control__message">{message}</p>}
    </div>
  );
}

export default function MovieDetailsPage({ movieId, onBack, onLogout, onNavigate }) {
  const [movie, setMovie] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState('');
  const [watchlistMessage, setWatchlistMessage] = useState('');

  async function loadMovie() {
    setStatus('loading');
    try {
      const [movieData, reviewData] = await Promise.all([getMovie(movieId), getMovieReviews(movieId)]);
      setMovie(movieData);
      setReviews(reviewData);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => { loadMovie(); }, [movieId]);

  async function handleAddToWatchlist() {
    try {
      await addToWatchlist(movieId);
      setWatchlistMessage('Added to your watchlist');
    } catch (error) {
      setWatchlistMessage(error.message);
    }
  }

  return (
    <div className="movie-details-page">
      <Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} onNavigate={onNavigate} />
      {status === 'loading' && <main className="details-status">Loading movie details…</main>}
      {status === 'error' && <main className="details-status">We could not load this movie. <button type="button" onClick={onBack}>Return to home</button></main>}
      {status === 'ready' && movie && (
        <main>
          <section className="movie-details__hero">
            <div className="movie-details__backdrop" aria-hidden="true">{movie.POSTERURL && <img src={movie.POSTERURL} alt="" />}</div>
            <div className="movie-details__hero-content">
              <button type="button" className="back-link" onClick={onBack}>← Back to discovery</button>
              <div className="movie-details__summary">
                <Poster movie={movie} />
                <div className="movie-details__headline">
                  <p className="movie-details__eyebrow">{movie.RELEASEYEAR} · {movie.LANGUAGE || 'Feature film'}</p>
                  <h1>{movie.TITLE}</h1>
                  <p className="movie-details__facts">{movie.RELEASEYEAR}{movie.RUNTIME ? ` · ${movie.RUNTIME} minutes` : ''}{movie.COUNTRY ? ` · ${movie.COUNTRY}` : ''}</p>
                  <div className="genre-tags">{movie.genres.map((genre) => <span key={genre.GENREID}>{genre.GENRENAME}</span>)}</div>
                  <div className="movie-details__actions"><button type="button" className="details-button details-button--gold" onClick={handleAddToWatchlist}>+ Watchlist</button><button type="button" className="details-button details-button--dark">▶ Trailer</button></div>
                  {watchlistMessage && <p className="movie-details__watchlist-message">{watchlistMessage}</p>}
                </div>
              </div>
            </div>
          </section>

          <div className="movie-details__body">
            <section className="movie-details__main-column">
              <div className="section-block">
                <p className="section-label">Storyline</p>
                <p className="storyline">{movie.SYNOPSIS || 'No synopsis has been added for this movie yet.'}</p>
              </div>
              <section className="section-block">
                <div className="section-heading"><div><p className="section-label">From the community</p><h2>Reviews</h2></div><span>{reviews.length} rating{reviews.length === 1 ? '' : 's'}</span></div>
                {reviews.length ? <div className="review-list">{reviews.map((review) => <article className="review-card" key={review.USERID}><div className="review-card__avatar">{(review.DISPLAYNAME || review.USERNAME).charAt(0)}</div><div><div className="review-card__topline"><strong>{review.DISPLAYNAME || review.USERNAME}</strong><span>★ {review.RATINGVALUE}/10</span></div><p>{review.REVIEWTEXT || 'Rated this movie.'}</p></div></article>)}</div> : <p className="empty-copy">Be the first person to rate this movie.</p>}
              </section>
            </section>
            <aside className="movie-details__side-column">
              <div className="community-rating"><p className="section-label">NOBOCHITRO rating</p><strong>{movie.avgRating || '–'}<small>/10</small></strong><p>Based on {movie.ratingCount || 0} community ratings</p></div>
              <RatingControl movieId={movieId} onSaved={loadMovie} />
              <div className="credits"><p className="section-label">Cast & crew</p>{movie.credits.length ? movie.credits.map((credit) => <div className="credit" key={`${credit.PERSONID}-${credit.ROLETYPE}`}><span className="credit__avatar">{credit.FULLNAME.charAt(0)}</span><div><strong>{credit.FULLNAME}</strong><p>{credit.ROLETYPE}{credit.CHARACTERNAME ? ` · ${credit.CHARACTERNAME}` : ''}</p></div></div>) : <p className="empty-copy">Credits coming soon.</p>}</div>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
