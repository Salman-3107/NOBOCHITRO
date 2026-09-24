import { useEffect, useRef, useState } from 'react';
import AuthModal from '../components/AuthModal';
import MovieCard from '../components/MovieCard';
import EmptyState from '../components/EmptyState';
import { SkeletonPosterRow } from '../components/Skeleton';
import { listMovies, listChallenges, listPosts } from '../api/movies';
import './LandingPage.css';

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

// Fades a section up into place the first time it enters the viewport.
// Skips straight to visible for reduced-motion so nothing ever depends on
// the animation actually running.
function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal--visible' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Tracks whether the page has scrolled past the hero enough for the navbar
// to switch from "sitting on the film" to "a real control bar".
function useScrolled(threshold = 40) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  if (Number.isNaN(end.getTime())) return null;
  const diff = Math.ceil((end.getTime() - Date.now()) / 86400000);
  return diff;
}

function timeAgo(dateStr) {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units = [
    ['y', 31536000],
    ['mo', 2592000],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `${value}${label} ago`;
  }
  return 'just now';
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { id: 'discover', label: 'Movies' },
  { id: 'personalize', label: 'Discover' },
  { id: 'community', label: 'Community' },
  { id: 'challenges', label: 'Challenges' },
];

function LandingNav({ scrolled, onLogin, onJoin }) {
  const [open, setOpen] = useState(false);

  function go(id) {
    setOpen(false);
    scrollToId(id);
  }

  return (
    <header className={`nb-nav ${scrolled ? 'nb-nav--solid' : ''}`}>
      <div className="nb-nav__row">
        <a href="#top" className="nb-nav__brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }}>
          <img src="/images/nobochitro-mark.png" alt="" width="30" height="30" />
          <span className="nb-nav__wordmark">
            NOBO<em>CHITRO</em>
          </span>
        </a>

        <nav className="nb-nav__links" aria-label="Page sections">
          {NAV_LINKS.map((link) => (
            <button key={link.id} type="button" className="nb-nav__link" onClick={() => go(link.id)}>
              {link.label}
            </button>
          ))}
        </nav>

        <div className="nb-nav__actions">
          <button type="button" className="nb-btn nb-btn--ghost nb-btn--sm" onClick={onLogin}>
            Log in
          </button>
          <button type="button" className="nb-btn nb-btn--primary nb-btn--sm" onClick={onJoin}>
            Join NOBOCHITRO
          </button>
        </div>

        <button
          type="button"
          className="nb-nav__burger"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {open && (
        <div className="nb-nav__sheet" role="dialog" aria-label="Menu">
          {NAV_LINKS.map((link) => (
            <button key={link.id} type="button" className="nb-nav__sheet-link" onClick={() => go(link.id)}>
              {link.label}
            </button>
          ))}
          <div className="nb-nav__sheet-actions">
            <button type="button" className="nb-btn nb-btn--ghost" onClick={() => { setOpen(false); onLogin(); }}>
              Log in
            </button>
            <button type="button" className="nb-btn nb-btn--primary" onClick={() => { setOpen(false); onJoin(); }}>
              Join NOBOCHITRO
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ onExplore, onJoin }) {
  return (
    <section className="nb-hero" id="top">
      <div className="nb-hero__backdrop" aria-hidden="true">
        <div className="nb-hero__image" />
        <div className="nb-hero__light" />
        <div className="nb-hero__vignette" />
        <div className="nb-hero__grain" />
      </div>

      <div className="nb-hero__content">
        <img className="nb-hero__logo" src="/images/nobochitro-logo.png" alt="NOBOCHITRO" width="360" height="61" />

        <p className="nb-hero__kicker">Every story leaves a mark.</p>

        <h1 className="nb-hero__title">Find the films that stay with you.</h1>

        <p className="nb-hero__lede">
          Discover movies, build your watchlist, track your journey, share your thoughts,
          and find stories that feel like yours.
        </p>

        <div className="nb-hero__actions">
          <button type="button" className="nb-btn nb-btn--primary nb-btn--lg" onClick={onJoin}>
            Join NOBOCHITRO
          </button>
          <button type="button" className="nb-btn nb-btn--ghost nb-btn--lg" onClick={onExplore}>
            Explore Movies
          </button>
        </div>
      </div>

      <button type="button" className="nb-hero__scroll" onClick={onExplore} aria-label="Scroll to movies">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M4 7l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Movie discovery row
// ---------------------------------------------------------------------------

function DiscoverSection({ movies, onSelect }) {
  return (
    <section className="nb-section" id="discover">
      <Reveal as="div" className="nb-section__head">
        <span className="nb-eyebrow">Tonight&rsquo;s stories</span>
        <h2 className="nb-section__title">Discover something new.</h2>
        <p className="nb-section__sub">Fresh from the NOBOCHITRO catalogue, sorted by what people rate highest.</p>
      </Reveal>

      <Reveal as="div" className="nb-poster-row" delay={80}>
        {movies === null && <SkeletonPosterRow count={7} />}

        {Array.isArray(movies) && movies.length === 0 && (
          <EmptyState
            icon="🎞️"
            title="The catalogue is warming up"
            message="New titles are added often — check back soon."
            compact
          />
        )}

        {Array.isArray(movies) && movies.length > 0 && (
          <div className="nb-poster-row__track">
            {movies.slice(0, 10).map((movie) => (
              <div className="nb-poster-row__item" key={movie.MOVIEID}>
                <MovieCard movie={movie} onClick={onSelect} />
              </div>
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Personalization
// ---------------------------------------------------------------------------

const FEATURES = [
  { title: 'Rate & review', text: 'Put a number and a few words on every film you finish — yours, in your own voice.' },
  { title: 'Bucket list', text: 'Keep a running list of what to watch next, so nothing good gets forgotten.' },
  { title: 'Movie Passport', text: 'Watch your way across countries, genres, and decades, and see the map fill in.' },
  { title: 'Experience Journal', text: 'Capture the feeling a film left behind, not just the score you gave it.' },
  { title: 'Taste Match', text: 'See how your taste lines up with a friend\u2019s, film for film.' },
];

function PersonalizationSection() {
  return (
    <section className="nb-section nb-section--split" id="personalize">
      <Reveal as="div" className="nb-split__text">
        <span className="nb-eyebrow">Cinema, your way</span>
        <h2 className="nb-section__title">Not just a database. Your record of watching.</h2>
        <ul className="nb-feature-list">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal as="div" className="nb-split__art" delay={120} aria-hidden="true">
        <div className="nb-split__art-image" />
        <div className="nb-split__art-frame" />
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Movie Passport spotlight
// ---------------------------------------------------------------------------

function PassportSection() {
  return (
    <section className="nb-section nb-section--band">
      <Reveal as="div" className="nb-band__inner">
        <span className="nb-eyebrow">Your passport through cinema</span>
        <h2 className="nb-section__title">Every film is a small trip somewhere.</h2>
        <p className="nb-section__sub nb-section__sub--wide">
          Countries explored. Genres discovered. Milestones marked along the way. The Movie
          Passport turns your watch history into a map of where the stories have taken you.
        </p>
        <div className="nb-passport-chips" aria-hidden="true">
          <span>Countries</span>
          <span>Genres</span>
          <span>Decades</span>
          <span>Milestones</span>
        </div>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Experience Journal spotlight
// ---------------------------------------------------------------------------

function JournalSection() {
  return (
    <section className="nb-section nb-section--split">
      <Reveal as="div" className="nb-split__art" aria-hidden="true">
        <div className="nb-split__art-image nb-split__art-image--journal" />
        <div className="nb-split__art-frame" />
      </Reveal>
      <Reveal as="div" className="nb-split__text" delay={120}>
        <span className="nb-eyebrow">Some movies deserve more than a rating</span>
        <h2 className="nb-section__title">Write down what it actually felt like.</h2>
        <p className="nb-section__sub">
          A star rating is quick, but it forgets fast. The Experience Journal is where the
          thoughts, the moments, and the reactions a film leaves behind actually get kept.
        </p>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------

function CommunitySection({ posts, onJoin }) {
  return (
    <section className="nb-section" id="community">
      <Reveal as="div" className="nb-section__head">
        <span className="nb-eyebrow">The community</span>
        <h2 className="nb-section__title">See cinema through other people&rsquo;s eyes.</h2>
        <p className="nb-section__sub">Real posts from real members, about the films they just watched.</p>
      </Reveal>

      {posts === null && (
        <div className="nb-post-grid">
          {Array.from({ length: 3 }, (_, i) => (
            <div className="nb-post-card nb-post-card--skeleton" key={i} aria-hidden="true" />
          ))}
        </div>
      )}

      {Array.isArray(posts) && posts.length === 0 && (
        <EmptyState
          icon="💬"
          title="No posts yet"
          message="Be one of the first voices in the NOBOCHITRO community."
          actionLabel="Join NOBOCHITRO"
          onAction={onJoin}
          compact
        />
      )}

      {Array.isArray(posts) && posts.length > 0 && (
        <Reveal as="div" className="nb-post-grid" delay={80}>
          {posts.slice(0, 3).map((post) => (
            <article className="nb-post-card" key={post.POSTID}>
              <div className="nb-post-card__author">
                {post.PROFILEPICTUREURL
                  ? <img src={post.PROFILEPICTUREURL} alt="" />
                  : <span aria-hidden="true">{(post.DISPLAYNAME || post.USERNAME || '?').charAt(0).toUpperCase()}</span>}
                <div>
                  <span className="nb-post-card__name">{post.DISPLAYNAME || post.USERNAME}</span>
                  <span className="nb-post-card__time">{timeAgo(post.POSTDATE)}</span>
                </div>
              </div>
              <p className="nb-post-card__text">{post.POSTTEXT}</p>
              {post.MOVIETITLE && <p className="nb-post-card__movie">on &ldquo;{post.MOVIETITLE}&rdquo;</p>}
              <div className="nb-post-card__meta">
                <span>{post.LIKECOUNT ?? 0} likes</span>
                <span>{post.COMMENTCOUNT ?? 0} comments</span>
              </div>
            </article>
          ))}
        </Reveal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Weekly Challenges
// ---------------------------------------------------------------------------

function ChallengesSection({ challenges, onJoin }) {
  return (
    <section className="nb-section nb-section--band" id="challenges">
      <Reveal as="div" className="nb-band__inner">
        <span className="nb-eyebrow">A new challenge, every week</span>
        <h2 className="nb-section__title">Give your watching a little direction.</h2>

        {challenges === null && (
          <div className="nb-challenge-grid">
            {Array.from({ length: 2 }, (_, i) => (
              <div className="nb-challenge-card nb-challenge-card--skeleton" key={i} aria-hidden="true" />
            ))}
          </div>
        )}

        {Array.isArray(challenges) && challenges.length === 0 && (
          <EmptyState icon="🏆" title="No active challenge right now" message="Check back soon — new ones appear regularly." compact />
        )}

        {Array.isArray(challenges) && challenges.length > 0 && (
          <div className="nb-challenge-grid">
            {challenges.slice(0, 3).map((c) => {
              const left = daysLeft(c.ENDDATE);
              return (
                <div className="nb-challenge-card" key={c.CHALLENGEID}>
                  <h3>{c.TITLE}</h3>
                  <p>{c.DESCRIPTION}</p>
                  <div className="nb-challenge-card__meta">
                    {c.XPREWARD ? <span className="nb-challenge-card__xp">+{c.XPREWARD} XP</span> : null}
                    {left !== null && left >= 0 ? <span>{left === 0 ? 'Ends today' : `${left} day${left === 1 ? '' : 's'} left`}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button type="button" className="nb-btn nb-btn--ghost" onClick={onJoin}>
          Join to take part
        </button>
      </Reveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA + footer
// ---------------------------------------------------------------------------

function FinalCta({ onJoin }) {
  return (
    <section className="nb-final">
      <div className="nb-final__backdrop" aria-hidden="true">
        <div className="nb-final__image" />
        <div className="nb-final__vignette" />
        <div className="nb-final__grain" />
      </div>
      <Reveal as="div" className="nb-final__content">
        <h2>
          Your next favourite story <em>is out there.</em>
        </h2>
        <p>Start discovering.</p>
        <button type="button" className="nb-btn nb-btn--primary nb-btn--lg" onClick={onJoin}>
          Explore NOBOCHITRO
        </button>
      </Reveal>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="nb-footer">
      <div className="nb-footer__row">
        <div className="nb-footer__brand">
          <img src="/images/nobochitro-mark.png" alt="" width="22" height="22" />
          <span>
            NOBO<em>CHITRO</em>
          </span>
        </div>
        <nav className="nb-footer__links" aria-label="Footer">
          <button type="button" onClick={() => scrollToId('discover')}>Movies</button>
          <button type="button" onClick={() => scrollToId('community')}>Community</button>
          <button type="button" onClick={() => scrollToId('challenges')}>Challenges</button>
        </nav>
      </div>
      <p className="nb-footer__legal">&copy; {new Date().getFullYear()} NOBOCHITRO. Made for people who love movies.</p>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage({ onAuthenticated }) {
  const [modalMode, setModalMode] = useState(null); // null | 'signin' | 'register'
  const [movies, setMovies] = useState(null);
  const [challenges, setChallenges] = useState(null);
  const [posts, setPosts] = useState(null);
  const scrolled = useScrolled();

  useEffect(() => {
    let active = true;

    listMovies({ sort: 'top_rated' })
      .then((rows) => { if (active) setMovies(rows); })
      .catch(() => { if (active) setMovies([]); });

    listChallenges()
      .then((rows) => { if (active) setChallenges(rows); })
      .catch(() => { if (active) setChallenges([]); });

    listPosts()
      .then((rows) => { if (active) setPosts(rows); })
      .catch(() => { if (active) setPosts([]); });

    return () => { active = false; };
  }, []);

  const openSignIn = () => setModalMode('signin');
  const openJoin = () => setModalMode('register');

  return (
    <div className="landing">
      <LandingNav scrolled={scrolled} onLogin={openSignIn} onJoin={openJoin} />

      <main>
        <Hero onExplore={() => scrollToId('discover')} onJoin={openJoin} />
        <DiscoverSection movies={movies} onSelect={openJoin} />
        <PersonalizationSection />
        <PassportSection />
        <JournalSection />
        <CommunitySection posts={posts} onJoin={openJoin} />
        <ChallengesSection challenges={challenges} onJoin={openJoin} />
        <FinalCta onJoin={openJoin} />
      </main>

      <LandingFooter />

      {modalMode && (
        <AuthModal
          initialMode={modalMode}
          onClose={() => setModalMode(null)}
          onAuthenticated={onAuthenticated}
        />
      )}
    </div>
  );
}
