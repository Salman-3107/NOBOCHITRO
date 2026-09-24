import { useEffect, useRef } from 'react';
import './JournalEntryModal.css';

// Turns "2026-03-12T00:00:00.000Z" into "March 12, 2026".
function formatWatchDate(dateValue) {
  if (!dateValue) return '';
  return new Date(dateValue).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Shows ONE journal entry in full: what the person wrote, how they felt,
// where they watched, their favorite scene. The movie page is a separate
// button at the bottom, so clicking a journal never jumps away by accident.
export default function JournalEntryModal({ entry, onClose, onOpenMovie }) {
  const closeButtonRef = useRef(null);

  // Keep the newest onClose in a ref so the effect below only runs once
  // (otherwise it would re-run on every parent render and steal focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const elementFocusedBefore = document.activeElement;
    const pageScrollBefore = document.body.style.overflow;

    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = pageScrollBefore;
      elementFocusedBefore?.focus?.();
    };
  }, []);

  const watchDate = formatWatchDate(entry.WATCHDATE);
  const isPrivate = entry.PRIVACY === 'Private';

  // Small facts row: only show the ones the person actually filled in.
  const facts = [
    { label: 'Where', value: entry.WATCHLOCATION },
    { label: 'Watched with', value: entry.WATCHEDWITH },
    { label: 'Felt before', value: entry.MOODBEFORE },
  ].filter((fact) => fact.value);

  return (
    <div className="journal-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article
        className="journal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="journal-modal__close"
          onClick={onClose}
          aria-label="Close journal entry"
        >
          ×
        </button>

        <header className="journal-modal__top">
          {entry.POSTERURL ? (
            <img className="journal-modal__poster" src={entry.POSTERURL} alt={`${entry.MOVIETITLE} poster`} />
          ) : (
            <span className="journal-modal__poster journal-modal__poster--empty">🎬</span>
          )}

          <div className="journal-modal__heading">
            {watchDate && <p className="journal-modal__date">{watchDate}</p>}
            <h2 id="journal-modal-title">{entry.MOVIETITLE}</h2>
            <div className="journal-modal__chips">
              {entry.MOODAFTER && <span className="journal-modal__chip journal-modal__chip--mood">{entry.MOODAFTER}</span>}
              {entry.REWATCHNUMBER > 1 && <span className="journal-modal__chip">↻ Rewatch #{entry.REWATCHNUMBER}</span>}
              <span className="journal-modal__chip">{isPrivate ? '🔒 Only me' : '🌎 Public'}</span>
            </div>
          </div>
        </header>

        {entry.JOURNALTEXT ? (
          <blockquote className="journal-modal__text">{entry.JOURNALTEXT}</blockquote>
        ) : (
          <p className="journal-modal__blank">No written notes for this watch.</p>
        )}

        {entry.FAVORITESCENE && (
          <section className="journal-modal__scene">
            <h3>Favorite scene</h3>
            <p>{entry.FAVORITESCENE}</p>
          </section>
        )}

        {facts.length > 0 && (
          <dl className="journal-modal__facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <footer className="journal-modal__footer">
          <button type="button" className="journal-modal__movie-button" onClick={onOpenMovie}>
            Open movie page
          </button>
        </footer>
      </article>
    </div>
  );
}
