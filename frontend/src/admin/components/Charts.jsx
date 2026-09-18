// Charts drawn as plain SVG.
//
// Deliberately not a charting library: recharts or chart.js would add a
// megabyte of dependency to draw one line, one column chart and two bar
// lists, none of which need tooltips, zooming or animation. SVG inherits the
// theme's CSS variables for free, scales with the container, and stays
// readable in a code review.
//
// Every component takes points already shaped by the backend, so an empty
// range renders a flat baseline instead of crashing on an empty array.

const EMPTY = <p className="adm-panel__note">No data in this range yet.</p>;


// ---------- Line chart (user growth, review activity) ----------

export function LineChart({ points, height = 170, label = 'value', formatX }) {
  if (!points || points.length === 0) return EMPTY;

  const width = 640;
  const padding = { top: 12, right: 10, bottom: 22, left: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  // A flat series (every value identical) would make min === max and divide
  // by zero below, so the floor is pinned at 0 unless the data goes lower.
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (index) => (points.length === 1
    ? padding.left + innerWidth / 2
    : padding.left + (index / (points.length - 1)) * innerWidth);
  const y = (value) => padding.top + innerHeight - ((value - min) / span) * innerHeight;

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${padding.top + innerHeight} L${x(0)},${padding.top + innerHeight} Z`;

  // Four gridlines is enough to read a value off without turning the chart
  // into graph paper.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(min + fraction * span));
  const uniqueTicks = [...new Set(ticks)];

  // Roughly six x-labels regardless of whether the range holds 7 points or 30.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      className="adm-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} over time`}
    >
      <defs>
        <linearGradient id="admFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {uniqueTicks.map((tick) => (
        <g key={tick}>
          <line
            className="adm-chart__grid"
            x1={padding.left} x2={width - padding.right}
            y1={y(tick)} y2={y(tick)}
          />
          <text className="adm-chart__label" x={4} y={y(tick) + 3}>
            {tick.toLocaleString()}
          </text>
        </g>
      ))}

      <path className="adm-chart__area" d={area} />
      <path className="adm-chart__line" d={line} />

      {points.map((point, index) => (
        <circle key={index} className="adm-chart__dot" cx={x(index)} cy={y(point.value)} r={2.2}>
          <title>{`${formatX ? formatX(point.date) : ''}: ${point.value.toLocaleString()}`}</title>
        </circle>
      ))}

      {points.map((point, index) => (
        index % labelStep === 0 || index === points.length - 1 ? (
          <text
            key={`label-${index}`}
            className="adm-chart__label"
            x={x(index)}
            y={height - 6}
            textAnchor="middle"
          >
            {formatX ? formatX(point.date) : ''}
          </text>
        ) : null
      ))}
    </svg>
  );
}


// ---------- Column chart (rating distribution) ----------

export function ColumnChart({ bars, height = 170, gold = false }) {
  if (!bars || bars.length === 0) return EMPTY;

  const width = 640;
  const padding = { top: 12, right: 8, bottom: 24, left: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const slot = innerWidth / bars.length;
  const barWidth = Math.min(slot * 0.62, 42);

  return (
    <svg
      className="adm-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Distribution"
    >
      <line
        className="adm-chart__grid"
        x1={padding.left} x2={width - padding.right}
        y1={padding.top + innerHeight} y2={padding.top + innerHeight}
      />
      {bars.map((bar, index) => {
        // Non-zero values always get at least 2px so a category with a single
        // entry is visible rather than indistinguishable from an empty one.
        const barHeight = bar.value === 0 ? 0 : Math.max(2, (bar.value / max) * innerHeight);
        const x = padding.left + index * slot + (slot - barWidth) / 2;
        const y = padding.top + innerHeight - barHeight;
        return (
          <g key={bar.label}>
            <rect
              className={`adm-chart__bar ${gold ? 'adm-chart__bar--gold' : ''}`}
              x={x} y={y} width={barWidth} height={barHeight} rx={3}
            >
              <title>{`${bar.label}: ${bar.value.toLocaleString()}`}</title>
            </rect>
            <text
              className="adm-chart__label"
              x={x + barWidth / 2}
              y={height - 8}
              textAnchor="middle"
            >
              {bar.label}
            </text>
          </g>
        );
      })}
      <text className="adm-chart__label" x={2} y={padding.top + 4}>{max.toLocaleString()}</text>
    </svg>
  );
}


// ---------- Horizontal bars (popular genres, leaderboards) ----------
//
// Genre names don't fit under vertical columns, so these run sideways --
// plain divs rather than SVG, because the labels then wrap and truncate using
// ordinary CSS.
export function BarList({ items, gold = false }) {
  if (!items || items.length === 0) return EMPTY;

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="adm-hbar">
      {items.map((item) => (
        <div className="adm-hbar__row" key={item.label}>
          <span title={item.label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.label}
          </span>
          <span className="adm-hbar__track">
            <span
              className={`adm-hbar__fill ${gold ? 'adm-hbar__fill--gold' : ''}`}
              style={{ width: `${Math.max(item.value === 0 ? 0 : 3, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="adm-hbar__value">{item.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}


// ---------- Range switcher ----------

const RANGES = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '3m', label: '3 Months' },
  { key: '1y', label: '1 Year' },
];

export function RangePicker({ value, onChange }) {
  return (
    <div className="adm-range" role="group" aria-label="Time range">
      {RANGES.map((range) => (
        <button
          key={range.key}
          type="button"
          className={`adm-range__btn ${value === range.key ? 'adm-range__btn--active' : ''}`}
          aria-pressed={value === range.key}
          onClick={() => onChange(range.key)}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

// Axis labels: a day bucket wants "14 Jun", a month bucket wants "Jun". The
// range key decides which, so a 12-month chart doesn't repeat the year twelve
// times across the bottom.
export function axisFormatter(range) {
  return (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (range === '1y') return date.toLocaleDateString(undefined, { month: 'short' });
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
}
