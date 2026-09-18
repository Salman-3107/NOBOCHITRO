import { Link } from 'react-router-dom';
import { PageHeader, StatusBadge, Avatar, formatDate } from './components/AdminUI';

// The signed-in admin's own record.
//
// Deliberately read-only. Editing your own profile belongs in the normal user
// settings, not the admin panel, and an admin editing their own role here
// would be the one change the server refuses anyway -- showing the control
// would just be a button that always fails.
export default function AdminProfilePage({ user }) {
  return (
    <>
      <PageHeader title="Admin profile" subtitle="Your account, as the database sees it." />

      <section className="adm-panel">
        <div className="adm-hero">
          <Avatar src={user.profilePictureUrl} name={user.displayName || user.username} />
          <div className="adm-hero__body">
            <h1 style={{ fontSize: 22 }}>{user.displayName || user.username}</h1>
            <p className="adm-hero__meta">@{user.username}{user.email ? ` · ${user.email}` : ''}</p>
            <div className="adm-hero__tags">
              <StatusBadge status="Admin" />
              {user.joinDate && <StatusBadge status={`Joined ${formatDate(user.joinDate)}`} tone="neutral" />}
            </div>
            <p className="adm-hero__synopsis">
              Your role is read from <code>AppUser.IsAdmin</code> on every single admin request, not
              from your session token — so a change to it takes effect immediately rather than when
              the token expires.
            </p>
          </div>
        </div>
      </section>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <div>
            <h2>Your account record</h2>
            <p className="adm-panel__note">
              To edit these details, open your account in the user management screen.
            </p>
          </div>
          <Link className="adm-btn" to={`/admin/users/${user.userId}`}>Open account</Link>
        </div>

        <ul className="adm-impact">
          <li><span>Account ID</span><strong>#{user.userId}</strong></li>
          <li><span>Username</span><strong>{user.username}</strong></li>
          <li><span>Display name</span><strong>{user.displayName || '—'}</strong></li>
          <li><span>Email</span><strong>{user.email || '—'}</strong></li>
          <li><span>Role</span><strong>Administrator</strong></li>
        </ul>
      </section>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <div>
            <h2>What gets recorded</h2>
            <p className="adm-panel__note">
              Edits, deletions, privilege changes, challenge publishes and announcements are written
              to the activity log against your account, in the same transaction as the change itself.
            </p>
          </div>
          <Link className="adm-btn" to="/admin/activity">View activity log</Link>
        </div>
      </section>
    </>
  );
}
