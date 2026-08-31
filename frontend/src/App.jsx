import { useState } from 'react';
import LandingPage from './pages/LandingPage';
import BrowsePage from './pages/BrowsePage';
import MovieDetailsPage from './pages/MovieDetailsPage';
import WatchlistPage from './pages/WatchlistPage';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('nobochitro_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [selectedMovieId, setSelectedMovieId] = useState(null);
  const [page, setPage] = useState('home');

  function handleLogout() {
    localStorage.removeItem('nobochitro_token');
    localStorage.removeItem('nobochitro_user');
    setUser(null);
  }

  function handleSelectMovie(movieId) { setSelectedMovieId(movieId); }

  function handleNavigate(nextPage) {
    setSelectedMovieId(null);
    setPage(nextPage);
  }

  if (!user) {
    return <LandingPage onAuthenticated={setUser} />;
  }

  if (selectedMovieId) {
    return <MovieDetailsPage movieId={selectedMovieId} user={user} onLogout={handleLogout} onBack={() => setSelectedMovieId(null)} onNavigate={handleNavigate} />;
  }

  if (page === 'watchlist') {
    return <WatchlistPage user={user} onLogout={handleLogout} onNavigate={handleNavigate} onSelectMovie={handleSelectMovie} />;
  }

  return <BrowsePage user={user} onLogout={handleLogout} onSelectMovie={handleSelectMovie} page={page} onNavigate={handleNavigate} />;
}
