export function StatCard({ icon: Icon, label, value, trend }) {
  return (
    <article className="stat-card">
      {Icon ? (
        <span className="stat-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      ) : null}
      <span>{label}</span>
      <strong>{value}</strong>
      {trend ? <small>{trend}</small> : null}
    </article>
  );
}
