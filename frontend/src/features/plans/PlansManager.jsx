import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Sparkles,
  Users,
  Zap
} from 'lucide-react';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { fetchPlans, fetchPlanUsage } from './plansApi.js';

const featureLabels = {
  advanced_reports: 'Reportes avanzados',
  ai_config: 'Configuracion de IA',
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

const usageIcons = {
  aiMessagesMonthly: Bot,
  products: Package,
  users: Users,
  whatsapp: MessageCircle
};

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency'
  });
}

function formatLimit(value) {
  return value === null || value === undefined ? 'Ilimitado' : Number(value).toLocaleString('es-MX');
}

function normalizeStatus(status) {
  return String(status ?? '').toLowerCase();
}

function getStatusLabel(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'trial') return 'Trial';
  if (normalized === 'expired' || normalized === 'vencido') return 'Vencida';
  if (normalized === 'suspended' || normalized === 'suspendido') return 'Suspendida';
  if (normalized === 'cancelled' || normalized === 'cancelada') return 'Cancelada';
  return 'Activa';
}

function getStatusTone(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'trial') return 'trial';
  if (['expired', 'vencido', 'suspended', 'suspendido', 'cancelled', 'cancelada'].includes(normalized)) return 'danger';
  return 'active';
}

function getPlanIcon(planKey) {
  if (planKey === 'enterprise') return Crown;
  if (planKey === 'business') return Zap;
  return Sparkles;
}

function SubscriptionStatusBadge({ status }) {
  return <span className={`subscription-status-badge ${getStatusTone(status)}`}>{getStatusLabel(status)}</span>;
}

function SubscriptionSkeleton() {
  return (
    <section className="resource-page plans-page subscription-page">
      <div className="subscription-skeleton" aria-label="Cargando informacion de suscripcion">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function SubscriptionErrorState({ message, onRetry }) {
  return (
    <section className="subscription-state-card error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar tu suscripcion.</h2>
        <p>{message || 'Revisa tu conexion o intenta actualizar la informacion.'}</p>
      </div>
      <button className="secondary-button" onClick={onRetry} type="button">Reintentar</button>
    </section>
  );
}

function SubscriptionEmptyState({ canViewPlans }) {
  return (
    <section className="subscription-state-card">
      <CreditCard size={26} aria-hidden="true" />
      <div>
        <h2>No tienes una suscripcion activa.</h2>
        <p>Selecciona un plan para comenzar a utilizar todas las funciones de la plataforma.</p>
      </div>
      {canViewPlans ? <a className="primary-button" href="#planes-disponibles">Ver planes</a> : null}
    </section>
  );
}

function SubscriptionHero({ currentPlan, isSuperAdmin, onRefresh, selectedCompanyName, status, usage }) {
  const amount = currentPlan?.estimatedMonthlyPrice ?? usage?.estimatedMonthlyPrice ?? 0;

  return (
    <header className="subscription-hero">
      <div>
        <span className="subscription-hero-icon"><CreditCard size={23} aria-hidden="true" /></span>
        <p className="eyebrow">Facturacion SaaS</p>
        <h1>Suscripciones</h1>
        <p>Administra el plan, pagos y limites de tu empresa desde un solo lugar.</p>
      </div>
      <div className="subscription-hero-facts">
        <article>
          <span>Plan actual</span>
          <strong>{currentPlan?.label ?? usage?.plan_label ?? 'Sin seleccionar'}</strong>
        </article>
        <article>
          <span>Estado</span>
          <strong><SubscriptionStatusBadge status={status} /></strong>
        </article>
        <article>
          <span>Monto mensual</span>
          <strong>{formatCurrency(amount)}</strong>
        </article>
        <article>
          <span>Empresa</span>
          <strong>{selectedCompanyName || usage?.empresa_nombre || (isSuperAdmin ? 'Selecciona empresa' : 'Empresa actual')}</strong>
        </article>
      </div>
      <div className="subscription-hero-actions">
        <button className="secondary-button" onClick={onRefresh} type="button">
          <RefreshCcw size={17} aria-hidden="true" />
          Actualizar
        </button>
        <a className="secondary-button" href="#facturacion">
          <FileText size={17} aria-hidden="true" />
          Ver facturacion
        </a>
      </div>
    </header>
  );
}

function CurrentPlanCard({ currentPlan, selectedCompanyName, status, usage }) {
  const amount = currentPlan?.estimatedMonthlyPrice ?? 0;

  return (
    <section className="current-plan-card">
      <div>
        <p className="eyebrow">Plan actual</p>
        <h2>{currentPlan?.label ?? usage?.plan_label ?? 'Sin seleccionar'}</h2>
        <p>Tu suscripcion esta {getStatusLabel(status).toLowerCase()} y define los limites disponibles para la empresa.</p>
      </div>
      <div className="current-plan-price">
        <strong>{formatCurrency(amount)}</strong>
        <span>/ mes estimado</span>
        <SubscriptionStatusBadge status={status} />
      </div>
      <dl>
        <div><dt>Empresa asociada</dt><dd>{selectedCompanyName || usage?.empresa_nombre || '-'}</dd></div>
        <div><dt>Periodo</dt><dd>Mensual</dd></div>
        <div><dt>Renovacion</dt><dd>{usage?.next_renewal_date || usage?.renovacion || 'Sin fecha disponible'}</dd></div>
        <div><dt>Metodo de pago</dt><dd>{usage?.payment_method || 'No disponible'}</dd></div>
        <div><dt>Estado de pago</dt><dd>{usage?.payment_status || 'Sin pagos registrados'}</dd></div>
        <div><dt>Fecha de inicio</dt><dd>{usage?.started_at || usage?.created_at || 'Sin fecha disponible'}</dd></div>
      </dl>
    </section>
  );
}

function UsageLimitBar({ label, limit, usage }) {
  const Icon = usageIcons[label] ?? CheckCircle2;
  const current = Number(usage ?? 0);
  const hasLimit = limit !== null && limit !== undefined;
  const max = Number(limit || 1);
  const percent = hasLimit ? Math.min((current / max) * 100, 100) : 100;

  return (
    <article className="usage-limit-card">
      <header>
        <span><Icon size={18} aria-hidden="true" /></span>
        <div>
          <strong>{limitLabels[label] ?? label}</strong>
          <p>{hasLimit ? `${current.toLocaleString('es-MX')} de ${max.toLocaleString('es-MX')} utilizados` : `${current.toLocaleString('es-MX')} usados - limite ilimitado`}</p>
        </div>
      </header>
      <div className="usage-limit-track" role="progressbar" aria-label={limitLabels[label] ?? label} aria-valuemin="0" aria-valuemax={hasLimit ? max : current || 1} aria-valuenow={current}>
        <i style={{ width: `${percent}%` }} />
      </div>
      <small>{hasLimit ? 'Si alcanzas el limite, necesitaras cambiar de plan.' : 'Este limite no restringe tu operacion actual.'}</small>
    </article>
  );
}

function UsageLimitsSection({ currentPlan, usage }) {
  const limits = currentPlan?.limits ?? {};
  const usageValues = usage?.usage ?? {};

  return (
    <section className="subscription-section">
      <header className="subscription-section-header">
        <div>
          <p className="eyebrow">Uso y limites</p>
          <h2>Consumo del plan</h2>
          <p>Estos limites indican cuanto puedes usar antes de necesitar un cambio de plan.</p>
        </div>
      </header>
      <div className="usage-limits-grid">
        {Object.keys(limits).length ? Object.entries(limits).map(([key, limit]) => (
          <UsageLimitBar key={key} label={key} limit={limit} usage={usageValues[key]} />
        )) : (
          <p className="subscription-muted">No hay limites configurados para este plan.</p>
        )}
      </div>
    </section>
  );
}

function PlanCard({ currentPlanKey, isBusy, onChangePlan, plan }) {
  const isCurrent = currentPlanKey === plan.key;
  const Icon = getPlanIcon(plan.key);
  const limits = plan.limits ?? {};
  const features = plan.features ?? [];

  return (
    <article className={`subscription-plan-card ${plan.key} ${isCurrent ? 'current' : ''}`}>
      <header>
        <span><Icon size={22} aria-hidden="true" /></span>
        <div>
          <h3>{plan.label}</h3>
          <p>{plan.key === 'starter' ? 'Para comenzar con control.' : plan.key === 'business' ? 'Para equipos comerciales en crecimiento.' : 'Para operacion avanzada.'}</p>
        </div>
        {plan.key === 'business' ? <em>Recomendado</em> : null}
      </header>
      <div className="subscription-plan-price">
        <strong>{formatCurrency(plan.estimatedMonthlyPrice)}</strong>
        <span>/ mes</span>
      </div>
      <dl>
        {Object.entries(limits).slice(0, 4).map(([key, limit]) => (
          <div key={key}><dt>{limitLabels[key] ?? key}</dt><dd>{formatLimit(limit)}</dd></div>
        ))}
      </dl>
      <ul>
        {features.slice(0, 5).map((feature) => (
          <li key={feature}><CheckCircle2 size={15} aria-hidden="true" />{featureLabels[feature] ?? feature}</li>
        ))}
      </ul>
      <button className={isCurrent ? 'secondary-button' : 'primary-button'} disabled={isBusy} onClick={() => onChangePlan(plan)} type="button">
        {isCurrent ? 'Actual' : 'Cambiar'}
      </button>
    </article>
  );
}

function PlansComparison({ currentPlanKey, isBusy, onChangePlan, plans }) {
  return (
    <section className="subscription-section" id="planes-disponibles">
      <header className="subscription-section-header">
        <div>
          <p className="eyebrow">Planes disponibles</p>
          <h2>Compara opciones</h2>
          <p>Elige el plan que mejor se ajuste al uso de tu empresa.</p>
        </div>
      </header>
      <div className="subscription-plans-grid">
        {plans.map((plan) => (
          <PlanCard currentPlanKey={currentPlanKey} isBusy={isBusy} key={plan.key} onChangePlan={onChangePlan} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function BillingHistory() {
  return (
    <section className="subscription-section" id="facturacion">
      <header className="subscription-section-header">
        <div>
          <p className="eyebrow">Facturacion</p>
          <h2>Historial de pagos</h2>
          <p>No hay pagos registrados todavia.</p>
        </div>
      </header>
      <div className="billing-empty-state">
        <FileText size={24} aria-hidden="true" />
        <span>Cuando existan pagos o facturas, apareceran aqui.</span>
      </div>
    </section>
  );
}

function SubscriptionAlerts({ currentPlan, usage }) {
  const alerts = [];
  const status = normalizeStatus(usage?.subscription_status ?? usage?.status);
  if (['expired', 'vencido', 'suspended', 'suspendido'].includes(status)) {
    alerts.push('Tu suscripcion requiere atencion antes de continuar operando.');
  }

  Object.entries(currentPlan?.limits ?? {}).forEach(([key, limit]) => {
    if (limit === null || limit === undefined) return;
    const current = Number(usage?.usage?.[key] ?? 0);
    if (current / Number(limit || 1) >= 0.85) {
      alerts.push(`${limitLabels[key] ?? key} esta cerca de su limite.`);
    }
  });

  if (!alerts.length) return null;

  return (
    <section className="subscription-alerts">
      {alerts.map((alert) => (
        <article key={alert}>
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{alert}</span>
        </article>
      ))}
    </section>
  );
}

export function PlansManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);

  const currentPlan = useMemo(() => plans.find((plan) => plan.key === usage?.plan), [plans, usage]);
  const selectedCompany = useMemo(() => companies.find((company) => String(company.id) === String(empresaId)), [companies, empresaId]);
  const status = usage?.subscription_status ?? usage?.status;

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextPlans, nextCompanies] = await Promise.all([
        fetchPlans(),
        isSuperAdmin ? fetchCompanies() : Promise.resolve([])
      ]);
      setPlans(nextPlans);
      setCompanies(nextCompanies);

      const nextCompanyId = isSuperAdmin ? empresaId || nextCompanies[0]?.id : undefined;
      if (isSuperAdmin && !empresaId && nextCompanyId) {
        setEmpresaId(String(nextCompanyId));
      }

      if (!isSuperAdmin || nextCompanyId) {
        setUsage(await fetchPlanUsage(nextCompanyId));
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudieron cargar los planes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin || !empresaId) return;
    fetchPlanUsage(empresaId)
      .then(setUsage)
      .catch((requestError) => setError(requestError?.response?.data?.message ?? 'No se pudo cargar el uso del plan.'));
  }, [empresaId, isSuperAdmin]);

  function handlePlanChange() {
    navigate('/empresas');
  }

  if (isLoading) {
    return <SubscriptionSkeleton />;
  }

  return (
    <section className="resource-page plans-page subscription-page" aria-label="Suscripciones">
      <SubscriptionHero
        currentPlan={currentPlan}
        isSuperAdmin={isSuperAdmin}
        onRefresh={loadData}
        selectedCompanyName={selectedCompany?.nombre}
        status={status}
        usage={usage}
      />

      {error ? <SubscriptionErrorState message={error} onRetry={loadData} /> : null}

      {isSuperAdmin ? (
        <section className="subscription-company-picker">
          <label htmlFor="plans-company">
            <span>Empresa</span>
            <select id="plans-company" onChange={(event) => setEmpresaId(event.target.value)} value={empresaId}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.nombre}</option>
              ))}
            </select>
          </label>
          <p>Cambia de empresa para revisar su plan y consumo actual.</p>
        </section>
      ) : null}

      {!usage ? <SubscriptionEmptyState canViewPlans={plans.length > 0} /> : null}

      {usage ? (
        <>
          <SubscriptionAlerts currentPlan={currentPlan} usage={usage} />
          <CurrentPlanCard currentPlan={currentPlan} selectedCompanyName={selectedCompany?.nombre} status={status} usage={usage} />
          <UsageLimitsSection currentPlan={currentPlan} usage={usage} />
        </>
      ) : null}

      {plans.length ? (
        <PlansComparison currentPlanKey={usage?.plan} isBusy={isLoading} onChangePlan={handlePlanChange} plans={plans} />
      ) : null}

      <BillingHistory />
    </section>
  );
}
