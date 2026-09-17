import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';
import ErrorScreen from '../components/ErrorScreen';
import { SkeletonBlock, LoadingRegion } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { listChallenges, getUserChallenges, joinChallenge } from '../api/movies';
import './ChallengesPage.css';

// Achievement definitions are derived on the client from challenge progress,
// because the Badge/UserBadge tables are only populated by the backend when a
// challenge actually completes. Showing the full ladder -- locked and
// unlocked -- is what makes progress feel worth chasing.
const ACHIEVEMENTS = [
  { icon: '\u{1F3AC}', name: 'Movie Starter', requirement: 1, blurb: 'Complete your first challenge' },
  { icon: '\u{1F37F}', name: 'Regular', requirement: 3, blurb: 'Complete three challenges' },
  { icon: '\u{1F30E}', name: 'World Explorer', requirement: 5, blurb: 'Complete five challenges' },
  { icon: '\u{1F525}', name: 'On Fire', requirement: 10, blurb: 'Complete ten challenges' },
];

function ChallengeCard({ challenge, progress, onJoin, joining }) {
  const target = challenge.TARGETCOUNT || 1;
  const current = progress?.CURRENTPROGRESS ?? 0;
  const completed = progress?.COMPLETED === 1 || current >= target;
  const percent = Math.min(100, Math.round((current / target) * 100));

  return (
    <article className={`challenge-card ${completed ? 'challenge-card--done' : ''}`}>
      <header className="challenge-card__head">
        <div>
          <p className="challenge-card__eyebrow">
            {completed ? 'COMPLETED' : progress ? 'IN PROGRESS' : 'AVAILABLE'}
          </p>
          <h2>{challenge.TITLE}</h2>
        </div>
        <span className="challenge-card__xp">+{challenge.XPREWARD} XP</span>
      </header>

      {challenge.DESCRIPTION && <p className="challenge-card__desc">{challenge.DESCRIPTION}</p>}

      {progress ? (
        <>
          <div className="challenge-card__track">
            <span className="challenge-card__fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="challenge-card__progress">
            <strong>{current} / {target}</strong> complete
            {completed && <span className="challenge-card__badge">&#127942; Badge earned</span>}
          </p>
        </>
      ) : (
        <button
          type="button"
          className="challenge-card__join"
          disabled={joining}
          onClick={() => onJoin(challenge.CHALLENGEID)}
        >
          {joining ? 'Joining\u2026' : `Join challenge \u00b7 +${challenge.XPREWARD} XP`}
        </button>
      )}
    </article>
  );
}

export default function ChallengesPage({ user, onLogout, onNavigate }) {
  const [challenges, setChallenges] = useState([]);
  const [joined, setJoined] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('');
  const [joiningId, setJoiningId] = useState(null);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      // allSettled so a failure on one list doesn't blank the whole page.
      const [all, mine] = await Promise.allSettled([
        listChallenges(),
        getUserChallenges(user.userId),
      ]);

      if (all.status === 'rejected') {
        setErrorMessage(all.reason?.message || 'Could not load challenges.');
        setStatus('error');
        return;
      }

      setChallenges(all.value || []);
      setJoined(mine.status === 'fulfilled' ? (mine.value || []) : []);
      setStatus('ready');
    } catch (err) {
      setErrorMessage(err.message);
      setStatus('error');
    }
  }, [user.userId]);

  useEffect(() => { load(); }, [load]);

  async function handleJoin(challengeId) {
    setJoiningId(challengeId);
    try {
      await joinChallenge(challengeId);
      toast.success('Challenge joined. Log a film to start making progress.');
      await load();
    } catch (err) {
      // Surface the server's own message -- e.g. already joined.
      toast.error(err.message);
    } finally {
      setJoiningId(null);
    }
  }

  const header = (
    <Header
      searchValue={search}
      onSearchChange={setSearch}
      onLogout={onLogout}
      activePage="challenges"
      onNavigate={onNavigate}
    />
  );

  if (status === 'loading') {
    return (
      <div className="challenges-page">
        {header}
        <main className="challenges-wrap">
          <LoadingRegion label="Loading challenges">
            <SkeletonBlock width="260px" height={34} />
            <SkeletonBlock height={150} radius="var(--radius-lg)" />
            <SkeletonBlock height={150} radius="var(--radius-lg)" />
          </LoadingRegion>
        </main>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="challenges-page">
        {header}
        <ErrorScreen
          variant={500}
          detail={errorMessage}
          actionLabel="Back to home"
          onAction={() => onNavigate('home')}
        />
      </div>
    );
  }

  const progressFor = (id) => joined.find((row) => row.CHALLENGEID === id);
  const completedCount = joined.filter(
    (row) => row.COMPLETED === 1
  ).length;

  return (
    <div className="challenges-page">
      {header}
      <main className="challenges-wrap">
        <header className="challenges-hero">
          <p className="challenges-hero__eyebrow">WEEKLY CHALLENGES</p>
          <h1>Give your watching a direction.</h1>
          <span>Join a challenge, then log films in your journal — progress updates itself.</span>
        </header>

        <section className="challenges-list">
          {challenges.length === 0 ? (
            <EmptyState
              icon={'\u{1F3C1}'}
              title="No challenges running"
              message="There are no active challenges right now. An admin can create one from the admin console."
            />
          ) : (
            challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.CHALLENGEID}
                challenge={challenge}
                progress={progressFor(challenge.CHALLENGEID)}
                joining={joiningId === challenge.CHALLENGEID}
                onJoin={handleJoin}
              />
            ))
          )}
        </section>

        <section className="achievements">
          <div className="challenges-section-heading">
            <div>
              <p>ACHIEVEMENTS</p>
              <h2>Badges you can earn</h2>
            </div>
            <span>{completedCount} challenge{completedCount === 1 ? '' : 's'} completed</span>
          </div>

          <div className="badge-grid">
            {ACHIEVEMENTS.map((badge) => {
              const unlocked = completedCount >= badge.requirement;
              return (
                <div
                  key={badge.name}
                  className={`badge ${unlocked ? 'badge--unlocked' : 'badge--locked'}`}
                >
                  <span className="badge__icon" aria-hidden="true">{badge.icon}</span>
                  <strong className="badge__name">{badge.name}</strong>
                  <small className="badge__blurb">{badge.blurb}</small>
                  <span className="badge__state">
                    {unlocked ? 'Unlocked' : `${completedCount}/${badge.requirement}`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
