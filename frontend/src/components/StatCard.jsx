import './StatCard.css';

// A single headline number with its label. Used in rows on the stats
// dashboard, the passport and the admin dashboard.
export default function StatCard({ icon, value, label, hint, tone = 'default' }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      {icon && <span className="stat-card__icon" aria-hidden="true">{icon}</span>}
      <strong className="stat-card__value">{value}</strong>
      <span className="stat-card__label">{label}</span>
      {hint && <small className="stat-card__hint">{hint}</small>}
    </div>
  );
}
