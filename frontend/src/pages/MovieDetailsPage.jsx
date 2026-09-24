import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import MovieCard from '../components/MovieCard';
import { addToWatchlist, getMovie, getMovieReviews, listMovies, saveMovieReview } from '../api/movies';
import './MovieDetailsPage.css';

// A horizontally-scrolling row of movie cards, Netflix-style: drag/scroll
// with the mouse or trackpad, snap to card edges, fade at both sides so
// it reads as "more content this way" rather than a hard cutoff.
function MovieRail({ movies, onSelect }) {
  const trackRef = useRef(null);

  function scrollBy(amount) {
    trackRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }

  if (!movies.length) return null;

  return (
    <div className="rail">
      <button type="button" className="rail__arrow rail__arrow--left" aria-label="Scroll left" onClick={() => scrollBy(-480)}>‹</button>
      <div className="rail__track" ref={trackRef}>
        {movies.map((item) => (
          <div className="rail__item" key={item.MOVIEID}>
            <MovieCard movie={item} onClick={() => onSelect(item.MOVIEID)} />
          </div>
        ))}
      </div>
      <button type="button" className="rail__arrow rail__arrow--right" aria-label="Scroll right" onClick={() => scrollBy(480)}>›</button>
    </div>
  );
}

// Cast presented as a scrolling row of circular portraits (Instagram
// stories-style), each lifting and ringed in accent color on hover to
// reveal the character name.
function CastRail({ credits }) {
  if (!credits.length) return null;

  return (
    <div className="cast-rail">
      {credits.map((credit) => (
        <div className="cast-chip" key={`${credit.PERSONID}-${credit.ROLETYPE}`}>
          <div className="cast-chip__portrait">
            {credit.PHOTOURL ? <img src={credit.PHOTOURL} alt={credit.FULLNAME} /> : <span>{credit.FULLNAME.charAt(0)}</span>}
          </div>
          <strong className="cast-chip__name">{credit.FULLNAME}</strong>
          <p className="cast-chip__role">{credit.CHARACTERNAME || credit.ROLETYPE}</p>
        </div>
      ))}
    </div>
  );
}

// TMDB hands back a normal youtube.com/watch?v=KEY link; the embed player
// needs just the key. Also accepts youtu.be/KEY in case a trailer was added
// by hand from the admin panel.
function youTubeKey(url) {
  if (!url) return null;
  const match = String(url).match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

function TrailerModal({ movieTitle, trailerUrl, onClose }) {
  const key = youTubeKey(trailerUrl);
  useEffect(() => {
    function onKeyDown(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!key) return null;

  return (
    <div className="trailer-overlay" role="dialog" aria-modal="true" aria-label={`${movieTitle} trailer`} onClick={onClose}>
      <div className="trailer-frame" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="trailer-frame__close" onClick={onClose} aria-label="Close trailer">×</button>
        <iframe
          src={`https://www.youtube.com/embed/${key}?autoplay=1&rel=0`}
          title={`${movieTitle} trailer`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// Pulls the names the hero's info panel needs out of the credits list.
function getCreditSummary(movie) {
  const allCredits = movie.credits || [];
  const actors = movie.cast || allCredits.filter((credit) => credit.ROLETYPE === 'Actor');
  const crewMembers = movie.crew || allCredits.filter((credit) => credit.ROLETYPE !== 'Actor');
  return {
    directors: crewMembers.filter((person) => person.ROLETYPE === 'Director').map((person) => person.FULLNAME),
    writers: crewMembers.filter((person) => person.ROLETYPE === 'Writer').map((person) => person.FULLNAME),
    stars: actors.slice(0, 6).map((person) => person.FULLNAME),
  };
}

// One landscape card for a related movie: poster cropped wide, title on top,
// year and rating at the bottom. Clicking opens that movie.
function UpNextCard({ movie, onOpen, isSecond }) {
  const hasRating = movie.AVGRATING !== null && movie.AVGRATING !== undefined;
  return (
    <button
      type="button"
      className={isSecond ? 'up-next-card up-next-card--second' : 'up-next-card'}
      onClick={onOpen}
      aria-label={`Open ${movie.TITLE}`}
    >
      {movie.POSTERURL && <img src={movie.POSTERURL} alt="" />}
      <span className="up-next-card__shade" aria-hidden="true" />
      <strong className="up-next-card__title">{movie.TITLE}</strong>
      <span className="up-next-card__meta">{movie.RELEASEYEAR}{hasRating ? ` · ★ ${movie.AVGRATING}` : ''}</span>
      <span className="up-next-card__go" aria-hidden="true">›</span>
    </button>
  );
}

// Right-hand column of the hero: a small list, a pager (arrows + dots) and a
// two full cards. The cards slide left or right when you move, the same way
// the profile tabs do.
function UpNext({ movies, onSelect }) {
  const suggestions = movies.slice(0, 6);
  const total = suggestions.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(null);

  // A different movie page means a different list: start from the first card.
  useEffect(() => { setActiveIndex(0); setSlideDirection(null); }, [movies]);

  function showPrevious() {
    setSlideDirection('backward');
    setActiveIndex((index) => (index - 1 + total) % total);
  }
  function showNext() {
    setSlideDirection('forward');
    setActiveIndex((index) => (index + 1) % total);
  }
  function showIndex(newIndex) {
    if (newIndex === activeIndex) return;
    setSlideDirection(newIndex > activeIndex ? 'forward' : 'backward');
    setActiveIndex(newIndex);
  }

  const activeMovie = suggestions[activeIndex];
  const nextMovie = suggestions[(activeIndex + 1) % total];
  const listedIndexes = total > 1 ? [activeIndex, (activeIndex + 1) % total] : [activeIndex];

  return (
    <aside className="cinema-hero__next up-next" aria-label="More like this">
      <ul className="up-next__list">
        {listedIndexes.map((movieIndex) => {
          const item = suggestions[movieIndex];
          return (
            <li key={item.MOVIEID}>
              <button type="button" className={movieIndex === activeIndex ? 'up-next__item up-next__item--active' : 'up-next__item'} onClick={() => showIndex(movieIndex)}>
                <i aria-hidden="true" />
                <strong>{item.TITLE}</strong>
                <span>{[item.RELEASEYEAR, item.RUNTIME ? `${item.RUNTIME} min` : null].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {total > 1 && (
        <div className="up-next__pager">
          <button type="button" className="up-next__arrow" onClick={showPrevious} aria-label="Previous suggestion">‹</button>
          <div className="up-next__dots">
            {suggestions.map((item, index) => (
              <button type="button" key={item.MOVIEID} className={index === activeIndex ? 'up-next__dot up-next__dot--active' : 'up-next__dot'} onClick={() => showIndex(index)} aria-label={`Suggestion ${index + 1} of ${total}`} />
            ))}
          </div>
          <button type="button" className="up-next__arrow" onClick={showNext} aria-label="Next suggestion">›</button>
        </div>
      )}

      <div className={slideDirection ? `up-next__stage up-next__stage--${slideDirection}` : 'up-next__stage'} key={activeMovie.MOVIEID}>
        <UpNextCard movie={activeMovie} onOpen={() => onSelect(activeMovie.MOVIEID)} />
        {total > 1 && <UpNextCard movie={nextMovie} onOpen={() => onSelect(nextMovie.MOVIEID)} isSecond />}
      </div>
    </aside>
  );
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

function ReviewComposer({ movieId, onSaved }) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function submitReview(event) {
    event.preventDefault();
    if (!rating) {
      setError('Choose a rating before publishing your review.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await saveMovieReview(movieId, { rating, reviewText: reviewText.trim() });
      setReviewText('');
      setRating(0);
      setIsOpen(false);
      onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return <button type="button" className="write-review-button" onClick={() => setIsOpen(true)}>✦ Write a review</button>;
  }

  return (
    <form className="review-composer" onSubmit={submitReview}>
      <div className="review-composer__topline"><div><p className="section-label">Your perspective</p><h3>Write a review</h3></div><button type="button" className="review-composer__close" onClick={() => setIsOpen(false)} aria-label="Close review editor">×</button></div>
      <div className="review-composer__rating" aria-label="Choose your rating">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <button key={value} type="button" className={value <= rating ? 'review-score review-score--selected' : 'review-score'} onClick={() => setRating(value)}>{value}</button>)}
        <span>{rating ? `${rating}/10` : 'Choose a score'}</span>
      </div>
      <label className="review-composer__label" htmlFor="review-text">Your review <small>optional</small></label>
      <textarea id="review-text" value={reviewText} onChange={(event) => setReviewText(event.target.value)} maxLength="2000" placeholder="What stayed with you after the credits rolled?" rows="5" />
      <div className="review-composer__footer"><span>{reviewText.length}/2000</span><button type="submit" className="details-button details-button--gold" disabled={isSaving}>{isSaving ? 'Publishing…' : 'Publish review'}</button></div>
      {error && <p className="review-composer__error">{error}</p>}
    </form>
  );
}

export default function MovieDetailsPage({ movieId, onBack, onLogout, onNavigate, onSelectMovie }) {
  const [movie, setMovie] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState('');
  const [watchlistMessage, setWatchlistMessage] = useState('');
  const [relatedMovies, setRelatedMovies] = useState([]);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

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

  // "More like this" -- pull other movies that share this film's primary
  // genre, Netflix-style, so the details page never feels like a dead end.
  useEffect(() => {
    let cancelled = false;
    if (!movie?.genres?.length) {
      setRelatedMovies([]);
      return;
    }
    listMovies({ genre: movie.genres[0].GENRENAME })
      .then((results) => {
        if (cancelled) return;
        setRelatedMovies((results || []).filter((item) => item.MOVIEID !== movie.MOVIEID).slice(0, 12));
      })
      .catch(() => { if (!cancelled) setRelatedMovies([]); });
    return () => { cancelled = true; };
  }, [movie?.MOVIEID]);

  function goToMovie(id) {
    if (onSelectMovie) onSelectMovie(id);
  }

  async function handleAddToWatchlist() {
    try {
      await addToWatchlist(movieId);
      setWatchlistMessage('Added to your watchlist');
    } catch (error) {
      setWatchlistMessage(error.message);
    }
  }

  const creditSummary = movie ? getCreditSummary(movie) : { directors: [], writers: [], stars: [] };

  return (
    <div className="movie-details-page">
      <Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} onNavigate={onNavigate} />
      {status === 'loading' && <main className="details-status">Loading movie details…</main>}
      {status === 'error' && <main className="details-status">We could not load this movie. <button type="button" onClick={onBack}>Return to home</button></main>}
      {status === 'ready' && movie && (
        <main>
          <section className={relatedMovies.length ? 'cinema-hero' : 'cinema-hero cinema-hero--no-next'}>
            <div className="cinema-hero__backdrop" aria-hidden="true">{movie.POSTERURL && <img key={movie.MOVIEID} src={movie.POSTERURL} alt="" />}</div>

            <div className="cinema-hero__main">
              <button type="button" className="back-link" onClick={onBack}>← Back to discovery</button>
              <h1>{movie.TITLE}</h1>
              <div className="cinema-hero__facts">
                {movie.avgRating && <span className="cinema-hero__rating">★ {movie.avgRating}</span>}
                {[movie.RELEASEYEAR, movie.RUNTIME ? `${movie.RUNTIME} min` : null, movie.COUNTRY, movie.LANGUAGE].filter(Boolean).map((fact) => <span key={fact}>{fact}</span>)}
              </div>
              <div className="cinema-hero__actions">
                <button
                  type="button"
                  className="hero-button hero-button--primary"
                  disabled={!youTubeKey(movie.TRAILERURL)}
                  title={youTubeKey(movie.TRAILERURL) ? 'Play trailer' : 'No trailer on file yet'}
                  onClick={() => setIsTrailerOpen(true)}
                >▶ Watch trailer</button>
                <button type="button" className="hero-button hero-button--light" onClick={handleAddToWatchlist}><b>+</b> Add to list</button>
              </div>
              {watchlistMessage && <p className="movie-details__watchlist-message">{watchlistMessage}</p>}
            </div>

            {relatedMovies.length > 0 && <UpNext movies={relatedMovies} onSelect={goToMovie} />}

            <div className="cinema-hero__info">
              <div>
                <h2>Category</h2>
                <p>{movie.genres.length ? movie.genres.map((genre) => genre.GENRENAME).join(', ') : 'Not listed yet'}</p>
              </div>
              <div>
                <h2>Storyline</h2>
                <p className="cinema-hero__storyline">{movie.SYNOPSIS || 'No synopsis has been added for this movie yet.'}</p>
              </div>
              <div>
                <h2>Director / Writer</h2>
                <p>Director: {creditSummary.directors.join(', ') || 'Not listed'}</p>
                <p>Writers: {creditSummary.writers.join(', ') || 'Not listed'}</p>
              </div>
              <div>
                <h2>Stars</h2>
                <p>{creditSummary.stars.join(', ') || 'Not listed yet'}</p>
              </div>
            </div>
          </section>

          {(movie.cast || movie.credits.filter((c) => c.ROLETYPE === 'Actor')).length > 0 && (
            <section className="rail-section">
              <div className="rail-section__heading"><p className="section-label">Cast</p></div>
              <CastRail credits={movie.cast || movie.credits.filter((c) => c.ROLETYPE === 'Actor')} />
            </section>
          )}

          {(movie.crew || movie.credits.filter((c) => c.ROLETYPE !== 'Actor')).length > 0 && (
            <section className="rail-section">
              <div className="rail-section__heading"><p className="section-label">Crew</p></div>
              <ul className="crew-list">
                {(movie.crew || movie.credits.filter((c) => c.ROLETYPE !== 'Actor')).map((member) => (
                  <li key={`${member.PERSONID}-${member.ROLETYPE}`}>
                    <span className="crew-list__role">{member.ROLETYPE}</span>
                    <strong>{member.FULLNAME}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {relatedMovies.length > 0 && (
            <section className="rail-section">
              <div className="rail-section__heading"><p className="section-label">More like this</p></div>
              <MovieRail movies={relatedMovies} onSelect={goToMovie} />
            </section>
          )}

          <div className="movie-details__body">
            <section className="movie-details__main-column">
              <div className="section-block">
                <p className="section-label">Storyline</p>
                <p className="storyline">{movie.SYNOPSIS || 'No synopsis has been added for this movie yet.'}</p>
              </div>
              <section className="section-block">
                <div className="section-heading"><div><p className="section-label">From the community</p><h2>Reviews</h2></div><span>{reviews.length} rating{reviews.length === 1 ? '' : 's'}</span></div>
                <ReviewComposer movieId={movieId} onSaved={loadMovie} />
                {reviews.length ? <div className="review-list">{reviews.map((review) => <article className="review-card" key={review.USERID}>{review.PROFILEPICTUREURL ? <img className="review-card__avatar review-card__avatar--image" src={review.PROFILEPICTUREURL} alt="" /> : <div className="review-card__avatar">{(review.DISPLAYNAME || review.USERNAME).charAt(0)}</div>}<div><div className="review-card__topline"><strong>{review.DISPLAYNAME || review.USERNAME}</strong><span>★ {review.RATINGVALUE}/10</span></div><p>{review.REVIEWTEXT || 'Rated this movie.'}</p></div></article>)}</div> : <p className="empty-copy">Be the first person to rate this movie.</p>}
              </section>
            </section>
            <aside className="movie-details__side-column">
              <div className="community-rating"><p className="section-label">NOBOCHITRO rating</p><strong>{movie.avgRating || '–'}<small>/10</small></strong><p>Based on {movie.ratingCount || 0} community ratings</p></div>
              <RatingControl movieId={movieId} onSaved={loadMovie} />
            </aside>
          </div>
        </main>
      )}
      {isTrailerOpen && movie && (
        <TrailerModal movieTitle={movie.TITLE} trailerUrl={movie.TRAILERURL} onClose={() => setIsTrailerOpen(false)} />
      )}
    </div>
  );
}
