import './RatingHistogram.css';

// The 10-down-to-1 bar chart on the movie details page.
//
// Bars are scaled against the LARGEST bucket rather than against the total,
// otherwise a movie whose ratings cluster tightly on 8 and 9 renders as two
// stubs and the shape of the distribution is lost.
export default function RatingHistogram({ distribution = [], totalRatings = 0, averageRating }) {
  if (!totalRatings) {
    return (
      <p className="histogram__none">
        No ratings yet — be the first to rate this film.
      </p>
    );
  }

  const peak = Math.max(...distribution.map((row) => row.count), 1);

  return (
    <div className="histogram">
      <div className="histogram__summary">
        <div>
          <strong className="histogram__average">{averageRating?.toFixed(1) ?? '–'}</strong>
          <span className="histogram__outof">/10</span>
        </div>
        <p className="histogram__count">
          {totalRatings.toLocaleString()} {totalRatings === 1 ? 'rating' : 'ratings'}
        </p>
      </div>

      <ul className="histogram__bars">
        {distribution.map((row) => (
          <li className="histogram__row" key={row.rating}>
            <span className="histogram__label">{row.rating}</span>
            <span className="histogram__track">
              <span
                className="histogram__fill"
                style={{ width: `${(row.count / peak) * 100}%` }}
              />
            </span>
            <span className="histogram__percent">
              {row.percent}%
              <small>{row.count.toLocaleString()}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
