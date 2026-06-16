import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  MessageCircle,
  PackageCheck,
  Plus,
  Rocket,
  Settings,
  Sparkles,
  Trash2,
  UserRound
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/ui/index.js';
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
  { id: 'business', title: 'Datos del negocio', icon: Settings },
  { id: 'owner', title: 'Primer owner', icon: UserRound },
  { id: 'plan', title: 'Plan', icon: Rocket },
  { id: 'welcome', title: 'Bienvenida', icon: ClipboardCheck },
  { id: 'ai', title: 'Nombre de IA', icon: Bot },
  { id: 'products', title: 'Primeros productos', icon: PackageCheck },
  { id: 'whatsapp', title: 'WhatsApp', icon: MessageCircle },
  { id: 'checklist', title: 'Checklist', icon: CheckCircle2 }
];

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

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar el onboarding.';
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

function StatusChecklist({ status }) {
  const progress = status?.progress ?? { percent: 0, completed_steps: 0, total_steps: 0 };
  const nextStep = status?.next_step;

  return (
    <>
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
    </>
  );
}

function Field({ children, error, full = false, id, label }) {
  return (
    <label className={full ? 'field-group full-field' : 'field-group'} htmlFor={id}>
      <span>{label}</span>
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function validateStep(stepId, form) {
  const errors = {};

  if (stepId === 'business') {
    if (!form.business.nombre.trim()) errors.nombre = 'El nombre del negocio es requerido.';
    if (!form.business.tipo_negocio.trim()) errors.tipo_negocio = 'Indica el giro del negocio.';
  }

  if (stepId === 'owner') {
    if (!form.owner.nombre.trim()) errors.owner_nombre = 'El nombre del owner es requerido.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner.correo)) errors.owner_correo = 'Ingresa un correo valido.';
    if (form.owner.password.length < 6) errors.owner_password = 'La contrasena debe tener al menos 6 caracteres.';
  }

  if (stepId === 'welcome' && !form.settings.mensaje_bienvenida.trim()) {
    errors.mensaje_bienvenida = 'El mensaje de bienvenida es requerido.';
  }

  if (stepId === 'ai' && !form.settings.nombre_bot.trim()) {
    errors.nombre_bot = 'El nombre de la IA es requerido.';
  }

  if (stepId === 'products') {
    form.products.forEach((product, index) => {
      if (!product.nombre.trim() && (product.descripcion || product.precio || product.stock)) {
        errors[`product_${index}_nombre`] = 'Agrega el nombre o deja la fila vacia.';
      }

      if (product.nombre.trim() && (Number(product.precio) < 0 || product.precio === '')) {
        errors[`product_${index}_precio`] = 'Precio requerido mayor o igual a 0.';
      }

      if (product.nombre.trim() && (!Number.isInteger(Number(product.stock)) || product.stock === '' || Number(product.stock) < 0)) {
        errors[`product_${index}_stock`] = 'Stock entero mayor o igual a 0.';
      }
    });
  }

  return errors;
}

function ChecklistPreview({ form, result }) {
  const productsCount = form.products.filter((product) => product.nombre.trim()).length;
  const checklist = [
    { label: 'Datos del negocio', done: Boolean(form.business.nombre && form.business.tipo_negocio) },
    { label: 'Primer usuario owner', done: Boolean(form.owner.nombre && form.owner.correo && form.owner.password) },
    { label: `Plan ${form.business.plan}`, done: true },
    { label: 'Mensaje de bienvenida', done: Boolean(form.settings.mensaje_bienvenida) },
    { label: 'Nombre de IA', done: Boolean(form.settings.nombre_bot) },
    { label: `${productsCount} productos iniciales`, done: productsCount > 0 },
    { label: form.whatsapp.connect_now ? 'WhatsApp para conectar' : 'WhatsApp pendiente', done: !form.whatsapp.connect_now },
    { label: result ? `tenant_id ${result.company.id} guardado` : 'tenant_id se asignara al crear la empresa', done: Boolean(result) }
  ];

  return (
    <section className="onboarding-steps">
      {checklist.map((item) => (
        <article className={item.done ? 'onboarding-step done' : 'onboarding-step'} key={item.label}>
          <span className="onboarding-step-icon">
            {item.done ? <CheckCircle2 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
          </span>
          <div>
            <strong>{item.label}</strong>
            <p>{item.done ? 'Listo' : 'Pendiente'}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const step = wizardSteps[currentStep];
  const isLastStep = currentStep === wizardSteps.length - 1;

  const completedPreview = useMemo(() => ({
    business: Boolean(form.business.nombre && form.business.tipo_negocio),
    owner: Boolean(form.owner.nombre && form.owner.correo && form.owner.password),
    plan: Boolean(form.business.plan),
    welcome: Boolean(form.settings.mensaje_bienvenida),
    ai: Boolean(form.settings.nombre_bot),
    products: form.products.some((product) => product.nombre.trim()),
    whatsapp: true,
    checklist: Boolean(result)
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

  function updateProduct(index, field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      products: currentForm.products.map((product, productIndex) => (
        productIndex === index ? { ...product, [field]: value } : product
      ))
    }));
    setErrors((currentErrors) => ({ ...currentErrors, [`product_${index}_${field}`]: '' }));
  }

  function addProduct() {
    setForm((currentForm) => ({
      ...currentForm,
      products: [...currentForm.products, { nombre: '', descripcion: '', precio: '', stock: '' }]
    }));
  }

  function removeProduct(index) {
    setForm((currentForm) => ({
      ...currentForm,
      products: currentForm.products.filter((_, productIndex) => productIndex !== index)
    }));
  }

  function goNext() {
    const nextErrors = validateStep(step.id, form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setCurrentStep((value) => Math.min(value + 1, wizardSteps.length - 1));
  }

  function goBack() {
    setCurrentStep((value) => Math.max(value - 1, 0));
  }

  async function handleSubmit() {
    const validationErrors = wizardSteps
      .filter((wizardStep) => wizardStep.id !== 'checklist' && wizardStep.id !== 'whatsapp' && wizardStep.id !== 'plan')
      .reduce((accumulator, wizardStep) => ({ ...accumulator, ...validateStep(wizardStep.id, form) }), {});

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

  return (
    <div className="resource-page onboarding-page">
      <section className="onboarding-hero">
        <div>
          <p className="eyebrow">Nueva empresa</p>
          <h1>Onboarding de tenant SaaS</h1>
          <p>Crea empresa, owner, plan, IA, productos y estado de WhatsApp con tenant_id consistente.</p>
        </div>
        <div className="onboarding-progress-ring" style={{ '--progress': `${Math.round(((currentStep + 1) / wizardSteps.length) * 100)}%` }}>
          <strong>{currentStep + 1}</strong>
          <span>de {wizardSteps.length}</span>
        </div>
      </section>

      <section className="onboarding-summary-grid">
        {wizardSteps.map((wizardStep, index) => {
          const Icon = wizardStep.icon;
          const isActive = index === currentStep;
          const isDone = completedPreview[wizardStep.id];

          return (
            <button
              className={isActive ? 'onboarding-step done' : 'onboarding-step'}
              key={wizardStep.id}
              onClick={() => setCurrentStep(index)}
              type="button"
            >
              <span className="onboarding-step-icon">
                {isDone ? <CheckCircle2 size={18} aria-hidden="true" /> : <Icon size={18} aria-hidden="true" />}
              </span>
              <strong>{wizardStep.title}</strong>
            </button>
          );
        })}
      </section>

      {submitError ? <ErrorState message={submitError} /> : null}

      <section className="panel-section">
        <div className="section-header">
          <div>
            <h2>{step.title}</h2>
            <p>{result ? `Empresa creada con tenant_id ${result.company.id}.` : 'Completa este paso para continuar.'}</p>
          </div>
        </div>

        {step.id === 'business' ? (
          <div className="company-form">
            <div className="form-grid">
              <Field error={errors.nombre} id="business-name" label="Nombre del negocio">
                <input id="business-name" onChange={(event) => updateSection('business', 'nombre', event.target.value)} type="text" value={form.business.nombre} />
              </Field>
              <Field error={errors.tipo_negocio} id="business-type" label="Giro">
                <input id="business-type" onChange={(event) => updateSection('business', 'tipo_negocio', event.target.value)} placeholder="Restaurante, retail, servicios..." type="text" value={form.business.tipo_negocio} />
              </Field>
              <Field id="business-phone" label="Telefono">
                <input id="business-phone" onChange={(event) => updateSection('business', 'telefono', event.target.value)} type="tel" value={form.business.telefono} />
              </Field>
              <Field id="business-address" label="Direccion">
                <input id="business-address" onChange={(event) => updateSection('business', 'direccion', event.target.value)} type="text" value={form.business.direccion} />
              </Field>
            </div>
          </div>
        ) : null}

        {step.id === 'owner' ? (
          <div className="company-form">
            <div className="form-grid">
              <Field error={errors.owner_nombre} id="owner-name" label="Nombre owner">
                <input id="owner-name" onChange={(event) => updateSection('owner', 'nombre', event.target.value)} type="text" value={form.owner.nombre} />
              </Field>
              <Field error={errors.owner_correo} id="owner-email" label="Correo owner">
                <input id="owner-email" onChange={(event) => updateSection('owner', 'correo', event.target.value)} type="email" value={form.owner.correo} />
              </Field>
              <Field error={errors.owner_password} id="owner-password" label="Contrasena temporal">
                <input id="owner-password" onChange={(event) => updateSection('owner', 'password', event.target.value)} type="password" value={form.owner.password} />
              </Field>
            </div>
          </div>
        ) : null}

        {step.id === 'plan' ? (
          <div className="company-form">
            <div className="plan-choice-grid">
              {['STARTER', 'BUSINESS', 'ENTERPRISE'].map((plan) => (
                <button
                  className={form.business.plan === plan ? 'onboarding-step done' : 'onboarding-step'}
                  key={plan}
                  onClick={() => updateSection('business', 'plan', plan)}
                  type="button"
                >
                  <span className="onboarding-step-icon">
                    <Rocket size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{plan}</strong>
                    <p>{plan === 'STARTER' ? 'Inicio controlado' : plan === 'BUSINESS' ? 'Operacion comercial' : 'Escala avanzada'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step.id === 'welcome' ? (
          <div className="company-form">
            <div className="form-grid">
              <Field error={errors.mensaje_bienvenida} full id="welcome-message" label="Mensaje de bienvenida">
                <textarea id="welcome-message" onChange={(event) => updateSection('settings', 'mensaje_bienvenida', event.target.value)} rows={4} value={form.settings.mensaje_bienvenida} />
              </Field>
              <Field id="fallback-message" label="Fallback">
                <input id="fallback-message" onChange={(event) => updateSection('settings', 'fallback_message', event.target.value)} type="text" value={form.settings.fallback_message} />
              </Field>
              <Field id="tone" label="Tono de respuesta">
                <select id="tone" onChange={(event) => updateSection('settings', 'tono_respuesta', event.target.value)} value={form.settings.tono_respuesta}>
                  <option value="profesional">profesional</option>
                  <option value="cercano">cercano</option>
                  <option value="formal">formal</option>
                  <option value="dinamico">dinamico</option>
                </select>
              </Field>
            </div>
          </div>
        ) : null}

        {step.id === 'ai' ? (
          <div className="company-form">
            <div className="form-grid">
              <Field error={errors.nombre_bot} id="ai-name" label="Nombre de la IA">
                <input id="ai-name" onChange={(event) => updateSection('settings', 'nombre_bot', event.target.value)} type="text" value={form.settings.nombre_bot} />
              </Field>
              <Field full id="business-instructions" label="Instrucciones del negocio">
                <textarea id="business-instructions" onChange={(event) => updateSection('settings', 'instrucciones_negocio', event.target.value)} rows={4} value={form.settings.instrucciones_negocio} />
              </Field>
              <Field id="blocked-topics" label="Temas bloqueados">
                <input id="blocked-topics" onChange={(event) => updateSection('settings', 'temas_bloqueados', event.target.value)} type="text" value={form.settings.temas_bloqueados} />
              </Field>
              <Field id="faq" label="FAQ personalizada">
                <input id="faq" onChange={(event) => updateSection('settings', 'faq_personalizada', event.target.value)} type="text" value={form.settings.faq_personalizada} />
              </Field>
            </div>
          </div>
        ) : null}

        {step.id === 'products' ? (
          <div className="company-form">
            <div className="onboarding-steps">
              {form.products.map((product, index) => (
                <article className="onboarding-step" key={`product-${index}`}>
                  <div className="form-grid full-field">
                    <Field error={errors[`product_${index}_nombre`]} id={`product-${index}-name`} label="Producto">
                      <input id={`product-${index}-name`} onChange={(event) => updateProduct(index, 'nombre', event.target.value)} type="text" value={product.nombre} />
                    </Field>
                    <Field id={`product-${index}-description`} label="Descripcion">
                      <input id={`product-${index}-description`} onChange={(event) => updateProduct(index, 'descripcion', event.target.value)} type="text" value={product.descripcion} />
                    </Field>
                    <Field error={errors[`product_${index}_precio`]} id={`product-${index}-price`} label="Precio">
                      <input id={`product-${index}-price`} min="0" onChange={(event) => updateProduct(index, 'precio', event.target.value)} step="0.01" type="number" value={product.precio} />
                    </Field>
                    <Field error={errors[`product_${index}_stock`]} id={`product-${index}-stock`} label="Stock">
                      <input id={`product-${index}-stock`} min="0" onChange={(event) => updateProduct(index, 'stock', event.target.value)} type="number" value={product.stock} />
                    </Field>
                  </div>
                  {form.products.length > 1 ? (
                    <button className="icon-button" onClick={() => removeProduct(index)} type="button" aria-label="Eliminar producto">
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
            <button className="secondary-button" onClick={addProduct} type="button">
              <Plus size={18} aria-hidden="true" />
              Agregar producto
            </button>
          </div>
        ) : null}

        {step.id === 'whatsapp' ? (
          <div className="company-form">
            <div className="onboarding-next-step">
              <span>
                <MessageCircle size={22} aria-hidden="true" />
              </span>
              <div>
                <h2>{form.whatsapp.connect_now ? 'Conectar al terminar' : 'Dejar pendiente'}</h2>
                <p>El tenant se crea igual. Si eliges conectar, al finalizar se mostrara el acceso a WhatsApp.</p>
              </div>
              <button
                className={form.whatsapp.connect_now ? 'primary-button' : 'secondary-button'}
                onClick={() => updateSection('whatsapp', 'connect_now', !form.whatsapp.connect_now)}
                type="button"
              >
                {form.whatsapp.connect_now ? 'Conectar WhatsApp' : 'Pendiente'}
              </button>
            </div>
          </div>
        ) : null}

        {step.id === 'checklist' ? (
          <>
            <ChecklistPreview form={form} result={result} />
            {result ? (
              <section className="onboarding-next-step ready">
                <span>
                  <CheckCircle2 size={22} aria-hidden="true" />
                </span>
                <div>
                  <h2>{result.company.nombre} esta creada</h2>
                  <p>tenant_id {result.company.id} · owner {result.owner.correo}</p>
                </div>
                <Link className="primary-button" to={result.whatsapp.connect_now ? '/whatsapp' : '/super-admin'}>
                  {result.whatsapp.connect_now ? 'Ir a WhatsApp' : 'Ver empresas'}
                </Link>
              </section>
            ) : null}
          </>
        ) : null}
      </section>

      <div className="form-actions">
        <button className="secondary-button" disabled={currentStep === 0 || isSaving} onClick={goBack} type="button">
          <ChevronLeft size={18} aria-hidden="true" />
          Atras
        </button>
        {isLastStep ? (
          <button className="primary-button" disabled={isSaving || Boolean(result)} onClick={handleSubmit} type="button">
            <Rocket size={18} aria-hidden="true" />
            {isSaving ? 'Creando...' : result ? 'Empresa creada' : 'Crear empresa'}
          </button>
        ) : (
          <button className="primary-button" disabled={isSaving} onClick={goNext} type="button">
            Siguiente
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
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
    return <LoadingState message="Revisando configuracion del negocio..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadStatus} />;
  }

  return (
    <div className="resource-page onboarding-page">
      <StatusChecklist status={status} />
    </div>
  );
}
