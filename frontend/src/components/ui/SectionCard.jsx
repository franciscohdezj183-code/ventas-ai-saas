export function SectionCard({ title, description, actions, children, className = '' }) {
  return (
    <section className={`section-card ${className}`}>
      {(title || description || actions) ? (
        <header className="section-card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="header-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="section-card-body">{children}</div>
    </section>
  );
}
