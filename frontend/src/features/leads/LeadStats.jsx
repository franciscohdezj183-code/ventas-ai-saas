import { CheckCircle2, CircleDollarSign, PhoneCall, Target, Trophy } from 'lucide-react';

const cards = [
  { key: 'nuevo', label: 'Nuevos', icon: Target, hint: 'Por atender' },
  { key: 'contactado', label: 'Contactados', icon: PhoneCall, hint: 'Primer contacto' },
  { key: 'cotizado', label: 'Cotizados', icon: CircleDollarSign, hint: 'Propuesta enviada' },
  { key: 'ganado', label: 'Ganados', icon: Trophy, hint: 'Venta cerrada' },
  { key: 'perdido', label: 'Perdidos', icon: CheckCircle2, hint: 'Cierre sin venta' }
];

export function LeadStats({ stats }) {
  return (
    <section className="crm-summary-grid" aria-label="Resumen de leads">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <article className="crm-summary-card" key={card.key}>
            <span>
              <Icon size={18} aria-hidden="true" />
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
