export function SectionCard({ title, description, actions, children, className = '' }) {
  return (
    <section className={`section-card card bg-base-100 border border-base-300 shadow-sm ${className}`}>
      {(title || description || actions) ? (
        <header className="section-card-header card-title">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="header-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="section-card-body card-body">{children}</div>
    </section>
  );
}
