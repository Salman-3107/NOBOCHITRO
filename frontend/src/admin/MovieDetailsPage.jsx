import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getAdminMovie, getMovieFilters, setMovieGenres, getMovieDependencies, deleteAdminMovie,
} from '../api/admin';
import { getMovie } from '../api/movies';
import MovieFormModal from './MovieFormModal';
import { useToast } from '../components/Toast';
import {
  PageHeader, StatCard, ErrorState, EmptyState, ConfirmModal, Modal,
  StatusBadge, Avatar, formatNumber, formatDate,
} from './components/AdminUI';
import { ColumnChart } from './components/Charts';

// Everything an admin needs about one title on one screen: the record itself,
// what the community has done with it, and the controls to change it.
export default function MovieDetailsPage() {
  const { movieId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [editing, setEditing] = useState(null);
  const [genreEditor, setGenreEditor] = useState(null);   // null | number[]
  const [allGenres, setAllGenres] = useState([]);
  const [savingGenres, setSavingGenres] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setData(await getAdminMovie(movieId));
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, [movieId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getMovieFilters().then((options) => setAllGenres(options.genres)).catch(() => setAllGenres([]));
  }, []);

  async function openEdit() {
    try {
      const full = await getMovie(movieId);
      setEditing({ ...full, MOVIEID: full.MOVIEID ?? Number(movieId) });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveGenres() {
    setSavingGenres(true);
    try {
      await setMovieGenres(movieId, genreEditor);
      toast.success('Genres updated successfully.');
      setGenreEditor(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingGenres(false);
    }
  }

  async function askDelete() {
    setPendingDelete({ impact: null });
    try {
      setPendingDelete(await getMovieDependencies(movieId));
    } catch {
      setPendingDelete({ cascades: [], detaches: [] });
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteAdminMovie(movieId);
      toast.success('Movie deleted successfully.');
      // Nothing left to show on this route, so go back to the list rather
      // than leaving a detail page pointed at a row that no longer exists.
      navigate('/admin/movies', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  if (status === 'loading') {
    return (
      <>
        <PageHeader title="Loading movie…" />
        <span className="adm-skel" style={{ height: 220, borderRadius: 'var(--radius-lg)' }} />
      </>
    );
  }

  if (status === 'error') {
    return (
      <>
        <PageHeader title="Movie" />
        <ErrorState message={errorMessage} onRetry={load} />
      </>
    );
  }

  const { movie, genres, credits, stats, ratingSpread, recentReviews } = data;
  const byRole = (role) => credits.filter((credit) => credit.roleType === role);

  return (
    <>
      <PageHeader title={movie.title} subtitle={`Movie #${movie.movieId}`}>
        <Link className="adm-btn adm-btn--ghost" to="/admin/movies">← All movies</Link>
        <button type="button" className="adm-btn" onClick={openEdit}>Edit</button>
        <button type="button" className="adm-btn adm-btn--danger" onClick={askDelete}>Delete</button>
      </PageHeader>

      <section className="adm-panel">
        <div className="adm-hero">
          {movie.posterUrl
            ? <img className="adm-hero__poster" src={movie.posterUrl} alt="" />
            : <span className="adm-hero__poster adm-thumb--empty">{movie.title.charAt(0)}</span>}

          <div className="adm-hero__body">
            <h1>{movie.title}</h1>
            <p className="adm-hero__meta">
              {[
                movie.releaseYear,
                movie.runtime ? `${movie.runtime} min` : null,
                movie.language,
                movie.country,
              ].filter(Boolean).join(' · ') || 'No metadata recorded'}
            </p>

            <div className="adm-hero__tags">
              {stats.avgRating
                ? <StatusBadge status={`★ ${stats.avgRating} average`} tone="warn" />
                : <StatusBadge status="Unrated" tone="neutral" />}
              {genres.map((genre) => (
                <StatusBadge key={genre.genreId} status={genre.genreName} tone="neutral" />
              ))}
              <button
                type="button"
                className="adm-btn adm-btn--sm adm-btn--ghost"
                onClick={() => setGenreEditor(genres.map((genre) => genre.genreId))}
              >
                Edit genres
              </button>
            </div>

            <p className="adm-hero__synopsis">{movie.synopsis || 'No synopsis recorded.'}</p>

            {movie.trailerUrl && (
              <p style={{ marginTop: 10 }}>
                <a className="adm-link" href={movie.trailerUrl} target="_blank" rel="noreferrer">
                  Open trailer ↗
                </a>
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="adm-cards">
        <StatCard label="Total ratings" value={formatNumber(stats.ratingCount)} />
        <StatCard label="Written reviews" value={formatNumber(stats.reviewCount)} />
        <StatCard label="Average rating" value={stats.avgRating ? `★ ${stats.avgRating}` : '—'} />
        <StatCard label="On bucket lists" value={formatNumber(stats.bucketListCount)} />
        <StatCard label="People who watched" value={formatNumber(stats.watchedByCount)} />
        <StatCard label="Journal entries" value={formatNumber(stats.journalCount)} hint="Includes rewatches" />
        <StatCard label="Community posts" value={formatNumber(stats.postCount)} />
      </section>

      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Rating spread</h2>
          </div>
          {stats.ratingCount === 0 ? (
            <EmptyState icon="★" title="Nobody has rated this yet" />
          ) : (
            <ColumnChart
              gold
              bars={ratingSpread.map((entry) => ({ label: String(entry.score), value: entry.count }))}
            />
          )}
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>Cast &amp; crew</h2>
            <Link className="adm-btn adm-btn--sm adm-btn--ghost" to={`/admin/credits?movieId=${movie.movieId}`}>
              Manage credits
            </Link>
          </div>

          {credits.length === 0 ? (
            <EmptyState icon="☻" title="No credits recorded" message="Add directors, writers and cast from the Credits screen." />
          ) : (
            ['Director', 'Writer', 'Actor'].map((role) => (
              byRole(role).length > 0 && (
                <div key={role} style={{ marginBottom: 12 }}>
                  <p className="adm-panel__note" style={{ marginBottom: 6 }}>{role}s</p>
                  <div className="adm-people">
                    {byRole(role).map((credit) => (
                      <div className="adm-person" key={`${credit.personId}-${credit.roleType}`}>
                        <Avatar src={credit.photoUrl} name={credit.fullName} />
                        <span>
                          <strong>{credit.fullName}</strong>
                          {credit.characterName && <span>as {credit.characterName}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))
          )}
        </section>
      </div>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>Recent reviews</h2>
          <Link className="adm-btn adm-btn--sm adm-btn--ghost" to={`/admin/reviews?movieId=${movie.movieId}`}>
            Moderate all
          </Link>
        </div>

        {recentReviews.length === 0 ? (
          <EmptyState icon="✍" title="No reviews yet" />
        ) : (
          <ul className="adm-feed">
            {recentReviews.map((review) => (
              <li key={review.userId} style={{ alignItems: 'flex-start' }}>
                <span className="adm-star">★ {review.rating}</span>
                <span>
                  <Link className="adm-link" to={`/admin/users/${review.userId}`}>
                    <strong>{review.displayName || review.username}</strong>
                  </Link>
                  {review.snippet && <span className="adm-clamp" style={{ marginTop: 3 }}>{review.snippet}</span>}
                </span>
                <time>{formatDate(review.reviewDate)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <MovieFormModal
          mode="edit"
          movie={editing}
          genres={allGenres.map((genre) => ({ GENREID: genre.genreId, GENRENAME: genre.genreName }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success('Movie updated successfully.');
            setEditing(null);
            load();
          }}
        />
      )}

      {genreEditor !== null && (
        <Modal
          title="Edit genres"
          onClose={() => setGenreEditor(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setGenreEditor(null)}>Cancel</button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={saveGenres} disabled={savingGenres}>
                {savingGenres ? 'Saving…' : 'Save genres'}
              </button>
            </>
          }
        >
          <p>Unticking a genre removes the link between this movie and that genre. The genre itself is untouched.</p>
          <div className="adm-checks">
            {allGenres.map((genre) => {
              const on = genreEditor.includes(genre.genreId);
              return (
                <label className={`adm-check ${on ? 'adm-check--on' : ''}`} key={genre.genreId}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setGenreEditor((current) => (
                      current.includes(genre.genreId)
                        ? current.filter((id) => id !== genre.genreId)
                        : [...current, genre.genreId]
                    ))}
                  />
                  {genre.genreName}
                </label>
              );
            })}
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete movie?"
          message={`"${movie.title}" will be removed. These related records are deleted with it:`}
          impact={pendingDelete.cascades}
          detaches={pendingDelete.detaches}
          confirmLabel="Delete movie"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
