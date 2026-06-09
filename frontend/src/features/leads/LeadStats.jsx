import { StatCard } from '../../components/StatCard.jsx';

export function LeadStats({ stats }) {
  return (
    <section className="lead-stats-grid" aria-label="Estadisticas de leads">
      <StatCard label="Total leads" value={stats.total ?? 0} trend="Todos los estados" />
      <StatCard label="Nuevos" value={stats.nuevo ?? 0} trend="Por contactar" />
      <StatCard label="En proceso" value={stats.en_proceso ?? 0} trend="Seguimiento activo" />
      <StatCard label="Ganados" value={stats.ganado ?? 0} trend="Convertidos" />
      <StatCard label="Perdidos" value={stats.perdido ?? 0} trend="Cerrados sin venta" />
    </section>
  );
}
