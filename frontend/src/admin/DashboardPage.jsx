import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard, getAnalytics, getPlatformActivity } from '../api/admin';
import {
  PageHeader, StatCard, CardsSkeleton, ErrorState, EmptyState,
  StatusBadge, formatNumber, relativeTime, Thumb,
} from './components/AdminUI';
import { LineChart, ColumnChart, BarList, RangePicker, axisFormatter } from './components/Charts';

// The admin landing screen.
//
// Every number here is a COUNT or AVG over the live Oracle schema -- nothing
// is seeded, cached or estimated. Three requests rather than one: the counters
// are cheap and load first, while the charts and the feed fill in behind them,
// so the page is useful before it is complete.

// One line of readable English per activity kind, instead of a raw event type.
function describeActivity(item) {
  switch (item.kind) {
    case 'user.joined':
      return <><strong>{item.actorName}</strong> registered</>;
    case 'review.created':
      return <><strong>{item.actorName}</strong> rated <em>{item.targetLabel}</em> {item.detail}/10</>;
    case 'post.created':
      return <><strong>{item.actorName}</strong> posted{item.targetLabel ? <> about <em>{item.targetLabel}</em></> : ''}</>;
    case 'challenge.completed':
      return <><strong>{item.actorName}</strong> completed <em>{item.targetLabel}</em></>;
    default:
      return <strong>{item.actorName}</strong>;
  }
}

export default function DashboardPage({ user }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [range, setRange] = useState('30d');
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState(null);

  const loadCounters = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');
    try {
      setData(await getAdminDashboard());
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => { loadCounters(); }, [loadCounters]);

  // The feed is independent of the range picker, so it loads once.
  useEffect(() => {
    getPlatformActivity(12).then(setActivity).catch(() => setActivity({ items: [] }));
  }, []);

  // Refetches whenever the range changes. A failed analytics call blanks the
  // charts rather than taking down the counters above them.
  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    getAnalytics(range)
      .then((result) => { if (!cancelled) setAnalytics(result); })
      .catch(() => { if (!cancelled) setAnalytics({ error: true }); });
    return () => { cancelled = true; };
  }, [range]);

  if (status === 'loading') {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Loading platform statistics…" />
        <CardsSkeleton count={8} />
        <span className="adm-skel" style={{ height: 220, borderRadius: 'var(--radius-lg)' }} />
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState message={errorMessage} onRetry={loadCounters} />
      </>
    );
  }

  const { totals, thisWeek, thisMonth, currentChallenge, recentMovies, recentReviews, unratedMovies, features } = data;
  const formatX = axisFormatter(range);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.displayName || user.username}`}
        subtitle="Live figures from the NOBOCHITRO database."
      >
        <button type="button" className="adm-btn" onClick={loadCounters}>Refresh</button>
      </PageHeader>

      <section className="adm-cards">
        <StatCard
          icon="👥" label="Total users" value={formatNumber(totals.users)}
          hint={`+${formatNumber(thisMonth.newUsers)} this month`}
          tone={thisMonth.newUsers > 0 ? 'up' : 'muted'}
        />
        <StatCard
          icon="🎬" label="Total movies" value={formatNumber(totals.movies)}
          hint={`${formatNumber(totals.genres)} genres · ${formatNumber(totals.people)} people`}
        />
        <StatCard
          icon="✍" label="Written reviews" value={formatNumber(totals.reviews)}
          hint={`+${formatNumber(thisWeek.reviews)} this week`}
          tone={thisWeek.reviews > 0 ? 'up' : 'muted'}
        />
        {/* Ratings and reviews are different figures from the same table:
            every Review row carries a score, but ReviewText is optional. */}
        <StatCard
          icon="★" label="Total ratings" value={formatNumber(totals.ratings)}
          hint="Every scored entry"
        />
        <StatCard
          icon="💬" label="Community posts" value={formatNumber(totals.posts)}
          hint={`${formatNumber(totals.comments)} comments`}
        />
        <StatCard
          icon="🏆" label="Active challenges" value={formatNumber(totals.activeChallenges)}
          hint={`${formatNumber(totals.challenges)} created in total`}
        />
        <StatCard
          icon="⚑" label="Pending reports"
          value={totals.pendingReports === null ? '—' : formatNumber(totals.pendingReports)}
          hint={totals.pendingReports === null ? 'Report table not installed' : 'Awaiting moderation'}
          tone={totals.pendingReports === null ? 'muted' : 'muted'}
        />
        <StatCard
          icon="⚙" label="Administrators" value={formatNumber(totals.admins)}
          hint={`of ${formatNumber(totals.users)} accounts`}
        />
      </section>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <div>
            <h2>Growth &amp; activity</h2>
            <p className="adm-panel__note">Registrations are cumulative; reviews are per period.</p>
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>

        {!analytics && <span className="adm-skel" style={{ height: 170 }} />}
        {analytics?.error && <p className="adm-panel__note">Charts could not be loaded.</p>}

        {analytics && !analytics.error && (
          <div className="adm-grid-2">
            <div>
              <p className="adm-panel__note" style={{ marginBottom: 6 }}>Total users</p>
              <LineChart points={analytics.userGrowth} label="users" formatX={formatX} />
            </div>
            <div>
              <p className="adm-panel__note" style={{ marginBottom: 6 }}>Reviews written</p>
              <LineChart points={analytics.reviewActivity} label="reviews" formatX={formatX} />
            </div>
          </div>
        )}
      </section>

      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <div>
              <h2>Rating distribution</h2>
              <p className="adm-panel__note">Every score across the platform, 1 to 10.</p>
            </div>
          </div>
          {analytics && !analytics.error ? (
            <ColumnChart
              gold
              bars={analytics.ratingDistribution.map((entry) => ({
                label: String(entry.score), value: entry.count,
              }))}
            />
          ) : <span className="adm-skel" style={{ height: 170 }} />}
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <div>
              <h2>Popular genres</h2>
              <p className="adm-panel__note">Movies per genre in the catalogue.</p>
            </div>
          </div>
          {analytics && !analytics.error ? (
            <BarList
              items={analytics.genrePopularity.map((genre) => ({
                label: genre.genreName, value: genre.movieCount,
              }))}
            />
          ) : <span className="adm-skel" style={{ height: 170 }} />}
        </section>
      </div>

      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Recent activity</h2>
            <Link className="adm-btn adm-btn--sm adm-btn--ghost" to="/admin/activity">Full log</Link>
          </div>
          {!activity && <span className="adm-skel" style={{ height: 160 }} />}
          {activity && activity.items.length === 0 && (
            <EmptyState icon="🕰" title="Nothing yet" message="Platform activity will appear here as people use NOBOCHITRO." />
          )}
          {activity && activity.items.length > 0 && (
            <ul className="adm-feed">
              {activity.items.map((item, index) => (
                <li key={`${item.kind}-${item.actorId}-${index}`}>
                  <span>{describeActivity(item)}</span>
                  <time dateTime={item.occurred}>{relativeTime(item.occurred)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Current weekly challenge</h2>
            <Link className="adm-btn adm-btn--sm adm-btn--ghost" to="/admin/challenges">Manage</Link>
          </div>

          {!currentChallenge ? (
            <EmptyState
              icon="🏆"
              title="No challenge running"
              message="Create one and publish it to notify every user."
            />
          ) : (
            <>
              <p style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text)', fontWeight: 600 }}>
                {currentChallenge.title}
              </p>
              <p className="adm-panel__note" style={{ marginBottom: 14 }}>
                Ends {currentChallenge.endDate ? new Date(currentChallenge.endDate).toLocaleDateString() : 'never'}
                {' · '}target {currentChallenge.targetCount}
              </p>
              <div className="adm-cards" style={{ marginBottom: 0 }}>
                <StatCard label="Participants" value={formatNumber(currentChallenge.participants)} />
                <StatCard label="Completed" value={formatNumber(currentChallenge.completedCount)} />
                <StatCard label="Completion" value={`${currentChallenge.completionRate}%`} />
              </div>
            </>
          )}

          {features && !features.challengeLifecycle && (
            <p className="adm-panel__note" style={{ marginTop: 12 }}>
              Draft/publish controls need <code>admin_dashboard_extensions.sql</code>.
            </p>
          )}
        </section>
      </div>

      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Latest reviews</h2>
            <Link className="adm-btn adm-btn--sm adm-btn--ghost" to="/admin/reviews">Moderate</Link>
          </div>
          {recentReviews.length === 0 ? (
            <EmptyState icon="★" title="No reviews yet" />
          ) : (
            <ul className="adm-feed">
              {recentReviews.map((review, index) => (
                <li key={`${review.username}-${review.movieId}-${index}`}>
                  <span className="adm-star">★ {review.rating}</span>
                  <span><strong>{review.username}</strong> rated <em>{review.title}</em></span>
                  <time>{relativeTime(review.reviewDate)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <div>
              <h2>Recently added movies</h2>
              {/* Movie has no CreatedDate column, so "recent" means highest
                  MovieID from seq_movie -- the only honest proxy available. */}
              <p className="adm-panel__note">Newest catalogue entries by insert order.</p>
            </div>
          </div>
          {!recentMovies || recentMovies.length === 0 ? (
            <EmptyState icon="🎬" title="Catalogue is empty" />
          ) : (
            <ul className="adm-feed">
              {recentMovies.map((movie) => (
                <li key={movie.movieId}>
                  <Thumb src={movie.posterUrl} label={movie.title?.charAt(0)} />
                  <Link className="adm-link" to={`/admin/movies/${movie.movieId}`}>
                    <strong>{movie.title}</strong>
                  </Link>
                  <time>{movie.releaseYear || '—'}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {unratedMovies && unratedMovies.length > 0 && (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <div>
              <h2>Movies with no ratings</h2>
              <p className="adm-panel__note">Nobody has scored these yet — usually worth checking the metadata.</p>
            </div>
            <StatusBadge status="Needs attention" tone="warn" />
          </div>
          <ul className="adm-feed">
            {unratedMovies.map((movie) => (
              <li key={movie.movieId}>
                <Link className="adm-link" to={`/admin/movies/${movie.movieId}`}>
                  <strong>{movie.title}</strong>
                </Link>
                <time>{movie.releaseYear || '—'}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
