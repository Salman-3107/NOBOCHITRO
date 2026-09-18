import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  listCredits, createCredit, deleteCredit,
  listAdminMovies, listAdminPeople, getMovieFilters,
} from '../api/admin';
import EntityPicker from './components/EntityPicker';
import { useToast } from '../components/Toast';
import { useAdminResource, useDebounced } from './hooks/useAdminResource';
import {
  PageHeader, DataTable, Pagination, TableSkeleton, ErrorState, EmptyState,
  Modal, ConfirmModal, StatusBadge, Thumb, Avatar, formatNumber,
} from './components/AdminUI';

// The Movie <-> Person <-> Role relationship, managed directly.
//
// RoleType is constrained by ck_moviecredit_roletype to Actor, Director and
// Writer. The brief also mentions Producer, Cinematographer and Composer --
// those need the CHECK constraint widened first, so the dropdown is built from
// what the server reports rather than from a hopeful hard-coded list.
export default function CreditsPage() {
  const toast = useToast();
  const [urlParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput);

  const [roleTypes, setRoleTypes] = useState(['Actor', 'Director', 'Writer']);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ movie: null, person: null, roleType: 'Actor', characterName: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { params, data, status, errorMessage, setFilter, setPage, setSort, refresh } =
    useAdminResource(listCredits, {
      page: 1, limit: 20, sort: 'movie', order: 'asc',
      movieId: urlParams.get('movieId') || '',
      personId: urlParams.get('personId') || '',
    });

  useEffect(() => {
    getMovieFilters().then((options) => setRoleTypes(options.roleTypes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (debouncedSearch !== params.search) setFilter({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function resetDraft() {
    setDraft({ movie: null, person: null, roleType: 'Actor', characterName: '' });
    setFormError('');
  }

  async function save() {
    if (!draft.movie || !draft.person) {
      setFormError('Pick both a movie and a person.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      await createCredit({
        movieId: draft.movie.movieId,
        personId: draft.person.personId,
        roleType: draft.roleType,
        characterName: draft.roleType === 'Actor' ? draft.characterName.trim() || undefined : undefined,
      });
      toast.success('Credit added successfully.');
      // Kept open with the movie retained: adding a whole cast one person at a
      // time is the normal case, and reopening the modal for each is tedious.
      setDraft((current) => ({ ...current, person: null, characterName: '' }));
      refresh();
    } catch (err) {
      // pk_moviecredit already prevents a duplicate movie+person+role; the
      // server turns that into a readable sentence.
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteCredit({
        movieId: pendingDelete.movieId,
        personId: pendingDelete.personId,
        roleType: pendingDelete.roleType,
      });
      toast.success('Credit removed successfully.');
      setPendingDelete(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const columns = [
    { key: 'poster', label: '', render: (credit) => <Thumb src={credit.posterUrl} label={credit.title?.charAt(0)} /> },
    {
      key: 'movie',
      label: 'Movie',
      sortable: true,
      render: (credit) => (
        <Link className="adm-link adm-table__strong" to={`/admin/movies/${credit.movieId}`}>
          {credit.title} <span style={{ color: 'var(--text-faint)' }}>({credit.releaseYear})</span>
        </Link>
      ),
    },
    {
      key: 'person',
      label: 'Person',
      sortable: true,
      render: (credit) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar src={credit.photoUrl} name={credit.fullName} />
          {credit.fullName}
        </span>
      ),
    },
    { key: 'role', label: 'Role', sortable: true, render: (credit) => <StatusBadge status={credit.roleType} tone="info" /> },
    { key: 'character', label: 'Character', render: (credit) => credit.characterName || '—' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (credit) => (
        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setPendingDelete(credit)}>
          Remove
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Credits"
        subtitle={data ? `${formatNumber(data.total)} movie–person links` : 'Loading…'}
      >
        <button
          type="button" className="adm-btn adm-btn--primary"
          onClick={() => { resetDraft(); setAdding(true); }}
        >
          + Add credit
        </button>
      </PageHeader>

      <div className="adm-filters">
        <input
          type="search"
          className="adm-input adm-input--grow"
          placeholder="Search by movie title or person…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search credits"
        />
        <select
          className="adm-select" value={params.role || ''}
          onChange={(event) => setFilter({ role: event.target.value })}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {roleTypes.map((role) => <option key={role} value={role}>{role}</option>)}
        </select>
        {(params.movieId || params.personId) && (
          <button
            type="button" className="adm-btn adm-btn--sm adm-btn--ghost"
            onClick={() => setFilter({ movieId: '', personId: '' })}
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
            rowKey={(credit) => `${credit.movieId}-${credit.personId}-${credit.roleType}`}
            sort={params.sort}
            order={params.order}
            onSort={setSort}
            emptyState={<EmptyState icon="⛓" title="No credits yet" message="Link a person to a movie to build out the cast and crew." />}
          />
          <Pagination
            page={data.page} pageCount={data.pageCount} total={data.total}
            limit={data.limit} onPage={setPage} noun="credits"
          />
        </>
      )}

      {adding && (
        <Modal
          title="Add credit"
          onClose={() => setAdding(false)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setAdding(false)}>Done</button>
              <button type="button" className="adm-btn adm-btn--primary" onClick={save} disabled={saving}>
                {saving ? 'Adding…' : 'Add credit'}
              </button>
            </>
          }
        >
          <EntityPicker
            label="Movie" required
            placeholder="Type a movie title…"
            value={draft.movie}
            onChange={(movie) => setDraft((current) => ({ ...current, movie }))}
            search={(term) => listAdminMovies({ search: term, limit: 6 })}
            renderLabel={(movie) => `${movie.title} (${movie.releaseYear})`}
            renderHint={(movie) => movie.language || ''}
          />

          <EntityPicker
            label="Person" required
            placeholder="Type a name…"
            value={draft.person}
            onChange={(person) => setDraft((current) => ({ ...current, person }))}
            search={(term) => listAdminPeople({ search: term, limit: 6 })}
            renderLabel={(person) => person.fullName}
            renderHint={(person) => person.roles || 'No credits yet'}
          />

          <div className="adm-field-row">
            <label className="adm-field">
              <span>Role <span className="adm-req">*</span></span>
              <select
                className="adm-select" value={draft.roleType}
                onChange={(event) => setDraft((current) => ({ ...current, roleType: event.target.value }))}
              >
                {roleTypes.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>

            {/* CharacterName only means anything for an actor -- a director
                doesn't play a part, and leaving the field visible invites
                nonsense data. */}
            {draft.roleType === 'Actor' && (
              <label className="adm-field">
                <span>Character name</span>
                <input
                  className="adm-input" value={draft.characterName}
                  onChange={(event) => setDraft((current) => ({ ...current, characterName: event.target.value }))}
                  placeholder="e.g. Apu"
                />
              </label>
            )}
          </div>

          {formError && <p className="adm-field__error" role="alert">{formError}</p>}
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          danger
          title="Remove credit?"
          message={`${pendingDelete.fullName} will no longer be credited as ${pendingDelete.roleType} on "${pendingDelete.title}". Neither the movie nor the person record is affected.`}
          confirmLabel="Remove credit"
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
