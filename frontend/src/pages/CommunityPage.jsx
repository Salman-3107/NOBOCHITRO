import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { createPost, getPost, getUserProfile, listPosts, searchMovies } from '../api/movies';
import { LikersModal, PostAvatar as Avatar, relativeTime } from '../components/PostSocial';
import { usePostSocial } from '../hooks/usePostSocial';
import { useToast } from '../components/Toast';
import CommentSection from '../components/CommentSection';
import './CommunityPage.css';

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

// `focus` is set when the person arrived from a notification: 'post' scrolls to
// and highlights this card, 'comments' also opens its comment thread, and
// 'likes' opens the "Liked by" list.
function PostCard({ post, user, onChanged, onSelectMovie, onSelectProfile, focus = null }) {
  const cardRef = useRef(null);
  const toast = useToast();
  const {
    expanded, comments, isLiked, likes, commentCount, isLiking,
    likersOpen, likers, likersStatus, setLikersOpen,
    openLikers, openLikerProfile, toggleComments, toggleLike,
    submitComment, removeComment, removePost,
  } = usePostSocial(post, onChanged);

  useEffect(() => {
    if (!focus) return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (focus === 'comments' && !expanded) toggleComments().catch(() => {});
    if (focus === 'likes') openLikers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  async function handleToggleLike() {
    try { await toggleLike(); } catch { toast.error('Could not update your like. Please try again.'); }
  }
  async function handleSubmitComment(text) {
    try { await submitComment(text); }
    catch { toast.error('Could not post your comment. Please try again.'); }
  }
  async function handleRemoveComment(commentId) {
    try { await removeComment(commentId); } catch { toast.error('Could not delete that comment.'); }
  }
  async function handleRemovePost() {
    if (!window.confirm('Delete this post?')) return;
    try { await removePost(); } catch { toast.error('Could not delete this post.'); }
  }

  const author = post.DISPLAYNAME || post.USERNAME;
  return <article ref={cardRef} className={focus ? 'community-post community-post--focus' : 'community-post'}><div className="community-post__header"><button type="button" className="profile-link" onClick={() => onSelectProfile(post.USERID)}><Avatar name={author} imageUrl={post.PROFILEPICTUREURL} /><div><strong>{author}</strong><span>@{post.USERNAME} · {relativeTime(post.POSTDATE)}</span></div></button>{Number(post.ISTASTEMATCH) === 1 && <span className="taste-match-badge" title={post.MATCHEDGENRES ? `Because you rate ${post.MATCHEDGENRES} highly` : 'Matches your taste'}>🎯 For you{post.MATCHEDGENRES ? ` · ${post.MATCHEDGENRES}` : ''}</span>}{Number(post.USERID) === Number(user.userId) && <button type="button" className="post-delete" onClick={handleRemovePost}>Delete</button>}</div><p className="community-post__text">{post.POSTTEXT}</p><button type="button" className="community-post__movie community-post__movie--poster" onClick={() => onSelectMovie(post.MOVIEID)}>{post.POSTERURL ? <img src={post.POSTERURL} alt={`${post.MOVIETITLE} poster`} /> : <span className="community-post__movie-placeholder">🎬</span>}<span className="community-post__movie-copy"><i>FEATURED FILM</i><strong>{post.MOVIETITLE}</strong><small>View movie →</small></span></button><div className="community-post__actions"><button type="button" disabled={isLiking} className={isLiked ? 'post-action post-action--liked' : 'post-action'} onClick={handleToggleLike} aria-label={isLiked ? 'Unlike this post' : 'Like this post'}>♥</button>{likes > 0 && <button type="button" className="post-action post-action--count" onClick={openLikers}>{likes} {likes === 1 ? 'like' : 'likes'}</button>}<button type="button" className="post-action" onClick={toggleComments}>◌ <span>{commentCount || ''}</span> Comments</button></div>{expanded && <CommentSection comments={comments} currentUserId={user.userId} onSelectProfile={onSelectProfile} onSubmit={handleSubmitComment} onDelete={handleRemoveComment} />}{likersOpen && <LikersModal people={likers} status={likersStatus} currentUserId={user.userId} onClose={() => setLikersOpen(false)} onOpenProfile={(userId) => openLikerProfile(userId, onSelectProfile)} />}</article>;
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
  // personalized: true asks the backend to weight the feed toward genres
  // this viewer rates highly (~80%), filling the rest with everything else,
  // instead of plain newest-first.
  async function loadPosts() { try { setStatus('loading'); setPosts(await listPosts({ personalized: true })); setStatus('ready'); } catch { setStatus('error'); } }
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

  return <div className="community-page"><Header searchValue={search} onSearchChange={setSearch} onLogout={onLogout} activePage="community" onNavigate={onNavigate} /><main className="community-layout"><section className="community-feed"><header className="community-title"><p>NOBOCHITRO COMMUNITY</p><h1>Movie conversations, uncut.</h1><span>Share the scenes that stayed with you.</span></header><MovieTagComposer user={user} profilePictureUrl={myProfile?.PROFILEPICTUREURL || user.profilePictureUrl} onCreated={loadPosts} /> {status === 'loading' && <p className="community-status">Loading conversations…</p>}{status === 'error' && <p className="community-status">Could not load posts. <button type="button" onClick={loadPosts}>Try again</button></p>}{status === 'ready' && !posts.length && <p className="community-status">No conversations yet. Start the first one.</p>}{posts.map((post) => <PostCard key={post.POSTID} post={post} user={user} onChanged={loadPosts} onSelectMovie={onSelectMovie} onSelectProfile={onSelectProfile} />)}</section><aside className="community-sidebar"><p>THE REEL</p><h2>Talk movies.<br />Find your people.</h2><span>Tag a movie with <strong>#</strong> and bring the conversation to life.</span></aside></main></div>;
}
