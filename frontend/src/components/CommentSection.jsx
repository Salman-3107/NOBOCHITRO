import { useState } from 'react';
import { PostAvatar as Avatar, relativeTime } from './PostSocial';
import './CommentSection.css';

// Instagram-style comment thread, wired to the SAME data your app already
// fetches/mutates via usePostSocial: comments come straight from
// GET /api/posts/:id (CommentID, CommentText, CommentDate, UserID,
// Username, DisplayName, ProfilePictureURL), and adding/deleting go through
// the same submitComment/removeComment calls PostCard already has.
//
// This replaces the old <section className="comment-section">...</section>
// block inside PostCard -- it's a drop-in for that block, not a separate
// standalone demo.
//
// Props:
//   comments        - array from usePostSocial (post.comments shape)
//   currentUserId   - user.userId, to show "Delete" only on your own comments
//   onSelectProfile - (userId) => void, same prop PostCard already receives
//   onSubmit        - async (text) => void  (wrap submitComment + toast in the parent)
//   onDelete        - (commentId) => void   (wrap removeComment + toast in the parent)

const EMOJIS = ['❤️', '🙌', '🔥', '👏', '😍', '😂', '😮', '😢', '🙏'];

export default function CommentSection({ comments, currentUserId, onSelectProfile, onSubmit, onDelete }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await onSubmit(trimmed);
      setText('');
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="ig-comments">
      <div className="ig-comments__thread">
        {!comments.length && <p className="ig-comments__empty">No comments yet. Be the first to say something.</p>}

        {comments.map((c) => {
          const name = c.DISPLAYNAME || c.USERNAME;
          const mine = Number(c.USERID) === Number(currentUserId);
          return (
            <div className="ig-comment" key={c.COMMENTID}>
              <button type="button" className="ig-comment__avatar-btn" onClick={() => onSelectProfile(c.USERID)} aria-label={`View ${name}'s profile`}>
                <Avatar name={name} imageUrl={c.PROFILEPICTUREURL} />
              </button>
              <div className="ig-comment__body">
                <p className="ig-comment__line">
                  <button type="button" className="ig-comment__name-btn" onClick={() => onSelectProfile(c.USERID)}><b>{name}</b></button>
                  {c.COMMENTTEXT}
                </p>
                <div className="ig-comment__meta">
                  <span>{relativeTime(c.COMMENTDATE)}</span>
                  {mine && <button type="button" className="ig-comment__del" onClick={() => onDelete(c.COMMENTID)}>Delete</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="ig-emoji-bar">
        {EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => setText((t) => t + e)}>{e}</button>
        ))}
      </div>

      <div className="ig-composer">
        <textarea
          rows={1}
          value={text}
          maxLength={1000}
          placeholder="Add a comment…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
        />
        <button type="button" className={`ig-post-btn ${text.trim() ? 'ig-post-btn--active' : ''}`} disabled={posting} onClick={handlePost}>
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </section>
  );
}
