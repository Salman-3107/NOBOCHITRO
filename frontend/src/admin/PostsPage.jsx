import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listPosts, deletePost } from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  ConfirmModal, Avatar, formatNumber, formatDate,
} from './components/AdminUI';

// Moderation of the existing social feature -- posts, likes and comments.
// Nothing here creates a forum or discussion room; it inspects and removes
// what users have already posted.
export default function PostsPage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(urlParams.get('search') || '');
  const debouncedSearch = useDebounced(searchInput);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } =
    useAdminResource(listPosts, {
      page: 1, limit: 20, sort: 'date', order: 'desc',
      userId: urlParams.get('userId') || '',
      search: urlParams.get('search') || '',
    });

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deletePost(pendingDelete.postId);
      toast.success('Post removed successfully.');
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
      render: (post) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={post.profilePictureUrl} name={post.username} />
          <Link className="adm-link" to={`/admin/users/${post.userId}`}>
            {post.displayName || post.username}
          </Link>
        </span>
      ),
    },
    { key: 'text', label: 'Content', render: (post) => <span className="adm-clamp">{post.preview}</span> },
    {
      key: 'movie',
      label: 'About',
      render: (post) => (
        post.movieId
          ? <Link className="adm-link" to={`/admin/movies/${post.movieId}`}>{post.title}</Link>
          : <span style={{ color: 'var(--text-faint)' }}>Untagged</span>
      ),
    },
    { key: 'likes', label: 'Likes', sortable: true, render: (post) => formatNumber(post.likeCount) },
    {
      key: 'comments',
      label: 'Comments',
      sortable: true,
      render: (post) => (
        post.commentCount > 0
          ? <Link className="adm-link" to={`/admin/comments?postId=${post.postId}`}>{formatNumber(post.commentCount)}</Link>
          : <span style={{ color: 'var(--text-faint)' }}>0</span>
      ),
    },
    { key: 'date', label: 'Posted', sortable: true, render: (post) => formatDate(post.postDate) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (post) => (
        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setPendingDelete(post)}>
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Posts" subtitle={data ? `${formatNumber(data.total)} community posts` : 'Loading…'} />

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search post text or author…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search posts"
        />
        {params.userId && (
          <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => setFilter({ userId: '' })}>
            Clear user filter
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
            rowKey={(post) => post.postId}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={<EmptyState icon="💬" title="No posts match those filters" />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="posts"
          />
        </>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete post?"
          message={`This post by ${pendingDelete.username} will be permanently removed.`}
          // fk_postlike_post and fk_postcomment_post both cascade, so the
          // replies and likes go with it. The admin sees how many first.
          impact={[
            { label: 'Comments deleted with it', count: pendingDelete.commentCount },
            { label: 'Likes deleted with it', count: pendingDelete.likeCount },
          ]}
          confirmLabel="Delete post"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
