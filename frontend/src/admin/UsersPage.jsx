import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUsers, setUserRole, getUserDependencies, deleteUser } from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  ConfirmModal, StatusBadge, Avatar, formatNumber, formatDate,
} from './components/AdminUI';

// Account management. Note what is NOT here: PasswordHash is never selected by
// the backend for any admin endpoint, so there is no route by which this
// screen could show or leak one, even accidentally.
export default function UsersPage({ currentUser }) {
  const toast = useToast();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput);

  const [pendingRole, setPendingRole] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } =
    useAdminResource(listUsers, { page: 1, limit: 20, sort: 'joined', order: 'desc', filter: 'all' });

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function confirmRole() {
    setBusy(true);
    try {
      await setUserRole(pendingRole.userId, !pendingRole.isAdmin);
      toast.success(pendingRole.isAdmin
        ? `Admin access removed from ${pendingRole.username}.`
        : `${pendingRole.username} is now an administrator.`);
      setPendingRole(null);
      refresh();
    } catch (err) {
      // The server's own wording carries the reason -- "Cannot demote the only
      // remaining admin" is far more useful than a generic failure.
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function askDelete(user) {
    setPendingDelete({ user, cascades: null });
    try {
      const dependencies = await getUserDependencies(user.userId);
      setPendingDelete({ user, ...dependencies });
    } catch {
      setPendingDelete({ user, cascades: [], detaches: [] });
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await deleteUser(pendingDelete.user.userId);
      toast.success(`Account "${pendingDelete.user.username}" deleted.`);
      setPendingDelete(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: 'avatar', label: '', render: (user) => <Avatar src={user.profilePictureUrl} name={user.username} /> },
    {
      key: 'username',
      label: 'Username',
      sortable: true,
      render: (user) => (
        <Link className="adm-link adm-table__strong" to={`/admin/users/${user.userId}`}>
          {user.username}
        </Link>
      ),
    },
    { key: 'display', label: 'Display name', render: (user) => user.displayName || '—' },
    { key: 'email', label: 'Email', render: (user) => user.email },
    { key: 'joined', label: 'Joined', sortable: true, render: (user) => formatDate(user.joinDate) },
    {
      key: 'role',
      label: 'Role',
      render: (user) => <StatusBadge status={user.isAdmin ? 'Admin' : 'User'} />,
    },
    {
      key: 'activity',
      label: 'Activity',
      sortable: true,
      render: (user) => (
        <span style={{ fontSize: 12 }}>
          {formatNumber(user.reviewCount)} reviews · {formatNumber(user.postCount)} posts
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (user) => {
        // Demoting or deleting yourself would end your own session mid-request.
        // The server refuses both; the button is disabled so it never looks
        // like an option in the first place.
        const isSelf = user.userId === currentUser.userId;
        return (
          <>
            <Link className="adm-btn adm-btn--sm adm-btn--ghost" to={`/admin/users/${user.userId}`}>View</Link>
            <button
              type="button" className="adm-btn adm-btn--sm"
              disabled={isSelf}
              title={isSelf ? 'You cannot change your own role' : undefined}
              onClick={() => setPendingRole(user)}
            >
              {user.isAdmin ? 'Demote' : 'Make admin'}
            </button>
            <button
              type="button" className="adm-btn adm-btn--sm adm-btn--danger"
              disabled={isSelf}
              title={isSelf ? 'You cannot delete your own account here' : undefined}
              onClick={() => askDelete(user)}
            >
              Delete
            </button>
          </>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Users" subtitle={data ? `${formatNumber(data.total)} accounts` : 'Loading…'} />

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search username, email or display name…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search users"
        />
        <select
          className="adm-select" value={params.filter || 'all'}
          onChange={(event) => setFilter({ filter: event.target.value })}
          aria-label="Filter accounts"
        >
          <option value="all">All users</option>
          <option value="admins">Admins</option>
          <option value="users">Normal users</option>
          <option value="recent">Joined in the last 30 days</option>
        </select>
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(user) => user.userId}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={<EmptyState icon="👥" title="No accounts match those filters" />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="accounts"
          />
        </>
      )}

      {pendingRole && (
        <ConfirmModal
          danger={pendingRole.isAdmin}
          title={pendingRole.isAdmin ? 'Remove administrator privileges?' : 'Grant administrator privileges?'}
          message={pendingRole.isAdmin
            ? `${pendingRole.username} will lose access to the NOBOCHITRO administration system and return to a normal account.`
            : `${pendingRole.username} will gain full access to the NOBOCHITRO administration system, including the ability to delete content and other accounts.`}
          confirmLabel={pendingRole.isAdmin ? 'Remove access' : 'Grant access'}
          busy={busy}
          onConfirm={confirmRole}
          onClose={() => setPendingRole(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete account?"
          message={`"${pendingDelete.user.username}" will be permanently removed. Everything below is deleted along with the account and cannot be recovered:`}
          impact={pendingDelete.cascades}
          confirmLabel="Delete account"
          busy={busy}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
