import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listAdminPeople, createPerson, updatePerson, deletePerson, getMovieFilters,
} from '../api/admin';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  Modal, ConfirmModal, Avatar, formatNumber, formatDate,
} from './components/AdminUI';

const EMPTY_PERSON = { fullName: '', dateOfBirth: '', bio: '', photoUrl: '' };

// Actors, directors and writers. Person has no "profession" column, so the
// roles shown per row are derived from the credits that actually exist rather
// than stored twice and allowed to drift.
export default function PeoplePage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(urlParams.get('search') || '');
  const debouncedSearch = useDebounced(searchInput);

  const [roleTypes, setRoleTypes] = useState(['Actor', 'Director', 'Writer']);
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } =
    useAdminResource(listAdminPeople, {
      page: 1, limit: 20, sort: 'name', order: 'asc',
      search: urlParams.get('search') || '',
    });

  useEffect(() => {
    getMovieFilters().then((options) => setRoleTypes(options.roleTypes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function save() {
    if (!editor.fullName.trim()) {
      setFormError('A name is required.');
      return;
    }

    setSaving(true);
    setFormError('');
    const payload = {
      fullName: editor.fullName.trim(),
      dateOfBirth: editor.dateOfBirth || undefined,
      bio: editor.bio?.trim() || undefined,
      photoUrl: editor.photoUrl?.trim() || undefined,
    };

    try {
      if (editor.personId) {
        await updatePerson(editor.personId, payload);
        toast.success('Person updated successfully.');
      } else {
        await createPerson(payload);
        toast.success('Person added successfully.');
      }
      setEditor(null);
      refresh();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Same two-step as genres: fk_moviecredit_person cascades, so deleting
  // someone quietly removes them from every film they worked on.
  async function confirmDelete() {
    setDeleting(true);
    try {
      await deletePerson(pendingDelete.personId, { force: pendingDelete.movieCount > 0 });
      toast.success('Person deleted successfully.');
      setPendingDelete(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { key: 'photo', label: 'Photo', render: (person) => <Avatar src={person.photoUrl} name={person.fullName} /> },
    { key: 'name', label: 'Name', sortable: true, render: (person) => <span className="adm-table__strong">{person.fullName}</span> },
    {
      key: 'roles',
      label: 'Credited as',
      render: (person) => person.roles || <span style={{ color: 'var(--text-faint)' }}>No credits</span>,
    },
    {
      key: 'movies',
      label: 'Movies',
      sortable: true,
      render: (person) => (
        person.movieCount > 0
          ? <Link className="adm-link" to={`/admin/credits?personId=${person.personId}`}>{formatNumber(person.movieCount)}</Link>
          : <span style={{ color: 'var(--text-faint)' }}>0</span>
      ),
    },
    { key: 'dob', label: 'Born', render: (person) => formatDate(person.dateOfBirth) },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (person) => (
        <>
          <button
            type="button" className="adm-btn adm-btn--sm"
            onClick={() => {
              setFormError('');
              setEditor({
                ...person,
                // <input type="date"> only accepts yyyy-MM-dd, and Oracle
                // hands back a full ISO timestamp.
                dateOfBirth: person.dateOfBirth ? String(person.dateOfBirth).slice(0, 10) : '',
                bio: person.bio || '',
                photoUrl: person.photoUrl || '',
              });
            }}
          >
            Edit
          </button>
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--danger"
            onClick={() => setPendingDelete(person)}
          >
            Delete
          </button>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="People" subtitle={data ? `${formatNumber(data.total)} cast and crew records` : 'Loading…'}>
        <button
          type="button" className="adm-btn adm-btn--primary"
          onClick={() => { setFormError(''); setEditor({ ...EMPTY_PERSON }); }}
        >
          + Add person
        </button>
      </PageHeader>

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search by name…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search people"
        />
        <select
          className="adm-select" value={params.role || ''}
          onChange={(event) => setFilter({ role: event.target.value })}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {roleTypes.map((role) => <option key={role} value={role}>{role}s</option>)}
        </select>
      </div>

      {status === 'loading' && <TableSkeleton rows={8} />}
      {status === 'error' && <ErrorState message={errorMessage} onRetry={refresh} />}

      {data && status !== 'loading' && (
        <>
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(person) => person.personId}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={<EmptyState icon="☻" title="No people match that search" />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="people"
          />
        </>
      )}

      {editor && (
        <Modal
          title={editor.personId ? `Edit ${editor.fullName}` : 'Add person'}
          onClose={() => setEditor(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setEditor(null)}>Cancel</button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save person'}
              </button>
            </>
          }
        >
          <label className="adm-field">
            <span>Full name <span className="adm-req">*</span></span>
            <input
              className="adm-input" value={editor.fullName} autoFocus
              onChange={(event) => setEditor((current) => ({ ...current, fullName: event.target.value }))}
              placeholder="e.g. Satyajit Ray"
            />
          </label>

          <div className="adm-field-row">
            <label className="adm-field">
              <span>Date of birth</span>
              <input
                type="date" className="adm-input" value={editor.dateOfBirth}
                onChange={(event) => setEditor((current) => ({ ...current, dateOfBirth: event.target.value }))}
              />
            </label>
            <label className="adm-field">
              <span>Photo URL</span>
              <input
                className="adm-input" value={editor.photoUrl}
                onChange={(event) => setEditor((current) => ({ ...current, photoUrl: event.target.value }))}
                placeholder="https://…"
              />
            </label>
          </div>

          <label className="adm-field">
            <span>Biography</span>
            <textarea
              className="adm-textarea" value={editor.bio}
              onChange={(event) => setEditor((current) => ({ ...current, bio: event.target.value }))}
            />
          </label>

          {formError && <p className="adm-field__error" role="alert">{formError}</p>}
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Delete person?"
          message={
            pendingDelete.movieCount > 0
              ? `${pendingDelete.fullName} is credited on ${formatNumber(pendingDelete.movieCount)} movie(s). Deleting them removes those credits. The movies themselves are kept.`
              : `${pendingDelete.fullName} has no credits and can be removed safely.`
          }
          impact={[{ label: 'Credits removed', count: pendingDelete.movieCount }]}
          confirmLabel="Delete person"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
