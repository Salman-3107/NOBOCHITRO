import { useEffect, useState, useCallback } from 'react';
import { listUsers, setUserRole } from '../api/admin';
import './MoviesPage.css';

// Admin-only screen: lists every account and lets an admin promote or demote
// one. This is the visible half of the role separation -- a regular user has
// no route that reaches it, and the API refuses their token anyway.
export default function UsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingId, setPendingId] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');
    try {
      setUsers(await listUsers());
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleRole(user) {
    const promoting = user.ISADMIN !== 1;
    const confirmed = window.confirm(
      promoting
        ? `Give "${user.USERNAME}" full admin access?`
        : `Remove admin access from "${user.USERNAME}"?`
    );
    if (!confirmed) return;

    setPendingId(user.USERID);
    setErrorMessage('');
    try {
      await setUserRole(user.USERID, promoting);
      setUsers((rows) =>
        rows.map((row) =>
          row.USERID === user.USERID ? { ...row, ISADMIN: promoting ? 1 : 0 } : row
        )
      );
    } catch (err) {
      // Surface the server's own message -- e.g. "Cannot demote the only
      // remaining admin" -- rather than a generic failure.
      setErrorMessage(err.message);
    } finally {
      setPendingId(null);
    }
  }

  if (status === 'loading') {
    return <div className="movies-page"><p className="movies-page__status">Loading users…</p></div>;
  }

  if (status === 'error') {
    return (
      <div className="movies-page">
        <p className="movies-page__status movies-page__status--error">{errorMessage}</p>
        <button type="button" className="movies-page__add" onClick={load}>Try again</button>
      </div>
    );
  }

  return (
    <div className="movies-page">
      <div className="movies-page__toolbar">
        <span className="movies-page__count">{users.length} accounts</span>
        <div className="movies-page__toolbar-right">
          <button type="button" className="movies-page__add" onClick={load}>Refresh</button>
        </div>
      </div>

      {errorMessage && (
        <p className="movies-page__status movies-page__status--error" role="alert">{errorMessage}</p>
      )}

      <div className="movies-table__wrap">
        <table className="movies-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Display name</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isAdmin = user.ISADMIN === 1;
              const isSelf = user.USERID === currentUser.userId;
              return (
                <tr key={user.USERID}>
                  <td>{user.USERID}</td>
                  <td className="movies-table__title">{user.USERNAME}</td>
                  <td>{user.DISPLAYNAME || '—'}</td>
                  <td>{user.EMAIL}</td>
                  <td>{user.JOINDATE ? new Date(user.JOINDATE).toLocaleDateString() : '—'}</td>
                  <td>{isAdmin ? 'Admin' : 'User'}</td>
                  <td className="movies-table__actions">
                    <button
                      type="button"
                      className={isAdmin ? 'movies-table__delete' : undefined}
                      disabled={pendingId === user.USERID || (isSelf && isAdmin)}
                      title={isSelf && isAdmin ? 'You cannot remove your own admin access' : undefined}
                      onClick={() => toggleRole(user)}
                    >
                      {pendingId === user.USERID
                        ? 'Saving…'
                        : isAdmin ? 'Demote to user' : 'Promote to admin'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
