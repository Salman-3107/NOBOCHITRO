import { useEffect, useState } from 'react';
import { getAnalytics, getAdminDashboard } from '../api/admin';
import {
  PageHeader, StatCard, CardsSkeleton, ErrorState, formatNumber,
} from './components/AdminUI';
import { LineChart, ColumnChart, BarList, RangePicker, axisFormatter } from './components/Charts';

// The analytics screen. Same data source as the dashboard cards, given room to
// breathe: full-width charts and the genre table with engagement alongside
// catalogue size, which is the comparison the small dashboard panel can't show.
export default function StatisticsPage() {
  const [range, setRange] = useState('30d');
  const [analytics, setAnalytics] = useState(null);
  const [totals, setTotals] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    getAdminDashboard().then((data) => setTotals(data.totals)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setErrorMessage('');

    getAnalytics(range)
      .then((data) => { if (!cancelled) setAnalytics(data); })
      .catch((err) => { if (!cancelled) setErrorMessage(err.message); });

    return () => { cancelled = true; };
  }, [range]);

  const formatX = axisFormatter(range);

  return (
    <>
      <PageHeader title="Platform statistics" subtitle="Aggregated live from the Oracle schema.">
        <RangePicker value={range} onChange={setRange} />
      </PageHeader>

      {!totals ? <CardsSkeleton count={6} /> : (
        <section className="adm-cards">
          <StatCard label="Users" value={formatNumber(totals.users)} />
          <StatCard label="Movies" value={formatNumber(totals.movies)} />
          <StatCard label="Ratings" value={formatNumber(totals.ratings)} />
          <StatCard label="Written reviews" value={formatNumber(totals.reviews)} />
          <StatCard label="Journal entries" value={formatNumber(totals.journalEntries)} />
          <StatCard label="Posts" value={formatNumber(totals.posts)} hint={`${formatNumber(totals.comments)} comments`} />
        </section>
      )}

      {errorMessage && <ErrorState message={errorMessage} onRetry={() => setRange((current) => current)} />}

      <section className="adm-panel">
        <div className="adm-panel__head">
          <div>
            <h2>User growth</h2>
            <p className="adm-panel__note">
              Cumulative registrations, including everyone who joined before this window opened.
            </p>
          </div>
        </div>
        {analytics
          ? <LineChart points={analytics.userGrowth} label="users" formatX={formatX} height={220} />
          : <span className="adm-skel" style={{ height: 220 }} />}
      </section>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <div>
            <h2>Review activity</h2>
            <p className="adm-panel__note">Reviews written per period, including quiet days.</p>
          </div>
        </div>
        {analytics
          ? <LineChart points={analytics.reviewActivity} label="reviews" formatX={formatX} height={220} />
          : <span className="adm-skel" style={{ height: 220 }} />}
      </section>

      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <div>
              <h2>Rating distribution</h2>
              <p className="adm-panel__note">Every score on the platform, 1 to 10.</p>
            </div>
          </div>
          {analytics
            ? <ColumnChart
              gold
              height={210}
              bars={analytics.ratingDistribution.map((entry) => ({
                label: String(entry.score), value: entry.count,
              }))}
            />
            : <span className="adm-skel" style={{ height: 210 }} />}
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <div>
              <h2>Genres by engagement</h2>
              {/* Catalogue size and engagement are different things -- a genre
                  can hold 200 films and attract almost no ratings. */}
              <p className="adm-panel__note">Ratings given to movies in each genre.</p>
            </div>
          </div>
          {analytics
            ? <BarList
              items={analytics.genrePopularity.map((genre) => ({
                label: genre.genreName, value: genre.ratingCount,
              }))}
            />
            : <span className="adm-skel" style={{ height: 210 }} />}
        </section>
      </div>

      {analytics && (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Genre breakdown</h2>
          </div>
          <div className="adm-table__wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Genre</th>
                  <th>Movies</th>
                  <th>Ratings</th>
                  <th>Average score</th>
                </tr>
              </thead>
              <tbody>
                {analytics.genrePopularity.map((genre) => (
                  <tr key={genre.genreId}>
                    <td className="adm-table__strong">{genre.genreName}</td>
                    <td>{formatNumber(genre.movieCount)}</td>
                    <td>{formatNumber(genre.ratingCount)}</td>
                    <td>
                      {genre.avgRating
                        ? <span className="adm-star">★ {genre.avgRating}</span>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
