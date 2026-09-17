import { useEffect, useState } from 'react';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import ErrorScreen from '../components/ErrorScreen';
import { SkeletonBlock, LoadingRegion } from '../components/Skeleton';
import { getTasteMatch } from '../api/stats';
import { getUserProfile } from '../api/movies';
import './TasteMatchPage.css';

function PosterStrip({ movies, onSelectMovie, renderMeta }) {
  return (
    <div className="taste-strip">
      {movies.map((movie) => (
        <button
          type="button"
          key={movie.movieId}
          className="taste-strip__item"
          onClick={() => onSelectMovie(movie.movieId)}
        >
          {movie.posterUrl
            ? <img src={movie.posterUrl} alt={`${movie.title} poster`} />
            : <span className="taste-strip__placeholder" aria-hidden="true">&#127916;</span>}
          <strong>{movie.title}</strong>
          {renderMeta && <small>{renderMeta(movie)}</small>}
        </button>
      ))}
    </div>
  );
}

export default function TasteMatchPage({ user, otherUserId, onLogout, onNavigate, onSelectMovie }) {
  const [match, setMatch] = useState(null);
  const [other, setOther] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | forbidden
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');

    Promise.allSettled([
      getTasteMatch(user.userId, otherUserId),
      getUserProfile(otherUserId),
    ]).then(([matchResult, profileResult]) => {
      if (!active) return;

      if (matchResult.status === 'rejected') {
        const err = matchResult.reason;
        setErrorMessage(err?.message || 'Could not compare tastes.');
        setStatus(err?.status === 404 ? 'notfound' : 'error');
        return;
      }

      setMatch(matchResult.value);
      if (profileResult.status === 'fulfilled') setOther(profileResult.value);
      setStatus('ready');
    });

    return () => { active = false; };
  }, [user.userId, otherUserId]);

  const header = (
    <Header
      searchValue={search}
      onSearchChange={setSearch}
      onLogout={onLogout}
      activePage="community"
      onNavigate={onNavigate}
    />
  );

  if (status === 'loading') {
    return (
      <div className="taste-page">
        {header}
        <main className="taste-wrap">
          <LoadingRegion label="Comparing your tastes">
            <SkeletonBlock width="300px" height={34} />
            <SkeletonBlock height={180} radius="var(--radius-lg)" />
            <SkeletonBlock height={220} radius="var(--radius-lg)" />
          </LoadingRegion>
        </main>
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="taste-page">
        {header}
        <ErrorScreen variant={404} actionLabel="Back to community" onAction={() => onNavigate('community')} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="taste-page">
        {header}
        <ErrorScreen
          variant={500}
          detail={errorMessage}
          actionLabel="Back to community"
          onAction={() => onNavigate('community')}
        />
      </div>
    );
  }

  const otherName = other?.DISPLAYNAME || other?.USERNAME || `User ${otherUserId}`;
  const myName = user.displayName || user.username;
  const percent = match.tasteMatchPercent;

  return (
    <div className="taste-page">
      {header}
      <main className="taste-wrap">
        <header className="taste-hero">
          <p className="taste-hero__eyebrow">TASTE MATCH</p>
          <h1>You &amp; {otherName}</h1>
          <span>
            Computed from every film you have both rated — the closer your scores, the higher
            the match.
          </span>
        </header>

        {percent === null ? (
          <EmptyState
            icon={'\u{1F50D}'}
            title="Nothing to compare yet"
            message={match.message}
          />
        ) : (
          <section className="taste-score">
            <div className="taste-score__number">
              <strong>{percent}%</strong>
              <span>MATCH</span>
            </div>
            <div className="taste-score__meter">
              <span className="taste-score__fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="taste-score__detail">
              <strong>{match.sharedMovieCount}</strong> films rated by you both
              {match.averageDifference !== null && (
                <> · average rating gap <strong>{match.averageDifference}</strong> points</>
              )}
            </p>
          </section>
        )}

        {match.commonlyLoved.length > 0 && (
          <section className="taste-section">
            <h2>You both loved</h2>
            <p className="taste-section__note">Films you each rated 8 or higher.</p>
            <PosterStrip
              movies={match.commonlyLoved}
              onSelectMovie={onSelectMovie}
              renderMeta={(movie) => `You ${movie.ratingA} · Them ${movie.ratingB}`}
            />
          </section>
        )}

        {match.biggestDisagreements.length > 0 && (
          <section className="taste-section">
            <h2>You disagree on</h2>
            <p className="taste-section__note">Where your scores diverge by 3 points or more.</p>
            <ul className="taste-disagree">
              {match.biggestDisagreements.map((movie) => (
                <li key={movie.movieId}>
                  <button type="button" onClick={() => onSelectMovie(movie.movieId)}>
                    <span className="taste-disagree__title">{movie.title}</span>
                    <span className="taste-disagree__scores">
                      <em>{myName}</em>
                      <b className="taste-disagree__mine">&#9733; {movie.ratingA}</b>
                      <em>{otherName}</em>
                      <b className="taste-disagree__theirs">&#9733; {movie.ratingB}</b>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {match.theyRecommend.length > 0 && (
          <section className="taste-section">
            <h2>Films {otherName} would recommend</h2>
            <p className="taste-section__note">
              Rated 8 or higher by them, and not yet rated by you.
            </p>
            <PosterStrip
              movies={match.theyRecommend}
              onSelectMovie={onSelectMovie}
              renderMeta={(movie) => `They rated it ${movie.theirRating}`}
            />
          </section>
        )}
      </main>
    </div>
  );
}
