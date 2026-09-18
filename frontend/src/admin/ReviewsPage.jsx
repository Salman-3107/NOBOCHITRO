import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listReviews, deleteReview } from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  ConfirmModal, Thumb, Avatar, formatNumber, formatDate,
} from './components/AdminUI';

// Review moderation. Review's primary key is (UserID, MovieID) -- a user can
// only review a film once -- so every row is identified by that pair rather
// than a single id.
export default function ReviewsPage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } =
    useAdminResource(listReviews, {
      page: 1, limit: 20, sort: 'date', order: 'desc',
      movieId: urlParams.get('movieId') || '',
      userId: urlParams.get('userId') || '',
    });

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteReview(pendingDelete.userId, pendingDelete.movieId);
      toast.success('Review removed successfully.');
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
      key: 'user',
      label: 'User',
      sortable: true,
      render: (review) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={review.profilePictureUrl} name={review.username} />
          <Link className="adm-link" to={`/admin/users/${review.userId}`}>
            {review.displayName || review.username}
          </Link>
        </span>
      ),
    },
    {
      key: 'movie',
      label: 'Movie',
      sortable: true,
      render: (review) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Thumb src={review.posterUrl} label={review.title?.charAt(0)} />
          <Link className="adm-link adm-table__strong" to={`/admin/movies/${review.movieId}`}>
            {review.title}
          </Link>
        </span>
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      sortable: true,
      render: (review) => <span className="adm-star">★ {review.rating}</span>,
    },
    {
      key: 'text',
      label: 'Review',
      // ReviewText is a CLOB; the server sends a capped preview so a page of
      // twenty rows doesn't ship twenty full essays.
      render: (review) => (
        review.snippet
          ? <span className="adm-clamp">{review.snippet}</span>
          : <span style={{ color: 'var(--text-faint)' }}>Rating only</span>
      ),
    },
    { key: 'date', label: 'Date', sortable: true, render: (review) => formatDate(review.reviewDate) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (review) => (
        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setPendingDelete(review)}>
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Reviews" subtitle={data ? `${formatNumber(data.total)} matching entries` : 'Loading…'} />

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search review text, movie or user…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search reviews"
        />
        <select
          className="adm-select" value={params.rating || ''}
          onChange={(event) => setFilter({ rating: event.target.value })}
          aria-label="Filter by rating"
        >
          <option value="">Any rating</option>
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((score) => (
            <option key={score} value={score}>★ {score}</option>
          ))}
        </select>
        <select
          className="adm-select" value={params.hasText || ''}
          onChange={(event) => setFilter({ hasText: event.target.value })}
          aria-label="Filter by review text"
        >
          <option value="">Ratings and reviews</option>
          <option value="true">Written reviews only</option>
          <option value="false">Ratings without text</option>
        </select>
        {(params.movieId || params.userId) && (
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--ghost"
            onClick={() => setFilter({ movieId: '', userId: '' })}
          >
            Clear filter
          </button>
        )}
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(review) => `${review.userId}-${review.movieId}`}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={<EmptyState icon="★" title="No reviews match those filters" />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="reviews"
          />
        </>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete review?"
          message={`${pendingDelete.username}'s review of "${pendingDelete.title}" will be permanently removed, along with their ${pendingDelete.rating}/10 rating — the score and the text are the same row.`}
          confirmLabel="Delete review"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
