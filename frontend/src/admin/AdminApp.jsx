import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import MoviesPage from './MoviesPage';
import UsersPage from './UsersPage';
import DashboardPage from './DashboardPage';
import './AdminApp.css';

// Rendered by App.jsx whenever the logged-in user has isAdmin true. There is
// no separate admin login -- whoever signs in on the regular form lands here
// if the database says their account is an admin.
//
// Everything in here lives under /admin/*, so the address bar always says
// where you are. Any stray path falls back to /admin rather than rendering
// the dashboard at an unrelated URL.
export default function AdminApp({ user, onLogout }) {
  const { pathname } = useLocation();

  const links = [
    { to: '/admin', label: 'Dashboard', exact: true },
    { to: '/admin/movies', label: 'Movies' },
    { to: '/admin/users', label: 'Users' },
  ];

  function isActive(link) {
    return link.exact ? pathname === link.to : pathname.startsWith(link.to);
  }

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__nav">
          <span className="admin-shell__brand">NOBOCHITRO Admin</span>
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`admin-shell__nav-link ${isActive(link) ? 'admin-shell__nav-link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="admin-shell__user">
          <span>{user.displayName || user.username}</span>
          <button type="button" className="admin-shell__logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-shell__main">
        <Routes>
          <Route path="/admin/movies" element={<MoviesPage />} />
          <Route path="/admin/users" element={<UsersPage currentUser={user} />} />
          <Route path="/admin" element={<DashboardPage user={user} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
