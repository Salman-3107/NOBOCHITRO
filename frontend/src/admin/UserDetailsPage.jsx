import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getAdminUser, updateUser, setUserRole, getUserDependencies, deleteUser,
} from '../api/admin';
import { useToast } from '../components/Toast';
import {
  PageHeader, StatCard, ErrorState, EmptyState, Modal, ConfirmModal,
  StatusBadge, Avatar, formatNumber, formatDate, relativeTime,
} from './components/AdminUI';

function describeActivity(item) {
  switch (item.kind) {
    case 'review': return <>rated <em>{item.label}</em> {item.detail}/10</>;
    case 'post': return <>posted about <em>{item.label}</em></>;
    case 'journal': return <>logged a watch of <em>{item.label}</em></>;
    default: return item.label;
  }
}

export default function UserDetailsPage({ currentUser }) {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [editor, setEditor] = useState(null);
  const [formError, setFormError] = useState('');
  const [pendingRole, setPendingRole] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData(await getAdminUser(userId));
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function saveProfile() {
    setBusy(true);
    setFormError('');
    try {
      await updateUser(userId, {
        displayName: editor.displayName.trim() || undefined,
        email: editor.email.trim(),
        bio: editor.bio?.trim() || undefined,
      });
      toast.success('User updated successfully.');
      setEditor(null);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRole() {
    setBusy(true);
    try {
      await setUserRole(userId, !data.user.isAdmin);
      toast.success(data.user.isAdmin ? 'Admin access removed.' : 'Administrator privileges granted.');
      setPendingRole(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function askDelete() {
    setPendingDelete({ cascades: null });
    try {
      setPendingDelete(await getUserDependencies(userId));
    } catch {
      setPendingDelete({ cascades: [], detaches: [] });
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await deleteUser(userId);
      toast.success('Account deleted.');
      navigate('/admin/users', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <>
        <PageHeader title="Loading account…" />
        <span className="adm-skel" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title="User" />
        <ErrorState message={errorMessage} onRetry={load} />
      </>
    );
  }

  const { user, stats, recentActivity } = data;
  const isSelf = user.userId === currentUser.userId;

  return (
    <>
      <PageHeader title={user.displayName || user.username} subtitle={`@${user.username} · account #${user.userId}`}>
        <Link className="adm-btn adm-btn--ghost" to="/admin/users">← All users</Link>
        <button
          type="button" className="adm-btn"
          onClick={() => {
            setFormError('');
            setEditor({
              displayName: user.displayName || '',
              email: user.email || '',
              bio: user.bio || '',
            });
          }}
        >
          Edit
        </button>
        <button
          type="button" className="adm-btn" disabled={isSelf}
          title={isSelf ? 'You cannot change your own role' : undefined}
          onClick={() => setPendingRole(true)}
        >
          {user.isAdmin ? 'Remove admin' : 'Make admin'}
        </button>
        <button
          type="button" className="adm-btn adm-btn--danger" disabled={isSelf}
          title={isSelf ? 'You cannot delete your own account here' : undefined}
          onClick={askDelete}
        >
          Delete
        </button>
      </PageHeader>

      <section className="adm-panel">
        {user.coverPictureUrl && <img className="adm-cover" src={user.coverPictureUrl} alt="" />}
        <div className="adm-hero" style={{ alignItems: 'flex-end' }}>
          <Avatar src={user.profilePictureUrl} name={user.username} />
          <div className="adm-hero__body">
            <h1 style={{ fontSize: 22 }}>{user.displayName || user.username}</h1>
            <p className="adm-hero__meta">
              {user.email} · joined {formatDate(user.joinDate)}
            </p>
            <div className="adm-hero__tags">
              <StatusBadge status={user.isAdmin ? 'Admin' : 'User'} />
              {stats.avgRating && <StatusBadge status={`★ ${stats.avgRating} average given`} tone="warn" />}
            </div>
            <p className="adm-hero__synopsis">{user.bio || 'No bio written.'}</p>
          </div>
        </div>
      </section>

      <section className="adm-cards">
        <StatCard label="Ratings" value={formatNumber(stats.ratings)} hint={`${formatNumber(stats.reviews)} with text`} />
        <StatCard label="Posts" value={formatNumber(stats.posts)} hint={`${formatNumber(stats.comments)} comments`} />
        <StatCard label="Followers" value={formatNumber(stats.followers)} hint={`Following ${formatNumber(stats.following)}`} />
        <StatCard label="Movies watched" value={formatNumber(stats.moviesWatched)} hint={`${formatNumber(stats.journalEntries)} journal entries`} />
        <StatCard label="Bucket list items" value={formatNumber(stats.bucketListItems)} />
        <StatCard
          label="Challenges completed"
          value={formatNumber(stats.challengesCompleted)}
          hint={`of ${formatNumber(stats.challengesJoined)} joined`}
        />
      </section>

      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Recent activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState icon="🕰" title="No activity recorded" />
          ) : (
            <ul className="adm-feed">
              {recentActivity.map((item, index) => (
                <li key={`${item.kind}-${item.targetId}-${index}`}>
                  <span>{describeActivity(item)}</span>
                  <time>{relativeTime(item.occurred)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Moderation shortcuts</h2>
            <p className="adm-panel__note">Jump to this account&apos;s content, pre-filtered.</p>
          </div>
          <div className="adm-page__actions">
            <Link className="adm-btn" to={`/admin/reviews?userId=${user.userId}`}>
              Reviews ({formatNumber(stats.ratings)})
            </Link>
            <Link className="adm-btn" to={`/admin/posts?userId=${user.userId}`}>
              Posts ({formatNumber(stats.posts)})
            </Link>
            <Link className="adm-btn" to={`/admin/comments?userId=${user.userId}`}>
              Comments ({formatNumber(stats.comments)})
            </Link>
            <Link className="adm-btn" to={`/admin/notifications?userId=${user.userId}`}>
              Notifications
            </Link>
          </div>
        </section>
      </div>

      {editor && (
        <Modal
          title={`Edit ${user.username}`}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={saveProfile} disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          }
        >
          {/* Username is not editable: it carries uq_appuser_username and other
              users refer to this person by it. Passwords are not touched here
              at all -- a reset is its own flow, not a field on an edit form. */}
          <p style={{ fontSize: 12 }}>Username and password can&apos;t be changed from here.</p>

          <label className="adm-field">
            <span>Display name</span>
            <input
              className="adm-input" value={editor.displayName}
              onChange={(event) => setEditor((current) => ({ ...current, displayName: event.target.value }))}
            />
          </label>

          <label className="adm-field">
            <span>Email <span className="adm-req">*</span></span>
            <input
              type="email" className="adm-input" value={editor.email}
              onChange={(event) => setEditor((current) => ({ ...current, email: event.target.value }))}
            />
          </label>

          <label className="adm-field">
            <span>Bio</span>
            <textarea
              className="adm-textarea" value={editor.bio}
              onChange={(event) => setEditor((current) => ({ ...current, bio: event.target.value }))}
            />
          </label>

          {formError && <p className="adm-field__error" role="alert">{formError}</p>}
        </Modal>
      )}

      {pendingRole && (
        <ConfirmModal
          danger={user.isAdmin}
          title={user.isAdmin ? 'Remove administrator privileges?' : 'Grant administrator privileges?'}
          message={user.isAdmin
            ? `${user.username} will lose access to the NOBOCHITRO administration system.`
            : `${user.username} will gain access to the NOBOCHITRO administration system, including the ability to delete content and other accounts.`}
          confirmLabel={user.isAdmin ? 'Remove access' : 'Grant access'}
          busy={busy}
          onConfirm={confirmRole}
          onClose={() => setPendingRole(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete account?"
          message={`"${user.username}" will be permanently removed. Everything below goes with it:`}
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
