import './Skeleton.css';

// Placeholder blocks shown while a request is in flight.
//
// The point is to reserve the same space the real content will occupy, so
// the page doesn't jump when data lands. A bare "Loading..." line collapses
// to nothing and then shoves everything down.

export function SkeletonBlock({ width = '100%', height = 16, radius = 'var(--radius-sm)' }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonPosterCard() {
  return (
    <div className="skeleton-card">
      <span className="skeleton skeleton-card__poster" />
      <SkeletonBlock width="80%" height={13} />
      <SkeletonBlock width="45%" height={11} />
    </div>
  );
}

// `count` posters laid out on the shared grid -- matches what the real
// results will look like once they arrive.
export function SkeletonPosterGrid({ count = 12 }) {
  return (
    <div className="poster-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <SkeletonPosterCard key={index} />)}
    </div>
  );
}

// Horizontal row, for the homepage carousels.
export function SkeletonPosterRow({ count = 7 }) {
  return (
    <div className="skeleton-row" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <SkeletonPosterCard key={index} />)}
    </div>
  );
}

export function SkeletonLines({ lines = 3 }) {
  return (
    <div className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBlock key={index} width={index === lines - 1 ? '60%' : '100%'} height={13} />
      ))}
    </div>
  );
}

// Wrap any loading region in this so screen readers announce the wait
// instead of silently reading a pile of empty boxes.
export function LoadingRegion({ label = 'Loading', children }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
