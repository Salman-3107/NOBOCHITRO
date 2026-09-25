import { useEffect, useMemo, useRef, useState } from 'react';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import JournalEntryModal from '../components/JournalEntryModal';
import { createJournalEntry, getUserJournal, searchMovies } from '../api/movies';
import './JournalPage.css';

const MOODS = [
  '😍 Loved it', '🥹 Emotional', '😂 Fun', '😱 Terrifying',
  '🤯 Mind-blown', '❤️ Comfort movie', '😔 Melancholic', '🔥 Absolutely insane',
];

// Client-side only -- every filter here reads fields the journal endpoint
// already returns, so none of this needs a new API call or a DB change.
const FILTERS = [
  { key: 'all', label: 'All Entries' },
  { key: 'year', label: 'This Year' },
  { key: 'month', label: 'This Month' },
  { key: 'rewatches', label: 'Rewatches' },
  { key: 'public', label: 'Public' },
];

const blankForm = () => ({
  watchDate: new Date().toISOString().slice(0, 10),
  moodAfter: '',
  watchLocation: '',
  watchedWith: 'Alone',
  privacy: 'Private',
  journalText: '',
  favoriteScene: '',
});

function formatMonthLabel(dateValue) {
  return new Date(dateValue)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    .toUpperCase();
}

function formatDayLabel(dateValue) {
  return new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function JournalPage({ user, onLogout, onNavigate, onSelectMovie }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [movieQuery, setMovieQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const movieSearchRef = useRef(null);
  const [movie, setMovie] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [openEntry, setOpenEntry] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setEntries(await getUserJournal(user.userId));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const query = movieQuery.replace(/^#\s*/, '').trim();
    if (!query) { setResults([]); return; }
    const timer = setTimeout(
      () => searchMovies(query).then((d) => { setResults(d.movies || []); setActiveSuggestion(0); }).catch(() => setResults([])),
      180,
    );
    return () => clearTimeout(timer);
  }, [movieQuery]);

  function chooseMovie(item) {
    setMovie(item);
    setMovieQuery(`#${item.TITLE}`);
    setResults([]);
    movieSearchRef.current?.blur();
  }

  function handleMovieKeys(event) {
    if (!results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveSuggestion((i) => (i + 1) % results.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSuggestion((i) => (i - 1 + results.length) % results.length); }
    if (event.key === 'Enter') { event.preventDefault(); chooseMovie(results[activeSuggestion]); }
    if (event.key === 'Escape') setResults([]);
  }

  async function submit(event) {
    event.preventDefault();
    if (!movie) { setError('Select the movie you watched first.'); return; }
    setSaving(true);
    try {
      await createJournalEntry(movie.MOVIEID, form);
      setOpen(false);
      setMovie(null);
      setMovieQuery('');
      setForm(blankForm());
      setError('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Only stats the data actually supports -- average rating and total watch
  // time aren't columns the journal endpoint returns, so they're left out
  // rather than faked (see the redesign brief: no DB changes for this pass).
  const stats = useMemo(() => ({
    total: entries.length,
    rewatches: entries.filter((e) => e.REWATCHNUMBER > 1).length,
    publicCount: entries.filter((e) => e.PRIVACY === 'Public').length,
  }), [entries]);

  const visibleEntries = useMemo(() => {
    const now = new Date();
    const q = memoryQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      const watched = new Date(entry.WATCHDATE);
      if (filter === 'year' && watched.getFullYear() !== now.getFullYear()) return false;
      if (filter === 'month' && (watched.getFullYear() !== now.getFullYear() || watched.getMonth() !== now.getMonth())) return false;
      if (filter === 'rewatches' && !(entry.REWATCHNUMBER > 1)) return false;
      if (filter === 'public' && entry.PRIVACY !== 'Public') return false;
      if (q) {
        const haystack = `${entry.MOVIETITLE} ${entry.JOURNALTEXT || ''} ${entry.FAVORITESCENE || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filter, memoryQuery]);

  // Entries already arrive sorted by WatchDate DESC, so grouping is a
  // single pass -- start a new month group whenever the year/month changes.
  const monthGroups = useMemo(() => {
    const groups = [];
    let lastKey = null;
    for (const entry of visibleEntries) {
      const watched = new Date(entry.WATCHDATE);
      const key = `${watched.getFullYear()}-${watched.getMonth()}`;
      if (key !== lastKey) {
        groups.push({ key, label: formatMonthLabel(entry.WATCHDATE), entries: [] });
        lastKey = key;
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [visibleEntries]);

  return (
    <div className="journal-page">
      <Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} activePage="journal" onNavigate={onNavigate} />
      <main className="journal-page__wrap">
        <header className="journal-hero">
          <div className="journal-hero__top">
            <div className="journal-hero__text">
              <p className="journal-hero__eyebrow">Personal Archive</p>
              <h1>My Movie Journal</h1>
              <span>A collection of stories I&rsquo;ve watched, felt, and remembered.</span>
            </div>
            <button type="button" className="journal-hero__cta" onClick={() => setOpen(true)}>
              + Add Journal Entry
            </button>
          </div>

          {stats.total > 0 && (
            <dl className="journal-hero__stats">
              <div className="journal-hero__stat">
                <dt>{stats.total}</dt>
                <dd>{stats.total === 1 ? 'Movie logged' : 'Movies logged'}</dd>
              </div>
              <span className="journal-hero__divider" aria-hidden="true" />
              <div className="journal-hero__stat">
                <dt>{stats.rewatches}</dt>
                <dd>{stats.rewatches === 1 ? 'Rewatch' : 'Rewatches'}</dd>
              </div>
              <span className="journal-hero__divider" aria-hidden="true" />
              <div className="journal-hero__stat">
                <dt>{stats.publicCount}</dt>
                <dd>Public stories</dd>
              </div>
            </dl>
          )}
        </header>

        {stats.total > 0 && (
          <div className="journal-controls">
            <div className="journal-filters" role="tablist" aria-label="Filter journal entries">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={filter === f.key ? 'journal-filter journal-filter--active' : 'journal-filter'}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              className="journal-memory-search"
              value={memoryQuery}
              onChange={(e) => setMemoryQuery(e.target.value)}
              placeholder="Search your memories…"
              aria-label="Search your journal"
            />
          </div>
        )}

        {!loading && stats.total === 0 && (
          <EmptyState
            icon="🎬"
            title="Your story starts here."
            message="Every great movie leaves something behind. Start keeping track of yours."
            actionLabel="Explore Movies"
            onAction={() => onNavigate('discover')}
          />
        )}

        {!loading && stats.total > 0 && visibleEntries.length === 0 && (
          <EmptyState compact icon="🔍" title="No memories match that." message="Try a different filter or search term." />
        )}

        {monthGroups.length > 0 && (
          <div className="journal-timeline">
            {monthGroups.map((group) => (
              <section className="journal-month" key={group.key}>
                <h2 className="journal-month__label">
                  <span className="journal-month__dot" aria-hidden="true" />
                  {group.label}
                </h2>
                <div className="journal-month__entries">
                  {group.entries.map((entry) => (
                    <article className="journal-entry" key={entry.JOURNALID}>
                      <button
                        type="button"
                        className="journal-entry__poster"
                        onClick={() => onSelectMovie(entry.MOVIEID)}
                        aria-label={`Open ${entry.MOVIETITLE}`}
                      >
                        {entry.POSTERURL
                          ? <img src={entry.POSTERURL} alt="" loading="lazy" />
                          : <span aria-hidden="true">🎬</span>}
                      </button>
                      <button
                        type="button"
                        className="journal-entry__body"
                        onClick={() => setOpenEntry(entry)}
                        aria-label={`Read full journal entry for ${entry.MOVIETITLE}`}
                      >
                        <span className="journal-entry__chevron" aria-hidden="true">›</span>
                        <p className="journal-entry__date">{formatDayLabel(entry.WATCHDATE)}</p>
                        <h3 className="journal-entry__title">{entry.MOVIETITLE}</h3>

                        <div className="journal-entry__meta">
                          {entry.MOODAFTER && <span className="journal-entry__chip journal-entry__chip--mood">{entry.MOODAFTER}</span>}
                          {entry.WATCHLOCATION && <span className="journal-entry__chip">📍 {entry.WATCHLOCATION}</span>}
                          {entry.REWATCHNUMBER > 1 && <span className="journal-entry__chip">↻ Rewatch #{entry.REWATCHNUMBER}</span>}
                          <span className="journal-entry__chip journal-entry__chip--privacy">
                            {entry.PRIVACY === 'Public' ? '🌎 Public' : '🔒 Only me'}
                          </span>
                        </div>

                        {entry.JOURNALTEXT
                          ? <blockquote className="journal-entry__quote">&ldquo;{entry.JOURNALTEXT}&rdquo;</blockquote>
                          : <p className="journal-entry__no-thoughts">No thoughts written for this watch.</p>}

                        {entry.FAVORITESCENE && (
                          <p className="journal-entry__scene">
                            <span>Favorite scene</span> {entry.FAVORITESCENE}
                          </p>
                        )}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {open && (
        <div className="journal-form-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <form className="journal-form-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="journal-form-modal__close" onClick={() => setOpen(false)} aria-label="Close">×</button>
            <p className="journal-form-modal__eyebrow">Record a movie experience</p>
            <h2>Tell the story behind this watch.</h2>

            <label>
              Tag a movie with #
              <input
                ref={movieSearchRef}
                value={movieQuery}
                onChange={(e) => setMovieQuery(e.target.value)}
                onKeyDown={handleMovieKeys}
                placeholder="#Interstellar…"
              />
            </label>

            {results.length > 0 && (
              <div className="movie-suggestions">
                <p className="movie-suggestions__label">
                  Select a movie <span>↑↓ select · Enter confirm</span>
                </p>
                {results.map((item, index) => (
                  <button
                    key={item.MOVIEID}
                    type="button"
                    className={index === activeSuggestion ? 'movie-suggestion movie-suggestion--active' : 'movie-suggestion'}
                    onMouseDown={(event) => { event.preventDefault(); chooseMovie(item); }}
                  >
                    {item.POSTERURL
                      ? <img src={item.POSTERURL} alt="" />
                      : <span className="movie-suggestions__icon" aria-hidden="true">🎬</span>}
                    <span>
                      <strong>{item.TITLE}</strong>
                      <small>{item.RELEASEYEAR || 'Film'} · Movie</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {movie && (
              <div className="journal-form-modal__selected">
                🎬 {movie.TITLE}
                <button type="button" onClick={() => setMovie(null)} aria-label="Remove selected movie">×</button>
              </div>
            )}

            <div className="journal-form-modal__grid">
              <label>
                Date watched
                <input type="date" value={form.watchDate} onChange={(e) => setForm({ ...form, watchDate: e.target.value })} />
              </label>
              <label>
                Privacy
                <select value={form.privacy} onChange={(e) => setForm({ ...form, privacy: e.target.value })}>
                  <option value="Private">🔒 Only me</option>
                  <option value="Public">🌎 Public</option>
                </select>
              </label>
              <label>
                Location
                <input value={form.watchLocation} onChange={(e) => setForm({ ...form, watchLocation: e.target.value })} placeholder="Cinema, home…" />
              </label>
              <label>
                Watched with
                <select value={form.watchedWith} onChange={(e) => setForm({ ...form, watchedWith: e.target.value })}>
                  <option>Alone</option>
                  <option>Friends</option>
                  <option>Family</option>
                  <option>Partner</option>
                </select>
              </label>
            </div>

            <p className="journal-form-modal__label">How did it make you feel?</p>
            <div className="journal-form-modal__moods">
              {MOODS.map((mood) => (
                <button
                  key={mood}
                  type="button"
                  className={form.moodAfter === mood ? 'journal-mood journal-mood--active' : 'journal-mood'}
                  onClick={() => setForm({ ...form, moodAfter: mood })}
                >
                  {mood}
                </button>
              ))}
            </div>

            <label>
              What stayed with you after the credits?
              <textarea
                rows="5"
                maxLength="3000"
                value={form.journalText}
                onChange={(e) => setForm({ ...form, journalText: e.target.value })}
                placeholder="What stayed with you after the credits?"
              />
            </label>

            <label>
              Favorite scene
              <input
                value={form.favoriteScene}
                onChange={(e) => setForm({ ...form, favoriteScene: e.target.value })}
                placeholder="The scene you'll never forget"
              />
            </label>

            {error && <span className="journal-form-modal__error">{error}</span>}
            <button className="journal-form-modal__submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save experience'}
            </button>
          </form>
        </div>
      )}

      {openEntry && (
        <JournalEntryModal
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          onOpenMovie={() => onSelectMovie(openEntry.MOVIEID)}
        />
      )}
    </div>
  );
}
