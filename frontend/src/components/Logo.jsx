export default function Logo({ size = 48 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nc-accent" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8fdcff" />
          <stop offset="100%" stopColor="#2e86ab" />
        </linearGradient>
      </defs>

      {/* Outer reel ring */}
      <circle cx="50" cy="50" r="45" stroke="url(#nc-accent)" strokeWidth="3" />

      {/* Spiral sweep, echoing a film reel's wound strip */}
      <path
        d="M50 8 A42 42 0 1 1 15 68"
        stroke="url(#nc-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* Center hub */}
      <circle cx="50" cy="50" r="10" fill="url(#nc-accent)" />

      {/* Sprocket holes, arranged around the hub like reel spokes */}
      <circle cx="50" cy="26" r="6" fill="url(#nc-accent)" />
      <circle cx="71" cy="39" r="6" fill="url(#nc-accent)" />
      <circle cx="71" cy="61" r="6" fill="url(#nc-accent)" />
      <circle cx="29" cy="61" r="6" fill="url(#nc-accent)" />
      <circle cx="29" cy="39" r="6" fill="url(#nc-accent)" />
    </svg>
  );
}
