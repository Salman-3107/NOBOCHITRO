import { useEffect } from 'react';
import { createPortal } from 'react-dom';
// Reuses the existing .community-avatar / .post-action / .comment-section /
// .likes-modal styling that CommunityPage already ships -- these rules are
// theme-token driven (var(--accent-bright), var(--panel), var(--border)…),
// not community-specific colors, so they read correctly on ProfilePage too.
// Importing the stylesheet here (rather than copying its rules) keeps a
// single source of truth instead of two copies that can drift apart.
import '../pages/CommunityPage.css';

export function relativeTime(value) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function PostAvatar({ name, imageUrl }) {
  return imageUrl
    ? <img className="community-avatar community-avatar--image" src={imageUrl} alt="" />
    : <span className="community-avatar">{(name || '?').charAt(0).toUpperCase()}</span>;
}

// The "Liked by" popup shared between CommunityPage and ProfilePage. Each
// row opens that person's profile.
export function LikersModal({ people, status, currentUserId, onClose, onOpenProfile }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  // Rendered into <body> so the popup always covers the whole screen, no
  // matter which card it was opened from.
  return createPortal(
    <div className="likes-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="likes-modal" role="dialog" aria-modal="true" aria-label="Liked by" onMouseDown={(event) => event.stopPropagation()}>
        <header><h2>Liked by</h2><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        {status === 'loading' && <p className="likes-modal__message">Loading…</p>}
        {status === 'error' && <p className="likes-modal__message">Could not load the likes right now.</p>}
        {status === 'ready' && !people.length && <p className="likes-modal__message">No likes yet.</p>}
        {status === 'ready' && people.length > 0 && (
          <div className="likes-modal__list">
            {people.map((person) => {
              const personName = person.DISPLAYNAME || person.USERNAME;
              const isMe = Number(person.USERID) === Number(currentUserId);
              return (
                <button type="button" key={person.USERID} onClick={() => onOpenProfile(person.USERID)}>
                  <PostAvatar name={personName} imageUrl={person.PROFILEPICTUREURL} />
                  <div><strong>{personName}</strong><small>@{person.USERNAME}{isMe ? ' · you' : ''}</small></div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
