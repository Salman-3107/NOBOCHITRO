import { useEffect, useRef, useState } from 'react';
import { getUserProfile, listNotifications, markAllNotificationsRead, searchMembers } from '../api/movies';
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

// Where clicking a notification should take you. Notification.RelatedID holds
// the thing that triggered it -- the follower's UserID for a follow, the PostID
// for a like/comment, the ChallengeID for a weekly challenge -- so no database
// change is needed. Returns null for notifications with nowhere to go (admin
// announcements), which then render as plain, non-clickable rows.
function notificationTarget(item) {
  const id = item.RELATEDID;
  switch (item.NOTIFTYPE) {
    case 'Follow': return id ? { page: 'profile', id } : null;
    case 'PostLike': return id ? { page: 'postLikes', id } : null;
    case 'PostComment': return id ? { page: 'postComments', id } : null;
    case 'WeeklyChallenge': return { page: 'challenges' };
    default: return null;
  }
}

function MemberAvatar({ member }) {
  const initial = (member.DISPLAYNAME || member.USERNAME || '?').charAt(0).toUpperCase();
  return member.PROFILEPICTUREURL
    ? <img src={member.PROFILEPICTUREURL} alt="" />
    : <span aria-hidden="true">{initial}</span>;
}

// `hideEmptyMembers`: pages where the search box already has its own meaning
// (Home/Discover filter the movie grid) pass this so the members dropdown only
// appears when there IS a matching member, instead of announcing "no members"
// on every movie search.
export default function Header({ searchValue, onSearchChange, onLogout, activePage = 'home', onNavigate, hideEmptyMembers = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const account = getStoredUser();
  const [currentProfile, setCurrentProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // ---- Member search ------------------------------------------------------
  // Typing in the header box also looks up other members by username or
  // display name, so you can open someone's profile without waiting for them
  // to post in the community feed.
  const searchBoxRef = useRef(null);
  const [members, setMembers] = useState([]);
  const [membersStatus, setMembersStatus] = useState('idle'); // idle | loading | ready | error
  const [membersOpen, setMembersOpen] = useState(false);
  const [activeMember, setActiveMember] = useState(-1);
  const memberQuery = (searchValue || '').trim();

  useEffect(() => {
    if (memberQuery.length < 2) {
      setMembers([]);
      setMembersStatus('idle');
      setActiveMember(-1);
      return undefined;
    }
    let active = true;
    setMembersStatus('loading');
    // Debounce so we don't fire a request on every keystroke.
    const timer = setTimeout(() => {
      searchMembers(memberQuery)
        .then((rows) => {
          if (!active) return;
          setMembers(rows);
          setMembersStatus('ready');
          setActiveMember(-1);
        })
        .catch(() => {
          if (!active) return;
          setMembers([]);
          setMembersStatus('error');
        });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [memberQuery]);

  // Click anywhere outside the search box closes the dropdown.
  useEffect(() => {
    function handleOutside(event) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target)) setMembersOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function pickMember(member) {
    setMembersOpen(false);
    setActiveMember(-1);
    setMembers([]);
    setNavOpen(false);
    // Clear the box so the dropdown doesn't reappear when landing on the
    // profile (profile -> profile keeps this same Header mounted).
    onSearchChange?.('');
    onNavigate?.('profile', member.USERID);
  }

  function handleSearchKeyDown(event) {
    if (event.key === 'Escape') { setMembersOpen(false); return; }
    if (!membersOpen || !members.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveMember((index) => (index + 1) % members.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveMember((index) => (index <= 0 ? members.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeMember >= 0) {
      // Only hijack Enter once someone has arrowed onto a member; otherwise
      // it keeps whatever meaning it had on the page.
      event.preventDefault();
      pickMember(members[activeMember]);
    }
  }

  const showMemberMenu = membersOpen && memberQuery.length >= 2 && (
    members.length > 0
    || (!hideEmptyMembers && (membersStatus === 'ready' || membersStatus === 'error'))
  );

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

  function openNotification(target) {
    setNotificationsOpen(false);
    setNavOpen(false);
    setMenuOpen(false);
    onNavigate?.(target.page, target.id);
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

      <div className="app-header__search" ref={searchBoxRef}>
        <svg viewBox="0 0 20 20" fill="none" className="app-header__search-icon" aria-hidden="true">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M18 18L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search movies, actors, members..."
          aria-label="Search"
          role="combobox"
          aria-expanded={showMemberMenu}
          aria-controls="member-search-results"
          aria-autocomplete="list"
          aria-activedescendant={activeMember >= 0 && members[activeMember] ? `member-option-${members[activeMember].USERID}` : undefined}
          autoComplete="off"
          value={searchValue}
          onChange={(e) => { onSearchChange(e.target.value); setMembersOpen(true); }}
          onFocus={() => setMembersOpen(true)}
          onKeyDown={handleSearchKeyDown}
        />

        {showMemberMenu && (
          <div className="member-results" id="member-search-results" role="listbox" aria-label="Members">
            <p className="member-results__label">MEMBERS</p>
            {members.map((member, index) => {
              const isMe = Number(member.USERID) === Number(account?.userId);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeMember}
                  id={`member-option-${member.USERID}`}
                  key={member.USERID}
                  className={index === activeMember ? 'member-result member-result--active' : 'member-result'}
                  onMouseEnter={() => setActiveMember(index)}
                  onClick={() => pickMember(member)}
                >
                  <MemberAvatar member={member} />
                  <span className="member-result__text">
                    <strong>{member.DISPLAYNAME || member.USERNAME}</strong>
                    <small>@{member.USERNAME}{isMe ? ' \u00B7 you' : ''}</small>
                  </span>
                </button>
              );
            })}
            {!members.length && membersStatus === 'ready' && (
              <p className="member-results__empty">No members match &ldquo;{memberQuery}&rdquo;.</p>
            )}
            {!members.length && membersStatus === 'error' && (
              <p className="member-results__empty">Couldn&rsquo;t search members right now.</p>
            )}
          </div>
        )}
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
              {notifications.length ? notifications.map((item) => {
                const target = notificationTarget(item);
                const Row = target ? 'button' : 'div';
                const rowClass = [
                  'notification-item',
                  item.ISREAD ? '' : 'notification-item--unread',
                  target ? 'notification-item--link' : '',
                ].filter(Boolean).join(' ');
                return (
                  <Row
                    className={rowClass}
                    key={item.NOTIFICATIONID}
                    {...(target ? { type: 'button', onClick: () => openNotification(target) } : {})}
                  >
                    <i aria-hidden="true">
                      {item.NOTIFTYPE === 'PostLike' ? '\u2665'
                        : item.NOTIFTYPE === 'PostComment' ? '\u25CC'
                        : item.NOTIFTYPE === 'WeeklyChallenge' ? '\u2726' : '\u25CE'}
                    </i>
                    <span>{item.MESSAGE}</span>
                    {target && <em aria-hidden="true">&rsaquo;</em>}
                  </Row>
                );
              }              ) : <p>No notifications yet.</p>}
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
