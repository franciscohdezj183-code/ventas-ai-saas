import { useEffect, useMemo, useState } from 'react';
import { Building2, MessageSquareText, ShoppingCart, Target, Users } from 'lucide-react';
import { StatCard } from '../../components/StatCard.jsx';
import { fetchCommercialDashboard } from './dashboardApi.js';

const emptyDashboard = {
  totals: {
    total_leads: 0,
    conversaciones_hoy: 0,
    ventas_potenciales: 0,
    empresas_registradas: 0
  },
  lead_states: [],
  productos_mas_consultados: []
};

const leadLabels = {
  NUEVO: 'Nuevos',
  EN_PROCESO: 'En proceso',
  GANADO: 'Ganados',
  PERDIDO: 'Perdidos'
};

function maxConsultas(items) {
  return Math.max(...items.map((item) => item.consultas), 1);
}

export function CommercialDashboard() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const topProductsMax = useMemo(
    () => maxConsultas(dashboard.productos_mas_consultados),
    [dashboard.productos_mas_consultados]
  );

  const leadTotal = Math.max(dashboard.totals.total_leads, 1);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setIsLoading(true);
        setError('');
        setDashboard(await fetchCommercialDashboard());
      } catch (requestError) {
        setError(requestError?.response?.data?.message ?? 'No se pudo cargar el dashboard comercial.');
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (isLoading) {
    return <div className="panel-section commercial-loading">Cargando dashboard comercial...</div>;
  }

  return (
    <section className="commercial-dashboard" aria-label="Dashboard comercial">
      {error ? <div className="form-alert">{error}</div> : null}

      <div className="commercial-stats-grid">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={dashboard.totals.total_leads}
          trend="Prospectos acumulados"
        />
        <StatCard
          icon={MessageSquareText}
          label="Conversaciones Hoy"
          value={dashboard.totals.conversaciones_hoy}
          trend="Interacciones del dia"
        />
        <StatCard
          icon={ShoppingCart}
          label="Ventas Potenciales"
          value={dashboard.totals.ventas_potenciales}
          trend="Leads nuevos o en proceso"
        />
        <StatCard
          icon={Building2}
          label="Empresas Registradas"
          value={dashboard.totals.empresas_registradas}
          trend="Cuentas en plataforma"
        />
      </div>

      <div className="commercial-charts-grid">
        <article className="panel-section chart-panel">
          <div className="section-header">
            <div>
              <h2>Productos Más Consultados</h2>
              <p>Basado en menciones dentro de leads y conversaciones.</p>
            </div>
          </div>

          <div className="bar-chart">
            {dashboard.productos_mas_consultados.length === 0 ? (
              <div className="empty-state table-message">Sin productos consultados todavia.</div>
            ) : (
              dashboard.productos_mas_consultados.map((product) => (
                <div className="bar-row" key={product.id}>
                  <span>{product.nombre}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(product.consultas / topProductsMax) * 100}%` }}
                    />
                  </div>
                  <strong>{product.consultas}</strong>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="panel-section chart-panel">
          <div className="section-header">
            <div>
              <h2>Estado de Leads</h2>
              <p>Distribucion del embudo comercial.</p>
            </div>
          </div>

          <div className="lead-state-chart">
            <div className="donut-chart">
              <Target size={38} aria-hidden="true" />
              <strong>{dashboard.totals.total_leads}</strong>
              <span>Leads</span>
            </div>

            <div className="state-bars">
              {dashboard.lead_states.length === 0 ? (
                <div className="empty-state table-message">Sin leads registrados todavia.</div>
              ) : (
                dashboard.lead_states.map((state) => (
                  <div className="state-row" key={state.estado}>
                    <div>
                      <span>{leadLabels[state.estado] ?? state.estado}</span>
                      <strong>{state.total}</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className="state-fill"
                        style={{ width: `${(state.total / leadTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
