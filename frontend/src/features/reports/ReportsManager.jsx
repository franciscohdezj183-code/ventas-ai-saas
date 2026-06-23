import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  CalendarDays,
  Download,
  Filter,
  MessageCircle,
  PackageSearch,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { EmptyState } from '../../components/ui/index.js';
import { SortablePaginatedTable } from '../../components/ui/SortablePaginatedTable.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { fetchReportsOverview } from './reportsApi.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  return dateDaysAgo(30);
}

const emptyReports = {
  date_range: {
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  },
  metrics: {
    total_conversaciones: 0,
    conversaciones_atendidas_bot: 0,
    conversaciones_pidieron_humano: 0,
    pedidos_generados: 0,
    ventas_estimadas: 0,
    clientes_nuevos: 0,
    tasa_conversion_conversacion_pedido: 0,
    orders_source: 'pending_orders_module'
  },
  productos_mas_consultados: [],
  consumo_ia: {
    total_requests: 0,
    total_tokens: 0,
    costo_estimado: 0
  },
  mensajes_por_dia: [],
  ventas_por_dia: [],
  pedidos_por_periodo: [],
  pedidos_por_estado: [],
  leads_por_origen: [],
  desglose_empresas: []
};

const datePresets = [
  { id: 'today', label: 'Hoy', days: 1 },
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '90 dias', days: 90 }
];

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 2,
    style: 'currency'
  });
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString('es-MX');
}

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}%`;
}

function getRangeLabel(filters) {
  return `${filters.fecha_inicio} - ${filters.fecha_fin}`;
}

function chartHasData(items, valueKey) {
  return items.length > 0 && items.some((item) => Number(item[valueKey] ?? 0) > 0);
}

function getCsvValue(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  if (!rows.length) {
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(getCsvValue).join(','),
    ...rows.map((row) => headers.map((header) => getCsvValue(row[header])).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportsHero({ isLoading, onExport, onRefresh, rangeLabel, scopeLabel }) {
  return (
    <header className="reports-hero">
      <div>
        <span className="reports-eyebrow">
          <Sparkles size={16} aria-hidden="true" />
          Business Intelligence Center
        </span>
        <h1>Reportes</h1>
        <p>Analiza el rendimiento de tu empresa y toma mejores decisiones con informacion en tiempo real.</p>
        <div className="reports-hero-meta">
          <span>{scopeLabel}</span>
          <span>{rangeLabel}</span>
        </div>
      </div>
      <div className="reports-hero-actions">
        <button className="secondary-button" disabled={isLoading} onClick={onRefresh} type="button">
          <RefreshCcw size={18} aria-hidden="true" />
          Actualizar
        </button>
        <button className="primary-button" disabled={isLoading} onClick={onExport} type="button">
          <Download size={18} aria-hidden="true" />
          Exportar
        </button>
      </div>
    </header>
  );
}

function ReportsToolbar({
  companies,
  filters,
  isLoading,
  isSuperAdmin,
  onChange,
  onClear,
  onPreset,
  onSubmit,
  selectedPreset
}) {
  return (
    <form className="reports-toolbar" onSubmit={onSubmit}>
      <div className="reports-toolbar-header">
        <span>
          <Filter size={18} aria-hidden="true" />
        </span>
        <div>
          <h2>Filtros globales</h2>
          <p>Estos filtros actualizan todos los reportes del centro de inteligencia.</p>
        </div>
      </div>

      <div className="reports-preset-row" aria-label="Rangos rapidos">
        {datePresets.map((preset) => (
          <button
            className={selectedPreset === preset.id ? 'active' : ''}
            key={preset.id}
            onClick={() => onPreset(preset)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
        <button className={selectedPreset === 'custom' ? 'active' : ''} type="button">
          Personalizado
        </button>
      </div>

      <div className="reports-filter-grid">
        <label className="reports-field" htmlFor="reports-start-date">
          <span>Fecha inicio</span>
          <div>
            <CalendarDays size={17} aria-hidden="true" />
            <input id="reports-start-date" name="fecha_inicio" onChange={onChange} type="date" value={filters.fecha_inicio} />
          </div>
        </label>
        <label className="reports-field" htmlFor="reports-end-date">
          <span>Fecha fin</span>
          <div>
            <CalendarDays size={17} aria-hidden="true" />
            <input id="reports-end-date" name="fecha_fin" onChange={onChange} type="date" value={filters.fecha_fin} />
          </div>
        </label>
        {isSuperAdmin ? (
          <label className="reports-field" htmlFor="reports-company">
            <span>Empresa</span>
            <select id="reports-company" name="empresa_id" onChange={onChange} value={filters.empresa_id}>
              <option value="">Todas las empresas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="reports-filter-actions">
          <button className="ghost-button" onClick={onClear} type="button">
            <X size={17} aria-hidden="true" />
            Limpiar
          </button>
          <button className="primary-button" disabled={isLoading} type="submit">
            {isLoading ? 'Actualizando...' : 'Aplicar filtros'}
          </button>
        </div>
      </div>
    </form>
  );
}

function ExecutiveKpiCard({ description, icon: Icon, label, tone = 'blue', value }) {
  return (
    <article className={`reports-kpi-card ${tone}`}>
      <div className="reports-kpi-topline">
        <span>
          <Icon size={21} aria-hidden="true" />
        </span>
        <small>Periodo actual</small>
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
      <div className="reports-mini-trend" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function ExecutiveKPIs({ aiUsage, metrics }) {
  const cards = [
    {
      icon: MessageCircle,
      label: 'Conversaciones',
      value: formatNumber(metrics.total_conversaciones),
      description: 'Total de conversaciones del periodo.'
    },
    {
      icon: Bot,
      label: 'Atencion IA',
      value: formatNumber(metrics.conversaciones_atendidas_bot),
      description: 'Mensajes atendidos por automatizacion.',
      tone: 'green'
    },
    {
      icon: ShoppingBag,
      label: 'Pedidos',
      value: formatNumber(metrics.pedidos_generados),
      description: metrics.orders_source === 'pending_orders_module' ? 'Modulo de pedidos pendiente.' : 'Pedidos registrados.',
      tone: 'purple'
    },
    {
      icon: TrendingUp,
      label: 'Ventas estimadas',
      value: formatCurrency(metrics.ventas_estimadas),
      description: 'Valor registrado desde pedidos.'
    },
    {
      icon: UserPlus,
      label: 'Clientes nuevos',
      value: formatNumber(metrics.clientes_nuevos),
      description: 'Primer contacto en el periodo.',
      tone: 'green'
    },
    {
      icon: Users,
      label: 'Handoff humano',
      value: formatNumber(metrics.conversaciones_pidieron_humano),
      description: 'Conversaciones que pidieron asesor.',
      tone: 'amber'
    },
    {
      icon: BarChart3,
      label: 'Conversion',
      value: formatPercent(metrics.tasa_conversion_conversacion_pedido),
      description: 'Conversaciones convertidas a pedido.'
    },
    {
      icon: Sparkles,
      label: 'Consumo IA',
      value: formatNumber(aiUsage.total_requests),
      description: `${formatNumber(aiUsage.total_tokens)} tokens usados.`,
      tone: 'amber'
    }
  ];

  return (
    <section className="reports-kpi-grid" aria-label="KPIs ejecutivos">
      {cards.map((card) => <ExecutiveKpiCard key={card.label} {...card} />)}
    </section>
  );
}

function ExecutiveSummary({ metrics, topProducts }) {
  const hasConversationData = Number(metrics.total_conversaciones ?? 0) > 0;
  const hasOrders = Number(metrics.pedidos_generados ?? 0) > 0;
  const topProduct = topProducts.find((item) => Number(item.consultas ?? 0) > 0);

  const insights = [];

  if (hasConversationData) {
    insights.push(`Se registraron ${formatNumber(metrics.total_conversaciones)} conversaciones en el periodo.`);
  }

  if (Number(metrics.conversaciones_atendidas_bot ?? 0) > 0) {
    insights.push(`La IA atendio ${formatNumber(metrics.conversaciones_atendidas_bot)} interacciones automatizadas.`);
  }

  if (hasOrders) {
    insights.push(`Los pedidos generaron ${formatCurrency(metrics.ventas_estimadas)} en ventas estimadas.`);
  }

  if (topProduct) {
    insights.push(`${topProduct.nombre} fue el producto con mayor interes detectado.`);
  }

  return (
    <section className="reports-summary-card">
      <div>
        <span>
          {hasOrders ? <TrendingUp size={22} aria-hidden="true" /> : <TrendingDown size={22} aria-hidden="true" />}
        </span>
        <div>
          <h2>Resumen ejecutivo</h2>
          <p>
            {insights.length
              ? insights.join(' ')
              : 'No hay datos suficientes para generar una lectura ejecutiva confiable en este periodo.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function ReportChartCard({ children, description, icon: Icon, title }) {
  return (
    <article className="reports-card reports-chart-card">
      <header className="reports-card-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span>
          <Icon size={20} aria-hidden="true" />
        </span>
      </header>
      <div className="reports-card-body">
        {children}
      </div>
    </article>
  );
}

function RankingList({ emptyTitle, items }) {
  const maxValue = Math.max(...items.map((item) => Number(item.consultas ?? 0)), 1);

  if (!items.length || items.every((item) => Number(item.consultas ?? 0) === 0)) {
    return <EmptyState title={emptyTitle} description="Aun no hay datos para el periodo seleccionado." />;
  }

  return (
    <div className="reports-ranking-list">
      {items.slice(0, 8).map((item, index) => (
        <article key={`${item.id}-${item.tenant_id ?? ''}`}>
          <span>{index + 1}</span>
          <div>
            <strong>{item.nombre}</strong>
            <small>{item.empresa_nombre ?? 'Empresa actual'}</small>
            <div className="reports-bar-track">
              <div style={{ width: `${(Number(item.consultas ?? 0) / maxValue) * 100}%` }} />
            </div>
          </div>
          <b>{formatNumber(item.consultas)}</b>
        </article>
      ))}
    </div>
  );
}

function ActivityTimeline({ metrics }) {
  const items = [
    {
      icon: MessageCircle,
      title: 'Conversaciones iniciadas',
      value: formatNumber(metrics.total_conversaciones),
      description: 'Actividad comercial capturada por el canal.'
    },
    {
      icon: Bot,
      title: 'Atencion automatizada',
      value: formatNumber(metrics.conversaciones_atendidas_bot),
      description: 'Interacciones donde participo la IA.'
    },
    {
      icon: Users,
      title: 'Escalamientos a humano',
      value: formatNumber(metrics.conversaciones_pidieron_humano),
      description: 'Casos que requieren seguimiento personal.'
    },
    {
      icon: ShoppingBag,
      title: 'Pedidos registrados',
      value: formatNumber(metrics.pedidos_generados),
      description: 'Oportunidades que llegaron a pedido.'
    }
  ];

  return (
    <section className="reports-card reports-timeline-card">
      <header className="reports-card-header">
        <div>
          <h2>Actividad comercial</h2>
          <p>Lectura agregada de los eventos importantes del periodo.</p>
        </div>
        <span>
          <BarChart3 size={20} aria-hidden="true" />
        </span>
      </header>
      <div className="reports-timeline">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title}>
              <span>
                <Icon size={18} aria-hidden="true" />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
              <b>{item.value}</b>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReportsDataTable({ isSuperAdmin, reports, topProducts }) {
  const [query, setQuery] = useState('');
  const data = isSuperAdmin ? reports.desglose_empresas ?? [] : topProducts;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredData = useMemo(() => (
    normalizedQuery
      ? data.filter((item) => Object.values(item).some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery)))
      : data
  ), [data, normalizedQuery]);

  const columns = isSuperAdmin
    ? [
        { key: 'empresa_nombre', label: 'Empresa' },
        { key: 'total_conversaciones', label: 'Conversaciones', render: (row) => formatNumber(row.total_conversaciones) },
        { key: 'conversaciones_atendidas_bot', label: 'Atendidas IA', render: (row) => formatNumber(row.conversaciones_atendidas_bot) },
        { key: 'conversaciones_pidieron_humano', label: 'Handoff', render: (row) => formatNumber(row.conversaciones_pidieron_humano) },
        { key: 'clientes_unicos', label: 'Clientes unicos', render: (row) => formatNumber(row.clientes_unicos) }
      ]
    : [
        { key: 'nombre', label: 'Producto' },
        { key: 'empresa_nombre', label: 'Empresa' },
        { key: 'consultas', label: 'Consultas', render: (row) => formatNumber(row.consultas) }
      ];

  return (
    <section className="reports-card reports-detail-card">
      <header className="reports-card-header">
        <div>
          <h2>{isSuperAdmin ? 'Detalle por empresa' : 'Detalle de productos'}</h2>
          <p>Tabla con busqueda, ordenamiento y paginacion local.</p>
        </div>
        <span>
          <Building2 size={20} aria-hidden="true" />
        </span>
      </header>
      <div className="reports-table-toolbar">
        <label htmlFor="reports-table-search">
          <Search size={17} aria-hidden="true" />
          <input
            id="reports-table-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en el detalle"
            value={query}
          />
        </label>
      </div>
      <SortablePaginatedTable
        columns={columns}
        data={filteredData}
        emptyMessage="No hay registros para mostrar con los filtros actuales."
        getRowKey={(row) => row.tenant_id ?? row.id ?? row.nombre}
        initialSortKey={columns[0].key}
        pageSizeOptions={[5, 10, 20]}
      />
    </section>
  );
}

function ReportsSkeleton() {
  return (
    <div className="reports-skeleton" role="status" aria-live="polite">
      <span />
      <div>
        <span />
        <span />
        <span />
        <span />
      </div>
      <span />
      <span />
    </div>
  );
}

function ReportsError({ message, onRetry }) {
  return (
    <section className="reports-state-card error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar los reportes.</h2>
        <p>{message || 'Revisa tu conexion o intenta actualizar la informacion.'}</p>
      </div>
      <button className="secondary-button" onClick={onRetry} type="button">Reintentar</button>
    </section>
  );
}

function ReportsEmpty() {
  return (
    <section className="reports-state-card">
      <Sparkles size={24} aria-hidden="true" />
      <div>
        <h2>No hay datos suficientes para generar reportes.</h2>
        <p>Cuando existan conversaciones, clientes o pedidos en el periodo, el centro de inteligencia mostrara analisis y tendencias.</p>
      </div>
    </section>
  );
}

export function ReportsManager() {
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today(),
    empresa_id: ''
  });
  const [selectedPreset, setSelectedPreset] = useState('30d');
  const [reports, setReports] = useState(emptyReports);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const metrics = reports.metrics ?? emptyReports.metrics;
  const aiUsage = reports.consumo_ia ?? emptyReports.consumo_ia;
  const dailyMessages = useMemo(
    () => (reports.mensajes_por_dia ?? []).map((item) => ({ ...item, label: item.fecha?.slice(5) ?? item.fecha })),
    [reports.mensajes_por_dia]
  );
  const salesOverTime = useMemo(
    () => (reports.ventas_por_dia ?? reports.ventas_en_tiempo ?? reports.sales_over_time ?? [])
      .map((item) => ({
        label: item.label ?? item.fecha?.slice(5) ?? item.periodo ?? item.date ?? '',
        ventas: Number(item.ventas ?? item.ventas_estimadas ?? item.total_ventas ?? item.total ?? 0)
      })),
    [reports]
  );
  const ordersByPeriod = useMemo(
    () => (reports.pedidos_por_periodo ?? reports.pedidos_por_dia ?? reports.orders_by_period ?? [])
      .map((item) => ({
        label: item.label ?? item.fecha?.slice(5) ?? item.periodo ?? item.date ?? '',
        pedidos: Number(item.pedidos ?? item.total_pedidos ?? item.orders ?? 0)
      })),
    [reports]
  );
  const ordersByStatus = useMemo(
    () => (reports.pedidos_por_estado ?? reports.orders_by_status ?? [])
      .map((item, id) => ({
        id,
        label: item.estado ?? item.status ?? item.label ?? 'Sin estado',
        value: Number(item.total ?? item.pedidos ?? item.value ?? 0)
      })),
    [reports]
  );
  const topProducts = reports.productos_mas_consultados ?? [];

  const selectedCompanyName = useMemo(
    () => companies.find((company) => String(company.id) === String(filters.empresa_id))?.nombre,
    [companies, filters.empresa_id]
  );

  const hasAnyData = Number(metrics.total_conversaciones ?? 0) > 0
    || Number(metrics.pedidos_generados ?? 0) > 0
    || Number(metrics.clientes_nuevos ?? 0) > 0
    || topProducts.some((item) => Number(item.consultas ?? 0) > 0);

  async function loadReports(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      const [nextReports, nextCompanies] = await Promise.all([
        fetchReportsOverview({
          fecha_inicio: nextFilters.fecha_inicio,
          fecha_fin: nextFilters.fecha_fin,
          empresa_id: isSuperAdmin && nextFilters.empresa_id ? nextFilters.empresa_id : undefined
        }),
        isSuperAdmin ? fetchCompanies() : Promise.resolve([])
      ]);
      setReports({ ...emptyReports, ...nextReports });
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudieron cargar los reportes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [isSuperAdmin]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setSelectedPreset('custom');
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function handlePreset(preset) {
    const nextFilters = {
      ...filters,
      fecha_inicio: dateDaysAgo(preset.days),
      fecha_fin: today()
    };
    setSelectedPreset(preset.id);
    setFilters(nextFilters);
    loadReports(nextFilters);
  }

  function handleClear() {
    const nextFilters = {
      fecha_inicio: thirtyDaysAgo(),
      fecha_fin: today(),
      empresa_id: ''
    };
    setSelectedPreset('30d');
    setFilters(nextFilters);
    loadReports(nextFilters);
  }

  function handleSubmit(event) {
    event.preventDefault();
    loadReports(filters);
  }

  function handleExportCsv() {
    const detailRows = isSuperAdmin && (reports.desglose_empresas ?? []).length
      ? reports.desglose_empresas.map((item) => ({
          tipo: 'empresa',
          nombre: item.empresa_nombre,
          conversaciones: item.total_conversaciones,
          atendidas_ia: item.conversaciones_atendidas_bot,
          handoff: item.conversaciones_pidieron_humano,
          clientes_unicos: item.clientes_unicos
        }))
      : topProducts.map((item) => ({
          tipo: 'producto',
          nombre: item.nombre,
          empresa: item.empresa_nombre,
          consultas: item.consultas
        }));
    const summaryRows = [
      { tipo: 'kpi', nombre: 'Conversaciones', valor: metrics.total_conversaciones },
      { tipo: 'kpi', nombre: 'Atencion IA', valor: metrics.conversaciones_atendidas_bot },
      { tipo: 'kpi', nombre: 'Handoff humano', valor: metrics.conversaciones_pidieron_humano },
      { tipo: 'kpi', nombre: 'Pedidos', valor: metrics.pedidos_generados },
      { tipo: 'kpi', nombre: 'Ventas estimadas', valor: metrics.ventas_estimadas },
      { tipo: 'kpi', nombre: 'Clientes nuevos', valor: metrics.clientes_nuevos },
      { tipo: 'kpi', nombre: 'Conversion', valor: metrics.tasa_conversion_conversacion_pedido },
      { tipo: 'kpi', nombre: 'Consumo IA requests', valor: aiUsage.total_requests },
      { tipo: 'kpi', nombre: 'Consumo IA tokens', valor: aiUsage.total_tokens }
    ];
    downloadCsv('reportes.csv', detailRows.length ? detailRows : summaryRows);
  }

  const scopeLabel = isSuperAdmin
    ? selectedCompanyName || 'Vista global'
    : user?.empresa?.nombre || 'Empresa actual';

  return (
    <section className="reports-page" aria-label="Reportes">
      <ReportsHero
        isLoading={isLoading}
        onExport={handleExportCsv}
        onRefresh={() => loadReports(filters)}
        rangeLabel={getRangeLabel(filters)}
        scopeLabel={scopeLabel}
      />

      <ReportsToolbar
        companies={companies}
        filters={filters}
        isLoading={isLoading}
        isSuperAdmin={isSuperAdmin}
        onChange={handleFilterChange}
        onClear={handleClear}
        onPreset={handlePreset}
        onSubmit={handleSubmit}
        selectedPreset={selectedPreset}
      />

      {error ? <ReportsError message={error} onRetry={() => loadReports(filters)} /> : null}
      {isLoading ? <ReportsSkeleton /> : null}
      {!isLoading && !error && !hasAnyData ? <ReportsEmpty /> : null}

      {!isLoading ? (
        <>
          <ExecutiveKPIs aiUsage={aiUsage} metrics={metrics} />
          <ExecutiveSummary metrics={metrics} topProducts={topProducts} />

          <section className="reports-grid-main">
            <ReportChartCard
              description="Esta grafica muestra la evolucion diaria de conversaciones atendidas."
              icon={MessageCircle}
              title="Conversaciones por dia"
            >
              {chartHasData(dailyMessages, 'mensajes') ? (
                <BarChart
                  colors={['#00abe4']}
                  height={300}
                  series={[{ data: dailyMessages.map((item) => Number(item.mensajes ?? 0)), label: 'Conversaciones' }]}
                  xAxis={[{ data: dailyMessages.map((item) => item.label), scaleType: 'band' }]}
                />
              ) : (
                <EmptyState title="Sin conversaciones" description="Aun no hay datos para el periodo seleccionado." />
              )}
            </ReportChartCard>

            <ReportChartCard
              description="Esta grafica resume los ingresos disponibles cuando el modulo de pedidos entrega ventas."
              icon={TrendingUp}
              title="Ventas"
            >
              {chartHasData(salesOverTime, 'ventas') ? (
                <LineChart
                  colors={['#2272ff']}
                  height={300}
                  series={[{ area: true, curve: 'monotoneX', data: salesOverTime.map((item) => item.ventas), label: 'Ventas' }]}
                  xAxis={[{ data: salesOverTime.map((item) => item.label), scaleType: 'point' }]}
                />
              ) : (
                <div className="reports-metric-spotlight">
                  <span>{formatCurrency(metrics.ventas_estimadas)}</span>
                  <p>Ventas estimadas del periodo. No hay serie diaria disponible para graficar.</p>
                </div>
              )}
            </ReportChartCard>
          </section>

          <section className="reports-grid-main">
            <ReportChartCard
              description="Esta grafica muestra el volumen de pedidos cuando existen datos por periodo."
              icon={ShoppingBag}
              title="Pedidos por periodo"
            >
              {chartHasData(ordersByPeriod, 'pedidos') ? (
                <BarChart
                  colors={['#1f8a62']}
                  height={280}
                  series={[{ data: ordersByPeriod.map((item) => item.pedidos), label: 'Pedidos' }]}
                  xAxis={[{ data: ordersByPeriod.map((item) => item.label), scaleType: 'band' }]}
                />
              ) : (
                <div className="reports-metric-spotlight">
                  <span>{formatNumber(metrics.pedidos_generados)}</span>
                  <p>Pedidos generados del periodo. No hay serie diaria disponible para graficar.</p>
                </div>
              )}
            </ReportChartCard>

            <ReportChartCard
              description="Esta grafica muestra la distribucion operativa de pedidos si el backend entrega estados."
              icon={ShoppingBag}
              title="Estado de pedidos"
            >
              {ordersByStatus.length && ordersByStatus.some((item) => item.value > 0) ? (
                <PieChart
                  colors={['#00abe4', '#2272ff', '#75dca7', '#ffd166']}
                  height={280}
                  series={[{ data: ordersByStatus, innerRadius: 58, outerRadius: 98, paddingAngle: 3 }]}
                  slotProps={{ legend: { direction: 'row', position: { horizontal: 'middle', vertical: 'bottom' } } }}
                />
              ) : (
                <EmptyState title="Sin estados" description="Aun no hay distribucion de pedidos por estado." />
              )}
            </ReportChartCard>
          </section>

          <section className="reports-grid-side">
            <ReportChartCard
              description="Ranking de productos con mayor interes detectado en conversaciones y leads."
              icon={PackageSearch}
              title="Top productos"
            >
              <RankingList emptyTitle="Sin productos consultados" items={topProducts} />
            </ReportChartCard>

            <ActivityTimeline metrics={metrics} />
          </section>

          <ReportsDataTable isSuperAdmin={isSuperAdmin} reports={reports} topProducts={topProducts} />
        </>
      ) : null}
    </section>
  );
}
