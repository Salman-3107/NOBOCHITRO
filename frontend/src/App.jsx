import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import BrowsePage from './pages/BrowsePage';

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('nobochitro_user');
    return stored ? JSON.parse(stored) : null;
  });

  function handleLogout() {
    localStorage.removeItem('nobochitro_token');
    localStorage.removeItem('nobochitro_user');
    setUser(null);
  }

  function handleSelectMovie(movieId) {
    // Movie detail page isn't built yet -- next piece to add.
    console.log('Selected movie', movieId);
  }

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />;
  }

  return <BrowsePage user={user} onLogout={handleLogout} onSelectMovie={handleSelectMovie} />;
}
