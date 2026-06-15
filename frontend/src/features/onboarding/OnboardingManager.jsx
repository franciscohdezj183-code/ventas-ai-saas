import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Circle, ClipboardCheck, MessageCircle, PackageCheck, Rocket, Settings, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/ui/index.js';
import { fetchOnboardingStatus } from './onboardingApi.js';

const stepIcons = {
  business: Settings,
  assistant: Bot,
  contact: ClipboardCheck,
  catalog: PackageCheck,
  whatsapp: MessageCircle,
  ai: Sparkles,
  template: Bot
};

function readinessLabel(percent) {
  if (percent >= 85) return 'Listo para operar';
  if (percent >= 60) return 'Casi listo';
  if (percent >= 35) return 'En configuracion';
  return 'Inicio pendiente';
}

function StepCard({ step }) {
  const Icon = stepIcons[step.id] ?? Circle;

  return (
    <article className={step.completed ? 'onboarding-step done' : 'onboarding-step'}>
      <span className="onboarding-step-icon">
        {step.completed ? <CheckCircle2 size={20} aria-hidden="true" /> : <Icon size={20} aria-hidden="true" />}
      </span>
      <div>
        <strong>{step.title}</strong>
        <p>{step.description}</p>
        <small>{step.detail}</small>
      </div>
      <Link className={step.completed ? 'secondary-button' : 'primary-button'} to={step.to}>
        {step.completed ? 'Revisar' : step.action}
      </Link>
    </article>
  );
}

export function OnboardingManager() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function loadStatus() {
    try {
      setIsLoading(true);
      setError('');
      setStatus(await fetchOnboardingStatus());
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudo cargar el inicio guiado.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  if (isLoading) {
    return <LoadingState message="Revisando configuracion del negocio..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadStatus} />;
  }

  const progress = status?.progress ?? { percent: 0, completed_steps: 0, total_steps: 0 };
  const nextStep = status?.next_step;

  return (
    <div className="resource-page onboarding-page">
      <section className="onboarding-hero">
        <div>
          <p className="eyebrow">Inicio guiado</p>
          <h1>Configura tu bot paso a paso</h1>
          <p>{status?.empresa_nombre ?? 'Empresa'} · {readinessLabel(progress.percent)}</p>
        </div>
        <div className="onboarding-progress-ring" style={{ '--progress': `${progress.percent}%` }}>
          <strong>{progress.percent}%</strong>
          <span>{progress.completed_steps}/{progress.total_steps}</span>
        </div>
      </section>

      <section className="onboarding-summary-grid">
        <article>
          <PackageCheck size={20} aria-hidden="true" />
          <strong>{status.summary.productos}</strong>
          <span>Productos</span>
        </article>
        <article>
          <ClipboardCheck size={20} aria-hidden="true" />
          <strong>{status.summary.servicios}</strong>
          <span>Servicios</span>
        </article>
        <article>
          <MessageCircle size={20} aria-hidden="true" />
          <strong>{status.summary.whatsapp_status}</strong>
          <span>WhatsApp</span>
        </article>
        <article>
          <Sparkles size={20} aria-hidden="true" />
          <strong>{status.summary.ia_activa ? 'Activa' : 'Pausada'}</strong>
          <span>IA</span>
        </article>
      </section>

      {nextStep ? (
        <section className="onboarding-next-step">
          <span>
            <Rocket size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Siguiente paso: {nextStep.title}</h2>
            <p>{nextStep.description}</p>
          </div>
          <Link className="primary-button" to={nextStep.to}>
            {nextStep.action}
          </Link>
        </section>
      ) : (
        <section className="onboarding-next-step ready">
          <span>
            <CheckCircle2 size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>Tu bot esta listo para operar</h2>
            <p>Revisa WhatsApp y prueba una conversacion real antes de invitar clientes.</p>
          </div>
          <Link className="primary-button" to="/whatsapp">
            Revisar WhatsApp
          </Link>
        </section>
      )}

      <section className="onboarding-steps">
        {status.steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </section>
    </div>
  );
}
