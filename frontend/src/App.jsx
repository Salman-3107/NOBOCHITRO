import { useState } from 'react';
import LoginPage from './pages/LoginPage';

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

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />;
  }

  // Placeholder home screen -- replace with the real dashboard/feed later.
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#ece8e0' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ opacity: 0.6, marginBottom: 8 }}>Signed in as</p>
        <h1 style={{ fontFamily: 'Fraunces, serif', margin: 0 }}>{user.displayName}</h1>
        <button
          onClick={handleLogout}
          style={{
            marginTop: 20,
            background: 'transparent',
            border: '1px solid #2a2f38',
            color: '#ece8e0',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
