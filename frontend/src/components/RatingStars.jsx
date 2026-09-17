import { useState } from 'react';
import './RatingStars.css';

// A 1-10 star rating control.
//
// Two modes:
//   readOnly  -> a compact display of a score someone already gave
//   editable  -> hover previews the score, click commits it
//
// Ratings in the database are integers 1-10 and the CHECK constraint on
// Review.RatingValue enforces that, so this deliberately offers exactly ten
// whole stars rather than a 5-star half-step control that would need
// converting at the boundary.
export default function RatingStars({
  value = 0,
  onChange,
  readOnly = false,
  size = 'md',
  showNumber = true,
  label,
}) {
  const [hovered, setHovered] = useState(0);
  const displayed = hovered || value || 0;

  if (readOnly) {
    return (
      <span className={`rating-stars rating-stars--read rating-stars--${size}`}>
        <span className="rating-stars__icon" aria-hidden="true">★</span>
        <b>{value ? Number(value).toFixed(1) : '–'}</b>
        {showNumber && <small>/10</small>}
      </span>
    );
  }

  return (
    <div className={`rating-stars rating-stars--${size}`}>
      {label && <p className="rating-stars__label">{label}</p>}
      <div
        className="rating-stars__row"
        role="radiogroup"
        aria-label={label || 'Rate this movie out of ten'}
        onMouseLeave={() => setHovered(0)}
      >
        {Array.from({ length: 10 }, (_, index) => {
          const star = index + 1;
          const filled = star <= displayed;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={star === value}
              aria-label={`${star} out of 10`}
              className={`rating-stars__star ${filled ? 'rating-stars__star--on' : ''}`}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onClick={() => onChange?.(star)}
            >
              ★
            </button>
          );
        })}
      </div>
      {showNumber && (
        <p className="rating-stars__value">
          {displayed ? <><strong>{displayed}</strong>/10</> : 'Not rated yet'}
        </p>
      )}
    </div>
  );
}
