import { useState } from 'react';
import Logo from '../components/Logo';
import AuthModal from '../components/AuthModal';
import PosterTile from '../components/PosterTile';
import './LandingPage.css';

// A scattered "wall" of generic poster tiles behind the hero content.
// Positions/rotations are hand-placed so nothing collides with the
// centered text, while still filling the page with visual texture.
const POSTER_TILES = [
  { top: '6%', left: '4%', rotate: -8, hue: 200, icon: 'mountain' },
  { top: '10%', left: '16%', rotate: 5, hue: 190, icon: 'stars', size: 0.85 },
  { top: '58%', left: '3%', rotate: 6, hue: 205, icon: 'wave' },
  { top: '68%', left: '15%', rotate: -4, hue: 195, icon: 'moon', size: 0.8 },
  { top: '4%', left: '78%', rotate: 7, hue: 198, icon: 'bolt', size: 0.85 },
  { top: '12%', left: '89%', rotate: -6, hue: 210, icon: 'city' },
  { top: '60%', left: '82%', rotate: -7, hue: 192, icon: 'stars' },
  { top: '70%', left: '93%', rotate: 5, hue: 202, icon: 'mountain', size: 0.8 },
  { top: '38%', left: '1%', rotate: 4, hue: 188, icon: 'city', size: 0.75 },
  { top: '40%', left: '95%', rotate: -5, hue: 196, icon: 'wave', size: 0.75 },
];

export default function LandingPage({ onAuthenticated }) {
  const [modalMode, setModalMode] = useState(null); // null | 'signin' | 'register'

  return (
    <div className="landing-page">
      {/* Abstract collage background -- layered color blooms suggesting
          "many movies, many moods" without depicting any specific film. */}
      <div className="landing-bg" aria-hidden="true">
        <div className="landing-bg__bloom landing-bg__bloom--1" />
        <div className="landing-bg__bloom landing-bg__bloom--2" />
        <div className="landing-bg__bloom landing-bg__bloom--3" />
        <div className="landing-bg__beam" />
        <div className="poster-wall">
          {POSTER_TILES.map((tile, i) => (
            <PosterTile key={i} {...tile} />
          ))}
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
