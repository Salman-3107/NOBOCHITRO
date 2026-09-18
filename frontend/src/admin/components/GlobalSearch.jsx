import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminSearch } from '../../api/admin';
import { useDebounced } from '../hooks/useAdminResource';

// One box across the whole platform: movies, users, people, genres, reviews
// and posts. It navigates -- it is a jump-to, not a report. Anything that
// needs filtering and paging has its own screen, and each group here links
// through to that screen.

const GROUPS = [
  { key: 'movies', label: 'Movies' },
  { key: 'users', label: 'Users' },
  { key: 'people', label: 'People' },
  { key: 'genres', label: 'Genres' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'posts', label: 'Posts' },
];

export default function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const debounced = useDebounced(term, 300);

  // Clicking anywhere else dismisses the panel. Without this it stays open
  // behind whatever the admin clicks next.
  useEffect(() => {
    function onDocumentClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  useEffect(() => {
    // Two characters is the floor -- a single letter matches most of the
    // catalogue and the result is noise, not a search.
    if (debounced.trim().length < 2) {
      setResults(null);
      return;
    }

    let cancelled = false;
    setBusy(true);

    adminSearch(debounced.trim())
      .then((data) => { if (!cancelled) setResults(data); })
      // A failed search should not throw an error screen over the header --
      // it clears and lets the admin try again.
      .catch(() => { if (!cancelled) setResults(null); })
      .finally(() => { if (!cancelled) setBusy(false); });

    return () => { cancelled = true; };
  }, [debounced]);

  function go(path) {
    setOpen(false);
    setTerm('');
    setResults(null);
    navigate(path);
  }

  const groupsWithHits = results
    ? GROUPS.filter((group) => results[group.key] && results[group.key].length > 0)
    : [];

  return (
    <div className="adm-search" ref={containerRef}>
      <input
        type="search"
        className="adm-search__input"
        placeholder="Search NOBOCHITRO…"
        value={term}
        onChange={(event) => { setTerm(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        aria-label="Search the platform"
      />

      {open && term.trim().length >= 2 && (
        <div className="adm-search__panel">
          {busy && !results && <p className="adm-search__group-label">Searching…</p>}

          {results && groupsWithHits.length === 0 && (
            <p className="adm-search__group-label">No matches for “{term.trim()}”</p>
          )}

          {groupsWithHits.map((group) => (
            <div key={group.key}>
              <p className="adm-search__group-label">{group.label}</p>

              {group.key === 'movies' && results.movies.map((movie) => (
                <button
                  key={movie.movieId} type="button" className="adm-search__hit"
                  onClick={() => go(`/admin/movies/${movie.movieId}`)}
                >
                  {movie.title}
                  <small>{movie.releaseYear || '—'}</small>
                </button>
              ))}

              {group.key === 'users' && results.users.map((user) => (
                <button
                  key={user.userId} type="button" className="adm-search__hit"
                  onClick={() => go(`/admin/users/${user.userId}`)}
                >
                  {user.displayName || user.username}
                  <small>{user.isAdmin ? 'Admin' : `@${user.username}`}</small>
                </button>
              ))}

              {/* People and genres have no detail route of their own, so they
                  land on their management screen pre-filtered to the match. */}
              {group.key === 'people' && results.people.map((person) => (
                <button
                  key={person.personId} type="button" className="adm-search__hit"
                  onClick={() => go(`/admin/people?search=${encodeURIComponent(person.fullName)}`)}
                >
                  {person.fullName}
                  <small>Person</small>
                </button>
              ))}

              {group.key === 'genres' && results.genres.map((genre) => (
                <button
                  key={genre.genreId} type="button" className="adm-search__hit"
                  onClick={() => go('/admin/genres')}
                >
                  {genre.genreName}
                  <small>Genre</small>
                </button>
              ))}

              {group.key === 'reviews' && results.reviews.map((review) => (
                <button
                  key={`${review.userId}-${review.movieId}`} type="button" className="adm-search__hit"
                  onClick={() => go(`/admin/reviews?movieId=${review.movieId}`)}
                >
                  <span className="adm-clamp" style={{ maxWidth: 260 }}>
                    {review.snippet || `${review.username} on ${review.title}`}
                  </span>
                  <small>★ {review.rating}</small>
                </button>
              ))}

              {group.key === 'posts' && results.posts.map((post) => (
                <button
                  key={post.postId} type="button" className="adm-search__hit"
                  onClick={() => go(`/admin/posts?search=${encodeURIComponent(term.trim())}`)}
                >
                  <span className="adm-clamp" style={{ maxWidth: 260 }}>{post.snippet}</span>
                  <small>@{post.username}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
