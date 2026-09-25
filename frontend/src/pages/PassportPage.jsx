import { useEffect, useState } from 'react';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import ErrorScreen from '../components/ErrorScreen';
import { SkeletonBlock, LoadingRegion } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { getPassport, getPassportCountryMovies } from '../api/movies';
import { getUserStats } from '../api/stats';
import { flagUrl, FLAG_FALLBACK } from '../utils/countryFlags';
import './PassportPage.css';

// One flag, one <img>, one fallback. A country missing from the lookup table
// -- or a CDN that can't be reached -- shows the film-reel glyph rather than a
// broken-image icon, so a stamp never renders as a hole in the page.
function CountryFlag({ country, size = 'w160', className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = flagUrl(country, size);

  useEffect(() => { setFailed(false); }, [country]);

  if (!src || failed) {
    return <span className={`flag-glyph ${className}`} aria-hidden="true">{FLAG_FALLBACK}</span>;
  }

  return (
    <img
      className={`flag-img ${className}`}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function formatWatchDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PassportPage({ user, onLogout, onNavigate, onSelectMovie }) {
  const [passport, setPassport] = useState(null);
  const [countries, setCountries] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');
  const [activeStamp, setActiveStamp] = useState(null);

  // The films behind the open stamp. Kept separate from `countries` because
  // it is fetched on demand -- loading every country's film list up front
  // would mean a dozen queries for a drawer the user may never open.
  const [stampMovies, setStampMovies] = useState([]);
  const [stampStatus, setStampStatus] = useState('idle'); // idle | loading | ready | error

  const toast = useToast();

  useEffect(() => {
    let active = true;

    // The passport summary and the per-country breakdown come from two
    // different endpoints. allSettled, not all: if the country breakdown
    // fails, the passport itself should still render.
    Promise.allSettled([getPassport(user.userId), getUserStats(user.userId)])
      .then(([passportResult, statsResult]) => {
        if (!active) return;

        if (passportResult.status === 'rejected') {
          setErrorMessage(passportResult.reason?.message || 'Could not open your passport.');
          setStatus('error');
          return;
        }

        setPassport(passportResult.value);
        if (statsResult.status === 'fulfilled') {
          setCountries(statsResult.value.byCountry || []);
        } else {
          toast.error('Country stamps could not be loaded.');
        }
        setStatus('ready');
      });

    return () => { active = false; };
    // toast identity is stable from the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.userId]);

  // Open stamp -> fetch that country's films. `active` guards the case where
  // the user clicks through three stamps quickly: only the newest response is
  // allowed to land, so the drawer can't fill with the wrong country's films.
  useEffect(() => {
    if (!activeStamp) {
      setStampMovies([]);
      setStampStatus('idle');
      return undefined;
    }

    let active = true;
    setStampStatus('loading');

    getPassportCountryMovies(user.userId, activeStamp)
      .then((data) => {
        if (!active) return;
        setStampMovies(data.movies || []);
        setStampStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setStampMovies([]);
        setStampStatus('error');
      });

    return () => { active = false; };
  }, [activeStamp, user.userId]);

  const header = (
    <Header
      searchValue={search}
      onSearchChange={setSearch}
      onLogout={onLogout}
      activePage="passport"
      onNavigate={onNavigate}
    />
  );

  if (status === 'loading') {
    return (
      <div className="passport-page">
        {header}
        <main className="passport-wrap">
          <LoadingRegion label="Opening your passport">
            <SkeletonBlock width="280px" height={34} />
            <SkeletonBlock height={200} radius="var(--radius-lg)" />
            <SkeletonBlock height={160} radius="var(--radius-lg)" />
          </LoadingRegion>
        </main>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="passport-page">
        {header}
        <ErrorScreen
          variant={500}
          detail={errorMessage}
          actionLabel="Back to home"
          onAction={() => onNavigate('home')}
        />
      </div>
    );
  }

  const displayName = user.displayName || user.username;
  const selected = countries.find((row) => row.country === activeStamp);

  return (
    <div className="passport-page">
      {header}
      <main className="passport-wrap">
        <header className="passport-hero">
          <p className="passport-hero__eyebrow">NOBOCHITRO MOVIE PASSPORT</p>
          <h1>Your journey through cinema.</h1>
          <span>Every film you log stamps another country into the book.</span>
        </header>

        {/* The passport booklet itself */}
        <section className="passport-book">
          <div className="passport-book__spine" aria-hidden="true" />

          <div className="passport-book__id">
            <span className="passport-book__photo">
              {user.profilePictureUrl
                ? <img src={user.profilePictureUrl} alt="" />
                : displayName.charAt(0).toUpperCase()}
            </span>
            <div className="passport-book__holder">
              <p>PASSENGER</p>
              <h2>{displayName}</h2>
              <small>@{user.username}</small>
            </div>
            <span className="passport-book__seal" aria-hidden="true">&#10022;</span>
          </div>

          <dl className="passport-book__figures">
            <div>
              <dt>Movies watched</dt>
              <dd>{passport.totalWatched ?? 0}</dd>
            </div>
            <div>
              <dt>Countries explored</dt>
              <dd>{passport.countriesExplored ?? 0}</dd>
            </div>
            <div>
              <dt>Languages</dt>
              <dd>{passport.languagesExplored ?? 0}</dd>
            </div>
            <div>
              <dt>Average rating</dt>
              <dd className="passport-book__gold">
                {passport.averageRating ? Number(passport.averageRating).toFixed(1) : '\u2013'}
              </dd>
            </div>
          </dl>

          <div className="passport-book__notes">
            <span>Favourite genre <strong>{passport.favoriteGenre || 'Still discovering'}</strong></span>
            <span>Favourite director <strong>{passport.favoriteDirector || 'Still discovering'}</strong></span>
            <span>Highest rated <strong>{passport.highestRatedMovie?.title || 'No reviews yet'}</strong></span>
          </div>
        </section>

        {/* Country stamps */}
        <section className="passport-stamps">
          <div className="passport-section-heading">
            <div>
              <p>ENTRY STAMPS</p>
              <h2>Where your films have taken you</h2>
            </div>
            <span className="passport-stamps__count">
              {countries.length} {countries.length === 1 ? 'country' : 'countries'}
            </span>
          </div>

          {countries.length === 0 ? (
            <EmptyState
              icon={'\u{1F30D}'}
              compact
              title="No stamps yet"
              message="Log a journal entry for any film and its country of origin gets stamped into your passport automatically."
              actionLabel="Browse movies"
              onAction={() => onNavigate('discover')}
            />
          ) : (
            <div className="stamp-grid">
              {countries.map((row, index) => (
                <button
                  type="button"
                  key={row.country}
                  className={`stamp ${activeStamp === row.country ? 'stamp--active' : ''}`}
                  /* Staggered entrance: the stamps press onto the page one
                     after another instead of all appearing at once. */
                  style={{ animationDelay: `${Math.min(index, 11) * 55}ms` }}
                  onClick={() => setActiveStamp(activeStamp === row.country ? null : row.country)}
                  aria-pressed={activeStamp === row.country}
                  aria-label={`${row.country}, ${row.movieCount} films watched`}
                >
                  {/* Oversized, faded copy of the flag bleeding behind the
                      stamp -- this is what makes the grid read as flags at a
                      glance rather than as another row of text cards. */}
                  <CountryFlag country={row.country} size="w320" className="stamp__wash" />

                  <span className="stamp__flagframe">
                    <CountryFlag country={row.country} size="w160" />
                  </span>

                  <strong className="stamp__country">{row.country}</strong>
                  <span className="stamp__count">
                    {row.movieCount} {row.movieCount === 1 ? 'film' : 'films'}
                  </span>
                  {row.avgRating && (
                    <span className="stamp__rating">&#9733; {Number(row.avgRating).toFixed(1)}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="stamp-detail" role="region" aria-live="polite">
              {/* Full-bleed flag banner for the open country. */}
              <div className="stamp-detail__banner">
                <CountryFlag country={selected.country} size="w640" className="stamp-detail__wash" />
                <div className="stamp-detail__ident">
                  <span className="stamp-detail__flagframe">
                    <CountryFlag country={selected.country} size="w320" />
                  </span>
                  <div>
                    <p className="stamp-detail__eyebrow">ENTRY STAMP</p>
                    <h3>{selected.country}</h3>
                    <p className="stamp-detail__meta">
                      {selected.movieCount} {selected.movieCount === 1 ? 'film' : 'films'} watched
                      {selected.avgRating && (
                        <> &middot; you rate them <strong>{Number(selected.avgRating).toFixed(1)}</strong> on average</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="stamp-detail__close"
                  onClick={() => setActiveStamp(null)}
                  aria-label={`Close ${selected.country}`}
                >
                  &times;
                </button>
              </div>

              {/* The films behind the stamp */}
              {stampStatus === 'loading' && (
                <div className="stamp-detail__body">
                  <LoadingRegion label={`Loading films from ${selected.country}`}>
                    <SkeletonBlock height={92} radius="var(--radius)" />
                    <SkeletonBlock height={92} radius="var(--radius)" />
                  </LoadingRegion>
                </div>
              )}

              {stampStatus === 'error' && (
                <div className="stamp-detail__body">
                  <p className="stamp-detail__note">
                    Could not load the films from {selected.country}. Try opening the stamp again.
                  </p>
                </div>
              )}

              {stampStatus === 'ready' && stampMovies.length === 0 && (
                <div className="stamp-detail__body">
                  <p className="stamp-detail__note">
                    No journal entries to show here yet.
                  </p>
                </div>
              )}

              {stampStatus === 'ready' && stampMovies.length > 0 && (
                <ul className="stamp-films">
                  {stampMovies.map((movie) => (
                    <li key={movie.movieId}>
                      <button
                        type="button"
                        className="stamp-film"
                        onClick={() => onSelectMovie && onSelectMovie(movie.movieId)}
                      >
                        {movie.posterUrl ? (
                          <img className="stamp-film__poster" src={movie.posterUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="stamp-film__poster stamp-film__poster--blank" aria-hidden="true">
                            {'\u{1F39E}\uFE0F'}
                          </span>
                        )}

                        <span className="stamp-film__text">
                          <strong>{movie.title}</strong>
                          <small>
                            {movie.releaseYear}
                            {movie.language && <> &middot; {movie.language}</>}
                          </small>
                          {formatWatchDate(movie.reviewedOn) && (
                            <small className="stamp-film__date">
                              Reviewed {formatWatchDate(movie.reviewedOn)}
                            </small>
                          )}
                        </span>

                        {movie.myRating && (
                          <span className="stamp-film__rating">&#9733; {movie.myRating}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
