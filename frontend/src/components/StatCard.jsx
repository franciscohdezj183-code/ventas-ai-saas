export function StatCard({ icon: Icon, label, value, trend }) {
  return (
    <article className="stat-card metric-card">
      {Icon ? (
        <span className="stat-icon metric-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      ) : null}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {trend ? <small>{trend}</small> : null}
      </div>
    </article>
  );
}
