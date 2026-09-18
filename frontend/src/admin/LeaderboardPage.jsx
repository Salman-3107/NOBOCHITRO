import { Link } from 'react-router-dom';
import { getLeaderboard } from '../api/admin';
import { useAdminResource } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, TableSkeleton, ErrorState, EmptyState,
  Avatar, formatNumber,
} from './components/AdminUI';

// The same three metrics the public leaderboard ranks by -- deliberately not a
// second, incompatible ranking system. This view just shows all four numbers
// side by side so an admin can see the whole picture at once.
//
// "Points" is summed from Challenge.XPReward over completed challenges, not
// stored on AppUser: there is no XP column, and adding one would put a
// denormalised counter in the schema that every completion would have to keep
// in step.
const TYPES = [
  { key: 'most_watched', label: 'Most watched' },
  { key: 'most_reviewed', label: 'Most reviewed' },
  { key: 'most_challenges', label: 'Most challenges' },
];

export default function LeaderboardPage() {
  const { params, data, status, errorMessage, setFilter, refresh } =
    useAdminResource(getLeaderboard, { type: 'most_watched', limit: 25 });

  const columns = [
    { key: 'rank', label: '#', render: (row) => <span style={{ color: 'var(--text-faint)' }}>{row.rank}</span> },
    {
      key: 'user',
      label: 'User',
      render: (row) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={row.profilePictureUrl} name={row.username} />
          <Link className="adm-link adm-table__strong" to={`/admin/users/${row.userId}`}>
            {row.displayName || row.username}
          </Link>
        </span>
      ),
    },
    { key: 'points', label: 'XP points', render: (row) => formatNumber(row.points) },
    { key: 'challenges', label: 'Challenges completed', render: (row) => formatNumber(row.challengesCompleted) },
    { key: 'watched', label: 'Movies watched', render: (row) => formatNumber(row.moviesWatched) },
    { key: 'reviews', label: 'Reviews', render: (row) => formatNumber(row.reviews) },
  ];

  return (
    <>
      <PageHeader title="Leaderboard" subtitle="Ranked with the same logic as the public leaderboard." />

      <div className="adm-filters">
        <div className="adm-range">
          {TYPES.map((type) => (
            <button
              key={type.key}
              type="button"
              className={`adm-range__btn ${params.type === type.key ? 'adm-range__btn--active' : ''}`}
              aria-pressed={params.type === type.key}
              onClick={() => setFilter({ type: type.key })}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(row) => row.userId}
          emptyState={<EmptyState icon="⬆" title="Nothing to rank yet" message="The board fills up as people watch, review and complete challenges." />}
        />
      )}
    </>
  );
}
