import { useState, useEffect, useCallback } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation,
} from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import BrowsePage from './pages/BrowsePage';
import MovieDetailsPage from './pages/MovieDetailsPage';
import WatchlistPage from './pages/WatchlistPage';
import CommunityPage from './pages/CommunityPage';
import ProfilePage from './pages/ProfilePage';
import JournalPage from './pages/JournalPage';
import PassportPage from './pages/PassportPage';
import ChallengesPage from './pages/ChallengesPage';
import StatsPage from './pages/StatsPage';
import TasteMatchPage from './pages/TasteMatchPage';
import ErrorScreen from './components/ErrorScreen';
import AdminApp from './admin/AdminApp';
import { logoutUser, fetchCurrentUser } from './api/auth';
import { clearSession, getStoredUser, setSessionExpiredHandler } from './api/client';

// Maps the "logical" page names used throughout the app (and sent by
// Header's onNavigate calls) to real, bookmarkable URLs.
const PAGE_PATHS = {
  home: '/',
  discover: '/discover',
  watchlist: '/watchlist',
  community: '/community',
  journal: '/journal',
  passport: '/passport',
  challenges: '/challenges',
  stats: '/stats',
};

// Wraps MovieDetailsPage so it can pull :movieId straight from the URL
// instead of from component state.
function MovieDetailsRoute({ user, onLogout, onNavigate, onSelectMovie }) {
  const { movieId } = useParams();
  const navigate = useNavigate();
  return (
    <MovieDetailsPage
      movieId={Number(movieId)}
      user={user}
      onLogout={onLogout}
      onBack={() => navigate(-1)}
      onNavigate={onNavigate}
      onSelectMovie={onSelectMovie}
    />
  );
}

// Same idea for ProfilePage and :userId.
function ProfileRoute({ user, onLogout, onNavigate, onSelectProfile, onSelectMovie }) {
  const { userId } = useParams();
  return (
    <ProfilePage
      profileUserId={Number(userId)}
      user={user}
      onLogout={onLogout}
      onNavigate={onNavigate}
      onSelectProfile={onSelectProfile}
      onSelectMovie={onSelectMovie}
    />
  );
}

// Taste match compares the signed-in user against the :userId in the URL.
function TasteMatchRoute({ user, onLogout, onNavigate, onSelectMovie }) {
  const { userId } = useParams();
  // Comparing yourself to yourself is meaningless and the API returns 400,
  // so send them to their own profile instead of showing an error.
  if (Number(userId) === Number(user.userId)) {
    return <Navigate to={`/profile/${user.userId}`} replace />;
  }
  return (
    <TasteMatchPage
      user={user}
      otherUserId={Number(userId)}
      onLogout={onLogout}
      onNavigate={onNavigate}
      onSelectMovie={onSelectMovie}
    />
  );
}

// Everything a logged-in, non-admin user can reach.
function AppShell({ user, onLogout }) {
  const navigate = useNavigate();

  // Some destinations need a target id alongside the page name --
  // onNavigate('tasteMatch', 42) rather than a bare page key.
  function handleNavigate(nextPage, targetId) {
    if (nextPage === 'profile') {
      navigate(`/profile/${targetId ?? user.userId}`);
      return;
    }
    if (nextPage === 'tasteMatch' && targetId) {
      navigate(`/taste-match/${targetId}`);
      return;
    }
    // Notification deep links: open the Community feed scrolled to one post,
    // optionally with its comments already expanded.
    if (nextPage === 'post' && targetId) {
      navigate(`/community?post=${targetId}`);
      return;
    }
    if (nextPage === 'postComments' && targetId) {
      navigate(`/community?post=${targetId}&view=comments`);
      return;
    }
    navigate(PAGE_PATHS[nextPage] || '/');
  }

  function handleSelectMovie(movieId) { navigate(`/movie/${movieId}`); }
  function handleSelectProfile(userId) { navigate(`/profile/${userId}`); }

  return (
    <Routes>
      <Route
        path="/movie/:movieId"
        element={<MovieDetailsRoute user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />}
      />
      <Route
        path="/profile/:userId"
        element={<ProfileRoute user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectProfile={handleSelectProfile} onSelectMovie={handleSelectMovie} />}
      />
      <Route path="/watchlist" element={<WatchlistPage user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />} />
      <Route path="/community" element={<CommunityPage user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} onSelectProfile={handleSelectProfile} />} />
      <Route path="/journal" element={<JournalPage user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />} />
      <Route path="/passport" element={<PassportPage user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />} />
      <Route path="/challenges" element={<ChallengesPage user={user} onLogout={onLogout} onNavigate={handleNavigate} />} />
      <Route path="/stats" element={<StatsPage user={user} onLogout={onLogout} onNavigate={handleNavigate} />} />
      <Route
        path="/taste-match/:userId"
        element={<TasteMatchRoute user={user} onLogout={onLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />}
      />
      <Route path="/discover" element={<BrowsePage user={user} onLogout={onLogout} onSelectMovie={handleSelectMovie} page="discover" onNavigate={handleNavigate} />} />
      <Route path="/" element={<BrowsePage user={user} onLogout={onLogout} onSelectMovie={handleSelectMovie} page="home" onNavigate={handleNavigate} />} />
      {/* A regular user who types /admin is bounced home by useUrlMatchesRole
          before this ever renders, and would get 403 from the API anyway.
          Anything else genuinely unknown gets a real 404 screen rather than a
          silent redirect, so a broken link is visible instead of mysterious. */}
      <Route
        path="*"
        element={<ErrorScreen variant={404} actionLabel="Return home" onAction={() => navigate('/')} />}
      />
    </Routes>
  );
}

// Keeps the address bar honest about who is signed in.
//
// The bug this fixes: the app decided which shell to render purely from the
// `user` object, and never touched the URL. So signing out from /admin left
// the landing page sitting at localhost:5173/admin, and refreshing that URL
// showed a public page under an admin-looking address.
//
// Rules, applied on every render and on every navigation:
//   - signed out          -> only "/" is valid
//   - signed in as admin  -> must be somewhere under "/admin"
//   - signed in as user   -> must be anywhere EXCEPT "/admin"
function useUrlMatchesRole(user) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');

    if (!user) {
      if (pathname !== '/') navigate('/', { replace: true });
      return;
    }
    if (user.isAdmin && !isAdminPath) {
      navigate('/admin', { replace: true });
      return;
    }
    if (!user.isAdmin && isAdminPath) {
      navigate('/', { replace: true });
    }
  }, [user, pathname, navigate]);
}

function Root() {
  const [user, setUser] = useState(getStoredUser);
  const navigate = useNavigate();

  useUrlMatchesRole(user);

  // Drop the user out of the app the moment the server rejects their token,
  // rather than leaving them on a page full of failed requests.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      navigate('/', { replace: true });
    });
    return () => setSessionExpiredHandler(null);
  }, [navigate]);

  // On a fresh page load the only thing we know is what localStorage says,
  // and that could be stale -- the token may have expired, been revoked by a
  // logout in another tab, or the account may have been promoted or demoted
  // since. Ask the server and take its answer over the cached copy.
  useEffect(() => {
    if (!user) return;
    fetchCurrentUser()
      .then((fresh) => {
        setUser((current) => (current ? { ...current, ...fresh } : current));
        localStorage.setItem('nobochitro_user', JSON.stringify(fresh));
      })
      .catch(() => {
        // A 401 already cleared the session via the handler above. Anything
        // else (backend down) leaves the cached user in place.
      });
    // Intentionally runs once per mount, not on every user change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = useCallback(async () => {
    // Revoke the token server-side FIRST, while we still have it to send.
    // If that call fails (backend down, network hiccup) we still sign out
    // locally -- the person's intent to leave shouldn't be blocked -- but the
    // server-side revocation is a real attempt, not a formality.
    try {
      await logoutUser();
    } catch {
      // Best effort. The token expires on its own within 7 days.
    }
    clearSession();
    setUser(null);
    // Send the browser back to "/" so an admin signing out of /admin doesn't
    // leave the landing page stranded at an /admin URL.
    navigate('/', { replace: true });
  }, [navigate]);

  const handleAuthenticated = useCallback((authenticatedUser) => {
    setUser(authenticatedUser);
    navigate(authenticatedUser.isAdmin ? '/admin' : '/', { replace: true });
  }, [navigate]);

  if (!user) {
    return <LandingPage onAuthenticated={handleAuthenticated} />;
  }

  // One login form for everyone. The server resolved the role from the
  // database and told us which it is; we just render the matching shell.
  return user.isAdmin
    ? <AdminApp user={user} onLogout={handleLogout} />
    : <AppShell user={user} onLogout={handleLogout} />;
}

export default function App() {
  // BrowserRouter has to sit ABOVE Root so Root itself can call useNavigate.
  // Previously it was rendered inside App's own return, which is why nothing
  // in App could touch the URL on login or logout.
  return (
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  );
}
