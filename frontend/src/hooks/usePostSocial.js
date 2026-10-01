import { useEffect, useState } from 'react';
import { addPostComment, deletePost, deletePostComment, getPost, getPostLikes, likePost, unlikePost } from '../api/movies';

// All the interactive "social" state for a single post -- like/unlike,
// the expandable comment thread, and the "Liked by" list -- in one place so
// CommunityPage and ProfilePage share the exact same behavior instead of
// two copies that can drift apart.
//
// `post` must include LIKECOUNT, COMMENTCOUNT and ISLIKED (every post the
// backend returns from listPosts()/getPost() does). `onChanged` is called
// after any action that the parent's own post list should know about
// (a new/removed comment, a deleted post) so it can refresh counts elsewhere
// on the page if it needs to.
export function usePostSocial(post, onChanged) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [isLiked, setIsLiked] = useState(Boolean(post.ISLIKED));
  const [likes, setLikes] = useState(Number(post.LIKECOUNT || 0));
  const [commentCount, setCommentCount] = useState(Number(post.COMMENTCOUNT || 0));
  const [isLiking, setIsLiking] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState([]);
  const [likersStatus, setLikersStatus] = useState('loading');

  // If the parent re-fetches the post list (e.g. after a follow/unfollow or
  // a page reload), pick up the fresh server state rather than keep stale
  // local state around.
  useEffect(() => {
    setIsLiked(Boolean(post.ISLIKED));
    setLikes(Number(post.LIKECOUNT || 0));
    setCommentCount(Number(post.COMMENTCOUNT || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.POSTID, post.ISLIKED, post.LIKECOUNT, post.COMMENTCOUNT]);

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
    if (!expanded) {
      const detail = await getPost(post.POSTID);
      setComments(detail.comments || []);
    }
    setExpanded((current) => !current);
  }

  // Optimistic: flips immediately, rolls back on failure. `isLiking` blocks
  // a second request from firing mid-flight (double-click, fast tapping).
  async function toggleLike() {
    if (isLiking) return;
    const wasLiked = isLiked;
    setIsLiking(true);
    setIsLiked(!wasLiked);
    setLikes((current) => Math.max(0, wasLiked ? current - 1 : current + 1));
    try {
      if (wasLiked) await unlikePost(post.POSTID);
      else await likePost(post.POSTID);
    } catch (err) {
      setIsLiked(wasLiked);
      setLikes((current) => Math.max(0, wasLiked ? current + 1 : current - 1));
      throw err;
    } finally {
      setIsLiking(false);
    }
  }

  async function submitComment(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await addPostComment(post.POSTID, trimmed);
    const detail = await getPost(post.POSTID);
    setComments(detail.comments || []);
    setCommentCount((current) => current + 1);
    if (!expanded) setExpanded(true);
    onChanged?.();
  }

  async function removeComment(commentId) {
    await deletePostComment(commentId);
    setComments((current) => current.filter((comment) => comment.COMMENTID !== commentId));
    setCommentCount((current) => Math.max(0, current - 1));
    onChanged?.();
  }

  async function removePost() {
    await deletePost(post.POSTID);
    onChanged?.();
  }

  function openLikerProfile(userId, onSelectProfile) {
    setLikersOpen(false);
    onSelectProfile(userId);
  }

  return {
    expanded,
    comments,
    isLiked,
    likes,
    commentCount,
    isLiking,
    likersOpen,
    likers,
    likersStatus,
    setLikersOpen,
    openLikers,
    openLikerProfile,
    toggleComments,
    toggleLike,
    submitComment,
    removeComment,
    removePost,
  };
}
