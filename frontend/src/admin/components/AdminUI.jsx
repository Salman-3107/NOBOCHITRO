import { useEffect } from 'react';

// ============================================================
// The small pieces every admin screen is built from. Keeping them in one file
// means a table on the Users page and a table on the Reviews page can't drift
// apart in padding, sort behaviour or empty-state wording -- and each page
// file stays short enough to read in one sitting.
// ============================================================


// ---------- Page header ----------

export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="adm-page__head">
      <div>
        <h1 className="adm-page__title">{title}</h1>
        {subtitle && <p className="adm-page__sub">{subtitle}</p>}
      </div>
      {children && <div className="adm-page__actions">{children}</div>}
    </header>
  );
}


// ---------- Stat card ----------

export function StatCard({ icon, label, value, hint, tone = 'muted' }) {
  return (
    <div className="adm-card">
      <div className="adm-card__top">
        <span>{label}</span>
        {icon && <span aria-hidden="true">{icon}</span>}
      </div>
      <strong className="adm-card__value">{value}</strong>
      {hint && <span className={`adm-card__hint adm-card__hint--${tone}`}>{hint}</span>}
    </div>
  );
}


// ---------- Badges ----------

// One place decides what colour a status is, so "Pending" is the same amber
// on the dashboard, in the reports queue and in the audit log.
const BADGE_TONES = {
  Draft: 'neutral',
  Scheduled: 'info',
  Active: 'success',
  Published: 'success',
  Completed: 'neutral',
  Archived: 'neutral',
  Pending: 'warn',
  Reviewed: 'info',
  Resolved: 'success',
  Rejected: 'danger',
  Admin: 'accent',
  User: 'neutral',
};

export function StatusBadge({ status, tone }) {
  const resolved = tone || BADGE_TONES[status] || 'neutral';
  return <span className={`adm-badge adm-badge--${resolved}`}>{status}</span>;
}


// ---------- Loading / empty / error ----------

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="adm-skel-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="adm-skel" style={{ height: 42 }} />
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }) {
  return (
    <div className="adm-cards" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="adm-skel" style={{ height: 92, borderRadius: 'var(--radius)' }} />
      ))}
    </div>
  );
}

// Nothing went wrong -- there is just nothing here yet. The copy points at
// what to do next rather than apologising.
export function EmptyState({ icon = '🎬', title, message, children }) {
  return (
    <div className="adm-state">
      <span className="adm-state__icon" aria-hidden="true">{icon}</span>
      <p className="adm-state__title">{title}</p>
      {message && <p>{message}</p>}
      {children}
    </div>
  );
}

// Something DID go wrong. Always offers a retry -- a dead end with no way
// back short of a page refresh is the worst version of an error screen.
export function ErrorState({ message, onRetry }) {
  return (
    <div className="adm-state">
      <span className="adm-state__icon" aria-hidden="true">⚠️</span>
      <p className="adm-state__title">That didn&apos;t load</p>
      <p role="alert">{message}</p>
      {onRetry && (
        <p style={{ marginTop: 14 }}>
          <button type="button" className="adm-btn" onClick={onRetry}>Try again</button>
        </p>
      )}
    </div>
  );
}

// Shown when an endpoint answers `available: false` -- the backing table from
// admin_dashboard_extensions.sql isn't there. Not an error, a missing install
// step, so it says which file to run rather than "something went wrong".
export function MigrationNotice({ feature, message }) {
  return (
    <div className="adm-notice">
      <strong>{feature} needs a schema update</strong>
      {message || (
        <>
          Run <code>database/admin_dashboard_extensions.sql</code> against the NOBOCHITRO
          database, then reload this page.
        </>
      )}
    </div>
  );
}


// ---------- Table ----------

// `columns` is [{ key, label, sortable?, align?, render(row) }].
// Sorting is lifted to the caller (and from there to the server) rather than
// done in the component, because the component only ever holds one page --
// sorting 20 of 1,284 rows locally would reorder the page, not the data.
export function DataTable({ columns, rows, rowKey, sort, order, onSort, emptyState }) {
  if (!rows || rows.length === 0) {
    return emptyState || <EmptyState title="Nothing here yet" />;
  }

  function headerClick(column) {
    if (!column.sortable || !onSort) return;
    // Clicking the active column flips direction; a new column starts on
    // descending, which is what someone scanning "most recent" or "most of X"
    // almost always wants first.
    const nextOrder = sort === column.key && order === 'desc' ? 'asc' : 'desc';
    onSort(column.key, nextOrder);
  }

  return (
    <div className="adm-table__wrap">
      <table className="adm-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                data-sortable={column.sortable || undefined}
                style={column.align ? { textAlign: column.align } : undefined}
                onClick={() => headerClick(column)}
                aria-sort={
                  sort === column.key ? (order === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                {column.label}
                {sort === column.key && (
                  <span className="adm-sort" aria-hidden="true">{order === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === 'right' ? 'adm-table__actions' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ---------- Pagination ----------

// Shows at most seven page buttons with ellipses, so 64 pages don't produce a
// row of numbers wider than the table.
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pageCount];
  if (page >= pageCount - 3) {
    return [1, '…', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }
  return [1, '…', page - 1, page, page + 1, '…', pageCount];
}

export function Pagination({ page, pageCount, total, limit, onPage, noun = 'items' }) {
  if (!total) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="adm-pager">
      <span>
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      {pageCount > 1 && (
        <div className="adm-pager__buttons">
          <button
            type="button" className="adm-pager__page"
            disabled={page <= 1} onClick={() => onPage(page - 1)}
          >
            ‹
          </button>
          {pageWindow(page, pageCount).map((entry, index) =>
            entry === '…' ? (
              <span key={`gap-${index}`} style={{ padding: '0 2px' }}>…</span>
            ) : (
              <button
                key={entry}
                type="button"
                className={`adm-pager__page ${entry === page ? 'adm-pager__page--active' : ''}`}
                onClick={() => onPage(entry)}
              >
                {entry}
              </button>
            )
          )}
          <button
            type="button" className="adm-pager__page"
            disabled={page >= pageCount} onClick={() => onPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}


// ---------- Modal ----------

export function Modal({ title, onClose, children, footer, wide = false }) {
  // Escape closes. Without it the only way out of a modal on a keyboard is to
  // tab to the X, which is a poor experience and an accessibility failure.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    // The backdrop covers the page, so the body behind it must not scroll --
    // otherwise a scroll gesture over the modal drifts the page underneath.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="adm-modal__backdrop" onClick={onClose} role="presentation">
      <div
        className={`adm-modal ${wide ? 'adm-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adm-modal__head">
          <h2>{title}</h2>
          <button type="button" className="adm-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="adm-modal__body">{children}</div>
        {footer && <div className="adm-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}


// ---------- Confirmation ----------

// Every destructive action in the dashboard goes through this. `impact` is
// the dependency list the backend returned, so the admin sees the real number
// of rows a cascade will take rather than a generic "this cannot be undone".
export function ConfirmModal({
  title,
  message,
  impact,
  detaches,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`adm-btn ${danger ? 'adm-btn--danger' : 'adm-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>

      {impact && impact.length > 0 && (
        <ul className="adm-impact">
          {impact.map((entry) => (
            // Zero-count rows are dimmed rather than hidden: "0 reviews" is
            // useful information when deciding whether a delete is safe.
            <li key={entry.label} data-zero={entry.count === 0}>
              <span>{entry.label}</span>
              <strong>{entry.count.toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      )}

      {detaches && detaches.some((entry) => entry.count > 0) && (
        <>
          <p style={{ fontSize: 12 }}>These are kept, but lose their link to it:</p>
          <ul className="adm-impact">
            {detaches.map((entry) => (
              <li key={entry.label} data-zero={entry.count === 0}>
                <span>{entry.label}</span>
                <strong>{entry.count.toLocaleString()}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}


// ---------- Formatting helpers ----------

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

// "3 days ago" reads better than a timestamp in an activity feed, but only
// up to a point -- past a month the absolute date is more useful.
export function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}

export function formatNumber(value) {
  return value === null || value === undefined ? '—' : Number(value).toLocaleString();
}

// Poster and avatar cells share one fallback so a missing image is never a
// broken-image icon.
export function Thumb({ src, alt, label }) {
  return src
    ? <img className="adm-thumb" src={src} alt={alt || ''} loading="lazy" />
    : <span className="adm-thumb adm-thumb--empty" aria-hidden="true">{label || '?'}</span>;
}

export function Avatar({ src, name }) {
  return src
    ? <img className="adm-avatar" src={src} alt="" loading="lazy" />
    : (
      <span className="adm-avatar adm-thumb--empty" aria-hidden="true">
        {(name || '?').charAt(0).toUpperCase()}
      </span>
    );
}
