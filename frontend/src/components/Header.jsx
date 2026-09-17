import { useEffect, useState } from 'react';
import { getUserProfile, listNotifications, markAllNotificationsRead } from '../api/movies';
import { getStoredUser } from '../api/client';
import './Header.css';

// Every destination in the main navigation. Kept as data so the desktop bar
// and the mobile drawer stay in sync -- previously the list was hard-coded
// inline and there was no mobile treatment at all.
const NAV_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'discover', label: 'Discover' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'community', label: 'Community' },
  { key: 'journal', label: 'Journal' },
  { key: 'passport', label: 'Passport' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'stats', label: 'Stats' },
];

export default function Header({ searchValue, onSearchChange, onLogout, activePage = 'home', onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const account = getStoredUser();
  const [currentProfile, setCurrentProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    if (!account?.userId) return undefined;
    let active = true;
    getUserProfile(account.userId)
      .then((profile) => { if (active) setCurrentProfile(profile); })
      .catch(() => {});
    return () => { active = false; };
  }, [account?.userId]);

  useEffect(() => {
    if (!account?.userId) return undefined;
    const load = () => listNotifications().then(setNotifications).catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [account?.userId]);

  // Close the mobile drawer whenever the route changes, otherwise it stays
  // open over the page you just navigated to.
  useEffect(() => { setNavOpen(false); }, [activePage]);

  async function openNotifications() {
    setNotificationsOpen((open) => !open);
    if (!notificationsOpen && notifications.some((item) => !item.ISREAD)) {
      try {
        await markAllNotificationsRead();
        setNotifications((items) => items.map((item) => ({ ...item, ISREAD: 1 })));
      } catch {
        // Non-critical -- the badge simply stays until the next poll.
      }
    }
  }

  function go(page) {
    setNavOpen(false);
    setMenuOpen(false);
    onNavigate?.(page);
  }

  const unreadCount = notifications.filter((item) => !item.ISREAD).length;
  const displayName = currentProfile?.DISPLAYNAME || account?.displayName || account?.username || '';
  const profilePictureUrl = currentProfile?.PROFILEPICTUREURL || account?.profilePictureUrl;

  return (
    <header className="app-header">
      <button
        type="button"
        className="app-header__burger"
        aria-label={navOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={navOpen}
        onClick={() => setNavOpen((open) => !open)}
      >
        <span aria-hidden="true">{navOpen ? '\u2715' : '\u2630'}</span>
      </button>

      <button type="button" className="app-header__brand" onClick={() => go('home')} aria-label="NOBOCHITRO home">
        <span className="app-header__wordmark">
          NOBO<em>CHITRO</em>
        </span>
      </button>

      <nav className={`app-header__nav ${navOpen ? 'app-header__nav--open' : ''}`} aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`app-header__nav-link ${activePage === item.key ? 'app-header__nav-link--active' : ''}`}
            aria-current={activePage === item.key ? 'page' : undefined}
            onClick={() => go(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="app-header__search">
        <svg viewBox="0 0 20 20" fill="none" className="app-header__search-icon" aria-hidden="true">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M18 18L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search movies, actors, directors..."
          aria-label="Search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {account && (
        <div className="app-header__notifications">
          <button type="button" className="notification-bell" onClick={openNotifications} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <span aria-hidden="true">&#9827;</span>
            {unreadCount > 0 && <b>{unreadCount > 9 ? '9+' : unreadCount}</b>}
          </button>
          {notificationsOpen && (
            <div className="notification-menu">
              <header>
                <strong>Notifications</strong>
                <span>{notifications.length ? 'Latest activity' : ''}</span>
              </header>
              {notifications.length ? notifications.map((item) => (
                <div
                  className={item.ISREAD ? 'notification-item' : 'notification-item notification-item--unread'}
                  key={item.NOTIFICATIONID}
                >
                  <i aria-hidden="true">
                    {item.NOTIFTYPE === 'PostLike' ? '\u2665'
                      : item.NOTIFTYPE === 'PostComment' ? '\u25CC'
                      : item.NOTIFTYPE === 'WeeklyChallenge' ? '\u2726' : '\u25CE'}
                  </i>
                  <span>{item.MESSAGE}</span>
                </div>
              )) : <p>No notifications yet.</p>}
            </div>
          )}
        </div>
      )}

      {account && (
        <div className="app-header__account">
          <button type="button" className="app-header__account-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
            {profilePictureUrl
              ? <img src={profilePictureUrl} alt="" />
              : <span>{displayName.charAt(0)}</span>}
            <b>{displayName}</b>
          </button>
          {menuOpen && (
            <div className="app-header__menu">
              <button type="button" onClick={() => go('profile')}>View profile</button>
              <button type="button" onClick={() => go('watchlist')}>My watchlist</button>
              <button type="button" onClick={() => go('passport')}>Movie passport</button>
              <button type="button" onClick={() => go('journal')}>Experience journal</button>
              <button type="button" onClick={() => go('stats')}>My statistics</button>
              <button type="button" onClick={onLogout}>Sign out</button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
