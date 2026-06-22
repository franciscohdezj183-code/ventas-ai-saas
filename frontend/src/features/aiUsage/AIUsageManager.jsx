import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, Building2, CalendarDays, Download, RefreshCcw, Sparkles, TrendingUp } from 'lucide-react';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { fetchReportsOverview } from '../reports/reportsApi.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}

const emptyReports = {
  consumo_ia: {
    total_requests: 0,
    total_tokens: 0,
    costo_estimado: 0
  },
  date_range: {
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  },
  desglose_empresas: [],
  mensajes_por_dia: [],
  metrics: {
    conversaciones_atendidas_bot: 0,
    total_conversaciones: 0
  }
};

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

function daysBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
  return Number.isFinite(diff) ? diff : 1;
}

function getDailyItems(reports) {
  return (reports.mensajes_por_dia ?? []).map((item) => ({
    fecha: item.fecha,
    label: item.fecha?.slice(5) ?? item.label ?? '',
    mensajes: Number(item.mensajes ?? item.total_mensajes ?? 0),
    conversaciones: Number(item.conversaciones ?? item.total_conversaciones ?? 0)
  }));
}

function AIUsageSkeleton() {
  return (
    <section className="resource-page ai-usage-page">
      <div className="ai-usage-skeleton" aria-label="Cargando informacion de consumo IA">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function AIUsageError({ message, onRetry }) {
  return (
    <section className="ai-usage-state error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar el consumo de IA.</h2>
        <p>{message || 'Revisa tu conexion o intenta actualizar la informacion.'}</p>
      </div>
      <button className="secondary-button" onClick={onRetry} type="button">Reintentar</button>
    </section>
  );
}

function AIUsageHero({ aiUsage, dateRange, onRefresh }) {
  const requests = Number(aiUsage.total_requests ?? 0);
  const limit = aiUsage.limit ?? aiUsage.limite ?? null;
  const percent = limit ? Math.min((requests / Number(limit || 1)) * 100, 100) : null;
  const state = percent === null ? 'Sin limite configurado' : percent >= 100 ? 'Limite alcanzado' : percent >= 85 ? 'Cerca del limite' : 'Consumo saludable';

  return (
    <header className="ai-usage-hero">
      <div>
        <span className="ai-usage-hero-icon"><Sparkles size={23} aria-hidden="true" /></span>
        <p className="eyebrow">Analitica IA</p>
        <h1>Consumo de IA</h1>
        <p>Monitorea el uso de inteligencia artificial, conversaciones automatizadas y limites de tu plan.</p>
      </div>
      <div className="ai-usage-hero-facts">
        <article><span>Uso actual</span><strong>{formatNumber(requests)}</strong></article>
        <article><span>Limite del plan</span><strong>{limit ? formatNumber(limit) : 'No disponible'}</strong></article>
        <article><span>Estado</span><strong>{state}</strong></article>
        <article><span>Periodo</span><strong>{dateRange.fecha_inicio} - {dateRange.fecha_fin}</strong></article>
      </div>
      <div className="ai-usage-actions">
        <button className="secondary-button" onClick={onRefresh} type="button"><RefreshCcw size={17} aria-hidden="true" /> Actualizar datos</button>
        <Link className="secondary-button" to="/suscripciones">Ver suscripcion</Link>
      </div>
    </header>
  );
}

function SummaryCard({ detail, label, value }) {
  return (
    <article className="ai-usage-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function ExecutiveSummary({ aiUsage, dailyItems, dateRange, metrics }) {
  const requests = Number(aiUsage.total_requests ?? 0);
  const messages = Number(aiUsage.total_tokens ?? 0);
  const limit = aiUsage.limit ?? aiUsage.limite ?? null;
  const usedPercent = limit ? Math.round(Math.min((requests / Number(limit || 1)) * 100, 100)) : null;
  const topDay = [...dailyItems].sort((a, b) => b.mensajes - a.mensajes)[0];
  const average = Math.round(requests / daysBetween(dateRange.fecha_inicio, dateRange.fecha_fin));

  return (
    <section className="ai-usage-summary-grid" aria-label="Resumen ejecutivo de consumo IA">
      <SummaryCard label="Uso mensual" value={formatNumber(requests)} detail={`${formatNumber(messages)} mensajes IA${usedPercent === null ? '' : ` - ${usedPercent}% utilizado`}`} />
      <SummaryCard label="Limite del plan" value={limit ? formatNumber(limit) : 'No disponible'} detail={limit ? `${formatNumber(Number(limit) - requests)} disponible` : 'El endpoint no expone limite'} />
      <SummaryCard label="Actividad" value={topDay?.label || 'Sin actividad'} detail={`${formatNumber(average)} promedio diario - ${metrics.conversaciones_atendidas_bot ?? 0} conversaciones con IA`} />
      <SummaryCard label="Costo estimado" value={formatCurrency(aiUsage.costo_estimado)} detail="Calculado desde datos reales del periodo" />
    </section>
  );
}

function LimitProgress({ aiUsage, dateRange }) {
  const used = Number(aiUsage.total_requests ?? 0);
  const limit = aiUsage.limit ?? aiUsage.limite ?? null;
  const hasLimit = limit !== null && limit !== undefined;
  const max = Number(limit || used || 1);
  const percent = hasLimit ? Math.min((used / max) * 100, 100) : 0;
  const remaining = hasLimit ? Math.max(max - used, 0) : null;
  const days = daysBetween(dateRange.fecha_inicio, dateRange.fecha_fin);
  const message = !hasLimit
    ? 'No hay un limite de plan disponible en los datos actuales.'
    : percent >= 100
      ? 'Has alcanzado el limite disponible para este periodo.'
      : percent >= 85
        ? 'Estas cerca de alcanzar el limite de tu plan.'
        : 'Todavia tienes margen suficiente para usar IA este mes.';

  return (
    <section className="ai-usage-limit-panel">
      <header>
        <div>
          <p className="eyebrow">Uso del plan</p>
          <h2>{hasLimit ? `${formatNumber(used)} de ${formatNumber(max)} conversaciones IA utilizadas` : `${formatNumber(used)} conversaciones IA registradas`}</h2>
          <p>{message}</p>
        </div>
      </header>
      <div className="ai-usage-big-progress" role="progressbar" aria-label="Uso del limite de IA" aria-valuemin="0" aria-valuemax={max} aria-valuenow={used}>
        <i style={{ width: `${hasLimit ? percent : 100}%` }} />
      </div>
      <dl>
        <div><dt>Disponible</dt><dd>{remaining === null ? 'No disponible' : formatNumber(remaining)}</dd></div>
        <div><dt>Usado</dt><dd>{formatNumber(used)}</dd></div>
        <div><dt>Porcentaje</dt><dd>{hasLimit ? `${Math.round(percent)}%` : 'Sin limite'}</dd></div>
        <div><dt>Dias del periodo</dt><dd>{days}</dd></div>
      </dl>
    </section>
  );
}

function UsageTrend({ items }) {
  return (
    <section className="ai-usage-section">
      <header>
        <div>
          <p className="eyebrow">Tendencia</p>
          <h2>Tendencia de uso</h2>
          <p>Mensajes y conversaciones agrupadas por dia.</p>
        </div>
      </header>
      {items.length ? (
        <div className="ai-usage-chart-shell">
          <BarChart
            borderRadius={8}
            colors={['#2272ff', '#64748b']}
            dataset={items.map((item) => ({
              conversaciones: item.conversaciones,
              fecha: item.label,
              mensajes: item.mensajes
            }))}
            height={310}
            margin={{ bottom: 42, left: 48, right: 18, top: 24 }}
            series={[
              { dataKey: 'mensajes', label: 'Mensajes IA' },
              { dataKey: 'conversaciones', label: 'Conversaciones IA' }
            ]}
            xAxis={[{ dataKey: 'fecha', scaleType: 'band' }]}
            yAxis={[{ min: 0 }]}
          />
        </div>
      ) : (
        <p className="ai-usage-muted">No hay actividad por dia para el periodo seleccionado.</p>
      )}
    </section>
  );
}

function Breakdown({ companies }) {
  const max = Math.max(...companies.map((item) => Number(item.total_conversaciones ?? 0)), 1);

  if (!companies.length) return null;

  return (
    <section className="ai-usage-section">
      <header>
        <div>
          <p className="eyebrow">Desglose</p>
          <h2>Desglose de consumo</h2>
          <p>Empresas con mayor volumen de conversaciones en el periodo.</p>
        </div>
      </header>
      <div className="ai-usage-breakdown-list">
        {companies.map((company) => {
          const total = Number(company.total_conversaciones ?? 0);
          return (
            <article key={company.tenant_id ?? company.empresa_nombre}>
              <div>
                <strong>{company.empresa_nombre ?? 'Empresa'}</strong>
                <span>{formatNumber(total)} conversaciones</span>
              </div>
              <div className="ai-usage-mini-track"><i style={{ width: `${(total / max) * 100}%` }} /></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AIUsageAlerts({ aiUsage }) {
  const used = Number(aiUsage.total_requests ?? 0);
  const limit = aiUsage.limit ?? aiUsage.limite ?? null;
  const alerts = [];
  if (!used) alerts.push('Sin consumo de IA registrado para el periodo seleccionado.');
  if (limit && used / Number(limit || 1) >= 0.85) alerts.push(`Has usado ${Math.round((used / Number(limit || 1)) * 100)}% de tus conversaciones IA disponibles.`);

  if (!alerts.length) return null;

  return (
    <section className="ai-usage-alerts">
      {alerts.map((alert) => (
        <article key={alert}><AlertTriangle size={18} aria-hidden="true" /><span>{alert}</span></article>
      ))}
    </section>
  );
}

export function AIUsageManager() {
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today(),
    empresa_id: ''
  });
  const [reports, setReports] = useState(emptyReports);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const aiUsage = reports.consumo_ia ?? emptyReports.consumo_ia;
  const dailyItems = useMemo(() => getDailyItems(reports), [reports]);

  async function loadUsage(nextFilters = filters) {
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
      setError(requestError?.response?.data?.message ?? 'No se pudo cargar el consumo de IA.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadUsage();
  }, [isSuperAdmin]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    loadUsage(filters);
  }

  if (isLoading) {
    return <AIUsageSkeleton />;
  }

  return (
    <section className="resource-page ai-usage-page" aria-label="Consumo de IA">
      <AIUsageHero aiUsage={aiUsage} dateRange={reports.date_range ?? filters} onRefresh={() => loadUsage(filters)} />
      {error ? <AIUsageError message={error} onRetry={() => loadUsage(filters)} /> : null}

      <form className="ai-usage-toolbar" onSubmit={handleSubmit}>
        <label htmlFor="ai-usage-start"><span>Fecha inicio</span><div><CalendarDays size={16} aria-hidden="true" /><input id="ai-usage-start" name="fecha_inicio" onChange={handleFilterChange} type="date" value={filters.fecha_inicio} /></div></label>
        <label htmlFor="ai-usage-end"><span>Fecha fin</span><div><CalendarDays size={16} aria-hidden="true" /><input id="ai-usage-end" name="fecha_fin" onChange={handleFilterChange} type="date" value={filters.fecha_fin} /></div></label>
        {isSuperAdmin ? (
          <label htmlFor="ai-usage-company"><span>Empresa</span><select id="ai-usage-company" name="empresa_id" onChange={handleFilterChange} value={filters.empresa_id}><option value="">Global</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}</select></label>
        ) : null}
        <button className="primary-button" disabled={isLoading} type="submit">Cambiar periodo</button>
      </form>

      <AIUsageAlerts aiUsage={aiUsage} />
      <ExecutiveSummary aiUsage={aiUsage} dailyItems={dailyItems} dateRange={reports.date_range ?? filters} metrics={reports.metrics ?? emptyReports.metrics} />
      <LimitProgress aiUsage={aiUsage} dateRange={reports.date_range ?? filters} />
      <section className="ai-usage-analytics-grid">
        <UsageTrend items={dailyItems} />
        {isSuperAdmin ? <Breakdown companies={reports.desglose_empresas ?? []} /> : null}
      </section>

      <section className="ai-usage-actions-panel">
        <Link className="secondary-button" to="/suscripciones">Ver suscripcion</Link>
        <Link className="secondary-button" to="/prompts-bot">Configurar IA</Link>
        <button className="secondary-button" onClick={() => loadUsage(filters)} type="button"><Download size={16} aria-hidden="true" /> Actualizar reporte</button>
      </section>
    </section>
  );
}
