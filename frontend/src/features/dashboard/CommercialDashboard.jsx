import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  MessageSquareText,
  PackageSearch,
  Percent,
  PlugZap,
  Trophy,
  Users,
  Wrench
} from 'lucide-react';
import { StatCard } from '../../components/StatCard.jsx';
import { fetchCommercialDashboard } from './dashboardApi.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}

const emptyDashboard = {
  date_range: {
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  },
  totals: {
    conversaciones_hoy: 0,
    leads_nuevos: 0,
    leads_ganados: 0,
    total_leads: 0,
    tasa_conversion: 0,
    empresas_activas: 0,
    sesiones_whatsapp_conectadas: 0
  },
  productos_mas_consultados: [],
  servicios_mas_consultados: [],
  errores_recientes: []
};

function maxConsultas(items) {
  return Math.max(...items.map((item) => item.consultas), 1);
}

function BarList({ emptyText, items, maxValue }) {
  if (items.length === 0) {
    return <div className="empty-state table-message">{emptyText}</div>;
  }

  return items.map((item) => (
    <div className="bar-row" key={item.id}>
      <span>{item.nombre}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${(item.consultas / maxValue) * 100}%` }} />
      </div>
      <strong>{item.consultas}</strong>
    </div>
  ));
}

export function CommercialDashboard() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [filters, setFilters] = useState({
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const topProductsMax = useMemo(
    () => maxConsultas(dashboard.productos_mas_consultados),
    [dashboard.productos_mas_consultados]
  );
  const topServicesMax = useMemo(
    () => maxConsultas(dashboard.servicios_mas_consultados),
    [dashboard.servicios_mas_consultados]
  );

  async function loadDashboard(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      setDashboard(await fetchCommercialDashboard(nextFilters));
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudo cargar el dashboard comercial.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value
    }));
  }

  function handleFilterSubmit(event) {
    event.preventDefault();
    loadDashboard(filters);
  }

  return (
    <section className="commercial-dashboard" aria-label="Dashboard comercial">
      {error ? <div className="form-alert">{error}</div> : null}

      <form className="dashboard-filters" onSubmit={handleFilterSubmit}>
        <label className="field-group" htmlFor="dashboard-start-date">
          <span>Fecha inicio</span>
          <input
            id="dashboard-start-date"
            name="fecha_inicio"
            onChange={handleFilterChange}
            type="date"
            value={filters.fecha_inicio}
          />
        </label>
        <label className="field-group" htmlFor="dashboard-end-date">
          <span>Fecha fin</span>
          <input
            id="dashboard-end-date"
            name="fecha_fin"
            onChange={handleFilterChange}
            type="date"
            value={filters.fecha_fin}
          />
        </label>
        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? 'Actualizando...' : 'Aplicar filtros'}
        </button>
      </form>

      <div className="commercial-stats-grid">
        <StatCard
          icon={MessageSquareText}
          label="Conversaciones"
          value={dashboard.totals.conversaciones_hoy}
          trend="Periodo seleccionado"
        />
        <StatCard
          icon={Users}
          label="Leads Nuevos"
          value={dashboard.totals.leads_nuevos}
          trend="Entradas al embudo"
        />
        <StatCard
          icon={Trophy}
          label="Leads Ganados"
          value={dashboard.totals.leads_ganados}
          trend="Cierres del periodo"
        />
        <StatCard
          icon={Percent}
          label="Conversion"
          value={`${dashboard.totals.tasa_conversion}%`}
          trend="Ganados sobre leads"
        />
        <StatCard
          icon={Building2}
          label="Empresas Activas"
          value={dashboard.totals.empresas_activas}
          trend="Segun tu alcance"
        />
        <StatCard
          icon={PlugZap}
          label="WhatsApp Conectadas"
          value={dashboard.totals.sesiones_whatsapp_conectadas}
          trend="Sesiones listas"
        />
        <StatCard
          icon={AlertTriangle}
          label="Errores Recientes"
          value={dashboard.errores_recientes.length}
          trend="Notificaciones y sesiones"
        />
        <StatCard
          icon={CheckCircle2}
          label="Total Leads"
          value={dashboard.totals.total_leads}
          trend="Periodo seleccionado"
        />
      </div>

      <div className="commercial-charts-grid">
        <article className="panel-section chart-panel">
          <div className="section-header">
            <div>
              <h2>Productos Mas Consultados</h2>
              <p>Menciones detectadas en conversaciones y leads.</p>
            </div>
            <PackageSearch size={22} aria-hidden="true" />
          </div>

          <div className="bar-chart">
            <BarList
              emptyText="Sin productos consultados en el periodo."
              items={dashboard.productos_mas_consultados}
              maxValue={topProductsMax}
            />
          </div>
        </article>

        <article className="panel-section chart-panel">
          <div className="section-header">
            <div>
              <h2>Servicios Mas Consultados</h2>
              <p>Menciones detectadas en conversaciones y leads.</p>
            </div>
            <Wrench size={22} aria-hidden="true" />
          </div>

          <div className="bar-chart">
            <BarList
              emptyText="Sin servicios consultados en el periodo."
              items={dashboard.servicios_mas_consultados}
              maxValue={topServicesMax}
            />
          </div>
        </article>
      </div>

      <article className="panel-section">
        <div className="section-header">
          <div>
            <h2>Errores Recientes</h2>
            <p>Problemas de notificaciones o sesiones WhatsApp.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Empresa</th>
                <th>Error</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.errores_recientes.length === 0 ? (
                <tr>
                  <td className="empty-state" colSpan="4">
                    Sin errores recientes.
                  </td>
                </tr>
              ) : (
                dashboard.errores_recientes.map((item) => (
                  <tr key={`${item.tipo}-${item.id}`}>
                    <td>{item.tipo}</td>
                    <td>{item.empresa_nombre ?? item.empresa_id ?? '-'}</td>
                    <td className="message-cell">{item.error ?? '-'}</td>
                    <td>{item.fecha_creacion ? new Date(item.fecha_creacion).toLocaleString('es-MX') : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
