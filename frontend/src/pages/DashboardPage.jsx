import { ChartNoAxesCombined, Sparkles } from 'lucide-react';
import { CommercialDashboard } from '../features/dashboard/CommercialDashboard.jsx';

const recentActivity = [
  { title: 'Nueva empresa registrada', detail: 'Pendiente de configurar usuarios' },
  { title: 'Catalogo listo para carga', detail: 'Productos y servicios preparados' },
  { title: 'Leads en seguimiento', detail: 'Bandeja inicial disponible' }
];

export function DashboardPage() {
  return (
    <>
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Resumen general</p>
          <h2>Control operativo para negocios pequenos</h2>
          <p>
            Vista inicial para administrar empresas, usuarios, catalogos, leads y conversaciones
            desde un solo panel.
          </p>
        </div>
        <button className="primary-button" type="button">
          <Sparkles size={18} aria-hidden="true" />
          Nueva empresa
        </button>
      </section>

      <CommercialDashboard />

      <section className="panel-section activity-panel">
        <div className="section-header">
          <div>
            <h2>Actividad</h2>
            <p>Eventos recientes del panel.</p>
          </div>
        </div>

        <div className="activity-list">
          {recentActivity.map((item) => (
            <article className="activity-item" key={item.title}>
              <span>
                <ChartNoAxesCombined size={16} aria-hidden="true" />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
