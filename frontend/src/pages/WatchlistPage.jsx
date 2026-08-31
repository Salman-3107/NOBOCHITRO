import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { getWatchlist, removeFromWatchlist } from '../api/movies';
import './WatchlistPage.css';

export default function WatchlistPage({ user, onLogout, onNavigate, onSelectMovie }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState('');
  const [removingId, setRemovingId] = useState(null);

  async function loadWatchlist() {
    setStatus('loading');
    try {
      setItems(await getWatchlist(user.userId));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }

  useEffect(() => { loadWatchlist(); }, [user.userId]);

  async function handleRemove(movieId) {
    setRemovingId(movieId);
    try {
      await removeFromWatchlist(movieId);
      setItems((current) => current.filter((item) => item.MOVIEID !== movieId));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="watchlist-page">
      <Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} activePage="watchlist" onNavigate={onNavigate} />
      <main className="watchlist-page__content">
        <section className="watchlist-page__heading">
          <div><p className="browse-page__eyebrow">Saved for later</p><h1>My watchlist</h1><p>Stories waiting for their perfect moment.</p></div>
          {status === 'ready' && <div className="watchlist-page__count"><strong>{items.length}</strong><span>movie{items.length === 1 ? '' : 's'} saved</span></div>}
        </section>
        {status === 'loading' && <p className="watchlist-status">Loading your watchlist…</p>}
        {status === 'error' && <p className="watchlist-status">We could not load your watchlist. <button type="button" onClick={loadWatchlist}>Try again</button></p>}
        {status === 'ready' && !items.length && <section className="watchlist-empty"><span>⌁</span><h2>Your watchlist is waiting</h2><p>Save the movies that you want to experience next.</p><button type="button" onClick={() => onNavigate('discover')}>Explore movies</button></section>}
        {status === 'ready' && items.length > 0 && <div className="watchlist-grid">{items.map((movie) => <article className="watchlist-item" key={movie.MOVIEID}><button type="button" className="watchlist-item__movie" onClick={() => onSelectMovie(movie.MOVIEID)}>{movie.POSTERURL ? <img src={movie.POSTERURL} alt={`${movie.TITLE} poster`} /> : <div className="watchlist-item__placeholder">{movie.TITLE.charAt(0)}</div>}<div><h2>{movie.TITLE}</h2><p>{movie.RELEASEYEAR || 'Release year unavailable'}</p></div></button><button type="button" className="watchlist-item__remove" disabled={removingId === movie.MOVIEID} onClick={() => handleRemove(movie.MOVIEID)}>{removingId === movie.MOVIEID ? 'Removing…' : 'Remove'}</button></article>)}</div>}
      </main>
    </div>
  );
}
