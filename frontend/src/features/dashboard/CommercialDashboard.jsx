import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleOff,
  Clock3,
  Flame,
  MessageSquareText,
  PackageCheck,
  PackageSearch,
  PlugZap,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasPermission, normalizeRole } from '../../config/permissions.js';
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
  scoring_leads: [],
  daily_activity: [],
  productos_mas_consultados: [],
  servicios_mas_consultados: [],
  oportunidades_prioritarias: [],
  optimizacion_industria: [],
  recomendaciones: [],
  leads_recientes: [],
  actividad_reciente: [],
  errores_recientes: [],
  ai_usage: {
    month: today().slice(0, 7),
    total_requests: 0,
    tokens_input: 0,
    tokens_output: 0,
    total_tokens: 0,
    costo_estimado: 0,
    limit: null,
    remaining: null,
    by_company: []
  }
};

const emptyIntelligence = {
  salud_negocio: 0,
  estado: 'RIESGO',
  conversaciones: {
    tasa_respuesta: 0,
    conversaciones_sin_respuesta: 0,
    clientes_unicos: 0
  },
  catalogo: {
    salud_catalogo: 0,
    productos_sin_stock: 0,
    productos_bajo_stock: 0
  },
  pipeline: {
    leads_abiertos: 0,
    leads_abiertos_2d: 0,
    leads_abiertos_7d: 0
  },
  riesgos: [],
  focos: []
};

const leadStateLabels = {
  NUEVO: 'Nuevos',
  EN_PROCESO: 'En proceso',
  CONTACTADO: 'Contactados',
  COTIZADO: 'Cotizados',
  GANADO: 'Ganados',
  PERDIDO: 'Perdidos'
};

const priorityLabels = {
  CRITICA: 'Critica',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BAJA: 'Baja'
};

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 4,
    style: 'currency'
  });
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

function OrdersPendingPanel() {
  return (
    <article className="panel-section chart-panel">
      <div className="section-header dashboard-section-header">
        <div>
          <h2>Pedidos</h2>
          <p>Estructura lista para conectar el modulo de pedidos.</p>
        </div>
        <PackageCheck size={22} aria-hidden="true" />
      </div>
      <EmptyState
        description="Aun no existe un endpoint de pedidos en el proyecto. Este bloque queda reservado para conectarlo sin usar datos falsos."
        title="Pedidos pendientes de integrar"
      />
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

function ExecutiveIntelligenceOverview({ intelligence }) {
  const data = { ...emptyIntelligence, ...(intelligence ?? {}) };
  const healthTone = data.estado === 'SALUDABLE' ? 'healthy' : data.estado === 'ATENCION' ? 'attention' : 'risk';

  return (
    <section className="executive-intelligence-panel executive-intelligence-overview" aria-label="Inteligencia ejecutiva">
      <article className={`business-health-card ${healthTone}`}>
        <span><Flame size={22} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Inteligencia Nexus IA</p>
          <strong>{data.salud_negocio}%</strong>
          <small>{data.estado}</small>
        </div>
      </article>

      <div className="executive-risk-list">
        <div>
          <p className="eyebrow">Riesgos y accion</p>
          <h3>Prioridades operativas</h3>
        </div>
        {data.riesgos.map((risk) => (
          <article key={`${risk.area}-${risk.titulo}`}>
            <span className={risk.nivel.toLowerCase()}>{risk.nivel}</span>
            <div>
              <strong>{risk.titulo}</strong>
              <p>{risk.detalle}</p>
              <small>{risk.accion}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExecutiveFocusCards({ intelligence }) {
  const data = { ...emptyIntelligence, ...(intelligence ?? {}) };

  return (
    <section className="executive-intelligence-panel executive-focus-panel" aria-label="Focos ejecutivos">
      <div className="executive-focus-grid">
        {data.focos.map((focus) => (
          <article key={focus.titulo}>
            <strong>{focus.valor}</strong>
            <span>{focus.titulo}</span>
            <small>{focus.detalle}</small>
            <em className={focus.estado === 'BUENO' ? 'good' : 'review'}>{focus.estado}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecommendationList({ items }) {
  if (!items.length) {
    return <EmptyState description="Cuando haya mas datos, Nexus IA sugerira acciones comerciales." title="Sin recomendaciones" />;
  }

  return (
    <div className="activity-list">
      {items.map((item) => (
        <article className="activity-item recommendation-item" key={`${item.tipo}-${item.titulo}`}>
          <span>
            <TrendingUp size={16} aria-hidden="true" />
          </span>
          <div>
            <strong>{item.titulo}</strong>
            <p>{item.detalle}</p>
            <small>{item.accion}</small>
          </div>
          <em>{priorityLabels[item.prioridad] ?? item.prioridad}</em>
        </article>
      ))}
    </div>
  );
}

function LeadOpportunities({ leads }) {
  if (!leads.length) {
    return <EmptyState description="Los leads con score alto apareceran aqui." title="Sin oportunidades priorizadas" />;
  }

  return (
    <div className="dashboard-list">
      {leads.map((lead) => (
        <article className="dashboard-list-item scored-lead" key={lead.id}>
          <span className="list-avatar">{lead.score}</span>
          <div>
            <strong>{lead.nombre_cliente}</strong>
            <p>{lead.interes ?? lead.telefono ?? 'Sin interes registrado'}</p>
          </div>
          <span className={`status-badge ${lead.prioridad === 'CRITICA' ? 'danger' : 'info'}`}>
            {priorityLabels[lead.prioridad] ?? lead.prioridad}
          </span>
        </article>
      ))}
    </div>
  );
}

function ScoreSummary({ items }) {
  const total = items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);

  if (!total) {
    return <EmptyState description="Aun no hay leads con score en el periodo." title="Sin scoring comercial" />;
  }

  return (
    <div className="lead-funnel-bars">
      {items.map((item) => (
        <div className="lead-funnel-row" key={item.prioridad}>
          <span>{priorityLabels[item.prioridad] ?? item.prioridad}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.total / total) * 100}%` }} />
          </div>
          <strong>{item.total}</strong>
        </div>
      ))}
    </div>
  );
}

function IndustryOptimization({ items }) {
  if (!items.length) {
    return <EmptyState description="No hay datos suficientes por industria." title="Sin optimizacion por industria" />;
  }

  return (
    <div className="dashboard-list">
      {items.slice(0, 5).map((item) => (
        <article className="dashboard-list-item" key={item.tipo_negocio}>
          <span className="list-avatar">{Math.round(item.score_promedio)}</span>
          <div>
            <strong>{item.tipo_negocio}</strong>
            <p>{item.leads} leads · {item.tasa_conversion}% conversion</p>
          </div>
          <span className="status-badge info">{item.empresas} emp.</span>
        </article>
      ))}
    </div>
  );
}

function AIUsagePanel({ isSuperAdmin, usage }) {
  const data = usage ?? emptyDashboard.ai_usage;
  const limit = data.limit;
  const used = Number(data.total_requests ?? 0);
  const usagePercent = limit ? Math.min((used / Number(limit)) * 100, 100) : 0;
  const companies = data.by_company ?? [];

  return (
    <article className="panel-section chart-panel">
      <div className="section-header dashboard-section-header">
        <div>
          <h2>Consumo IA</h2>
          <p>{isSuperAdmin ? 'Consumo global mensual por empresa.' : `Uso mensual del plan ${data.month}.`}</p>
        </div>
        <Bot size={22} aria-hidden="true" />
      </div>

      <div className="dashboard-bar-list">
        <div className="dashboard-bar-row">
          <div>
            <strong>{used} mensajes IA</strong>
            <span>{limit ? `${data.remaining} disponibles de ${limit}` : 'Sin limite mensual configurado'}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${limit ? usagePercent : 100}%` }} />
          </div>
        </div>
      </div>

      <div className="executive-focus-grid">
        <article>
          <strong>{Number(data.total_tokens ?? 0).toLocaleString('es-MX')}</strong>
          <span>Tokens totales</span>
          <small>{Number(data.tokens_input ?? 0).toLocaleString('es-MX')} in / {Number(data.tokens_output ?? 0).toLocaleString('es-MX')} out</small>
          <em className="good">{data.month}</em>
        </article>
        <article>
          <strong>{formatCurrency(data.costo_estimado)}</strong>
          <span>Costo estimado</span>
          <small>Depende de tarifas configuradas en backend</small>
          <em className="review">IA</em>
        </article>
      </div>

      {isSuperAdmin && companies.length ? (
        <div className="dashboard-list">
          {companies.slice(0, 6).map((company) => (
            <article className="dashboard-list-item" key={company.tenant_id}>
              <span className="list-avatar">{company.total_requests}</span>
              <div>
                <strong>{company.empresa_nombre}</strong>
                <p>{company.plan_label} - {Number(company.total_tokens ?? 0).toLocaleString('es-MX')} tokens</p>
              </div>
              <span className="status-badge info">{formatCurrency(company.costo_estimado)}</span>
            </article>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function CommercialDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [filters, setFilters] = useState({
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const metrics = dashboard.metrics ?? emptyDashboard.metrics;
  const aiUsage = dashboard.ai_usage ?? emptyDashboard.ai_usage;
  const intelligence = dashboard.inteligencia ?? emptyIntelligence;
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
  const role = normalizeRole(user?.rol);
  const isSuperAdmin = role === 'super_admin';
  const isOwner = role === 'owner';
  const isSeller = role === 'seller';
  const isSupport = role === 'support';
  const isViewer = role === 'viewer';
  const canViewReports = hasPermission(user, 'reports.view');
  const canViewCustomers = hasPermission(user, 'customers.view');
  const canViewConversations = hasPermission(user, 'conversations.view');
  const canViewOrders = hasPermission(user, 'orders.view');
  const canViewProducts = hasPermission(user, 'products.view');
  const dashboardTitle = isSuperAdmin
    ? 'Métricas globales de Nexus IA'
    : isOwner
      ? 'Métricas de tu empresa'
      : isSeller
        ? 'Panel comercial'
        : isSupport
          ? 'Panel de soporte'
          : 'Reportes de solo lectura';
  const dashboardDescription = isSuperAdmin
    ? 'Empresas, actividad comercial, WhatsApp y salud operativa de la plataforma.'
    : isOwner
      ? 'Salud, ventas, WhatsApp y riesgos de tu negocio.'
      : isSeller
        ? 'Conversaciones, leads y pedidos disponibles para seguimiento comercial.'
        : isSupport
          ? 'Conversaciones pendientes y clientes que requieren atención.'
          : 'Indicadores disponibles en modo lectura.';

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
          <p className="eyebrow">Dashboard</p>
          <h2>{dashboardTitle}</h2>
          <p>{dashboardDescription}</p>
        </div>
        <div className={whatsappConnected ? 'whatsapp-pill connected' : 'whatsapp-pill disconnected'}>
          {whatsappConnected ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleOff size={18} aria-hidden="true" />}
          <span>{whatsappConnected ? 'WhatsApp conectado' : 'WhatsApp desconectado'}</span>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => loadDashboard(filters)} /> : null}

      <div className="dashboard-control-row">
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

        {(isSuperAdmin || isOwner) && canViewReports ? <ExecutiveIntelligenceOverview intelligence={intelligence} /> : null}
      </div>

      {isLoading ? <LoadingState message="Cargando indicadores del negocio..." /> : null}

      {(isSuperAdmin || isOwner) && canViewReports ? <ExecutiveFocusCards intelligence={intelligence} /> : null}

      <div className="enterprise-metrics-grid dashboard-kpi-row">
        {isSuperAdmin ? (
          <MetricTile icon={ShieldCheck} label="Empresas activas" value={dashboard.totals.empresas_activas} detail="Tenants operando en Nexus IA" />
        ) : null}
        {canViewCustomers ? <MetricTile icon={Users} label="Leads del dia" value={metrics.leads_hoy} detail="Nuevos contactos hoy" /> : null}
        {canViewConversations ? (
          <MetricTile
            icon={MessageSquareText}
            label={isSupport ? 'Pendientes de respuesta' : 'Conversaciones del dia'}
            value={isSupport ? intelligence.conversaciones.conversaciones_sin_respuesta : metrics.conversaciones_hoy}
            detail={isSupport ? 'Conversaciones sin respuesta registrada' : 'Mensajes recibidos hoy'}
            tone="green"
          />
        ) : null}
        {canViewProducts && (isSuperAdmin || isOwner) ? (
          <MetricTile
            icon={PackageCheck}
            label="Productos activos"
            value={metrics.productos_activos}
            detail="Disponibles en catalogo"
            tone="purple"
          />
        ) : null}
        {canViewProducts && (isSuperAdmin || isOwner) ? (
          <MetricTile
            icon={Wrench}
            label="Servicios activos"
            value={metrics.servicios_activos}
            detail="Servicios publicados"
            tone="amber"
          />
        ) : null}
        {(isSuperAdmin || isOwner) ? (
          <MetricTile
            icon={PlugZap}
            label="WhatsApp"
            value={`${whatsapp.conectadas}/${whatsapp.total}`}
            detail={`${whatsapp.desconectadas} desconectadas`}
            tone={whatsappConnected ? 'green' : 'red'}
          />
        ) : null}
        {(isSuperAdmin || isOwner) ? (
          <MetricTile
            icon={Bot}
            label="Consumo IA"
            value={aiUsage.limit ? `${aiUsage.total_requests}/${aiUsage.limit}` : aiUsage.total_requests}
            detail={`${Number(aiUsage.total_tokens ?? 0).toLocaleString('es-MX')} tokens este mes`}
            tone="amber"
          />
        ) : null}
        {canViewReports ? (
          <MetricTile
            icon={TrendingUp}
            label="Conversion"
            value={`${dashboard.totals.tasa_conversion}%`}
            detail={`${dashboard.totals.leads_ganados} leads ganados`}
          />
        ) : null}
      </div>

      {canViewReports || canViewCustomers ? (
        <div className="enterprise-dashboard-grid">
          {canViewReports ? (
            <article className="panel-section chart-panel activity-chart-panel">
              <div className="section-header dashboard-section-header">
                <div>
                  <h2>Actividad diaria</h2>
                  <p>Movimiento del periodo.</p>
                </div>
                <BarChart3 size={22} aria-hidden="true" />
              </div>
              <DailyActivityChart items={dashboard.daily_activity} />
            </article>
          ) : null}

          {canViewCustomers ? (
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
          ) : null}
        </div>
      ) : null}

      {(isSuperAdmin || isOwner || isSeller || isSupport) ? (
        <div className="enterprise-dashboard-grid">
          {(isSuperAdmin || isOwner || isSeller) && canViewReports ? (
            <article className="panel-section chart-panel">
              <div className="section-header dashboard-section-header">
                <div>
                  <h2>Recomendaciones comerciales</h2>
                  <p>Prioridades accionables.</p>
                </div>
                <TrendingUp size={22} aria-hidden="true" />
              </div>
              <RecommendationList items={dashboard.recomendaciones} />
            </article>
          ) : null}

          {canViewCustomers ? (
            <article className="panel-section chart-panel">
              <div className="section-header dashboard-section-header">
                <div>
                  <h2>{isSupport ? 'Clientes por atender' : 'Oportunidades prioritarias'}</h2>
                  <p>{isSupport ? 'Leads abiertos que pueden requerir seguimiento.' : 'Mayor probabilidad comercial.'}</p>
                </div>
                <Users size={22} aria-hidden="true" />
              </div>
              <LeadOpportunities leads={dashboard.oportunidades_prioritarias} />
            </article>
          ) : null}
        </div>
      ) : null}

      {(isSuperAdmin || isOwner || isViewer) && canViewReports ? <div className="enterprise-dashboard-grid">
        {(isSuperAdmin || isOwner) ? <AIUsagePanel isSuperAdmin={isSuperAdmin} usage={aiUsage} /> : null}

        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Scoring de leads</h2>
              <p>Distribucion de prioridad en el periodo.</p>
            </div>
            <BarChart3 size={22} aria-hidden="true" />
          </div>
          <ScoreSummary items={dashboard.scoring_leads} />
        </article>

        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Optimizacion por industria</h2>
              <p>Rendimiento por tipo de negocio.</p>
            </div>
            <Activity size={22} aria-hidden="true" />
          </div>
          <IndustryOptimization items={dashboard.optimizacion_industria} />
        </article>
      </div> : null}

      {(canViewProducts || canViewOrders) ? <div className="enterprise-dashboard-grid">
        {canViewProducts && (isSuperAdmin || isOwner) ? <article className="panel-section chart-panel">
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
        </article> : null}

        {canViewProducts && (isSuperAdmin || isOwner) ? <article className="panel-section chart-panel">
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
        </article> : null}
        {canViewOrders && (isSeller || isViewer) ? <OrdersPendingPanel /> : null}
      </div> : null}

      <div className="enterprise-dashboard-grid lower-grid">
        {canViewCustomers ? <article className="panel-section">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>{isSupport ? 'Clientes recientes' : 'Leads recientes'}</h2>
              <p>Ultimos prospectos capturados.</p>
            </div>
            <Clock3 size={22} aria-hidden="true" />
          </div>
          <RecentLeads leads={dashboard.leads_recientes} />
        </article> : null}

        {canViewReports && (isSuperAdmin || isOwner || isViewer) ? <article className="panel-section">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Actividad reciente</h2>
              <p>Eventos operativos del panel.</p>
            </div>
            <Activity size={22} aria-hidden="true" />
          </div>
          <RecentActivity items={dashboard.actividad_reciente} />
        </article> : null}
      </div>
    </section>
  );
}
