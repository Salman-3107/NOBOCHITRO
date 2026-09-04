import { useState } from 'react';
import LandingPage from './pages/LandingPage';
import BrowsePage from './pages/BrowsePage';
import MovieDetailsPage from './pages/MovieDetailsPage';
import WatchlistPage from './pages/WatchlistPage';
import CommunityPage from './pages/CommunityPage';
import ProfilePage from './pages/ProfilePage';
import JournalPage from './pages/JournalPage';
import PassportPage from './pages/PassportPage';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('nobochitro_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [page, setPage] = useState('home');
  const [profileUserId, setProfileUserId] = useState(null);

  function handleLogout() {
    localStorage.removeItem('nobochitro_token');
    localStorage.removeItem('nobochitro_user');
    setUser(null);
  }

  function handleSelectMovie(movieId) { setSelectedMovieId(movieId); }

  function handleNavigate(nextPage) {
    setSelectedMovieId(null);
    setProfileUserId(null);
    if (nextPage === 'profile') { setProfileUserId(user.userId); return; }
    setPage(nextPage);
  }

  function handleSelectProfile(userId) { setSelectedMovieId(null); setProfileUserId(userId); }

  if (!user) {
    return <LandingPage onAuthenticated={setUser} />;
  }

  if (selectedMovieId) {
    return <MovieDetailsPage movieId={selectedMovieId} user={user} onLogout={handleLogout} onBack={() => setSelectedMovieId(null)} onNavigate={handleNavigate} />;
  }

  if (profileUserId) return <ProfilePage profileUserId={profileUserId} user={user} onLogout={handleLogout} onNavigate={handleNavigate} onSelectProfile={handleSelectProfile} onSelectMovie={handleSelectMovie} />;

  if (page === 'watchlist') {
    return <WatchlistPage user={user} onLogout={handleLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />;
  }

  if (page === 'community') {
    return <CommunityPage user={user} onLogout={handleLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} onSelectProfile={handleSelectProfile} />;
  }
  if (page === 'journal') return <JournalPage user={user} onLogout={handleLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />;
  if (page === 'passport') return <PassportPage user={user} onLogout={handleLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />;

  return <BrowsePage user={user} onLogout={handleLogout} onSelectMovie={handleSelectMovie} page={page} onNavigate={handleNavigate} />;
}
