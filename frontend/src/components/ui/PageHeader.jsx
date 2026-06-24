import { ActionBar } from './ActionBar.jsx';

export function PageHeader({ eyebrow, title, description, actions, className = '' }) {
  return (
    <header className={['page-header', className].filter(Boolean).join(' ')}>
      <div className="page-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <ActionBar className="header-actions">{actions}</ActionBar> : null}
    </header>
  );
}
