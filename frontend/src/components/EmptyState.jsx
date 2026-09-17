import './EmptyState.css';

// Shown when a list legitimately has nothing in it -- an empty watchlist,
// no journal entries yet, a search with no matches.
//
// This is distinct from an error: nothing went wrong, there is just nothing
// here yet, so the copy should point at what to do next rather than apologise.
export default function EmptyState({
  icon = '🎬',
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <h3 className="empty-state__title">{title}</h3>
      {message && <p className="empty-state__message">{message}</p>}
      {actionLabel && onAction && (
        <button type="button" className="empty-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
