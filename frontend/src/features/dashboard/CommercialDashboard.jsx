import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleOff,
  Clock3,
  MessageSquareText,
  PackageCheck,
  PackageSearch,
  PlugZap,
  TrendingUp,
  Users,
  Wrench
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/index.js';
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
  metrics: {
    leads_hoy: 0,
    conversaciones_hoy: 0,
    productos_activos: 0,
    servicios_activos: 0,
    whatsapp: {
      conectadas: 0,
      desconectadas: 0,
      total: 0,
      estado: 'DISCONNECTED'
    }
  },
  lead_states: [],
  daily_activity: [],
  productos_mas_consultados: [],
  servicios_mas_consultados: [],
  leads_recientes: [],
  actividad_reciente: [],
  errores_recientes: []
};

const leadStateLabels = {
  NUEVO: 'Nuevos',
  EN_PROCESO: 'En proceso',
  GANADO: 'Ganados',
  PERDIDO: 'Perdidos'
};

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function maxValue(items, key) {
  return Math.max(...items.map((item) => Number(item[key] ?? 0)), 1);
}

function MetricTile({ icon: Icon, label, value, detail, tone = 'blue' }) {
  return (
    <article className={`enterprise-metric ${tone}`}>
      <span className="enterprise-metric-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ConsultationBars({ emptyDescription, items }) {
  const maxConsultas = maxValue(items, 'consultas');

  if (items.length === 0) {
    return <EmptyState description={emptyDescription} title="Sin consultas registradas" />;
  }

  return (
    <div className="dashboard-bar-list">
      {items.map((item) => (
        <div className="dashboard-bar-row" key={item.id}>
          <div>
            <strong>{item.nombre}</strong>
            <span>{item.consultas} consultas</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.consultas / maxConsultas) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeadStateChart({ states }) {
  const total = states.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
  const maxTotal = maxValue(states, 'total');

  if (total === 0) {
    return <EmptyState description="Todavia no hay leads en el periodo seleccionado." title="Embudo sin datos" />;
  }

  return (
    <div className="lead-funnel-bars">
      {states.map((item) => (
        <div className="lead-funnel-row" key={item.estado}>
          <span>{leadStateLabels[item.estado] ?? item.estado}</span>
          <div className="bar-track">
            <div className={`bar-fill state-${item.estado.toLowerCase()}`} style={{ width: `${(item.total / maxTotal) * 100}%` }} />
          </div>
          <strong>{item.total}</strong>
        </div>
      ))}
    </div>
  );
}

function DailyActivityChart({ items }) {
  const maxDaily = Math.max(
    ...items.map((item) => Number(item.leads ?? 0) + Number(item.conversaciones ?? 0)),
    1
  );

  if (items.length === 0 || items.every((item) => Number(item.leads) + Number(item.conversaciones) === 0)) {
    return <EmptyState description="Aun no hay leads ni conversaciones para graficar." title="Sin actividad diaria" />;
  }

  return (
    <div className="daily-activity-chart">
      {items.map((item) => {
        const total = Number(item.leads ?? 0) + Number(item.conversaciones ?? 0);

        return (
          <div className="daily-activity-column" key={item.fecha}>
            <div className="daily-bars" title={`${item.fecha}: ${total} eventos`}>
              <span className="daily-bar conversations" style={{ height: `${(item.conversaciones / maxDaily) * 100}%` }} />
              <span className="daily-bar leads" style={{ height: `${(item.leads / maxDaily) * 100}%` }} />
            </div>
            <small>{item.fecha.slice(5)}</small>
          </div>
        );
      })}
    </div>
  );
}

function RecentLeads({ leads }) {
  if (leads.length === 0) {
    return <EmptyState description="Los nuevos leads apareceran aqui automaticamente." title="Sin leads recientes" />;
  }

  return (
    <div className="dashboard-list">
      {leads.map((lead) => (
        <article className="dashboard-list-item" key={lead.id}>
          <span className="list-avatar">{lead.nombre_cliente?.charAt(0) ?? 'L'}</span>
          <div>
            <strong>{lead.nombre_cliente}</strong>
            <p>{lead.interes ?? lead.telefono ?? 'Sin interes registrado'}</p>
          </div>
          <span className="status-badge info">{lead.estado}</span>
        </article>
      ))}
    </div>
  );
}

function RecentActivity({ items }) {
  if (items.length === 0) {
    return <EmptyState description="Los eventos importantes del panel apareceran aqui." title="Sin actividad reciente" />;
  }

  return (
    <div className="activity-list">
      {items.map((item) => (
        <article className="activity-item" key={item.id}>
          <span>
            <Activity size={16} aria-hidden="true" />
          </span>
          <div>
            <strong>{item.descripcion ?? `${item.accion} en ${item.modulo}`}</strong>
            <p>
              {item.empresa_nombre ?? 'Sistema'} · {formatDateTime(item.fecha)}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function CommercialDashboard() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [filters, setFilters] = useState({
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const metrics = dashboard.metrics ?? emptyDashboard.metrics;
  const whatsapp = metrics.whatsapp ?? emptyDashboard.metrics.whatsapp;
  const whatsappConnected = whatsapp.estado === 'CONNECTED' || Number(whatsapp.conectadas ?? 0) > 0;
  const totalConsultations = useMemo(
    () =>
      [...dashboard.productos_mas_consultados, ...dashboard.servicios_mas_consultados].reduce(
        (sum, item) => sum + Number(item.consultas ?? 0),
        0
      ),
    [dashboard.productos_mas_consultados, dashboard.servicios_mas_consultados]
  );

  async function loadDashboard(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      setDashboard({ ...emptyDashboard, ...(await fetchCommercialDashboard(nextFilters)) });
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
    <section className="commercial-dashboard enterprise-dashboard" aria-label="Dashboard empresarial">
      <div className="dashboard-hero enterprise-hero">
        <div>
          <p className="eyebrow">Panel empresarial</p>
          <h2>Resumen operativo en tiempo real</h2>
          <p>Monitorea leads, conversaciones, catalogo activo y actividad comercial desde una sola vista.</p>
        </div>
        <div className={whatsappConnected ? 'whatsapp-pill connected' : 'whatsapp-pill disconnected'}>
          {whatsappConnected ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleOff size={18} aria-hidden="true" />}
          <span>{whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</span>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => loadDashboard(filters)} /> : null}

      <form className="dashboard-filters enterprise-filters" onSubmit={handleFilterSubmit}>
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

      {isLoading ? <LoadingState message="Cargando indicadores del negocio..." /> : null}

      <div className="enterprise-metrics-grid">
        <MetricTile icon={Users} label="Leads del dia" value={metrics.leads_hoy} detail="Nuevos contactos hoy" />
        <MetricTile
          icon={MessageSquareText}
          label="Conversaciones del dia"
          value={metrics.conversaciones_hoy}
          detail="Mensajes recibidos hoy"
          tone="green"
        />
        <MetricTile
          icon={PackageCheck}
          label="Productos activos"
          value={metrics.productos_activos}
          detail="Disponibles en catalogo"
          tone="purple"
        />
        <MetricTile
          icon={Wrench}
          label="Servicios activos"
          value={metrics.servicios_activos}
          detail="Servicios publicados"
          tone="amber"
        />
        <MetricTile
          icon={PlugZap}
          label="WhatsApp"
          value={`${whatsapp.conectadas}/${whatsapp.total}`}
          detail={`${whatsapp.desconectadas} desconectadas`}
          tone={whatsappConnected ? 'green' : 'red'}
        />
        <MetricTile
          icon={TrendingUp}
          label="Conversion"
          value={`${dashboard.totals.tasa_conversion}%`}
          detail={`${dashboard.totals.leads_ganados} leads ganados`}
        />
      </div>

      <div className="enterprise-dashboard-grid">
        <article className="panel-section chart-panel activity-chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Actividad diaria</h2>
              <p>Leads y conversaciones del periodo.</p>
            </div>
            <BarChart3 size={22} aria-hidden="true" />
          </div>
          <DailyActivityChart items={dashboard.daily_activity} />
        </article>

        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Embudo de leads</h2>
              <p>Distribucion por estado.</p>
            </div>
            <Users size={22} aria-hidden="true" />
          </div>
          <LeadStateChart states={dashboard.lead_states} />
        </article>
      </div>

      <div className="enterprise-dashboard-grid">
        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Productos mas consultados</h2>
              <p>{totalConsultations} consultas detectadas en catalogo.</p>
            </div>
            <PackageSearch size={22} aria-hidden="true" />
          </div>
          <ConsultationBars
            emptyDescription="Sin productos consultados en el periodo seleccionado."
            items={dashboard.productos_mas_consultados}
          />
        </article>

        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Servicios mas consultados</h2>
              <p>Interes capturado desde conversaciones y leads.</p>
            </div>
            <Wrench size={22} aria-hidden="true" />
          </div>
          <ConsultationBars
            emptyDescription="Sin servicios consultados en el periodo seleccionado."
            items={dashboard.servicios_mas_consultados}
          />
        </article>
      </div>

      <div className="enterprise-dashboard-grid lower-grid">
        <article className="panel-section">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Leads recientes</h2>
              <p>Ultimos prospectos capturados.</p>
            </div>
            <Clock3 size={22} aria-hidden="true" />
          </div>
          <RecentLeads leads={dashboard.leads_recientes} />
        </article>

        <article className="panel-section">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Actividad reciente</h2>
              <p>Eventos operativos del panel.</p>
            </div>
            <Activity size={22} aria-hidden="true" />
          </div>
          <RecentActivity items={dashboard.actividad_reciente} />
        </article>
      </div>
    </section>
  );
}
