import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { addPostComment, createPost, deletePost, deletePostComment, getPost, getPostLikes, getUserProfile, likePost, listPosts, searchMovies, unlikePost } from '../api/movies';
import './CommunityPage.css';

function relativeTime(value) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function Avatar({ name, imageUrl }) { return imageUrl ? <img className="community-avatar community-avatar--image" src={imageUrl} alt="" /> : <span className="community-avatar">{(name || '?').charAt(0).toUpperCase()}</span>; }

function MovieTagComposer({ user, onCreated, profilePictureUrl }) {
  const [text, setText] = useState('');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const hashMatch = text.match(/#([^#\n]*)$/);
  const query = hashMatch?.[1] || '';

  useEffect(() => {
    if (!hashMatch) { setSuggestions([]); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const result = await searchMovies(query.trim() || 'a');
        setSuggestions(result.movies || []);
        setActiveSuggestion(0);
      } catch { setSuggestions([]); }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, Boolean(hashMatch)]);

  function handleChange(event) {
    const nextText = event.target.value;
    setText(nextText);
    if (selectedMovie && !nextText.includes(`#${selectedMovie.TITLE}`)) setSelectedMovie(null);
  }

  function handleKeyDown(event) {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveSuggestion((current) => (current + 1) % suggestions.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length); }
    if (event.key === 'Enter' && hashMatch) { event.preventDefault(); chooseMovie(suggestions[activeSuggestion]); }
    if (event.key === 'Escape') setSuggestions([]);
  }

  function chooseMovie(movie) {
    setText((current) => current.replace(/#[^\s#]*$/, `#${movie.TITLE} `));
    setSelectedMovie(movie);
    setSuggestions([]);
    textareaRef.current?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedMovie) { setError('Use # to select the movie this post is about.'); return; }
    if (!text.trim()) { setError('Write something to share with the community.'); return; }
    setIsPosting(true); setError('');
    try {
      await createPost({ movieId: selectedMovie.MOVIEID, postText: text.trim() });
      setText(''); setSelectedMovie(null); onCreated();
    } catch (requestError) { setError(requestError.message); }
    finally { setIsPosting(false); }
  }

  return <form className="post-composer" onSubmit={submit}><Avatar name={user.displayName || user.username} imageUrl={profilePictureUrl} /><div className="post-composer__body"><textarea ref={textareaRef} value={text} onChange={handleChange} onKeyDown={handleKeyDown} placeholder="Share a movie moment… Type # to tag a movie." rows="3" maxLength="1500" />{suggestions.length > 0 && <div className="movie-suggestions"><p className="movie-suggestions__label">TAG A MOVIE <span>↑↓ select · Enter confirm</span></p>{suggestions.map((movie, index) => <button type="button" className={index === activeSuggestion ? 'movie-suggestion movie-suggestion--active' : 'movie-suggestion'} key={movie.MOVIEID} onMouseDown={(event) => { event.preventDefault(); chooseMovie(movie); }}>{movie.POSTERURL ? <img src={movie.POSTERURL} alt="" /> : <span className="movie-suggestions__icon">🎬</span>}<span><strong>{movie.TITLE}</strong><small>{movie.RELEASEYEAR || 'Film'} · Movie</small></span><b>#</b></button>)}</div>}{selectedMovie && <span className="selected-movie-tag">🎬 About <strong>{selectedMovie.TITLE}</strong><button type="button" onClick={() => setSelectedMovie(null)} aria-label="Remove movie tag">×</button></span>}<div className="post-composer__footer"><span>{text.length}/1500</span><button className="community-primary-button" type="submit" disabled={isPosting}>{isPosting ? 'Posting…' : 'Post'}</button></div>{error && <p className="community-error">{error}</p>}</div></form>;
}

// The "Liked by" popup. Each row opens that person's profile.
function LikersModal({ people, status, currentUserId, onClose, onOpenProfile }) {
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
                  <Avatar name={personName} imageUrl={person.PROFILEPICTUREURL} />
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

// `focus` is set when the person arrived from a notification: 'post' scrolls to
// and highlights this card, 'comments' also opens its comment thread, and
// 'likes' opens the "Liked by" list.
function PostCard({ post, user, onChanged, onSelectMovie, onSelectProfile, focus = null }) {
  const cardRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [isLiked, setIsLiked] = useState(Number(post.ISLIKED) === 1 || post.ISLIKED === true);
  const [likes, setLikes] = useState(Number(post.LIKECOUNT || 0));
  const [commentCount, setCommentCount] = useState(Number(post.COMMENTCOUNT || 0));
  const [isWorking, setIsWorking] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState([]);
  const [likersStatus, setLikersStatus] = useState('loading');

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

  function openLikerProfile(userId) {
    setLikersOpen(false);
    onSelectProfile(userId);
  }

  async function toggleComments() {
    if (!expanded) { const detail = await getPost(post.POSTID); setComments(detail.comments || []); setCommentCount(Number(detail.COMMENTCOUNT || detail.comments?.length || 0)); }
    setExpanded((current) => !current);
  }
  useEffect(() => {
    if (!focus) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (focus === 'comments' && !expanded) toggleComments().catch(() => {});
    if (focus === 'likes') openLikers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  async function toggleLike() { if (isWorking) return; const previousLiked = isLiked; const previousLikes = likes; setIsWorking(true); setIsLiked(!previousLiked); setLikes(Math.max(0, previousLikes + (previousLiked ? -1 : 1))); try { if (previousLiked) await unlikePost(post.POSTID); else await likePost(post.POSTID); } catch { setIsLiked(previousLiked); setLikes(previousLikes); } finally { setIsWorking(false); } }
  async function submitComment(event) { event.preventDefault(); if (!commentText.trim()) return; await addPostComment(post.POSTID, commentText.trim()); setCommentText(''); const detail = await getPost(post.POSTID); setComments(detail.comments || []); setCommentCount(Number(detail.COMMENTCOUNT || detail.comments?.length || 0)); if (!expanded) setExpanded(true); onChanged(); }
  async function removeComment(commentId) { await deletePostComment(commentId); setComments((current) => current.filter((comment) => comment.COMMENTID !== commentId)); setCommentCount((current) => Math.max(0, current - 1)); onChanged(); }
  async function removePost() { if (!window.confirm('Delete this post?')) return; await deletePost(post.POSTID); onChanged(); }
  const author = post.DISPLAYNAME || post.USERNAME;
  return <article ref={cardRef} className={focus ? 'community-post community-post--focus' : 'community-post'}><div className="community-post__header"><button type="button" className="profile-link" onClick={() => onSelectProfile(post.USERID)}><Avatar name={author} imageUrl={post.PROFILEPICTUREURL} /><div><strong>{author}</strong><span>@{post.USERNAME} · {relativeTime(post.POSTDATE)}</span></div></button>{Number(post.USERID) === Number(user.userId) && <button type="button" className="post-delete" onClick={removePost}>Delete</button>}</div><p className="community-post__text">{post.POSTTEXT}</p><button type="button" className="community-post__movie community-post__movie--poster" onClick={() => onSelectMovie(post.MOVIEID)}>{post.POSTERURL ? <img src={post.POSTERURL} alt={`${post.MOVIETITLE} poster`} /> : <span className="community-post__movie-placeholder">🎬</span>}<span className="community-post__movie-copy"><i>FEATURED FILM</i><strong>{post.MOVIETITLE}</strong><small>View movie →</small></span></button><div className="community-post__actions"><button type="button" disabled={isWorking} className={isLiked ? 'post-action post-action--liked' : 'post-action'} onClick={toggleLike} aria-label={isLiked ? 'Unlike this post' : 'Like this post'}>♥</button><button type="button" className="post-action post-action--count" onClick={openLikers}>{likes} {likes === 1 ? 'like' : 'likes'}</button><button type="button" className="post-action" onClick={toggleComments}>◌ <span>{comments.length || commentCount}</span> {commentCount === 1 ? 'Comment' : 'Comments'}</button></div>{expanded && <section className="comment-section">{comments.map((comment) => <div className="comment" key={comment.COMMENTID}><button type="button" className="comment__profile-button" onClick={() => onSelectProfile(comment.USERID)} aria-label={`View ${comment.DISPLAYNAME || comment.USERNAME}'s profile`}><Avatar name={comment.DISPLAYNAME || comment.USERNAME} imageUrl={comment.PROFILEPICTUREURL} /></button><div><button type="button" className="comment__name-button" onClick={() => onSelectProfile(comment.USERID)}><strong>{comment.DISPLAYNAME || comment.USERNAME}</strong></button><p>{comment.COMMENTTEXT}</p></div>{Number(comment.USERID) === Number(user.userId) && <button type="button" onClick={() => removeComment(comment.COMMENTID)}>×</button>}</div>)}<form className="comment-form" onSubmit={submitComment}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write a reply…" maxLength="1000" /><button type="submit">Reply</button></form></section>}{likersOpen && <LikersModal people={likers} status={likersStatus} currentUserId={user.userId} onClose={() => setLikersOpen(false)} onOpenProfile={openLikerProfile} />}</article>;
}

export default function CommunityPage({ user, onLogout, onNavigate, onSelectMovie, onSelectProfile }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusPostId = Number(searchParams.get('post')) || null;
  const viewParam = searchParams.get('view');
  const focusView = viewParam === 'comments' || viewParam === 'likes' ? viewParam : 'post';
  const [posts, setPosts] = useState([]); const [status, setStatus] = useState('loading'); const [search, setSearch] = useState(''); const [myProfile, setMyProfile] = useState(null);
  // Arriving from a post-related notification (?post=<id>) is a single-post
  // view, not the full feed with that card scrolled-to: `singlePost` holds
  // just that post (fetched via GET /api/posts/:id, which already includes
  // its comments) and the full-feed fetch below is skipped entirely.
  const [singlePost, setSinglePost] = useState(null);
  const [singleStatus, setSingleStatus] = useState('loading');
  async function loadPosts() { try { setStatus('loading'); setPosts(await listPosts()); setStatus('ready'); } catch { setStatus('error'); } }
  async function loadSinglePost(id) { try { setSingleStatus('loading'); setSinglePost(await getPost(id)); setSingleStatus('ready'); } catch { setSingleStatus('error'); } }
  useEffect(() => {
    getUserProfile(user.userId).then(setMyProfile).catch(() => {});
    if (focusPostId) loadSinglePost(focusPostId); else loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPostId]);
  function backToFeed() { setSearchParams({}); }

  if (focusPostId) {
    return <div className="community-page"><Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} activePage="community" onNavigate={onNavigate} /><main className="community-layout"><section className="community-feed"><header className="community-title"><button type="button" className="community-back-link" onClick={backToFeed}>← Back to Community</button><h1>From your notifications</h1></header>{singleStatus === 'loading' && <p className="community-status">Loading post…</p>}{singleStatus === 'error' && <p className="community-status">That post is no longer available. <button type="button" onClick={backToFeed}>Back to Community</button></p>}{singleStatus === 'ready' && singlePost && <PostCard post={singlePost} user={user} onChanged={() => loadSinglePost(focusPostId)} onSelectMovie={onSelectMovie} onSelectProfile={onSelectProfile} focus={focusView} />}</section></main></div>;
  }

  return <div className="community-page"><Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} activePage="community" onNavigate={onNavigate} /><main className="community-layout"><section className="community-feed"><header className="community-title"><p>NOBOCHITRO COMMUNITY</p><h1>Movie conversations, uncut.</h1><span>Share the scenes that stayed with you.</span></header><MovieTagComposer user={user} profilePictureUrl={myProfile?.PROFILEPICTUREURL || user.profilePictureUrl} onCreated={loadPosts} />{status === 'loading' && <p className="community-status">Loading conversations…</p>}{status === 'error' && <p className="community-status">Could not load posts. <button type="button" onClick={loadPosts}>Try again</button></p>}{status === 'ready' && !posts.length && <p className="community-status">No conversations yet. Start the first one.</p>}{posts.map((post) => <PostCard key={post.POSTID} post={post} user={user} onChanged={loadPosts} onSelectMovie={onSelectMovie} onSelectProfile={onSelectProfile} />)}</section><aside className="community-sidebar"><p>THE REEL</p><h2>Talk movies.<br />Find your people.</h2><span>Tag a movie with <strong>#</strong> and bring the conversation to life.</span></aside></main></div>;
}
