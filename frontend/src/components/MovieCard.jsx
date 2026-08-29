import './MovieCard.css';

export default function MovieCard({ movie, onClick }) {
  const rating = movie.AVGRATING;
  const hasRating = rating !== null && rating !== undefined;

  return (
    <button type="button" className="movie-card" onClick={onClick}>
      <div className="movie-card__poster">
        {movie.POSTERURL ? (
          <img src={movie.POSTERURL} alt={movie.TITLE} />
        ) : (
          <PosterPlaceholder title={movie.TITLE} year={movie.RELEASEYEAR} />
        )}

        <span className={`movie-card__rating ${hasRating ? '' : 'movie-card__rating--empty'}`}>
          {hasRating ? (
            <>
              <StarIcon /> {rating}
            </>
          ) : (
            'New'
          )}
        </span>
      </div>

      <div className="movie-card__info">
        <h3 className="movie-card__title">{movie.TITLE}</h3>
        <p className="movie-card__meta">
          {movie.RELEASEYEAR}
          {movie.RUNTIME ? ` · ${movie.RUNTIME} min` : ''}
        </p>
      </div>
    </button>
  );
}

// A film-strip-themed placeholder for movies with no poster image on
// file yet -- reuses the same sprocket-hole motif from the login page
// instead of a generic gray box or broken image icon.
function PosterPlaceholder({ title, year }) {
  const initial = title ? title.charAt(0).toUpperCase() : '?';

  return (
    <div className="poster-placeholder">
      <div className="poster-placeholder__sprockets poster-placeholder__sprockets--left" />
      <div className="poster-placeholder__sprockets poster-placeholder__sprockets--right" />
      <span className="poster-placeholder__initial">{initial}</span>
      <span className="poster-placeholder__year">{year}</span>
    </div>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor">
      <path d="M8 0.5l2.163 4.382 4.837.703-3.5 3.412.826 4.815L8 11.5l-4.326 2.312.826-4.815L1 6.585l4.837-.703L8 0.5z" />
    </svg>
  );
}
