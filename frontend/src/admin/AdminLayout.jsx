import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import GlobalSearch from './components/GlobalSearch';
import { Avatar } from './components/AdminUI';
import './admin.css';

// The admin shell: rail, header, content well.
//
// Grouped exactly as the brief lays it out, because the grouping is what makes
// twenty destinations navigable -- a flat list of twenty links is a wall.
const NAV_GROUPS = [
  {
    label: null,
    links: [{ to: '/admin', label: 'Dashboard', icon: '▤', end: true }],
  },
  {
    label: 'Content',
    links: [
      { to: '/admin/movies', label: 'Movies', icon: '🎬' },
      { to: '/admin/genres', label: 'Genres', icon: '◈' },
      { to: '/admin/people', label: 'People', icon: '☻' },
      { to: '/admin/credits', label: 'Credits', icon: '⛓' },
      { to: '/admin/reviews', label: 'Reviews', icon: '★' },
    ],
  },
  {
    label: 'Community',
    links: [
      { to: '/admin/users', label: 'Users', icon: '👥' },
      { to: '/admin/posts', label: 'Posts', icon: '💬' },
      { to: '/admin/comments', label: 'Comments', icon: '🗨' },
      { to: '/admin/reports', label: 'Reports', icon: '⚑' },
    ],
  },
  {
    label: 'Engagement',
    links: [
      { to: '/admin/challenges', label: 'Weekly Challenges', icon: '🏆' },
      { to: '/admin/notifications', label: 'Notifications', icon: '🔔' },
      { to: '/admin/activity', label: 'Activity Log', icon: '≡' },
      { to: '/admin/leaderboard', label: 'Leaderboard', icon: '⬆' },
    ],
  },
  {
    label: 'Analytics',
    links: [{ to: '/admin/statistics', label: 'Platform Statistics', icon: '📈' }],
  },
];

const COLLAPSE_KEY = 'nobochitro_admin_rail_collapsed';

export default function AdminLayout({ user, onLogout, children }) {
  // The collapsed choice is remembered -- an admin who prefers the narrow rail
  // shouldn't have to re-collapse it on every page load.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true'
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed]);

  // On mobile the rail is an overlay, so it has to close itself after a
  // navigation -- otherwise it sits on top of the page you just opened.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const shellClass = [
    'adm',
    collapsed ? 'adm--collapsed' : '',
    drawerOpen ? 'adm--drawer-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass}>
      <div
        className="adm-scrim"
        onClick={() => setDrawerOpen(false)}
        role="presentation"
      />

      <aside className="adm-rail">
        <div className="adm-rail__brand">
          <span className="adm-rail__mark" aria-hidden="true">N</span>
          {!collapsed && (
            <span className="adm-rail__name">
              NOBOCHITRO
              <small>Admin</small>
            </span>
          )}
        </div>

        <nav className="adm-rail__nav" aria-label="Admin sections">
          {NAV_GROUPS.map((group, index) => (
            <div className="adm-rail__group" key={group.label || `group-${index}`}>
              {group.label && <p className="adm-rail__group-label">{group.label}</p>}
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  title={collapsed ? link.label : undefined}
                  className={({ isActive }) =>
                    `adm-rail__link ${isActive ? 'adm-rail__link--active' : ''}`}
                >
                  <span className="adm-rail__icon" aria-hidden="true">{link.icon}</span>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          ))}

          <div className="adm-rail__group">
            <p className="adm-rail__group-label">System</p>
            <NavLink
              to="/admin/profile"
              title={collapsed ? 'Admin profile' : undefined}
              className={({ isActive }) =>
                `adm-rail__link ${isActive ? 'adm-rail__link--active' : ''}`}
            >
              <span className="adm-rail__icon" aria-hidden="true">⚙</span>
              <span>Admin Profile</span>
            </NavLink>
            <button type="button" className="adm-rail__link" onClick={onLogout} style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'transparent', textAlign: 'left' }}>
              <span className="adm-rail__icon" aria-hidden="true">⏻</span>
              <span>Sign out</span>
            </button>
          </div>
        </nav>

        <div className="adm-rail__foot">
          <button
            type="button"
            className="adm-rail__collapse"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '»' : '«  Collapse'}
          </button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-head">
          <button
            type="button"
            className="adm-head__burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            ☰
          </button>

          <GlobalSearch />
          <div className="adm-head__spacer" />

          <div className="adm-head__user">
            <Avatar src={user.profilePictureUrl} name={user.displayName || user.username} />
            <span>{user.displayName || user.username}</span>
            <button type="button" className="adm-head__signout" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="adm-page">{children}</main>
      </div>
    </div>
  );
}
