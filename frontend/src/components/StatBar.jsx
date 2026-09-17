import './StatBar.css';

// Generic horizontal bar list used by the statistics dashboard for
// "movies by genre", "movies per month" and similar breakdowns.
//
// Bars scale against the largest value in the set for the same reason the
// rating histogram does -- relative shape matters more than absolute width.
export default function StatBar({ data = [], emptyMessage = 'Nothing to chart yet.', suffix = '' }) {
  if (!data.length) {
    return <p className="stat-bar__empty">{emptyMessage}</p>;
  }

  const peak = Math.max(...data.map((row) => row.value), 1);

  return (
    <ul className="stat-bar">
      {data.map((row) => (
        <li className="stat-bar__row" key={row.label}>
          <span className="stat-bar__label" title={row.label}>{row.label}</span>
          <span className="stat-bar__track">
            <span className="stat-bar__fill" style={{ width: `${(row.value / peak) * 100}%` }} />
          </span>
          <span className="stat-bar__value">{row.value}{suffix}</span>
        </li>
      ))}
    </ul>
  );
}
