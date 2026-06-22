import { CalendarPlus, CheckCircle2, PauseCircle, UsersRound } from 'lucide-react';

const metricCards = [
  {
    key: 'total',
    label: 'Total de clientes',
    hint: 'Registros disponibles',
    icon: UsersRound,
    tone: 'blue'
  },
  {
    key: 'active',
    label: 'Clientes activos',
    hint: 'En seguimiento',
    icon: CheckCircle2,
    tone: 'green'
  },
  {
    key: 'inactive',
    label: 'Clientes inactivos',
    hint: 'Cerrados o perdidos',
    icon: PauseCircle,
    tone: 'amber'
  },
  {
    key: 'newThisMonth',
    label: 'Nuevos este mes',
    hint: 'Altas recientes',
    icon: CalendarPlus,
    tone: 'cyan'
  }
];

export function LeadStats({ stats }) {
  return (
    <section className="customer-stats-grid" aria-label="Indicadores de clientes">
      {metricCards.map((card) => {
        const Icon = card.icon;

        return (
          <article className={`customer-stat-card ${card.tone}`} key={card.key}>
            <span className="customer-stat-icon">
              <Icon size={19} aria-hidden="true" />
            </span>
            <div>
              <strong>{stats[card.key] ?? 0}</strong>
              <small>{card.label}</small>
              <p>{card.hint}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}
