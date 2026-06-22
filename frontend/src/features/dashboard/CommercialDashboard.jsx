import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  ClipboardList,
  MessageCircle,
  MessageSquareText,
  Package,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wrench
} from 'lucide-react';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { GridStack } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/index.js';
import { hasPermission } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
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
  oportunidades_prioritarias: [],
  recomendaciones: [],
  leads_recientes: [],
  actividad_reciente: [],
  ai_usage: {
    month: today().slice(0, 7),
    total_requests: 0,
    total_tokens: 0,
    limit: null,
    remaining: null
  }
};

const leadStateLabels = {
  NUEVO: 'Nuevos',
  EN_PROCESO: 'En proceso',
  CONTACTADO: 'Contactados',
  COTIZADO: 'Cotizados',
  GANADO: 'Ganados',
  PERDIDO: 'Perdidos'
};

function DashboardGridStack({ ariaLabel, cellHeight = 92, className = '', column = 12, items }) {
  const gridElementRef = useRef(null);
  const itemSignature = items.map((item) => `${item.id}:${item.x ?? 0}:${item.y ?? 0}:${item.w}:${item.h}`).join('|');

  useEffect(() => {
    if (!gridElementRef.current || !items.length) {
      return undefined;
    }

    const grid = GridStack.init({
      animate: false,
      cellHeight,
      column,
      disableDrag: true,
      disableResize: true,
      margin: 18,
      staticGrid: true,
      oneColumnModeDomSort: true
    }, gridElementRef.current);

    return () => {
      grid.destroy(false);
    };
  }, [cellHeight, column, itemSignature, items.length]);

  return (
    <section ref={gridElementRef} className={`grid-stack dashboard-gridstack ${className}`} aria-label={ariaLabel}>
      {items.map((item) => (
        <div
          className="grid-stack-item dashboard-gridstack-item"
          data-card-id={item.id}
          gs-h={item.h}
          gs-id={item.id}
          gs-w={item.w}
          gs-x={item.x}
          gs-y={item.y}
          key={item.id}
        >
          <div className="grid-stack-item-content dashboard-gridstack-content">
            {item.content}
          </div>
        </div>
      ))}
    </section>
  );
}

function formatDate(value) {
  return value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency'
  });
}

function compactNumber(value) {
  return Number(value ?? 0).toLocaleString('es-MX', { notation: Number(value ?? 0) >= 10000 ? 'compact' : 'standard' });
}

function sumValues(items, keys) {
  return items.reduce((sum, item) => {
    const value = keys.map((key) => Number(item[key] ?? 0)).find((candidate) => candidate > 0) ?? 0;
    return sum + value;
  }, 0);
}

function statusLabel(isOk, okText, badText) {
  return isOk ? okText : badText;
}

function ExecutiveHeader({ companyName, user }) {
  const userName = user?.nombre ?? 'Administrador';
  const currentDate = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="dashboard-card dashboard-executive-header">
      <div className="dashboard-header-copy">
        <span className="dashboard-date-pill">
          <CalendarDays size={16} aria-hidden="true" />
          {currentDate}
        </span>
        <h1>Buen dia, {userName}</h1>
        <p>Vista ejecutiva de {companyName}: ventas, pipeline, conversaciones y actividad operativa.</p>
        <div className="dashboard-header-insights" aria-label="Resumen del dashboard">
          <span>Comercial</span>
          <span>Pipeline</span>
          <span>Atencion</span>
        </div>
      </div>
    </section>
  );
}

function DashboardStatusCard({ aiUsage, isWhatsAppConnected, whatsapp }) {
  const aiHasActivity = Number(aiUsage.total_requests ?? 0) > 0 || Number(aiUsage.total_tokens ?? 0) > 0;

  return (
    <section className="dashboard-card dashboard-status-card" aria-label="Estado de canales e IA">
      <header className="dashboard-card-header">
        <div>
          <h2>Canales e IA</h2>
          <p>Monitoreo operativo en tiempo real.</p>
        </div>
        <span>
          <Bot size={20} aria-hidden="true" />
        </span>
      </header>

      <div className="dashboard-status-panel">
        <span className={isWhatsAppConnected ? 'status-chip connected' : 'status-chip disconnected'}>
          {isWhatsAppConnected ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleOff size={16} aria-hidden="true" />}
          {statusLabel(isWhatsAppConnected, 'WhatsApp conectado', 'WhatsApp desconectado')}
        </span>
        <span className={aiHasActivity ? 'status-chip connected' : 'status-chip neutral'}>
          <Bot size={16} aria-hidden="true" />
          {aiHasActivity ? 'IA activa' : 'IA sin actividad'}
        </span>
        <small>{whatsapp.conectadas ?? 0}/{whatsapp.total ?? 0} sesiones conectadas</small>
      </div>
    </section>
  );
}

function DashboardFilterCard({ filters, isLoading, onFilterChange, onFilterSubmit }) {
  return (
    <section className="dashboard-filter-card" aria-label="Filtro de busqueda">
      <header className="dashboard-filter-card-header">
        <div>
          <h2>Periodo de analisis</h2>
          <p>Actualiza el rango de datos.</p>
        </div>
        <span>
          <CalendarDays size={20} aria-hidden="true" />
        </span>
      </header>
      <form className="dashboard-date-filter" onSubmit={onFilterSubmit}>
        <label htmlFor="dashboard-start-date">
          <span>Inicio</span>
          <input id="dashboard-start-date" name="fecha_inicio" onChange={onFilterChange} type="date" value={filters.fecha_inicio} />
        </label>
        <label htmlFor="dashboard-end-date">
          <span>Fin</span>
          <input id="dashboard-end-date" name="fecha_fin" onChange={onFilterChange} type="date" value={filters.fecha_fin} />
        </label>
        <button className="dashboard-primary-button" disabled={isLoading} type="submit">
          {isLoading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </form>
    </section>
  );
}

function KpiCard({ detail, icon: Icon, label, tone = 'green', trend = [], value }) {
  return (
    <article className={`dashboard-kpi-card ${tone}`}>
      <div className="dashboard-kpi-topline">
        <span className="dashboard-kpi-icon">
          <Icon size={21} aria-hidden="true" />
        </span>
        <span className="dashboard-kpi-growth">
          <TrendingUp size={14} aria-hidden="true" />
          Activo
        </span>
      </div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
      <div className="dashboard-kpi-trend">
        {trend.length ? (
          <SparkLineChart colors={['#00abe4']} data={trend} height={42} showHighlight={false} showTooltip={false} />
        ) : (
          <span />
        )}
      </div>
    </article>
  );
}

function ChartCard({ children, description, icon: Icon, title, wide = false }) {
  return (
    <article className={`dashboard-card dashboard-chart-card ${wide ? 'wide' : ''}`}>
      <header className="dashboard-card-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span>
          <Icon size={20} aria-hidden="true" />
        </span>
      </header>
      {children}
    </article>
  );
}

function SalesTrendChart({ dailyActivity, salesByDay }) {
  const dataset = salesByDay.length
    ? salesByDay.map((item) => ({
      fecha: item.fecha?.slice?.(5) ?? item.dia ?? item.date ?? '-',
      ventas: Number(item.ventas ?? item.total ?? item.monto ?? 0)
    }))
    : dailyActivity.map((item) => ({
      fecha: item.fecha?.slice?.(5) ?? '-',
      ventas: Number(item.leads ?? 0)
    }));

  if (!dataset.length || dataset.every((item) => Number(item.ventas) === 0)) {
    return <EmptyState description="Cuando existan ventas o actividad diaria, la evolucion aparecera aqui." title="Sin evolucion disponible" />;
  }

  return (
    <div className="dashboard-chart-shell">
      <LineChart
        colors={['#00abe4']}
        dataset={dataset}
        height={300}
        margin={{ bottom: 42, left: 52, right: 18, top: 24 }}
        series={[{ curve: 'monotoneX', dataKey: 'ventas', label: salesByDay.length ? 'Ventas' : 'Leads', valueFormatter: (value) => salesByDay.length ? formatCurrency(value) : value }]}
        xAxis={[{ dataKey: 'fecha', scaleType: 'point' }]}
        yAxis={[{ min: 0 }]}
      />
    </div>
  );
}

function DailyActivityChart({ items }) {
  if (!items.length || items.every((item) => Number(item.leads ?? 0) + Number(item.conversaciones ?? 0) === 0)) {
    return <EmptyState description="Aun no hay conversaciones o leads para graficar." title="Sin actividad diaria" />;
  }

  return (
    <div className="dashboard-chart-shell">
      <BarChart
        borderRadius={8}
        colors={['#00abe4', '#64748b']}
        dataset={items.map((item) => ({
          conversaciones: Number(item.conversaciones ?? 0),
          fecha: item.fecha?.slice?.(5) ?? '-',
          leads: Number(item.leads ?? 0)
        }))}
        height={300}
        margin={{ bottom: 42, left: 42, right: 18, top: 24 }}
        series={[
          { dataKey: 'leads', label: 'Leads' },
          { dataKey: 'conversaciones', label: 'Conversaciones' }
        ]}
        xAxis={[{ dataKey: 'fecha', scaleType: 'band' }]}
        yAxis={[{ min: 0 }]}
      />
    </div>
  );
}

function LeadStateChart({ states }) {
  const total = states.reduce((sum, item) => sum + Number(item.total ?? 0), 0);

  if (!total) {
    return <EmptyState description="Todavia no hay leads en el periodo seleccionado." title="Embudo sin datos" />;
  }

  return (
    <div className="dashboard-chart-shell compact">
      <PieChart
        colors={['#00abe4', '#64748b', '#94a3b8', '#f59e0b', '#ef4444', '#8b5cf6']}
        height={292}
        margin={{ bottom: 18, left: 18, right: 18, top: 18 }}
        series={[{
          data: states.map((item) => ({
            id: item.estado,
            label: leadStateLabels[item.estado] ?? item.estado,
            value: Number(item.total ?? 0)
          })),
          innerRadius: 58,
          outerRadius: 104,
          paddingAngle: 2
        }]}
      />
    </div>
  );
}

function ConsultationOriginChart({ products, services }) {
  const items = [
    ...products.slice(0, 4).map((item) => ({ label: item.nombre, consultas: Number(item.consultas ?? 0) })),
    ...services.slice(0, 4).map((item) => ({ label: item.nombre, consultas: Number(item.consultas ?? 0) }))
  ].filter((item) => item.consultas > 0);

  if (!items.length) {
    return <EmptyState description="Aun no hay consultas de productos o servicios en este periodo." title="Sin origen de interes" />;
  }

  return (
    <div className="dashboard-chart-shell compact">
      <BarChart
        borderRadius={8}
        colors={['#00abe4']}
        dataset={items}
        height={300}
        layout="horizontal"
        margin={{ bottom: 34, left: 122, right: 18, top: 22 }}
        series={[{ dataKey: 'consultas', label: 'Consultas' }]}
        xAxis={[{ min: 0 }]}
        yAxis={[{ dataKey: 'label', scaleType: 'band' }]}
      />
    </div>
  );
}

function RecentList({ emptyDescription, emptyTitle, icon: Icon, items, renderItem, title }) {
  const visibleItems = items.slice(0, 3);

  return (
    <article className="dashboard-card dashboard-list-card">
      <header className="dashboard-card-header">
        <div>
          <h2>{title}</h2>
          <p>Ultimos movimientos registrados.</p>
        </div>
        <span>
          <Icon size={20} aria-hidden="true" />
        </span>
      </header>
      {visibleItems.length ? <div className="dashboard-modern-list">{visibleItems.map(renderItem)}</div> : <EmptyState description={emptyDescription} title={emptyTitle} />}
    </article>
  );
}

function QuickActions({ canViewConversations, canViewCustomers, canViewOrders, canViewProducts }) {
  const actions = [
    canViewCustomers ? { icon: UserPlus, label: 'Nuevo lead', to: '/leads' } : null,
    canViewOrders ? { icon: ClipboardList, label: 'Nuevo pedido', to: '/pedidos' } : null,
    canViewProducts ? { icon: Package, label: 'Nuevo producto', to: '/productos' } : null,
    canViewProducts ? { icon: Wrench, label: 'Nuevo servicio', to: '/servicios' } : null,
    canViewConversations ? { icon: MessageSquareText, label: 'Abrir conversaciones', to: '/conversaciones' } : null
  ].filter(Boolean);

  if (!actions.length) {
    return null;
  }

  return (
    <section className="dashboard-card dashboard-actions-card">
      <header className="dashboard-card-header">
        <div>
          <h2>Accesos operativos</h2>
          <p>Acciones frecuentes para ventas, catalogo y atencion.</p>
        </div>
        <span>
          <Sparkles size={20} aria-hidden="true" />
        </span>
      </header>
      <div className="dashboard-actions-grid">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link className="dashboard-action-button" key={action.label} to={action.to}>
              <span><Icon size={20} aria-hidden="true" /></span>
              <strong>{action.label}</strong>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function CommercialDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [filters, setFilters] = useState({ fecha_inicio: thirtyDaysAgo(), fecha_fin: today() });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const companyName = user?.empresa?.nombre ?? 'Nexus IA';
  const metrics = dashboard.metrics ?? emptyDashboard.metrics;
  const whatsapp = metrics.whatsapp ?? emptyDashboard.metrics.whatsapp;
  const aiUsage = dashboard.ai_usage ?? emptyDashboard.ai_usage;
  const salesByDay = dashboard.ventas_por_dia ?? dashboard.sales_by_day ?? [];
  const dailyActivity = dashboard.daily_activity ?? [];
  const leadTrend = dailyActivity.map((item) => Number(item.leads ?? 0));
  const conversationTrend = dailyActivity.map((item) => Number(item.conversaciones ?? 0));
  const salesTotal = sumValues(salesByDay, ['ventas', 'total', 'monto']);
  const ordersByStatus = dashboard.pedidos_por_estado ?? dashboard.orders_by_status ?? [];
  const ordersTotal = sumValues(ordersByStatus, ['total', 'cantidad', 'value']);
  const whatsappConnected = whatsapp.estado === 'CONNECTED' || Number(whatsapp.conectadas ?? 0) > 0;

  const permissions = useMemo(() => ({
    customers: hasPermission(user, 'customers.view'),
    conversations: hasPermission(user, 'conversations.view'),
    orders: hasPermission(user, 'orders.view'),
    products: hasPermission(user, 'products.view'),
    reports: hasPermission(user, 'reports.view')
  }), [user]);

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
    setFilters((currentFilters) => ({ ...currentFilters, [name]: value }));
  }

  function handleFilterSubmit(event) {
    event.preventDefault();
    loadDashboard(filters);
  }

  const kpis = [
    permissions.reports ? {
      detail: salesByDay.length ? `Periodo ${formatDate(filters.fecha_inicio)} - ${formatDate(filters.fecha_fin)}` : 'Sin serie de ventas conectada',
      icon: TrendingUp,
      label: 'Ventas',
      trend: salesByDay.map((item) => Number(item.ventas ?? item.total ?? item.monto ?? 0)),
      value: salesByDay.length ? formatCurrency(salesTotal) : 'Sin datos'
    } : null,
    permissions.orders ? {
      detail: ordersByStatus.length ? 'Pedidos registrados por estado' : 'Modulo listo para operar pedidos',
      icon: ClipboardList,
      label: 'Pedidos',
      trend: [],
      value: ordersByStatus.length ? compactNumber(ordersTotal) : 'Sin datos'
    } : null,
    permissions.customers ? {
      detail: `${dashboard.totals.tasa_conversion ?? 0}% conversion`,
      icon: Users,
      label: 'Leads',
      trend: leadTrend,
      value: compactNumber(dashboard.totals.total_leads || metrics.leads_hoy)
    } : null,
    permissions.conversations ? {
      detail: 'Conversaciones recibidas hoy',
      icon: MessageCircle,
      label: 'Conversaciones',
      tone: 'mint',
      trend: conversationTrend,
      value: compactNumber(metrics.conversaciones_hoy)
    } : null,
    permissions.customers ? {
      detail: `${dashboard.totals.leads_ganados ?? 0} oportunidades ganadas`,
      icon: UserPlus,
      label: 'Clientes',
      trend: leadTrend,
      value: compactNumber(dashboard.totals.leads_ganados ?? 0)
    } : null
  ].filter(Boolean);
  const dashboardCards = [
    permissions.reports ? {
      content: (
        <ChartCard description="Tendencia del periodo seleccionado." icon={TrendingUp} title="Rendimiento comercial">
          <SalesTrendChart dailyActivity={dailyActivity} salesByDay={salesByDay} />
        </ChartCard>
      ),
      h: 5,
      id: 'sales-trend',
      w: 4,
      x: 0,
      y: 0
    } : null,
    permissions.reports ? {
      content: (
        <ChartCard description="Leads y conversaciones por dia." icon={MessageSquareText} title="Actividad diaria">
          <DailyActivityChart items={dailyActivity} />
        </ChartCard>
      ),
      h: 5,
      id: 'daily-activity',
      w: 4,
      x: 4,
      y: 0
    } : null,
    permissions.customers ? {
      content: (
        <ChartCard description="Distribucion por etapa comercial." icon={Users} title="Pipeline de leads">
          <LeadStateChart states={dashboard.lead_states ?? []} />
        </ChartCard>
      ),
      h: 5,
      id: 'lead-state',
      w: 4,
      x: 8,
      y: 0
    } : null,
    permissions.products ? {
      content: (
        <ChartCard description="Productos y servicios con mas consultas." icon={Package} title="Demanda del catalogo">
          <ConsultationOriginChart products={dashboard.productos_mas_consultados ?? []} services={dashboard.servicios_mas_consultados ?? []} />
        </ChartCard>
      ),
      h: 5,
      id: 'catalog-interest',
      w: 6,
      x: 0,
      y: 5
    } : null,
    permissions.customers ? {
      content: (
        <RecentList
          emptyDescription="Los nuevos leads apareceran aqui automaticamente."
          emptyTitle="Sin leads recientes"
          icon={UserPlus}
          items={dashboard.leads_recientes ?? []}
          title="Leads recientes"
          renderItem={(lead) => (
            <article className="dashboard-modern-list-item" key={lead.id}>
              <span>{lead.nombre_cliente?.charAt(0) ?? 'L'}</span>
              <div>
                <strong>{lead.nombre_cliente ?? 'Lead sin nombre'}</strong>
                <p>{lead.interes ?? lead.telefono ?? 'Sin interes registrado'}</p>
              </div>
              <em>{lead.estado ?? 'Nuevo'}</em>
            </article>
          )}
        />
      ),
      h: 4,
      id: 'recent-leads',
      w: 6,
      x: 6,
      y: 10
    } : null,
    permissions.reports ? {
      content: (
        <RecentList
          emptyDescription="Los eventos importantes del panel apareceran aqui."
          emptyTitle="Sin actividad reciente"
          icon={Sparkles}
          items={dashboard.actividad_reciente ?? []}
          title="Bitacora reciente"
          renderItem={(item) => (
            <article className="dashboard-modern-list-item" key={item.id}>
              <span><Sparkles size={16} aria-hidden="true" /></span>
              <div>
                <strong>{item.descripcion ?? `${item.accion ?? 'Actividad'} en ${item.modulo ?? 'panel'}`}</strong>
                <p>{item.empresa_nombre ?? companyName} - {formatDateTime(item.fecha)}</p>
              </div>
            </article>
          )}
        />
      ),
      h: 4,
      id: 'recent-activity',
      w: 6,
      x: 0,
      y: 10
    } : null,
    (permissions.conversations || permissions.customers || permissions.orders || permissions.products) ? {
      content: (
        <QuickActions
          canViewConversations={permissions.conversations}
          canViewCustomers={permissions.customers}
          canViewOrders={permissions.orders}
          canViewProducts={permissions.products}
        />
      ),
      h: 5,
      id: 'quick-actions',
      w: 6,
      x: 6,
      y: 5
    } : null
  ].filter(Boolean);

  return (
    <section className="commercial-dashboard premium-dashboard" aria-label="Dashboard ejecutivo">
      <section className="dashboard-control-strip" aria-label="Controles del dashboard">
        <ExecutiveHeader companyName={companyName} user={user} />
        <DashboardStatusCard aiUsage={aiUsage} isWhatsAppConnected={whatsappConnected} whatsapp={whatsapp} />
        <DashboardFilterCard
          filters={filters}
          isLoading={isLoading}
          onFilterChange={handleFilterChange}
          onFilterSubmit={handleFilterSubmit}
        />
      </section>

      {error ? <ErrorState message={error} onRetry={() => loadDashboard(filters)} /> : null}
      {isLoading ? <LoadingState message="Cargando indicadores del negocio..." /> : null}

      <section className="dashboard-kpi-grid dashboard-kpi-strip" aria-label="KPIs principales">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </section>

      <DashboardGridStack
        ariaLabel="Cards del dashboard"
        cellHeight={88}
        className="dashboard-card-gridstack"
        column={12}
        items={dashboardCards}
      />
    </section>
  );
}
