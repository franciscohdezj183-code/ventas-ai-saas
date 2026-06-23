import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CreditCard,
  Crown,
  FileText,
  MessageCircle,
  Package,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';
import { ErrorState, LoadingState, StatusBadge } from '../../components/ui/index.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import { fetchPlans, fetchPlanUsage } from '../plans/plansApi.js';

const featureLabels = {
  advanced_reports: 'Reportes avanzados',
  ai_config: 'Configuracion IA',
  api: 'API e integraciones',
  basic_conversations: 'Conversaciones basicas',
  basic_orders: 'Pedidos basicos',
  crm: 'CRM comercial',
  custom_ai: 'IA personalizada',
  leads: 'Leads y seguimiento',
  multi_branch: 'Multi-sucursal',
  orders: 'Pedidos',
  priority_support: 'Soporte prioritario',
  reports: 'Reportes'
};

const limitLabels = {
  aiMessagesMonthly: 'Conversaciones IA',
  products: 'Productos',
  users: 'Usuarios',
  whatsapp: 'WhatsApp conectados'
};

const limitHelp = {
  aiMessagesMonthly: 'Mensajes automatizados disponibles durante el mes actual.',
  products: 'Catalogo activo disponible para ventas y respuestas del asistente.',
  users: 'Cuentas activas del equipo dentro de la empresa.',
  whatsapp: 'Canales de WhatsApp que puede conectar tu empresa.'
};

const limitIcons = {
  aiMessagesMonthly: Bot,
  products: Package,
  users: Users,
  whatsapp: MessageCircle
};

const featureIcons = {
  advanced_reports: TrendingUp,
  ai_config: Bot,
  api: Zap,
  basic_conversations: MessageCircle,
  basic_orders: FileText,
  crm: Users,
  custom_ai: Bot,
  leads: Users,
  multi_branch: ShieldCheck,
  orders: FileText,
  priority_support: ShieldCheck,
  reports: TrendingUp
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo cargar la suscripcion.';
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return 'No disponible';

  return Number(value).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency'
  });
}

function formatLimit(value) {
  if (value === null || value === undefined) return 'Ilimitado';
  return Number(value).toLocaleString('es-MX');
}

function getStatusLabel(status, company) {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'trial') return 'Trial';
  if (['expired', 'vencido'].includes(normalized)) return 'Vencido';
  if (['suspended', 'suspendido'].includes(normalized)) return 'Suspendido';
  if (['cancelled', 'cancelada'].includes(normalized)) return 'Cancelado';
  if (company && !company.activo) return 'Suspendido';
  return 'Activo';
}

function getStatusTone(status, company) {
  const label = getStatusLabel(status, company).toLowerCase();
  if (label === 'activo') return 'ACTIVO';
  if (label === 'trial') return 'PENDIENTE';
  return 'INACTIVO';
}

function getPlanIcon(planKey) {
  if (planKey === 'enterprise') return Crown;
  if (planKey === 'business') return Zap;
  return Sparkles;
}

function getFeatureLabel(feature) {
  return featureLabels[feature] ?? feature;
}

function getUsageRows(currentPlan, usage) {
  const limits = currentPlan?.limits ?? usage?.limits ?? {};
  const usageValues = usage?.usage ?? {};

  return Object.entries(limits).map(([key, limit]) => {
    const used = Number(usageValues[key] ?? 0);
    const hasLimit = limit !== null && limit !== undefined;
    const limitNumber = Number(limit || 0);
    const percent = hasLimit && limitNumber > 0 ? Math.min((used / limitNumber) * 100, 100) : 100;

    return {
      key,
      label: limitLabels[key] ?? key,
      help: limitHelp[key] ?? 'Uso registrado para este recurso.',
      limit,
      percent,
      used
    };
  });
}

function getHighUsageAlerts(rows) {
  return rows
    .filter((row) => row.limit !== null && row.limit !== undefined && Number(row.limit) > 0 && row.used / Number(row.limit) >= 0.85)
    .map((row) => ({
      key: row.key,
      text: `Has utilizado ${row.used.toLocaleString('es-MX')} de ${Number(row.limit).toLocaleString('es-MX')} en ${row.label.toLowerCase()}.`
    }));
}

function SubscriptionHero({ company, currentPlan, onRefresh, status }) {
  return (
    <header className="owner-subscription-hero">
      <div className="owner-subscription-hero-copy">
        <span><CreditCard size={24} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Mi suscripcion</p>
          <h1>Mi Suscripcion</h1>
          <p>Consulta tu plan activo, beneficios, limites y uso mensual de la plataforma.</p>
        </div>
      </div>
      <div className="owner-subscription-hero-side">
        <div className="owner-subscription-badges">
          <span>{currentPlan?.label ?? company?.plan ?? 'Sin plan'}</span>
          <StatusBadge status={getStatusTone(status, company)}>{getStatusLabel(status, company)}</StatusBadge>
        </div>
        <button className="secondary-button" onClick={onRefresh} type="button">
          <RefreshCcw size={17} aria-hidden="true" />
          Actualizar datos
        </button>
      </div>
    </header>
  );
}

function CurrentPlanCard({ company, currentPlan, status, usage }) {
  const Icon = getPlanIcon(currentPlan?.key);
  const details = [
    ['Estado', getStatusLabel(status, company)],
    ['Empresa actual', company?.nombre ?? usage?.empresa_nombre ?? 'No disponible'],
    ['Precio mensual', formatCurrency(currentPlan?.estimatedMonthlyPrice)],
    ['Precio anual', usage?.annual_price ? formatCurrency(usage.annual_price) : 'No disponible'],
    ['Fecha de inicio', usage?.started_at ?? usage?.created_at ?? 'No disponible'],
    ['Proxima renovacion', usage?.next_renewal_date ?? usage?.renovacion ?? 'No disponible'],
    ['Vencimiento', usage?.expires_at ?? usage?.expiration_date ?? 'No disponible']
  ];

  return (
    <section className="owner-plan-card">
      <div className="owner-plan-card-main">
        <span><Icon size={26} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Plan actual</p>
          <h2>Plan {currentPlan?.label ?? usage?.plan_label ?? company?.plan ?? 'No disponible'}</h2>
          <p>Tu empresa tiene acceso a las funciones incluidas en este plan y a los limites configurados para operar este mes.</p>
        </div>
      </div>
      <dl>
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BenefitsSection({ currentPlan }) {
  const features = currentPlan?.features ?? [];

  return (
    <section className="owner-subscription-section">
      <header>
        <span><CheckCircle2 size={19} aria-hidden="true" /></span>
        <div>
          <h2>Beneficios incluidos</h2>
          <p>Funciones disponibles segun el plan activo configurado en la plataforma.</p>
        </div>
      </header>
      {features.length ? (
        <div className="owner-benefits-grid">
          {features.map((feature) => {
            const Icon = featureIcons[feature] ?? CheckCircle2;
            return (
              <article key={feature}>
                <span><Icon size={18} aria-hidden="true" /></span>
                <strong>{getFeatureLabel(feature)}</strong>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="owner-subscription-muted">No hay beneficios configurados para este plan.</p>
      )}
    </section>
  );
}

function UsageSection({ rows }) {
  return (
    <section className="owner-subscription-section">
      <header>
        <span><BarIcon aria-hidden="true" /></span>
        <div>
          <h2>Uso y limites</h2>
          <p>Metricas reales disponibles para tu plan actual.</p>
        </div>
      </header>
      {rows.length ? (
        <div className="owner-usage-grid">
          {rows.map((row) => {
            const Icon = limitIcons[row.key] ?? CheckCircle2;
            return (
              <article className="owner-usage-card" key={row.key}>
                <header>
                  <span><Icon size={18} aria-hidden="true" /></span>
                  <div>
                    <strong>{row.label}</strong>
                    <p>{row.used.toLocaleString('es-MX')} de {formatLimit(row.limit)} utilizadas</p>
                  </div>
                </header>
                <div className="owner-usage-track" role="progressbar" aria-label={row.label} aria-valuemin="0" aria-valuemax={(row.limit ?? row.used) || 1} aria-valuenow={row.used}>
                  <i style={{ width: `${row.percent}%` }} />
                </div>
                <small>{row.help}</small>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="owner-subscription-muted">No hay limites disponibles para mostrar.</p>
      )}
    </section>
  );
}

function BarIcon(props) {
  return <TrendingUp size={19} {...props} />;
}

function RecommendationsSection({ alerts }) {
  return (
    <section className={`owner-recommendation-card ${alerts.length ? 'warning' : 'ok'}`}>
      <span>{alerts.length ? <AlertTriangle size={20} aria-hidden="true" /> : <ShieldCheck size={20} aria-hidden="true" />}</span>
      <div>
        <h2>{alerts.length ? 'Estas cerca del limite' : 'Tu plan tiene capacidad suficiente'}</h2>
        {alerts.length ? (
          <ul>
            {alerts.map((alert) => <li key={alert.key}>{alert.text}</li>)}
          </ul>
        ) : (
          <p>No hay alertas de consumo alto con los datos disponibles este mes.</p>
        )}
      </div>
    </section>
  );
}

function PlansComparison({ currentPlanKey, plans }) {
  if (!plans.length) return null;

  return (
    <section className="owner-subscription-section">
      <header>
        <span><Crown size={19} aria-hidden="true" /></span>
        <div>
          <h2>Comparacion de planes</h2>
          <p>Opciones disponibles en la logica actual de planes.</p>
        </div>
      </header>
      <div className="owner-plan-comparison-grid">
        {plans.map((plan) => {
          const isCurrent = plan.key === currentPlanKey;
          const Icon = getPlanIcon(plan.key);
          return (
            <article className={isCurrent ? 'current' : ''} key={plan.key}>
              <header>
                <span><Icon size={19} aria-hidden="true" /></span>
                <div>
                  <strong>{plan.label}</strong>
                  <small>{formatCurrency(plan.estimatedMonthlyPrice)} / mes</small>
                </div>
              </header>
              <dl>
                {Object.entries(plan.limits ?? {}).slice(0, 4).map(([key, limit]) => (
                  <div key={key}>
                    <dt>{limitLabels[key] ?? key}</dt>
                    <dd>{formatLimit(limit)}</dd>
                  </div>
                ))}
              </dl>
              <div className="owner-plan-feature-list">
                {(plan.features ?? []).slice(0, 4).map((feature) => <span key={feature}>{getFeatureLabel(feature)}</span>)}
              </div>
              {isCurrent ? <StatusBadge status="ACTIVO">Actual</StatusBadge> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BillingSection() {
  return (
    <section className="owner-subscription-section owner-billing-empty">
      <header>
        <span><FileText size={19} aria-hidden="true" /></span>
        <div>
          <h2>Historial y facturacion</h2>
          <p>Aun no hay historial de facturacion disponible.</p>
        </div>
      </header>
    </section>
  );
}

export function OwnerCompanyPanel() {
  const [company, setCompany] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);

  const currentPlan = useMemo(
    () => plans.find((plan) => plan.key === usage?.plan) ?? plans.find((plan) => plan.legacyPlan === company?.plan),
    [company?.plan, plans, usage?.plan]
  );
  const usageRows = useMemo(() => getUsageRows(currentPlan, usage), [currentPlan, usage]);
  const alerts = useMemo(() => getHighUsageAlerts(usageRows), [usageRows]);
  const status = usage?.subscription_status ?? usage?.status;

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [companies, nextPlans, nextUsage] = await Promise.all([
        fetchCompanies(),
        fetchPlans(),
        fetchPlanUsage()
      ]);
      setCompany(companies[0] ?? null);
      setPlans(nextPlans);
      setUsage(nextUsage);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return <LoadingState message="Cargando suscripcion..." />;
  }

  return (
    <div className="resource-page owner-subscription-page">
      <SubscriptionHero company={company} currentPlan={currentPlan} onRefresh={loadData} status={status} />
      {error ? <ErrorState message={error} onRetry={loadData} /> : null}
      <CurrentPlanCard company={company} currentPlan={currentPlan} status={status} usage={usage} />
      <BenefitsSection currentPlan={currentPlan} />
      <UsageSection rows={usageRows} />
      <RecommendationsSection alerts={alerts} />
      <PlansComparison currentPlanKey={currentPlan?.key ?? usage?.plan} plans={plans} />
      <BillingSection />
    </div>
  );
}
