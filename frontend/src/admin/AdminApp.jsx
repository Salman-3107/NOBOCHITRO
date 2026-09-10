import { useState } from 'react';
import MoviesPage from './MoviesPage';
import './AdminApp.css';

// Rendered by the main App.jsx whenever the logged-in user has isAdmin true.
// There's no separate admin login anymore -- whoever is signed in on the
// regular Sign in form lands here automatically if their account is an admin.
export default function AdminApp({ user, onLogout }) {
  const [page, setPage] = useState('home');

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__nav">
          <span className="admin-shell__brand">NOBOCHITRO Admin</span>
          <button
            type="button"
            className={`admin-shell__nav-link ${page === 'home' ? 'admin-shell__nav-link--active' : ''}`}
            onClick={() => setPage('home')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`admin-shell__nav-link ${page === 'movies' ? 'admin-shell__nav-link--active' : ''}`}
            onClick={() => setPage('movies')}
          >
            Movies
          </button>
        </div>
        <div className="admin-shell__user">
          <span>{user.displayName || user.username}</span>
          <button type="button" className="admin-shell__logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-shell__main">
        {page === 'movies' ? (
          <MoviesPage />
        ) : (
          <div className="admin-shell__placeholder">
            <h1>Signed in as admin ✓</h1>
            <p>Dashboard stats, user management, and moderation still to come. Click "Movies" above to manage the catalogue.</p>
          </div>
        )}
      </main>
    </div>
  );
}
