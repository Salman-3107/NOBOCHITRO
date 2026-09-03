import { useState } from 'react';
import AdminLoginPage from './pages/AdminLoginPage';
import MoviesPage from './pages/MoviesPage';
import './App.css';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('nobochitro_admin_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [page, setPage] = useState('home');

  function handleLogout() {
    localStorage.removeItem('nobochitro_admin_token');
    localStorage.removeItem('nobochitro_admin_user');
    setUser(null);
  }

  if (!user) {
    return <AdminLoginPage onAuthenticated={setUser} />;
  }

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
          <button type="button" className="admin-shell__logout" onClick={handleLogout}>
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
