import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Header from '../components/Header';
import { followUser, getFollowers, getFollowing, getUserActivity, getUserJournal, getUserProfile, getUserWatchlist, listPosts, unfollowUser, updateMyProfile, uploadProfileMedia } from '../api/movies';
import ProfilePostCard from '../components/ProfilePostCard';
import EmptyState from '../components/EmptyState';
import JournalEntryModal from '../components/JournalEntryModal';
import { useToast } from '../components/Toast';
import './ProfilePage.css';

const PROFILE_TABS = ['posts', 'watchlist', 'journal', 'activity'];

// "March 12, 2026" -- used on the journal cards.
function formatShortDate(dateValue) {
  if (!dateValue) return '';
  return new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function Avatar({ profile }) {
  const label = (profile.DISPLAYNAME || profile.USERNAME || '?').charAt(0);
  return profile.PROFILEPICTUREURL ? <img className="profile-avatar" src={profile.PROFILEPICTUREURL} alt={`${profile.DISPLAYNAME || profile.USERNAME}'s profile`} /> : <div className="profile-avatar">{label}</div>;
}

function PersonList({ title, people, onClose, onOpenProfile }) {
  return <div className="profile-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="profile-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close">×</button></header>{people.length ? <div className="profile-people">{people.map((person) => <button type="button" key={person.USERID} onClick={() => { onOpenProfile(person.USERID); onClose(); }}>{person.PROFILEPICTUREURL ? <img src={person.PROFILEPICTUREURL} alt="" /> : <span>{(person.DISPLAYNAME || person.USERNAME).charAt(0)}</span>}<div><strong>{person.DISPLAYNAME || person.USERNAME}</strong><small>@{person.USERNAME}</small></div></button>)}</div> : <p className="profile-empty">No one here yet.</p>}</section></div>;
}

export default function ProfilePage({ profileUserId, user, onLogout, onNavigate, onSelectProfile, onSelectMovie }) {
  const [profile, setProfile] = useState(null); const [watchlist, setWatchlist] = useState([]); const [journal, setJournal] = useState([]); const [activity, setActivity] = useState([]); const [posts, setPosts] = useState([]); const [followers, setFollowers] = useState([]); const [following, setFollowing] = useState([]); const [tab, setTab] = useState('posts'); const [followingUser, setFollowingUser] = useState(false); const [status, setStatus] = useState('loading'); const [search, setSearch] = useState(''); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState({}); const [peopleModal, setPeopleModal] = useState(null); const [watchlistBlocked, setWatchlistBlocked] = useState(false); const [saving, setSaving] = useState(false);
  const isOwner = Number(profileUserId) === Number(user.userId);

  // Journal entry that is open in the popup (null = closed).
  const [openJournalEntry, setOpenJournalEntry] = useState(null);

  // Tab animation: which way the content should slide, and where the
  // sliding underline sits.
  const [tabDirection, setTabDirection] = useState(null);
  const [tabLine, setTabLine] = useState({ left: 0, width: 0, animate: false });
  const tabButtonRefs = useRef({});

  function switchTab(nextTab) {
    if (nextTab === tab) return;
    setTabDirection(PROFILE_TABS.indexOf(nextTab) > PROFILE_TABS.indexOf(tab) ? 'forward' : 'backward');
    setTab(nextTab);
  }

  // Measure the active tab button and move the underline under it.
  useLayoutEffect(() => {
    function measure() {
      const activeButton = tabButtonRefs.current[tab];
      if (!activeButton) return;
      setTabLine((oldLine) => ({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
        // No slide on the very first measurement, otherwise the line
        // would fly in from the left edge when the page opens.
        animate: oldLine.width > 0,
      }));
    }
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab, status]);

  const toast = useToast();

  async function load() {
    setStatus('loading');
    setWatchlistBlocked(false);

    // allSettled, not all. A private watchlist now returns 403 by design, and
    // with Promise.all that single rejection blanked the entire profile with
    // "Profile unavailable". Each section is allowed to fail on its own.
    const [
      profileResult, watchlistResult, journalResult, activityResult,
      postsResult, followersResult, followingResult,
    ] = await Promise.allSettled([
      getUserProfile(profileUserId),
      getUserWatchlist(profileUserId),
      getUserJournal(profileUserId),
      getUserActivity(profileUserId),
      listPosts({ userId: profileUserId }),
      getFollowers(profileUserId),
      getFollowing(profileUserId),
    ]);

    // The profile itself is the only genuinely required piece.
    if (profileResult.status === 'rejected') {
      setStatus('error');
      return;
    }

    const valueOr = (result, fallback) =>
      result.status === 'fulfilled' ? result.value : fallback;

    setProfile(profileResult.value);
    setJournal(valueOr(journalResult, []));
    setActivity(valueOr(activityResult, []));
    setPosts(valueOr(postsResult, []));

    const followerRows = valueOr(followersResult, []);
    setFollowers(followerRows);
    setFollowing(valueOr(followingResult, []));

    if (watchlistResult.status === 'fulfilled') {
      setWatchlist(watchlistResult.value);
    } else {
      // 403 means "theirs and private" -- an expected outcome, not a bug.
      setWatchlist([]);
      setWatchlistBlocked(watchlistResult.reason?.status === 403);
    }

    setFollowingUser(
      Number(profileResult.value.USERID) !== Number(user.userId)
      && followerRows.some((item) => Number(item.USERID) === Number(user.userId))
    );
    setStatus('ready');
  }

  useEffect(() => { load(); }, [profileUserId]);
  async function toggleFollow() { try { if (followingUser) { await unfollowUser(profileUserId); setFollowingUser(false); setFollowers((items) => items.filter((person) => Number(person.USERID) !== Number(user.userId))); } else { await followUser(profileUserId); setFollowingUser(true); setFollowers((items) => [...items, { USERID: user.userId, DISPLAYNAME: user.displayName, USERNAME: user.username }]); } } catch (err) { toast.error(err.message); } }
  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    try {
      let media = {};
      if (draft.profilePicture || draft.coverPicture) {
        media = await uploadProfileMedia(draft);
      }
      await updateMyProfile({
        displayName: draft.displayName,
        bio: draft.bio,
        profilePictureUrl: media.profilePictureUrl,
        coverPictureUrl: media.coverPictureUrl,
      });

      const account = JSON.parse(localStorage.getItem('nobochitro_user') || '{}');
      localStorage.setItem('nobochitro_user', JSON.stringify({
        ...account,
        displayName: draft.displayName || account.displayName,
        profilePictureUrl: media.profilePictureUrl || account.profilePictureUrl,
      }));

      setEditing(false);
      toast.success('Profile updated.');
      await load();
    } catch (err) {
      // Previously this had no catch at all -- an oversized image or a failed
      // save rejected silently and the modal just sat there looking fine.
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function openEditor() { setDraft({ displayName: profile.DISPLAYNAME || '', bio: profile.BIO || '', profilePicture: null, coverPicture: null }); setEditing(true); }

  if (status === 'loading') return <div className="profile-page"><Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} onNavigate={onNavigate} /><p className="profile-status">Loading profile…</p></div>;
  if (status === 'error') return <div className="profile-page"><Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} onNavigate={onNavigate} /><p className="profile-status">Profile unavailable.</p></div>;
  const favorites = profile.favoriteMovies || [];
  return <div className="profile-page"><Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} onNavigate={onNavigate} /><main className="profile-wrap">
    <section className="profile-cover profile-cover--cinematic" style={profile.COVERPICTUREURL ? { backgroundImage: `linear-gradient(0deg, var(--bg) 0%, rgba(13,13,15,.1) 65%), url("${profile.COVERPICTUREURL}")` } : undefined} />
    <section className="profile-header profile-header--reference"><div className="profile-avatar-frame"><Avatar profile={profile} />{isOwner && <button type="button" onClick={openEditor} aria-label="Update profile picture">⌁</button>}</div><div className="profile-actions">{isOwner ? <button type="button" className="profile-edit" onClick={openEditor}>✎ Edit profile</button> : <><button type="button" className="profile-edit" onClick={() => onNavigate?.('tasteMatch', profileUserId)}>&#10022; Taste match</button><button type="button" className={followingUser ? 'profile-follow profile-follow--active' : 'profile-follow'} onClick={toggleFollow}>{followingUser ? 'Following' : 'Follow'}</button></>}</div><div className="profile-header__content"><div><h1>{profile.DISPLAYNAME || profile.USERNAME}</h1><p>@{profile.USERNAME} <b>✦</b></p></div></div><p className="profile-bio">{profile.BIO || 'Collecting unforgettable stories, one film at a time.'}</p><div className="profile-numbers"><button type="button" onClick={() => setPeopleModal('followers')}><strong>{followers.length}</strong> followers</button><button type="button" onClick={() => setPeopleModal('following')}><strong>{following.length}</strong> following</button><span>Joined {new Date(profile.JOINDATE).getFullYear()}</span></div></section>
    <section className="profile-stats profile-stats--reference"><div><strong>{profile.MOVIESWATCHED}</strong><span>Movies rated</span></div><div><strong>{profile.REVIEWCOUNT}</strong><span>Reviews</span></div><div><strong>{watchlist.length}</strong><span>Watchlisted</span></div><div><strong>{profile.POSTCOUNT}</strong><span>Posts</span></div></section>
    {favorites.length > 0 && <section className="profile-favorites profile-favorites--reference"><div className="profile-section-heading"><div><p>{isOwner ? 'YOUR MOVIE IDENTITY' : 'THEIR MOVIE IDENTITY'}</p><h2>Favorite Movies</h2></div><button type="button" onClick={() => switchTab('watchlist')}>See all</button></div><div className="favorite-film-strip">{favorites.map((movie) => <button type="button" key={movie.MOVIEID} onClick={() => onSelectMovie(movie.MOVIEID)}>{movie.POSTERURL ? <img src={movie.POSTERURL} alt={`${movie.TITLE} poster`} /> : <span>🎬</span>}<i>★ {movie.RATINGVALUE}</i><strong>{movie.TITLE}</strong></button>)}</div></section>}
    <nav className="profile-tabs profile-tabs--reference" role="tablist">{PROFILE_TABS.map((key) => <button type="button" role="tab" aria-selected={tab === key} ref={(element) => { tabButtonRefs.current[key] = element; }} className={tab === key ? 'profile-tab profile-tab--active' : 'profile-tab'} onClick={() => switchTab(key)} key={key}>{key}</button>)}<span className={tabLine.animate ? 'profile-tabs__line profile-tabs__line--slides' : 'profile-tabs__line'} style={{ width: tabLine.width, transform: `translateX(${tabLine.left}px)` }} aria-hidden="true" /></nav>
    <section key={tab} className={`profile-content profile-content--reference${tabDirection ? ` profile-content--${tabDirection}` : ''}`}>
      {tab === 'posts' && (posts.length ? posts.map((post) => <ProfilePostCard key={post.POSTID} post={post} user={user} profile={profile} onSelectMovie={onSelectMovie} onSelectProfile={onSelectProfile} />) : <p className="profile-empty">No posts yet. The first great movie thought is waiting.</p>)}
      {tab === 'activity' && (activity.length ? activity.map((item, index) => <button type="button" className="profile-activity" key={`${item.MOVIEID}-${index}`} onClick={() => onSelectMovie(item.MOVIEID)}><span>{item.ACTIVITYTYPE === 'Rated' ? '★' : item.ACTIVITYTYPE === 'Posted' ? '◌' : '🎬'}</span><div><strong>{item.ACTIVITYTYPE} <em>{item.MOVIETITLE}</em></strong><p>{item.EXTRAINFO || 'Added to their movie story'}</p></div></button>) : <p className="profile-empty">No public activity yet.</p>)}
      {tab === 'watchlist' && (watchlistBlocked ? <EmptyState compact icon={'\u{1F512}'} title="This watchlist is private" message={`${profile.DISPLAYNAME || profile.USERNAME} keeps their watchlist to themselves.`} /> : watchlist.length ? <div className="profile-movie-grid">{watchlist.map((movie) => <button type="button" key={movie.MOVIEID} onClick={() => onSelectMovie(movie.MOVIEID)}>{movie.POSTERURL ? <img src={movie.POSTERURL} alt="" /> : <span>🎬</span>}<strong>{movie.TITLE}</strong><small>{movie.RELEASEYEAR}</small></button>)}</div> : <p className="profile-empty">This watchlist is still empty.</p>)}
      {tab === 'journal' && (journal.length ? journal.map((entry) => <button type="button" className="profile-journal" key={entry.JOURNALID} onClick={() => setOpenJournalEntry(entry)} aria-label={`Read journal entry for ${entry.MOVIETITLE}`}>{entry.POSTERURL ? <img className="profile-journal__poster" src={entry.POSTERURL} alt="" /> : <span className="profile-journal__poster profile-journal__poster--empty">🎬</span>}<div className="profile-journal__body"><strong>{entry.MOVIETITLE}</strong><p>{[formatShortDate(entry.WATCHDATE), entry.MOODAFTER, entry.WATCHLOCATION].filter(Boolean).join(' · ') || 'Movie memory'}</p>{entry.JOURNALTEXT && <em>{entry.JOURNALTEXT}</em>}</div><span className="profile-journal__chevron" aria-hidden="true">›</span></button>) : <p className="profile-empty">No public journal entries yet.</p>)}
    </section></main>
    {openJournalEntry && <JournalEntryModal entry={openJournalEntry} onClose={() => setOpenJournalEntry(null)} onOpenMovie={() => onSelectMovie(openJournalEntry.MOVIEID)} />}
    {peopleModal && <PersonList title={peopleModal === 'followers' ? 'Followers' : 'Following'} people={peopleModal === 'followers' ? followers : following} onClose={() => setPeopleModal(null)} onOpenProfile={onSelectProfile} />}
    {editing && <div className="profile-modal-backdrop" role="presentation" onMouseDown={() => setEditing(false)}><form className="profile-modal profile-editor" onSubmit={saveProfile} onMouseDown={(event) => event.stopPropagation()}><header><h2>Shape your profile</h2><button type="button" onClick={() => setEditing(false)} aria-label="Close">×</button></header><label>Display name<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label>Bio<textarea value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} /></label><label>Profile picture <input type="file" accept="image/*" onChange={(event) => setDraft({ ...draft, profilePicture: event.target.files[0] || null })} /><small>{draft.profilePicture ? draft.profilePicture.name : 'Choose an image from this device (max 5 MB).'}</small></label><label>Cover picture <input type="file" accept="image/*" onChange={(event) => setDraft({ ...draft, coverPicture: event.target.files[0] || null })} /><small>{draft.coverPicture ? draft.coverPicture.name : 'Choose an image from this device (max 5 MB).'}</small></label><button className="profile-save" type="submit" disabled={saving}>{saving ? 'Saving\u2026' : 'Save profile'}</button></form></div>}
  </div>;
}
