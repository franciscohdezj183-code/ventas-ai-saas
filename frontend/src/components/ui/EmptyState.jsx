import { Inbox } from 'lucide-react';

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Sin registros',
  description = 'Cuando haya informacion disponible, aparecera aqui.',
  action
}) {
  return (
    <div className="state-card empty-state-card">
      <Icon size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
