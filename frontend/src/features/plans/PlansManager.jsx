import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCircle2, CreditCard, Crown, MessageCircle, Package, Sparkles, Users, Zap } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/index.js';
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
  aiMessagesMonthly: 'Mensajes IA / mes',
  products: 'Productos',
  users: 'Usuarios',
  whatsapp: 'WhatsApp conectados'
};

const planTone = {
  business: 'recommended',
  enterprise: 'enterprise',
  starter: 'starter'
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

function getStatusBadges(plan, usage) {
  const badges = [];
  const isCurrent = usage?.plan === plan.key;
  const status = normalizeStatus(usage?.subscription_status ?? usage?.status);

  if (isCurrent) {
    badges.push({ label: 'Actual', tone: 'actual' });
  }

  if (plan.key === 'business') {
    badges.push({ label: 'Recomendado', tone: 'recommended' });
  }

  if (status === 'trial') {
    badges.push({ label: 'Trial', tone: 'trial' });
  }

  if (status === 'expired' || status === 'vencido') {
    badges.push({ label: 'Vencido', tone: 'expired' });
  }

  if (status === 'suspended' || status === 'suspendido') {
    badges.push({ label: 'Suspendido', tone: 'suspended' });
  }

  return badges;
}

function PlanUsageMeter({ limit, usage }) {
  if (limit === null || limit === undefined) {
    return (
      <div className="plan-usage-meter unlimited">
        <span>Ilimitado</span>
        <div><i /></div>
      </div>
    );
  }

  const current = Number(usage ?? 0);
  const max = Number(limit || 1);
  const percent = Math.min((current / max) * 100, 100);

  return (
    <div className="plan-usage-meter">
      <span>{current.toLocaleString('es-MX')} / {max.toLocaleString('es-MX')}</span>
      <div><i style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function PlanCard({ isBusy, onChangePlan, plan, usage }) {
  const isCurrent = usage?.plan === plan.key;
  const badges = getStatusBadges(plan, usage);
  const limits = plan.limits ?? {};
  const features = plan.features ?? [];
  const Icon = plan.key === 'enterprise' ? Crown : plan.key === 'business' ? Zap : Sparkles;

  return (
    <article className={`plan-card ${planTone[plan.key] ?? 'starter'} ${isCurrent ? 'current' : ''}`}>
      <header>
        <div>
          <span className="plan-card-icon"><Icon size={22} aria-hidden="true" /></span>
          <div>
            <h2>{plan.label}</h2>
            <p>{plan.key === 'starter' ? 'Para comenzar con control.' : plan.key === 'business' ? 'Para equipos comerciales en crecimiento.' : 'Para operacion avanzada.'}</p>
          </div>
        </div>
        <div className="plan-badge-row">
          {badges.map((badge) => (
            <span className={`plan-status-badge ${badge.tone}`} key={`${plan.key}-${badge.label}`}>{badge.label}</span>
          ))}
        </div>
      </header>

      <div className="plan-price">
        <strong>{formatCurrency(plan.estimatedMonthlyPrice)}</strong>
        <span>/ mes estimado</span>
      </div>

      <div className="plan-limits">
        {Object.entries(limits).map(([key, limit]) => (
          <div className="plan-limit-row" key={key}>
            <span>{limitLabels[key] ?? key}</span>
            <strong>{formatLimit(limit)}</strong>
            {isCurrent ? <PlanUsageMeter limit={limit} usage={usage?.usage?.[key]} /> : null}
          </div>
        ))}
      </div>

      <div className="plan-benefits">
        <span>Beneficios</span>
        <ul>
          {features.map((feature) => (
            <li key={feature}>
              <CheckCircle2 size={16} aria-hidden="true" />
              {featureLabels[feature] ?? feature}
            </li>
          ))}
        </ul>
      </div>

      <button className={isCurrent ? 'secondary-button' : 'primary-button'} disabled={isBusy} onClick={() => onChangePlan(plan)} type="button">
        {isCurrent ? 'Plan actual' : 'Cambiar plan'}
      </button>
    </article>
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

  const selectedCompanyId = isSuperAdmin ? empresaId : undefined;
  const currentPlan = useMemo(() => plans.find((plan) => plan.key === usage?.plan), [plans, usage]);

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
    if (!isSuperAdmin || !empresaId) {
      return;
    }

    fetchPlanUsage(empresaId)
      .then(setUsage)
      .catch((requestError) => setError(requestError?.response?.data?.message ?? 'No se pudo cargar el uso del plan.'));
  }, [empresaId, isSuperAdmin]);

  function handlePlanChange() {
    navigate('/empresas');
  }

  return (
    <section className="resource-page plans-page" aria-label="Planes y suscripcion">
      <div className="plans-hero">
        <div>
          <span className="plans-hero-icon"><CreditCard size={22} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">Suscripcion</p>
            <h1>Planes</h1>
            <p>Compara limites, beneficios y uso actual antes de cambiar el plan de una empresa.</p>
          </div>
        </div>
        <div className="plans-current-pill">
          <span>Plan actual</span>
          <strong>{currentPlan?.label ?? usage?.plan_label ?? 'Sin seleccionar'}</strong>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <div className="plans-toolbar">
        {isSuperAdmin ? (
          <label className="field-group" htmlFor="plans-company">
            <span>Empresa</span>
            <select id="plans-company" onChange={(event) => setEmpresaId(event.target.value)} value={empresaId}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.nombre}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="plans-trust-note">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>Cambiar de plan usa el flujo administrativo existente. No se ejecutan cobros desde esta pantalla.</span>
        </div>
      </div>

      {isLoading ? <LoadingState message="Cargando planes..." /> : null}

      {!isLoading && !plans.length ? (
        <EmptyState title="Sin planes disponibles" description="Cuando existan planes configurados, apareceran aqui." />
      ) : null}

      <div className="plans-grid">
        {plans.map((plan) => (
          <PlanCard
            isBusy={isLoading}
            key={plan.key}
            onChangePlan={handlePlanChange}
            plan={plan}
            usage={usage}
          />
        ))}
      </div>

      {usage ? (
        <section className="plans-usage-panel">
          <header>
            <span><Bot size={20} aria-hidden="true" /></span>
            <div>
              <h2>Uso incluido</h2>
              <p>{usage.empresa_nombre} usa el plan {usage.plan_label}.</p>
            </div>
          </header>
          <div className="plans-usage-grid">
            <article><Users size={18} aria-hidden="true" /><span>Usuarios</span><strong>{usage.usage?.users ?? 0}</strong></article>
            <article><Package size={18} aria-hidden="true" /><span>Productos</span><strong>{usage.usage?.products ?? 0}</strong></article>
            <article><MessageCircle size={18} aria-hidden="true" /><span>WhatsApp</span><strong>{usage.usage?.whatsapp ?? 0}</strong></article>
            <article><Bot size={18} aria-hidden="true" /><span>Mensajes IA</span><strong>{Number(usage.usage?.aiMessagesMonthly ?? 0).toLocaleString('es-MX')}</strong></article>
          </div>
        </section>
      ) : null}
    </section>
  );
}
