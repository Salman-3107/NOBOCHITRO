import './Header.css';

export default function Header({ searchValue, onSearchChange, onLogout }) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__wordmark">
          NOBO<em>CHITRO</em>
        </span>
      </div>

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

      <button type="button" className="app-header__logout" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}
