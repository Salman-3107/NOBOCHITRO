import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listAdminMovies, getMovieFilters, getMovieDependencies, deleteAdminMovie,
} from '../api/admin';
import { getMovie } from '../api/movies';
import MovieFormModal from './MovieFormModal';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  ConfirmModal, Thumb, formatNumber,
} from './components/AdminUI';

// The movie catalogue. Server-side paged, searched, filtered and sorted --
// with a few thousand titles, pulling the whole table to show twenty rows is
// the difference between a dashboard that feels instant and one that doesn't.
export default function MoviesPage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(urlParams.get('search') || '');
  const debouncedSearch = useDebounced(searchInput);

  const [filterOptions, setFilterOptions] = useState(null);
  const [formState, setFormState] = useState(null);   // null | { mode, movie? }
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const resource = useAdminResource(listAdminMovies, {
    page: 1, limit: 20, sort: 'added', order: 'desc',
    search: urlParams.get('search') || '',
  });
  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } = resource;

  // The dropdowns offer only what the catalogue actually contains, rather than
  // a hard-coded country list that goes stale the moment a film is added.
  useEffect(() => {
    getMovieFilters().then(setFilterOptions).catch(() => setFilterOptions(null));
  }, []);

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // Only the debounced term should drive a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function openEdit(movieId) {
    try {
      // getMovie returns the UPPERCASE-key shape (plus a `genres` array) that
      // MovieFormModal already expects -- reused directly rather than
      // reshaping the paginated row, which omits synopsis.
      const full = await getMovie(movieId);
      setFormState({ mode: 'edit', movie: { ...full, MOVIEID: full.MOVIEID ?? movieId } });
    } catch (err) {
      toast.error(`Couldn't load that movie: ${err.message}`);
    }
  }

  // The delete never fires straight from the button. The dependency counts are
  // fetched first so the confirmation shows what the cascade will actually
  // take -- reviews, journal entries, bucket lists -- instead of a vague
  // "this cannot be undone".
  async function askDelete(movie) {
    setPendingDelete({ movie, impact: null });
    try {
      const dependencies = await getMovieDependencies(movie.movieId);
      setPendingDelete({ movie, ...dependencies });
    } catch {
      setPendingDelete({ movie, cascades: [], detaches: [] });
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteAdminMovie(pendingDelete.movie.movieId);
      toast.success(`"${pendingDelete.movie.title}" deleted.`);
      setPendingDelete(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    {
      key: 'poster',
      label: 'Poster',
      render: (movie) => <Thumb src={movie.posterUrl} alt="" label={movie.title?.charAt(0)} />,
    },
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (movie) => (
        <Link className="adm-link adm-table__strong" to={`/admin/movies/${movie.movieId}`}>
          {movie.title}
        </Link>
      ),
    },
    { key: 'year', label: 'Year', sortable: true, render: (movie) => movie.releaseYear ?? '—' },
    { key: 'runtime', label: 'Runtime', sortable: true, render: (movie) => (movie.runtime ? `${movie.runtime} min` : '—') },
    { key: 'language', label: 'Language', render: (movie) => movie.language || '—' },
    { key: 'country', label: 'Country', render: (movie) => movie.country || '—' },
    {
      key: 'rating',
      label: 'Avg rating',
      sortable: true,
      // Derived from Review every time it is read. There is no stored average
      // on Movie, and adding one would mean a denormalised counter to keep in
      // step with every rating insert, update and delete.
      render: (movie) => (movie.avgRating
        ? <span className="adm-star">★ {movie.avgRating}</span>
        : <span style={{ color: 'var(--text-faint)' }}>Unrated</span>),
    },
    { key: 'reviews', label: 'Reviews', sortable: true, render: (movie) => formatNumber(movie.reviewCount) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (movie) => (
        <>
          <Link className="adm-btn adm-btn--sm adm-btn--ghost" to={`/admin/movies/${movie.movieId}`}>View</Link>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => openEdit(movie.movieId)}>Edit</button>
          <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => askDelete(movie)}>Delete</button>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Movies"
        subtitle={data ? `${formatNumber(data.total)} titles in the catalogue` : 'Loading…'}
      >
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => setFormState({ mode: 'create' })}>
          + Add movie
        </button>
      </PageHeader>

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search title, language or country…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search movies"
        />

        <select
          className="adm-select" value={params.genre || ''}
          onChange={(event) => setFilter({ genre: event.target.value })}
          aria-label="Filter by genre"
        >
          <option value="">All genres</option>
          {filterOptions?.genres.map((genre) => (
            <option key={genre.genreId} value={genre.genreName}>{genre.genreName}</option>
          ))}
        </select>

        <select
          className="adm-select" value={params.year || ''}
          onChange={(event) => setFilter({ year: event.target.value })}
          aria-label="Filter by year"
        >
          <option value="">All years</option>
          {filterOptions?.years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>

        <select
          className="adm-select" value={params.language || ''}
          onChange={(event) => setFilter({ language: event.target.value })}
          aria-label="Filter by language"
        >
          <option value="">All languages</option>
          {filterOptions?.languages.map((language) => (
            <option key={language} value={language}>{language}</option>
          ))}
        </select>

        <select
          className="adm-select" value={params.country || ''}
          onChange={(event) => setFilter({ country: event.target.value })}
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
          {filterOptions?.countries.map((country) => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>

        <select
          className="adm-select" value={params.minRating || ''}
          onChange={(event) => setFilter({ minRating: event.target.value })}
          aria-label="Filter by minimum rating"
        >
          <option value="">Any rating</option>
          {[9, 8, 7, 6, 5].map((score) => (
            <option key={score} value={score}>{score}+ average</option>
          ))}
        </select>
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(movie) => movie.movieId}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={
              <EmptyState
                icon="🎬"
                title="No movies match those filters"
                message="Try clearing the search box or widening the year and genre filters."
              />
            }
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="movies"
          />
        </>
      )}

      {formState && (
        <MovieFormModal
          mode={formState.mode}
          movie={formState.movie}
          genres={filterOptions?.genres.map((genre) => ({
            GENREID: genre.genreId, GENRENAME: genre.genreName,
          })) || []}
          onClose={() => setFormState(null)}
          onSaved={() => {
            toast.success(formState.mode === 'create' ? 'Movie added successfully.' : 'Movie updated successfully.');
            setFormState(null);
            refresh();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete movie?"
          message={`"${pendingDelete.movie.title}" (${pendingDelete.movie.releaseYear}) will be removed. These related records are deleted with it:`}
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
