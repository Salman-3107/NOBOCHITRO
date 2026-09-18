import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listComments, deleteComment } from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  ConfirmModal, Avatar, formatNumber, formatDate,
} from './components/AdminUI';

export default function CommentsPage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } =
    useAdminResource(listComments, {
      page: 1, limit: 20, sort: 'date', order: 'desc',
      postId: urlParams.get('postId') || '',
      userId: urlParams.get('userId') || '',
    });

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteComment(pendingDelete.commentId);
      toast.success('Comment removed successfully.');
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
      render: (comment) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={comment.profilePictureUrl} name={comment.username} />
          <Link className="adm-link" to={`/admin/users/${comment.userId}`}>
            {comment.displayName || comment.username}
          </Link>
        </span>
      ),
    },
    { key: 'text', label: 'Comment', render: (comment) => <span className="adm-clamp">{comment.preview}</span> },
    {
      key: 'post',
      label: 'On post',
      render: (comment) => (
        <Link className="adm-link" to={`/admin/comments?postId=${comment.postId}`}>
          <span className="adm-clamp" style={{ maxWidth: 240 }}>
            {comment.postPreview || `Post #${comment.postId}`}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>by @{comment.postAuthor}</span>
        </Link>
      ),
    },
    { key: 'date', label: 'Posted', sortable: true, render: (comment) => formatDate(comment.commentDate) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (comment) => (
        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setPendingDelete(comment)}>
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Comments" subtitle={data ? `${formatNumber(data.total)} comments` : 'Loading…'} />

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search comment text or author…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search comments"
        />
        {(params.postId || params.userId) && (
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--ghost"
            onClick={() => setFilter({ postId: '', userId: '' })}
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
            rowKey={(comment) => comment.commentId}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={<EmptyState icon="🗨" title="No comments match those filters" />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="comments"
          />
        </>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete comment?"
          message={`This comment by ${pendingDelete.username} will be permanently removed. The post it replies to is kept.`}
          confirmLabel="Delete comment"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
