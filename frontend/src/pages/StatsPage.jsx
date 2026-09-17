import { useEffect, useState } from 'react';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import StatBar from '../components/StatBar';
import EmptyState from '../components/EmptyState';
import ErrorScreen from '../components/ErrorScreen';
import { SkeletonBlock, LoadingRegion } from '../components/Skeleton';
import { getUserStats } from '../api/stats';
import './StatsPage.css';

// Turns "2026-03" into "Mar 26" for the monthly chart's axis labels.
function formatMonth(period) {
  const [year, month] = period.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function StatsPage({ user, onLogout, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getUserStats(user.userId)
      .then((data) => {
        if (!active) return;
        setStats(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(err.message);
        setStatus('error');
      });
    return () => { active = false; };
  }, [user.userId]);

  const header = (
    <Header
      searchValue={search}
      onSearchChange={setSearch}
      onLogout={onLogout}
      activePage="stats"
      onNavigate={onNavigate}
    />
  );

  if (status === 'loading') {
    return (
      <div className="stats-page">
        {header}
        <main className="stats-wrap">
          <LoadingRegion label="Loading your statistics">
            <SkeletonBlock width="240px" height={34} />
            <div className="stat-card-row stats-page__cards">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonBlock key={index} height={96} radius="var(--radius)" />
              ))}
            </div>
            <SkeletonBlock height={220} radius="var(--radius-lg)" />
          </LoadingRegion>
        </main>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="stats-page">
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

  const hasAnything = stats.moviesRated > 0 || stats.entriesLogged > 0;

  return (
    <div className="stats-page">
      {header}
      <main className="stats-wrap">
        <header className="stats-hero">
          <p className="stats-hero__eyebrow">YOUR MOVIE STATS</p>
          <h1>The numbers behind your viewing.</h1>
          <span>Every figure here is computed live from your ratings and journal entries.</span>
        </header>

        {!hasAnything ? (
          <EmptyState
            icon="📊"
            title="No statistics yet"
            message="Rate a few films and log some journal entries — your genre breakdown, viewing timeline and rating habits will build themselves from there."
            actionLabel="Find something to watch"
            onAction={() => onNavigate('discover')}
          />
        ) : (
          <>
            <section className="stat-card-row stats-page__cards">
              <StatCard icon="🎬" value={stats.moviesRated} label="Movies rated" />
              <StatCard
                icon="⭐"
                tone="gold"
                value={stats.averageRating ? Number(stats.averageRating).toFixed(1) : '–'}
                label="Average rating"
                hint="Across everything you've scored"
              />
              <StatCard icon="✍️" value={stats.reviewsWritten} label="Reviews written" />
              <StatCard
                icon="⏱"
                tone="accent"
                value={`${stats.hoursWatched}h`}
                label="Hours watched"
                hint={`${stats.entriesLogged} journal entries`}
              />
            </section>

            <div className="stats-grid">
              <section className="stats-panel">
                <h2>Movies by genre</h2>
                <p className="stats-panel__note">Your eight most-watched genres.</p>
                <StatBar
                  data={stats.byGenre}
                  emptyMessage="Log some journal entries to see your genre mix."
                />
              </section>

              <section className="stats-panel">
                <h2>Movies watched per month</h2>
                <p className="stats-panel__note">The last twelve months.</p>
                <StatBar
                  data={stats.byMonth.map((row) => ({ ...row, label: formatMonth(row.label) }))}
                  emptyMessage="Nothing logged in the past year yet."
                />
              </section>

              <section className="stats-panel">
                <h2>How you rate</h2>
                <p className="stats-panel__note">
                  Where your own scores land on the 1–10 scale — a quick check on whether you
                  are a generous or a harsh critic.
                </p>
                <StatBar
                  data={stats.ratingSpread.map((row) => ({
                    label: `★ ${row.rating}`,
                    value: row.count,
                  }))}
                  emptyMessage="You haven't rated anything yet."
                />
              </section>

              <section className="stats-panel">
                <h2>Countries explored</h2>
                <p className="stats-panel__note">
                  {stats.byCountry.length} {stats.byCountry.length === 1 ? 'country' : 'countries'} so far.
                </p>
                <StatBar
                  data={stats.byCountry.slice(0, 8).map((row) => ({
                    label: row.country,
                    value: row.movieCount,
                  }))}
                  emptyMessage="Your passport is still blank."
                />
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
