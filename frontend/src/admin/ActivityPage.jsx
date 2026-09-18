import { Link } from 'react-router-dom';
import { getAuditLog } from '../api/admin';
import { useAdminResource } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  MigrationNotice, StatusBadge, formatNumber, formatDateTime,
} from './components/AdminUI';

// The administrative audit trail: who did what, to which row, and when.
//
// AdminActivityLog is written inside the same transaction as the action it
// records, so the log and the change commit or roll back together -- a log
// entry never describes something that didn't happen.
//
// AdminID is ON DELETE SET NULL and TargetLabel stores a snapshot of the
// target's name, so deleting an admin account doesn't erase what it did, and
// "deleted movie 'Rashomon'" still reads correctly after the movie is gone.

const ACTION_TONES = {
  'user.promote': 'accent',
  'user.demote': 'danger',
  'user.delete': 'danger',
  'movie.delete': 'danger',
  'review.delete': 'danger',
  'post.delete': 'danger',
  'comment.delete': 'danger',
  'genre.delete': 'danger',
  'person.delete': 'danger',
  'challenge.publish': 'success',
  'announcement.send': 'success',
};

export default function ActivityPage() {
  const { params, data, status, errorMessage, setFilter, setPage, refresh } =
    useAdminResource(getAuditLog, { page: 1, limit: 25 });

  if (data && data.available === false) {
    return (
      <>
        <PageHeader title="Activity log" />
        <MigrationNotice feature="The admin activity log" message={data.message} />
      </>
    );
  }

  const columns = [
    {
      key: 'admin',
      label: 'Admin',
      render: (entry) => (
        entry.adminId
          ? <Link className="adm-link" to={`/admin/users/${entry.adminId}`}>{entry.adminName}</Link>
          : <span style={{ color: 'var(--text-faint)' }}>{entry.adminName}</span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      render: (entry) => <StatusBadge status={entry.action} tone={ACTION_TONES[entry.action] || 'neutral'} />,
    },
    {
      key: 'target',
      label: 'Target',
      render: (entry) => (
        <span className="adm-table__strong">
          {entry.targetLabel || (entry.targetType ? `${entry.targetType} #${entry.targetId}` : '—')}
        </span>
      ),
    },
    { key: 'details', label: 'Details', render: (entry) => <span className="adm-clamp">{entry.details || '—'}</span> },
    { key: 'when', label: 'When', render: (entry) => formatDateTime(entry.createdDate) },
  ];

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle={data ? `${formatNumber(data.total)} recorded administrative actions` : 'Loading…'}
      />

      <div className="adm-filters">
        <input
          className="adm-input adm-input--grow"
          placeholder="Filter by exact action, e.g. movie.delete"
          value={params.action || ''}
          onChange={(event) => setFilter({ action: event.target.value })}
          aria-label="Filter by action"
        />
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && data.available !== false && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(entry) => entry.logId}
            emptyState={
              <EmptyState
                icon="≡"
                title="No administrative actions recorded yet"
                message="Edits, deletions, privilege changes and challenge publishes appear here as they happen."
              />
            }
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="entries"
          />
        </>
      )}
    </>
  );
}
