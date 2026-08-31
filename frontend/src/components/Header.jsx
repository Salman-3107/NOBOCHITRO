import './Header.css';

export default function Header({ searchValue, onSearchChange, onLogout, activePage = 'home', onNavigate }) {
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
        <button type="button" className="app-header__nav-link">Community</button>
        <button type="button" className="app-header__nav-link">Passport</button>
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

      <button type="button" className="app-header__logout" onClick={onLogout}>Sign out</button>
    </header>
  );
}
