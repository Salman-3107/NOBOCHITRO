import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addPostComment, deletePostComment, getPost, getPostLikes, likePost, unlikePost } from '../api/movies';

function Avatar({ name, imageUrl }) {
  return imageUrl
    ? <img className="profile-post-card__avatar profile-post-card__avatar--image" src={imageUrl} alt="" />
    : <span className="profile-post-card__avatar">{(name || '?').charAt(0).toUpperCase()}</span>;
}

function LikersModal({ people, status, currentUserId, onClose, onOpenProfile }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="profile-likes-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="profile-likes-modal" role="dialog" aria-modal="true" aria-label="Liked by" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>THE REEL</span><h2>Liked by</h2></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        {status === 'loading' && <p className="profile-likes-modal__message">Loading…</p>}
        {status === 'error' && <p className="profile-likes-modal__message">Could not load the likes right now.</p>}
        {status === 'ready' && !people.length && <p className="profile-likes-modal__message">No one has liked this post yet.</p>}
        {status === 'ready' && people.length > 0 && (
          <div className="profile-likes-modal__list">
            {people.map((person) => {
              const name = person.DISPLAYNAME || person.USERNAME;
              const isMe = Number(person.USERID) === Number(currentUserId);
              return (
                <button type="button" key={person.USERID} onClick={() => onOpenProfile(person.USERID)}>
                  <Avatar name={name} imageUrl={person.PROFILEPICTUREURL} />
                  <div><strong>{name}</strong><small>@{person.USERNAME}{isMe ? ' · you' : ''}</small></div>
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

export default function ProfilePostCard({ post, user, profile, onSelectMovie, onSelectProfile }) {
  const [isLiked, setIsLiked] = useState(Number(post.ISLIKED) === 1 || post.ISLIKED === true);
  const [likes, setLikes] = useState(Number(post.LIKECOUNT || 0));
  const [commentCount, setCommentCount] = useState(Number(post.COMMENTCOUNT || 0));
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [workingLike, setWorkingLike] = useState(false);
  const [workingComment, setWorkingComment] = useState(false);
  const [error, setError] = useState('');
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState([]);
  const [likersStatus, setLikersStatus] = useState('idle');

  useEffect(() => {
    setIsLiked(Number(post.ISLIKED) === 1 || post.ISLIKED === true);
    setLikes(Number(post.LIKECOUNT || 0));
    setCommentCount(Number(post.COMMENTCOUNT || 0));
  }, [post.ISLIKED, post.LIKECOUNT, post.COMMENTCOUNT]);

  async function openLikers() {
    setLikersOpen(true);
    setLikersStatus('loading');
    try {
      setLikers(await getPostLikes(post.POSTID));
      setLikersStatus('ready');
    } catch {
      setLikersStatus('error');
    }
  }

  async function toggleComments() {
    setError('');
    if (!expanded) {
      try {
        const detail = await getPost(post.POSTID);
        setComments(detail.comments || []);
        setCommentCount(Number(detail.COMMENTCOUNT || 0));
      } catch (err) {
        setError(err.message || 'Could not load comments.');
        return;
      }
    }
    setExpanded((current) => !current);
  }

  async function toggleLike() {
    if (workingLike) return;
    setError('');
    const previousLiked = isLiked;
    const previousLikes = likes;
    setWorkingLike(true);
    setIsLiked(!previousLiked);
    setLikes(Math.max(0, previousLikes + (previousLiked ? -1 : 1)));
    try {
      if (previousLiked) await unlikePost(post.POSTID);
      else await likePost(post.POSTID);
    } catch (err) {
      setIsLiked(previousLiked);
      setLikes(previousLikes);
      setError(err.message || 'Could not update the like.');
    } finally {
      setWorkingLike(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || workingComment) return;
    setError('');
    setWorkingComment(true);
    try {
      await addPostComment(post.POSTID, text);
      const detail = await getPost(post.POSTID);
      setComments(detail.comments || []);
      setCommentCount(Number(detail.COMMENTCOUNT || detail.comments?.length || 0));
      setCommentText('');
      setExpanded(true);
    } catch (err) {
      setError(err.message || 'Could not add your comment.');
    } finally {
      setWorkingComment(false);
    }
  }

  async function removeComment(commentId) {
    setError('');
    try {
      await deletePostComment(commentId);
      setComments((current) => current.filter((comment) => comment.COMMENTID !== commentId));
      setCommentCount((current) => Math.max(0, current - 1));
    } catch (err) {
      setError(err.message || 'Could not delete the comment.');
    }
  }

  const author = profile?.DISPLAYNAME || profile?.USERNAME || post.DISPLAYNAME || post.USERNAME;
  const authorUsername = profile?.USERNAME || post.USERNAME;

  return (
    <article className="profile-post profile-post--interactive">
      <header>
        <button type="button" className="profile-post-card__author" onClick={() => onSelectProfile(post.USERID)}>
          <Avatar name={author} imageUrl={profile?.PROFILEPICTUREURL || post.PROFILEPICTUREURL} />
          <span><strong>{author}</strong><small>@{authorUsername} · {new Date(post.POSTDATE).toLocaleDateString()}</small></span>
        </button>
      </header>

      <p>{post.POSTTEXT}</p>

      <button type="button" className="profile-post__movie" onClick={() => onSelectMovie(post.MOVIEID)}>
        {post.POSTERURL ? <img src={post.POSTERURL} alt={`${post.MOVIETITLE} poster`} /> : <span className="profile-post__placeholder">🎬</span>}
        <span className="profile-post__film-info"><i>FEATURED FILM</i><strong>{post.MOVIETITLE}</strong><small>Join the conversation about this film →</small></span>
      </button>

      <footer className="profile-post__actions">
        <button type="button" disabled={workingLike} className={isLiked ? 'profile-post__action profile-post__action--liked' : 'profile-post__action'} onClick={toggleLike} aria-label={isLiked ? 'Unlike this post' : 'Like this post'}>
          {isLiked ? '♥' : '♡'}
        </button>
        <button type="button" className="profile-post__count" onClick={openLikers} aria-label={`View ${likes} likes`}>
          {likes} {likes === 1 ? 'like' : 'likes'}
        </button>
        <button type="button" className="profile-post__count" onClick={toggleComments} aria-expanded={expanded}>
          ◌ {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </button>
      </footer>

      {error && <p className="profile-post__error" role="alert">{error}</p>}

      {expanded && (
        <section className="profile-comment-section" aria-label="Comments">
          <div className="profile-comment-section__heading"><span>THE CONVERSATION</span><strong>{commentCount} {commentCount === 1 ? 'comment' : 'comments'}</strong></div>
          {comments.length ? comments.map((comment) => {
            const name = comment.DISPLAYNAME || comment.USERNAME;
            return (
              <div className="profile-comment" key={comment.COMMENTID}>
                <button type="button" onClick={() => onSelectProfile(comment.USERID)} aria-label={`View ${name}'s profile`}>
                  <Avatar name={name} imageUrl={comment.PROFILEPICTUREURL} />
                </button>
                <div className="profile-comment__body">
                  <button type="button" className="profile-comment__name" onClick={() => onSelectProfile(comment.USERID)}>{name}</button>
                  <p>{comment.COMMENTTEXT}</p>
                </div>
                {Number(comment.USERID) === Number(user.userId) && <button type="button" className="profile-comment__delete" onClick={() => removeComment(comment.COMMENTID)} aria-label="Delete your comment">×</button>}
              </div>
            );
          }) : <p className="profile-comment-section__empty">No comments yet. Start the conversation.</p>}
          <form className="profile-comment-form" onSubmit={submitComment}>
            <Avatar name={user.displayName || user.username} imageUrl={user.profilePictureUrl} />
            <input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write a reply…" maxLength="1000" aria-label="Write a comment" />
            <button type="submit" disabled={workingComment || !commentText.trim()}>{workingComment ? '…' : 'Reply'}</button>
          </form>
        </section>
      )}

      {likersOpen && <LikersModal people={likers} status={likersStatus} currentUserId={user.userId} onClose={() => setLikersOpen(false)} onOpenProfile={(userId) => { setLikersOpen(false); onSelectProfile(userId); }} />}
    </article>
  );
}
