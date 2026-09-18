import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listChallenges, getChallenge, publishChallenge, archiveChallenge, deleteChallenge,
} from '../api/admin';
import ChallengeFormModal from './ChallengeFormModal';
import { useToast } from '../components/Toast';
import { useAdminResource } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  Modal, ConfirmModal, StatusBadge, StatCard, Avatar, formatNumber, formatDate,
} from './components/AdminUI';
import { BarList } from './components/Charts';

// Weekly challenges, end to end: draft, review, publish, watch the numbers.
//
// Publishing is the only thing that notifies users, it happens once, and it is
// guarded on the server by Challenge.PublishedDate inside the same transaction
// as the notification insert -- so a double click cannot produce a second
// broadcast to every account.
export default function ChallengesPage() {
  const toast = useToast();
  const [editor, setEditor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);   // { kind, challenge }
  const [busy, setBusy] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, refresh } =
    useAdminResource(listChallenges, { page: 1, limit: 20 });

  const criteriaTypes = data?.criteriaTypes || [];
  const lifecycleSupported = data?.lifecycleSupported !== false;

  async function openDetail(challenge) {
    setDetail({ loading: true });
    try {
      setDetail(await getChallenge(challenge.challengeId));
    } catch (err) {
      setDetail(null);
      toast.error(err.message);
    }
  }

  async function runConfirm() {
    const { kind, challenge } = confirm;
    setBusy(true);
    try {
      if (kind === 'publish') {
        const result = await publishChallenge(challenge.challengeId);
        toast.success(result.message);
      } else if (kind === 'archive') {
        await archiveChallenge(challenge.challengeId);
        toast.success('Challenge archived.');
      } else {
        await deleteChallenge(challenge.challengeId);
        toast.success('Challenge deleted.');
      }
      setConfirm(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'title',
      label: 'Challenge',
      render: (challenge) => (
        <button
          type="button"
          className="adm-link adm-table__strong"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
          onClick={() => openDetail(challenge)}
        >
          {challenge.title}
        </button>
      ),
    },
    { key: 'lifecycle', label: 'Status', render: (challenge) => <StatusBadge status={challenge.lifecycle} /> },
    {
      key: 'window',
      label: 'Runs',
      render: (challenge) => `${formatDate(challenge.startDate)} → ${formatDate(challenge.endDate)}`,
    },
    {
      key: 'target',
      label: 'Target',
      render: (challenge) => (
        <span>
          {challenge.targetCount}
          <span style={{ color: 'var(--text-faint)' }}> · {challenge.xpReward} XP</span>
        </span>
      ),
    },
    { key: 'participants', label: 'Participants', render: (challenge) => formatNumber(challenge.participants) },
    { key: 'completed', label: 'Completed', render: (challenge) => formatNumber(challenge.completedCount) },
    {
      key: 'rate',
      label: 'Completion',
      render: (challenge) => (
        challenge.participants === 0
          ? <span style={{ color: 'var(--text-faint)' }}>—</span>
          : <span className="adm-hbar__value">{challenge.completionRate}%</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (challenge) => (
        <>
          {lifecycleSupported && challenge.status === 'Draft' && (
            <button
              type="button" className="adm-btn adm-btn--sm adm-btn--primary"
              onClick={() => setConfirm({ kind: 'publish', challenge })}
            >
              Publish
            </button>
          )}
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => setEditor(challenge)}>Edit</button>
          {lifecycleSupported && challenge.status === 'Published' && (
            <button
              type="button" className="adm-btn adm-btn--sm"
              onClick={() => setConfirm({ kind: 'archive', challenge })}
            >
              Archive
            </button>
          )}
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--danger"
            onClick={() => setConfirm({ kind: 'delete', challenge })}
          >
            Delete
          </button>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Weekly challenges"
        subtitle={data ? `${formatNumber(data.total)} challenges created` : 'Loading…'}
      >
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => setEditor({})}>
          + Create challenge
        </button>
      </PageHeader>

      {data && !lifecycleSupported && (
        <div className="adm-notice">
          <strong>Draft and publish are unavailable</strong>
          Without <code>Challenge.Status</code>, a challenge goes live as soon as its start date
          arrives and there is no draft stage. Run
          {' '}<code>database/admin_dashboard_extensions.sql</code> to enable the full lifecycle.
        </div>
      )}

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search challenge titles…"
          value={params.search || ''}
          onChange={(event) => setFilter({ search: event.target.value })}
          aria-label="Search challenges"
        />
        {lifecycleSupported && (
          <select
            className="adm-select" value={params.status || ''}
            onChange={(event) => setFilter({ status: event.target.value })}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="Draft">Drafts</option>
            <option value="Published">Published</option>
            <option value="Archived">Archived</option>
          </select>
        )}
      </div>

      {status === 'loading' && <TableSkeleton rows={6} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(challenge) => challenge.challengeId}
            emptyState={
              <EmptyState
                icon="🏆"
                title="No challenges yet"
                message="Create one, check it over, then publish to notify every user."
              />
            }
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="challenges"
          />
        </>
      )}

      {editor && (
        <ChallengeFormModal
          challenge={editor}
          criteriaTypes={criteriaTypes}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            toast.success(message || 'Challenge saved.');
            setEditor(null);
            refresh();
          }}
        />
      )}

      {detail && (
        <Modal
          wide
          title={detail.loading ? 'Loading…' : detail.challenge.title}
          onClose={() => setDetail(null)}
          footer={<button type="button" className="adm-btn" onClick={() => setDetail(null)}>Close</button>}
        >
          {detail.loading && <span className="adm-skel" style={{ height: 160 }} />}

          {!detail.loading && (
            <>
              <p>{detail.challenge.description || 'No description written.'}</p>

              <div className="adm-cards">
                <StatCard label="Participants" value={formatNumber(detail.analytics.participants)} />
                <StatCard label="Completed" value={formatNumber(detail.analytics.completed)} />
                <StatCard label="In progress" value={formatNumber(detail.analytics.inProgress)} />
                <StatCard label="Completion rate" value={`${detail.analytics.completionRate}%`} />
                <StatCard
                  label="Average progress"
                  value={detail.analytics.avgProgress}
                  hint={`of ${detail.challenge.targetCount} target`}
                />
              </div>

              <div className="adm-panel__head">
                <h2>Participant leaderboard</h2>
              </div>

              {detail.participants.length === 0 ? (
                <EmptyState icon="👥" title="Nobody has joined yet" />
              ) : (
                <>
                  <BarList
                    items={detail.participants.slice(0, 10).map((participant) => ({
                      label: participant.displayName || participant.username,
                      value: participant.currentProgress,
                    }))}
                  />
                  <ul className="adm-feed" style={{ marginTop: 14 }}>
                    {detail.participants.map((participant) => (
                      <li key={participant.userId}>
                        <span style={{ color: 'var(--text-faint)', width: 22 }}>#{participant.rank}</span>
                        <Avatar src={participant.profilePictureUrl} name={participant.username} />
                        <Link className="adm-link" to={`/admin/users/${participant.userId}`}>
                          <strong>{participant.displayName || participant.username}</strong>
                        </Link>
                        {participant.completed
                          ? <StatusBadge status="Completed" tone="success" />
                          : <span>{participant.currentProgress}/{detail.challenge.targetCount}</span>}
                        <time>{participant.completionDate ? formatDate(participant.completionDate) : ''}</time>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmModal
          danger={confirm.kind === 'delete'}
          title={{
            publish: 'Publish this challenge?',
            archive: 'Archive this challenge?',
            delete: 'Delete this challenge?',
          }[confirm.kind]}
          message={{
            publish: `"${confirm.challenge.title}" goes live and every registered user receives a notification about it. This happens once — publishing again is refused, so nobody gets a duplicate.`,
            archive: `"${confirm.challenge.title}" stops appearing to users. Existing progress is kept and nothing is deleted.`,
            delete: `"${confirm.challenge.title}" and everyone's progress on it are permanently removed.`,
          }[confirm.kind]}
          impact={confirm.kind === 'delete'
            ? [{ label: 'Participant progress records deleted', count: confirm.challenge.participants }]
            : undefined}
          confirmLabel={{ publish: 'Publish & notify', archive: 'Archive', delete: 'Delete challenge' }[confirm.kind]}
          busy={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
