import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  MessageCircle,
  Rocket,
  Sparkles,
  UserRound
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { createCompanyOnboarding, fetchOnboardingStatus } from './onboardingApi.js';

const initialForm = {
  business: {
    nombre: '',
    telefono: '',
    direccion: '',
    tipo_negocio: '',
    plan: 'STARTER'
  },
  owner: {
    nombre: '',
    correo: '',
    password: ''
  },
  settings: {
    mensaje_bienvenida: '',
    nombre_bot: '',
    tono_respuesta: 'profesional',
    instrucciones_negocio: '',
    temas_bloqueados: '',
    faq_personalizada: '',
    auto_pedidos: true,
    envio_imagenes: true,
    fallback_message: ''
  },
  products: [
    { nombre: '', descripcion: '', precio: '', stock: '' }
  ],
  whatsapp: {
    connect_now: false
  }
};

const wizardSteps = [
  { id: 'business', label: 'Empresa', icon: Building2 },
  { id: 'contact', label: 'Contacto', icon: UserRound },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'ai', label: 'IA', icon: Bot },
  { id: 'summary', label: 'Resumen', icon: ClipboardCheck }
];

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar el onboarding.';
}

function readinessLabel(percent) {
  if (percent >= 85) return 'Listo para operar';
  if (percent >= 60) return 'Casi listo';
  if (percent >= 35) return 'En configuracion';
  return 'Inicio pendiente';
}

function validateStep(stepId, form) {
  const errors = {};

  if (stepId === 'business') {
    if (!form.business.nombre.trim()) errors.nombre = 'El nombre del negocio es requerido.';
    if (!form.business.tipo_negocio.trim()) errors.tipo_negocio = 'Indica el giro del negocio.';
  }

  if (stepId === 'contact') {
    if (!form.owner.nombre.trim()) errors.owner_nombre = 'El nombre del administrador es requerido.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner.correo)) errors.owner_correo = 'Ingresa un correo valido.';
    if (form.owner.password.length < 6) errors.owner_password = 'La contrasena debe tener al menos 6 caracteres.';
  }

  if (stepId === 'ai') {
    if (!form.settings.nombre_bot.trim()) errors.nombre_bot = 'El nombre de la IA es requerido.';
    if (!form.settings.mensaje_bienvenida.trim()) errors.mensaje_bienvenida = 'El mensaje de bienvenida es requerido.';
  }

  return errors;
}

function OnboardingSkeleton() {
  return (
    <div className="resource-page onboarding-page onboarding-wizard-page">
      <section className="onboarding-shell onboarding-skeleton" aria-label="Cargando inicio guiado">
        <span />
        <span />
        <span />
      </section>
    </div>
  );
}

function OnboardingError({ message, onRetry }) {
  return (
    <section className="onboarding-error" role="alert">
      <Sparkles size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar el inicio guiado.</h2>
        <p>{message || 'Intenta nuevamente en unos segundos.'}</p>
      </div>
      {onRetry ? <button className="secondary-button" onClick={onRetry} type="button">Reintentar</button> : null}
    </section>
  );
}

function StatusChecklist({ status }) {
  const progress = status?.progress ?? { percent: 0, completed_steps: 0, total_steps: 0 };
  const nextStep = status?.next_step;
  const summary = status?.summary ?? {};

  return (
    <div className="resource-page onboarding-page onboarding-wizard-page">
      <section className="onboarding-shell">
        <div className="onboarding-status-hero">
          <span className="onboarding-illustration"><Rocket size={42} aria-hidden="true" /></span>
          <p className="eyebrow">Inicio guiado</p>
          <h1>Tu configuracion inicial</h1>
          <p>{status?.empresa_nombre ?? 'Empresa'} - {readinessLabel(progress.percent)}</p>
          <div className="onboarding-status-progress" aria-label={`Progreso ${progress.percent}%`}>
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <strong>{progress.percent}% completado</strong>
        </div>

        <section className="onboarding-status-grid" aria-label="Resumen del negocio">
          <StatusCard label="Productos" value={summary.productos ?? 0} />
          <StatusCard label="Servicios" value={summary.servicios ?? 0} />
          <StatusCard label="WhatsApp" value={summary.whatsapp_status ?? 'Pendiente'} />
          <StatusCard label="IA" value={summary.ia_activa ? 'Activa' : 'Pausada'} />
        </section>

        <section className="onboarding-focus-card">
          <span><Sparkles size={22} aria-hidden="true" /></span>
          <div>
            <h2>{nextStep ? `Siguiente paso: ${nextStep.title}` : 'Tu bot esta listo para operar'}</h2>
            <p>{nextStep ? nextStep.description : 'Revisa WhatsApp y prueba una conversacion real antes de invitar clientes.'}</p>
          </div>
          <Link className="primary-button" to={nextStep?.to ?? '/whatsapp'}>
            {nextStep?.action ?? 'Revisar WhatsApp'}
          </Link>
        </section>
      </section>
    </div>
  );
}

function StatusCard({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Stepper({ currentStep, completed }) {
  return (
    <nav className="onboarding-stepper" aria-label="Progreso de configuracion">
      {wizardSteps.map((step, index) => {
        const Icon = step.icon;
        const active = index === currentStep;
        const done = completed[step.id];

        return (
          <span className={active ? 'active' : done ? 'done' : ''} key={step.id}>
            <i>{done ? <CheckCircle2 size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}</i>
            <small>{index + 1}</small>
            <strong>{step.label}</strong>
          </span>
        );
      })}
    </nav>
  );
}

function Field({ children, error, help, id, label }) {
  return (
    <label className="onboarding-field" htmlFor={id}>
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
      {error ? <em>{error}</em> : null}
    </label>
  );
}

function WelcomeStep({ onStart }) {
  return (
    <div className="resource-page onboarding-page onboarding-wizard-page">
      <section className="onboarding-welcome">
        <span className="onboarding-illustration"><Sparkles size={54} aria-hidden="true" /></span>
        <p className="eyebrow">Inicio guiado</p>
        <h1>Bienvenido a tu nueva plataforma</h1>
        <p>En pocos minutos configuraremos tu empresa para que puedas comenzar a vender y atender clientes.</p>
        <button className="primary-button" onClick={onStart} type="button">
          Comenzar configuracion
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

function BusinessStep({ errors, form, updateSection }) {
  return (
    <StepLayout
      eyebrow="Paso 1"
      title="Informacion del negocio"
      description="Cuéntanos lo esencial para identificar tu empresa dentro de la plataforma."
      helperTitle="Por que pedimos estos datos"
      helperText="El nombre, giro y plan ayudan a personalizar la experiencia, reportes y permisos iniciales."
    >
      <div className="onboarding-field-grid">
        <Field error={errors.nombre} help="Este nombre se mostrara en paneles, reportes y conversaciones." id="business-name" label="Nombre empresa">
          <input id="business-name" onChange={(event) => updateSection('business', 'nombre', event.target.value)} placeholder="Ej. Casa Norte" type="text" value={form.business.nombre} />
        </Field>
        <Field error={errors.tipo_negocio} help="Ayuda a la IA a entender el contexto comercial." id="business-type" label="Giro">
          <input id="business-type" onChange={(event) => updateSection('business', 'tipo_negocio', event.target.value)} placeholder="Restaurante, retail, servicios..." type="text" value={form.business.tipo_negocio} />
        </Field>
        <Field help="Define el alcance inicial de la empresa." id="business-plan" label="Plan">
          <select id="business-plan" onChange={(event) => updateSection('business', 'plan', event.target.value)} value={form.business.plan}>
            <option value="STARTER">STARTER</option>
            <option value="BUSINESS">BUSINESS</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
          </select>
        </Field>
        <Field help="La imagen se puede agregar despues desde configuracion." id="business-logo" label="Logo">
          <input disabled id="business-logo" placeholder="Disponible despues de crear la empresa" type="text" />
        </Field>
      </div>
    </StepLayout>
  );
}

function ContactStep({ errors, form, updateSection }) {
  return (
    <StepLayout
      eyebrow="Paso 2"
      title="Informacion comercial"
      description="Configura el primer administrador y los datos de contacto de la empresa."
      helperTitle="Para que sirve"
      helperText="El administrador podra entrar al sistema, continuar la configuracion y gestionar el equipo."
    >
      <div className="onboarding-field-grid">
        <Field error={errors.owner_nombre} help="Sera el primer responsable de la cuenta." id="owner-name" label="Administrador">
          <input id="owner-name" onChange={(event) => updateSection('owner', 'nombre', event.target.value)} placeholder="Nombre del administrador" type="text" value={form.owner.nombre} />
        </Field>
        <Field error={errors.owner_correo} help="Usaremos este correo para crear el acceso inicial." id="owner-email" label="Correo">
          <input id="owner-email" onChange={(event) => updateSection('owner', 'correo', event.target.value)} placeholder="owner@empresa.com" type="email" value={form.owner.correo} />
        </Field>
        <Field error={errors.owner_password} help="Debe tener al menos 6 caracteres." id="owner-password" label="Contrasena temporal">
          <input id="owner-password" onChange={(event) => updateSection('owner', 'password', event.target.value)} placeholder="Minimo 6 caracteres" type="password" value={form.owner.password} />
        </Field>
        <Field help="Telefono principal visible para operacion comercial." id="business-phone" label="Telefono">
          <input id="business-phone" onChange={(event) => updateSection('business', 'telefono', event.target.value)} placeholder="+52 55 0000 0000" type="tel" value={form.business.telefono} />
        </Field>
      </div>
    </StepLayout>
  );
}

function WhatsappStep({ form, updateSection }) {
  return (
    <StepLayout
      eyebrow="Paso 3"
      title="WhatsApp"
      description="Conecta tu cuenta de WhatsApp para comenzar a recibir y responder mensajes desde la plataforma."
      helperTitle="Como funciona"
      helperText="La empresa se puede crear aunque dejes WhatsApp pendiente. Si eliges conectar, iras a la pantalla de QR al finalizar."
    >
      <div className="onboarding-whatsapp-card">
        <span><MessageCircle size={44} aria-hidden="true" /></span>
        <div>
          <h3>{form.whatsapp.connect_now ? 'Conectar al finalizar' : 'Configurar despues'}</h3>
          <p>Abre WhatsApp en tu telefono, entra a dispositivos vinculados y escanea el QR desde el modulo de WhatsApp.</p>
          <ol>
            <li>Abre WhatsApp en tu telefono.</li>
            <li>Toca Menu o Ajustes y luego Dispositivos vinculados.</li>
            <li>Escanea el QR cuando termines este asistente.</li>
          </ol>
        </div>
        <button className={form.whatsapp.connect_now ? 'primary-button' : 'secondary-button'} onClick={() => updateSection('whatsapp', 'connect_now', !form.whatsapp.connect_now)} type="button">
          {form.whatsapp.connect_now ? 'Conectar WhatsApp' : 'Dejar pendiente'}
        </button>
      </div>
    </StepLayout>
  );
}

function AIStep({ errors, form, updateSection }) {
  return (
    <StepLayout
      eyebrow="Paso 4"
      title="Configuracion IA"
      description="La Inteligencia Artificial respondera automaticamente siguiendo las instrucciones de tu empresa."
      helperTitle="Como ayuda a la IA"
      helperText="Un nombre, tono, bienvenida e instrucciones claras hacen que las respuestas sean mas utiles y consistentes."
    >
      <div className="onboarding-field-grid">
        <Field error={errors.nombre_bot} help="Nombre visible del asistente en la operacion." id="ai-name" label="Nombre de la IA">
          <input id="ai-name" onChange={(event) => updateSection('settings', 'nombre_bot', event.target.value)} placeholder="Ej. Asistente Casa Norte" type="text" value={form.settings.nombre_bot} />
        </Field>
        <Field help="Define como debe sonar la IA." id="tone" label="Tono">
          <select id="tone" onChange={(event) => updateSection('settings', 'tono_respuesta', event.target.value)} value={form.settings.tono_respuesta}>
            <option value="profesional">profesional</option>
            <option value="cercano">cercano</option>
            <option value="formal">formal</option>
            <option value="dinamico">dinamico</option>
          </select>
        </Field>
        <Field error={errors.mensaje_bienvenida} help="Primer mensaje que recibiran tus clientes." id="welcome-message" label="Mensaje de bienvenida">
          <textarea id="welcome-message" onChange={(event) => updateSection('settings', 'mensaje_bienvenida', event.target.value)} placeholder="Hola, puedo ayudarte con productos, precios y pedidos." rows={4} value={form.settings.mensaje_bienvenida} />
        </Field>
        <Field help="Horarios, politicas y reglas simples del negocio." id="business-instructions" label="Instrucciones">
          <textarea id="business-instructions" onChange={(event) => updateSection('settings', 'instrucciones_negocio', event.target.value)} placeholder="Describe horarios, politicas, productos destacados y reglas." rows={4} value={form.settings.instrucciones_negocio} />
        </Field>
      </div>
    </StepLayout>
  );
}

function SummaryStep({ form, result }) {
  const summary = [
    { title: 'Empresa', rows: [['Nombre', form.business.nombre || '-'], ['Giro', form.business.tipo_negocio || '-'], ['Plan', form.business.plan]] },
    { title: 'Contacto', rows: [['Administrador', form.owner.nombre || '-'], ['Correo', form.owner.correo || '-'], ['Telefono', form.business.telefono || '-']] },
    { title: 'WhatsApp', rows: [['Estado', form.whatsapp.connect_now ? 'Conectar al finalizar' : 'Pendiente'], ['Siguiente paso', form.whatsapp.connect_now ? 'Escanear QR' : 'Configurar despues']] },
    { title: 'IA', rows: [['Asistente', form.settings.nombre_bot || '-'], ['Tono', form.settings.tono_respuesta], ['Bienvenida', form.settings.mensaje_bienvenida ? 'Configurada' : 'Pendiente']] }
  ];

  return (
    <StepLayout
      eyebrow="Paso 5"
      title="Resumen"
      description="Revisa que todo este correcto antes de finalizar la configuracion."
      helperTitle="Ultima revision"
      helperText="Al finalizar se creara la empresa, el owner y la configuracion inicial con los mismos endpoints existentes."
    >
      <div className="onboarding-review-grid">
        {summary.map((card) => (
          <article key={card.title}>
            <h3>{card.title}</h3>
            <dl>
              {card.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      {result ? (
        <section className="onboarding-success">
          <CheckCircle2 size={24} aria-hidden="true" />
          <div>
            <h3>{result.company.nombre} esta creada</h3>
            <p>tenant_id {result.company.id} - owner {result.owner.correo}</p>
          </div>
          <Link className="primary-button" to={result.whatsapp.connect_now ? '/whatsapp' : '/super-admin'}>
            {result.whatsapp.connect_now ? 'Ir a WhatsApp' : 'Ver empresas'}
          </Link>
        </section>
      ) : null}
    </StepLayout>
  );
}

function StepLayout({ children, description, eyebrow, helperText, helperTitle, title }) {
  return (
    <section className="onboarding-step-screen">
      <div className="onboarding-step-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <aside className="onboarding-helper-card">
        <strong>{helperTitle}</strong>
        <p>{helperText}</p>
      </aside>
      <div className="onboarding-step-content">
        {children}
      </div>
    </section>
  );
}

function OnboardingWizard() {
  const [hasStarted, setHasStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const step = wizardSteps[currentStep];
  const isLastStep = currentStep === wizardSteps.length - 1;
  const progressPercent = Math.round(((currentStep + 1) / wizardSteps.length) * 100);

  const completed = useMemo(() => ({
    business: Boolean(form.business.nombre && form.business.tipo_negocio),
    contact: Boolean(form.owner.nombre && form.owner.correo && form.owner.password),
    whatsapp: true,
    ai: Boolean(form.settings.nombre_bot && form.settings.mensaje_bienvenida),
    summary: Boolean(result)
  }), [form, result]);

  function updateSection(section, field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [section]: {
        ...currentForm[section],
        [field]: value
      }
    }));
    setErrors((currentErrors) => ({ ...currentErrors, [field]: '' }));
  }

  function goNext() {
    const nextErrors = validateStep(step.id, form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setCurrentStep((value) => Math.min(value + 1, wizardSteps.length - 1));
  }

  function goBack() {
    setCurrentStep((value) => Math.max(value - 1, 0));
  }

  async function handleSubmit() {
    const validationErrors = ['business', 'contact', 'ai']
      .reduce((accumulator, stepId) => ({ ...accumulator, ...validateStep(stepId, form) }), {});

    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setSubmitError('Revisa los pasos marcados antes de crear la empresa.');
      return;
    }

    try {
      setIsSaving(true);
      setSubmitError('');
      const created = await createCompanyOnboarding({
        ...form,
        products: form.products
          .filter((product) => product.nombre.trim())
          .map((product) => ({
            ...product,
            precio: Number(product.precio),
            stock: Number(product.stock)
          }))
      });
      setResult(created);
    } catch (requestError) {
      setSubmitError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (!hasStarted) {
    return <WelcomeStep onStart={() => setHasStarted(true)} />;
  }

  return (
    <div className="resource-page onboarding-page onboarding-wizard-page">
      <section className="onboarding-shell">
        <header className="onboarding-wizard-header">
          <div>
            <p className="eyebrow">Inicio guiado</p>
            <h1>Configura tu empresa paso a paso</h1>
            <p>Un objetivo por pantalla. Sin ruido, sin configuraciones tecnicas innecesarias.</p>
          </div>
          <div className="onboarding-progress-badge" style={{ '--onboarding-progress-fill': `${progressPercent}%` }}>
            <strong>{progressPercent}%</strong>
            <span>Paso {currentStep + 1} de {wizardSteps.length}</span>
          </div>
        </header>

        <Stepper completed={completed} currentStep={currentStep} />

        {submitError ? <OnboardingError message={submitError} /> : null}

        <div className="onboarding-slide" key={step.id}>
          {step.id === 'business' ? <BusinessStep errors={errors} form={form} updateSection={updateSection} /> : null}
          {step.id === 'contact' ? <ContactStep errors={errors} form={form} updateSection={updateSection} /> : null}
          {step.id === 'whatsapp' ? <WhatsappStep form={form} updateSection={updateSection} /> : null}
          {step.id === 'ai' ? <AIStep errors={errors} form={form} updateSection={updateSection} /> : null}
          {step.id === 'summary' ? <SummaryStep form={form} result={result} /> : null}
        </div>

        <footer className="onboarding-navigation">
          <button className="secondary-button" disabled={currentStep === 0 || isSaving} onClick={goBack} type="button">
            <ChevronLeft size={18} aria-hidden="true" />
            Atras
          </button>
          {isLastStep ? (
            <button className="primary-button" disabled={isSaving || Boolean(result)} onClick={handleSubmit} type="button">
              <Rocket size={18} aria-hidden="true" />
              {isSaving ? 'Finalizando...' : result ? 'Finalizado' : 'Finalizar configuracion'}
            </button>
          ) : (
            <button className="primary-button" disabled={isSaving} onClick={goNext} type="button">
              Siguiente
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

export function OnboardingManager() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(!isSuperAdminRole(user?.rol));

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
    if (!isSuperAdminRole(user?.rol)) {
      loadStatus();
    }
  }, [user?.rol]);

  if (isSuperAdminRole(user?.rol)) {
    return <OnboardingWizard />;
  }

  if (isLoading) {
    return <OnboardingSkeleton />;
  }

  if (error) {
    return (
      <div className="resource-page onboarding-page onboarding-wizard-page">
        <OnboardingError message={error} onRetry={loadStatus} />
      </div>
    );
  }

  return <StatusChecklist status={status} />;
}
