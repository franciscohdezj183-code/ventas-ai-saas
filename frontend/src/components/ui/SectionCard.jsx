import { ActionBar } from './ActionBar.jsx';

export function SectionCard({ title, description, actions, children, className = '' }) {
  return (
    <section className={['section-card', 'card', 'bg-base-100', 'border', 'border-base-300', 'shadow-sm', className].filter(Boolean).join(' ')}>
      {(title || description || actions) ? (
        <header className="section-card-header">
          <div className="section-card-heading">
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <ActionBar className="header-actions">{actions}</ActionBar> : null}
        </header>
      ) : null}
      <div className="section-card-body card-body">{children}</div>
    </section>
  );
}
