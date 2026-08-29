const ICONS = {
  mountain: (
    <path d="M4 20L10 9l4 6 3-4 5 9H4z" />
  ),
  wave: (
    <path d="M2 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0 4 3 6 0" fill="none" strokeWidth="1.6" stroke="currentColor" />
  ),
  stars: (
    <>
      <circle cx="6" cy="7" r="1.3" />
      <circle cx="16" cy="5" r="1" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="15" r="1" />
      <circle cx="8" cy="18" r="1.1" />
    </>
  ),
  moon: <path d="M15 3a9 9 0 1 0 6 15.7A9.3 9.3 0 0 1 15 3z" />,
  bolt: <path d="M13 2 4 14h6l-2 8 10-13h-6l1-7z" />,
  city: (
    <path d="M3 21V9l4-3v3l4-3v5l4-3v9l3-2v7H3z" />
  ),
};

// A generic, non-figurative "poster" tile -- a 2:3 rectangle with a
// gradient and a simple genre-suggestive icon (mountain, wave, stars,
// moon, bolt, city skyline). No character, film, or brand is depicted;
// this is original iconography, not sourced imagery.
export default function PosterTile({ top, left, rotate, hue, icon, size = 1 }) {
  return (
    <div
      className="poster-tile"
      style={{
        top,
        left,
        transform: `rotate(${rotate}deg) scale(${size})`,
        '--tile-hue': hue,
      }}
    >
      <svg viewBox="0 0 24 24" className="poster-tile__icon" fill="currentColor">
        {ICONS[icon]}
      </svg>
    </div>
  );
}
