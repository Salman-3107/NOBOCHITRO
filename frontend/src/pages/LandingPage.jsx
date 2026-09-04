import { useState } from 'react';
import Logo from '../components/Logo';
import AuthModal from '../components/AuthModal';
import './LandingPage.css';

export default function LandingPage({ onAuthenticated }) {
  const [modalMode, setModalMode] = useState(null); // null | 'signin' | 'register'

  return (
    <div className="landing-page">
      {/* Real poster-wall photo, tiled and slowly auto-scrolling behind
          the hero content, darkened so the text stays readable. */}
      <div className="landing-bg" aria-hidden="true">
        <div className="poster-scroll">
          <div className="poster-scroll__img" />
          <div className="poster-scroll__img" />
        </div>
        <div className="landing-bg__grain" />
        <div className="landing-bg__vignette" />
      </div>

      <header className="landing-topbar">
        <div className="landing-topbar__brand">
          <Logo size={32} />
          <span className="landing-topbar__wordmark">
            NOBO<em>CHITRO</em>
          </span>
        </div>
        <button type="button" className="landing-topbar__login" onClick={() => setModalMode('signin')}>
          Log In
        </button>
      </header>

      <main className="landing-hero">
        <Logo size={88} />
        <h1 className="landing-hero__title">
          NOBO<em>CHITRO</em>
        </h1>
        <p className="landing-hero__tagline">
          Every film you've watched, loved, or lived through — catalogued in one place.
        </p>
        <button type="button" className="landing-hero__cta" onClick={() => setModalMode('register')}>
          Start your movie journey
        </button>
      </main>

      {modalMode && (
        <AuthModal
          initialMode={modalMode}
          onClose={() => setModalMode(null)}
          onAuthenticated={onAuthenticated}
        />
      )}
    </div>
  );
}
