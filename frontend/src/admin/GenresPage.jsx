import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAdminGenres, createGenre, updateGenre, deleteGenre } from '../api/admin';
import { useToast } from '../components/Toast';
import {
  PageHeader, DataTable, TableSkeleton, ErrorState, EmptyState,
  Modal, ConfirmModal, formatNumber,
} from './components/AdminUI';

// Genres are a short list -- a few dozen at most -- so this one screen is not
// paginated. Everything else in the dashboard is.
export default function GenresPage() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [editor, setEditor] = useState(null);      // null | { genreId?, genreName }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await listAdminGenres();
      setRows(data.items);
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    const name = editor.genreName.trim();
    if (!name) {
      setFormError('Give the genre a name.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editor.genreId) {
        await updateGenre(editor.genreId, name);
        toast.success('Genre updated successfully.');
      } else {
        await createGenre(name);
        toast.success('Genre added successfully.');
      }
      setEditor(null);
      load();
    } catch (err) {
      // uq_genre_genrename gives a 409 here -- the server's own wording is
      // more useful than a generic "save failed".
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Two-step delete. fk_moviegenre_genre is ON DELETE CASCADE, so removing a
  // genre silently strips it from every film that used it. The first attempt
  // is refused by the server with a count; only then does the UI offer the
  // forced delete, with that number shown.
  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteGenre(pendingDelete.genreId, { force: pendingDelete.forced });
      toast.success('Genre deleted successfully.');
      setPendingDelete(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { key: 'name', label: 'Genre', render: (genre) => <span className="adm-table__strong">{genre.genreName}</span> },
    {
      key: 'movies',
      label: 'Movies using this genre',
      render: (genre) => (
        genre.movieCount > 0
          ? <Link className="adm-link" to={`/admin/movies?genre=${encodeURIComponent(genre.genreName)}`}>
            {formatNumber(genre.movieCount)}
          </Link>
          : <span style={{ color: 'var(--text-faint)' }}>0</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (genre) => (
        <>
          <button
            type="button" className="adm-btn adm-btn--sm"
            onClick={() => { setFormError(''); setEditor({ ...genre }); }}
          >
            Rename
          </button>
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--danger"
            onClick={() => setPendingDelete({ ...genre, forced: genre.movieCount > 0 })}
          >
            Delete
          </button>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Genres" subtitle={`${rows.length} genres in the catalogue`}>
        <button
          type="button" className="adm-btn adm-btn--primary"
          onClick={() => { setFormError(''); setEditor({ genreName: '' }); }}
        >
          + Add genre
        </button>
      </PageHeader>

      {status === 'loading' && <TableSkeleton rows={6} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={load} />}

      {status === 'ready' && (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(genre) => genre.genreId}
          emptyState={<EmptyState icon="◈" title="No genres yet" message="Add one to start categorising the catalogue." />}
        />
      )}

      {editor && (
        <Modal
          title={editor.genreId ? 'Rename genre' : 'Add genre'}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <label className="adm-field">
            <span>Genre name <span className="adm-req">*</span></span>
            <input
              className="adm-input"
              value={editor.genreName}
              autoFocus
              onChange={(event) => setEditor((current) => ({ ...current, genreName: event.target.value }))}
              onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
              placeholder="e.g. Neo-noir"
            />
            {formError && <p className="adm-field__error" role="alert">{formError}</p>}
          </label>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete genre?"
          message={
            pendingDelete.movieCount > 0
              ? `"${pendingDelete.genreName}" is used by ${formatNumber(pendingDelete.movieCount)} movie(s). Deleting it removes the genre from all of them. The movies themselves are kept.`
              : `"${pendingDelete.genreName}" isn't used by any movie and can be removed safely.`
          }
          impact={[{ label: 'Movies losing this genre', count: pendingDelete.movieCount }]}
          confirmLabel="Delete genre"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
