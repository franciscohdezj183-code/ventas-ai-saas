import { Inbox } from 'lucide-react';

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Sin registros',
  description = 'Cuando haya informacion disponible, aparecera aqui.',
  action
}) {
  return (
    <div className="state-card empty-state-card card bg-base-100 border border-base-300 shadow-sm" role="status">
      <span className="state-card-icon">
        <Icon size={24} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
