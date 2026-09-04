import { useEffect, useState } from 'react';
import { getUserProfile, listNotifications, markAllNotificationsRead } from '../api/movies';
import './Header.css';

export default function Header({ searchValue, onSearchChange, onLogout, activePage = 'home', onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const account = JSON.parse(localStorage.getItem('nobochitro_user') || 'null');
  const [currentProfile, setCurrentProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    if (!account?.userId) return undefined;
    let active = true;
    getUserProfile(account.userId).then((profile) => { if (active) setCurrentProfile(profile); }).catch(() => {});
    return () => { active = false; };
  }, [account?.userId]);
  useEffect(() => {
    if (!account?.userId) return undefined;
    const load = () => listNotifications().then(setNotifications).catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [account?.userId]);
  async function openNotifications() { setNotificationsOpen((open) => !open); if (!notificationsOpen && notifications.some((item) => !item.ISREAD)) { await markAllNotificationsRead(); setNotifications((items) => items.map((item) => ({ ...item, ISREAD: 1 }))); } }
  const unreadCount = notifications.filter((item) => !item.ISREAD).length;
  const displayName = currentProfile?.DISPLAYNAME || account?.displayName || account?.username;
  const profilePictureUrl = currentProfile?.PROFILEPICTUREURL || account?.profilePictureUrl;
  return (
    <header className="app-header">
      <button type="button" className="app-header__brand" onClick={() => onNavigate?.('home')} aria-label="NOBOCHITRO home">
        <span className="app-header__wordmark">
          NOBO<em>CHITRO</em>
        </span>
      </button>

      <nav className="app-header__nav" aria-label="Main navigation">
        <button type="button" className={`app-header__nav-link ${activePage === 'home' ? 'app-header__nav-link--active' : ''}`} onClick={() => onNavigate?.('home')}>Home</button>
        <button type="button" className={`app-header__nav-link ${activePage === 'discover' ? 'app-header__nav-link--active' : ''}`} onClick={() => onNavigate?.('discover')}>Discover</button>
        <button type="button" className={`app-header__nav-link ${activePage === 'watchlist' ? 'app-header__nav-link--active' : ''}`} onClick={() => onNavigate?.('watchlist')}>Watchlist</button>
        <button type="button" className={`app-header__nav-link ${activePage === 'community' ? 'app-header__nav-link--active' : ''}`} onClick={() => onNavigate?.('community')}>Community</button>
        <button type="button" className={`app-header__nav-link ${activePage === 'journal' ? 'app-header__nav-link--active' : ''}`} onClick={() => onNavigate?.('journal')}>Journal</button>
        <button type="button" className={`app-header__nav-link ${activePage === 'passport' ? 'app-header__nav-link--active' : ''}`} onClick={() => onNavigate?.('passport')}>Passport</button>
      </nav>

      <div className="app-header__search">
        <svg viewBox="0 0 20 20" fill="none" className="app-header__search-icon">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M18 18L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search movies..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {account && <div className="app-header__notifications"><button type="button" className="notification-bell" onClick={openNotifications} aria-label="Notifications">♧{unreadCount > 0 && <b>{unreadCount > 9 ? '9+' : unreadCount}</b>}</button>{notificationsOpen && <div className="notification-menu"><header><strong>Notifications</strong><span>{notifications.length ? 'Latest activity' : ''}</span></header>{notifications.length ? notifications.map((item) => <div className={item.ISREAD ? 'notification-item' : 'notification-item notification-item--unread'} key={item.NOTIFICATIONID}><i>{item.NOTIFTYPE === 'PostLike' ? '♥' : item.NOTIFTYPE === 'PostComment' ? '◌' : item.NOTIFTYPE === 'WeeklyChallenge' ? '✦' : '◎'}</i><span>{item.MESSAGE}</span></div>) : <p>No notifications yet.</p>}</div>}</div>}{account && <div className="app-header__account"><button type="button" className="app-header__account-button" onClick={() => setMenuOpen((open) => !open)}>{profilePictureUrl ? <img src={profilePictureUrl} alt="" /> : <span>{displayName.charAt(0)}</span>}<b>{displayName}</b></button>{menuOpen && <div className="app-header__menu"><button type="button" onClick={() => { setMenuOpen(false); onNavigate?.('profile'); }}>View profile</button><button type="button" onClick={() => { setMenuOpen(false); onNavigate?.('watchlist'); }}>My watchlist</button><button type="button" onClick={onLogout}>Sign out</button></div>}</div>}
    </header>
  );
}
