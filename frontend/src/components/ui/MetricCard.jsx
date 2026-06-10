export function MetricCard({ icon: Icon, label, value, helper, tone = 'blue' }) {
  return (
    <article className={`metric-card ${tone}`}>
      {Icon ? (
        <span className="metric-icon">
          <Icon size={19} aria-hidden="true" />
        </span>
      ) : null}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {helper ? <small>{helper}</small> : null}
      </div>
    </article>
  );
}
