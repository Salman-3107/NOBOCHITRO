import { useCallback, useEffect, useState } from 'react';
import StatCard from '../components/StatCard';
import { SkeletonBlock, LoadingRegion } from '../components/Skeleton';
import { getAdminDashboard } from '../api/admin';
import './DashboardPage.css';

// Admin landing screen. Every number here comes from a COUNT/aggregate query
// in statsController -- it doubles as a live demonstration of the schema's
// relationships during evaluation.
export default function DashboardPage({ user }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData(await getAdminDashboard());
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') {
    return (
      <div className="admin-dashboard">
        <LoadingRegion label="Loading dashboard">
          <SkeletonBlock width="240px" height={30} />
          <div className="stat-card-row admin-dashboard__cards">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock key={index} height={96} radius="var(--radius)" />
            ))}
          </div>
          <SkeletonBlock height={200} radius="var(--radius-lg)" />
        </LoadingRegion>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="admin-dashboard">
        <p className="admin-dashboard__error" role="alert">{errorMessage}</p>
        <button type="button" className="admin-dashboard__retry" onClick={load}>Try again</button>
      </div>
    );
  }

  const { totals, thisWeek, unratedMovies, recentReviews } = data;

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard__head">
        <div>
          <p className="admin-dashboard__eyebrow">NOBOCHITRO ADMIN</p>
          <h1>Signed in as {user.displayName || user.username}</h1>
        </div>
        <button type="button" className="admin-dashboard__retry" onClick={load}>Refresh</button>
      </header>

      <section className="stat-card-row admin-dashboard__cards">
        <StatCard
          icon={'\u{1F465}'}
          value={totals.users.toLocaleString()}
          label="Users"
          hint={`${totals.admins} admin${totals.admins === 1 ? '' : 's'} · +${thisWeek.newUsers} this week`}
        />
        <StatCard
          icon={'\u{1F3AC}'}
          value={totals.movies.toLocaleString()}
          label="Movies"
          hint={`${totals.genres} genres · ${totals.people} people`}
        />
        <StatCard
          icon={'\u2B50'}
          tone="gold"
          value={totals.reviews.toLocaleString()}
          label="Reviews"
          hint={`+${thisWeek.reviews} this week`}
        />
        <StatCard
          icon={'\u{1F4AC}'}
          tone="accent"
          value={totals.posts.toLocaleString()}
          label="Posts"
          hint={`${totals.comments} comments`}
        />
      </section>

      <section className="stat-card-row admin-dashboard__cards">
        <StatCard value={totals.journalEntries.toLocaleString()} label="Journal entries" />
        <StatCard value={totals.comments.toLocaleString()} label="Comments" />
        <StatCard value={totals.genres.toLocaleString()} label="Genres" />
        <StatCard value={totals.people.toLocaleString()} label="Cast &amp; crew" />
      </section>

      <div className="admin-dashboard__panels">
        <section className="admin-panel">
          <h2>Recent reviews</h2>
          <p className="admin-panel__note">The last eight ratings submitted across the site.</p>
          {recentReviews.length === 0 ? (
            <p className="admin-panel__empty">No reviews yet.</p>
          ) : (
            <ul className="admin-feed">
              {recentReviews.map((review, index) => (
                <li key={`${review.username}-${review.movieId}-${index}`}>
                  <span className="admin-feed__rating">&#9733; {review.rating}</span>
                  <span className="admin-feed__text">
                    <strong>{review.username}</strong> rated <em>{review.title}</em>
                  </span>
                  <small>{new Date(review.reviewDate).toLocaleDateString()}</small>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="admin-panel">
          <h2>Movies with no ratings</h2>
          <p className="admin-panel__note">
            Catalogue entries nobody has scored yet — usually worth checking the metadata.
          </p>
          {unratedMovies.length === 0 ? (
            <p className="admin-panel__empty">Every movie has at least one rating.</p>
          ) : (
            <ul className="admin-list">
              {unratedMovies.map((movie) => (
                <li key={movie.movieId}>
                  <span>{movie.title}</span>
                  <small>{movie.releaseYear || '—'}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
