import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  Globe2,
  ListChecks,
  MessageCircle,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Workflow,
  X
} from 'lucide-react';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  deleteBotPromptTemplate,
  fetchBotPromptCatalog,
  previewBotPrompt,
  saveBotPromptTemplate,
  saveBotResponseSettings
} from './botPromptsApi.js';

const emptyTemplate = {
  nombre: '',
  tipo_negocio: 'General',
  intencion: '',
  prompt_sistema: '',
  formato_respuesta: '{emoji_principal} Claro, encontre estas opciones para ti:\n\n{items}\n\nResponde con el numero de la opcion que quieres ver, por ejemplo: 1.',
  ejemplos_json: null,
  emojis_activos: true,
  tono: 'PROFESIONAL',
  activo: true
};

const emptySettings = {
  empresa_id: '',
  template_id: '',
  nombre_asistente: '',
  tono_respuesta: '',
  usar_emojis: true,
  emoji_principal: '*',
  emoji_producto: '-',
  emoji_precio: '$',
  emoji_stock: '#',
  emoji_asesor: '@',
  emoji_pago: '$',
  saludo_personalizado: '',
  despedida_personalizada: '',
  mensaje_sin_resultados: '',
  mensaje_asesor: '',
  mensaje_fuera_horario: '',
  reglas_adicionales: '',
  sinonimos_json: '',
  handoff_timeout_minutos: 4,
  handoff_mensaje_tomar: '',
  handoff_mensaje_declinar: '',
  handoff_mensaje_expirado: '',
  handoff_mensaje_reactivar: ''
};

const sectionItems = [
  {
    id: 'identity',
    title: 'Identidad',
    description: 'Quien es y como se presenta',
    icon: UserRound
  },
  {
    id: 'behavior',
    title: 'Comportamiento',
    description: 'Tono, estilo y formato',
    icon: SlidersHorizontal
  },
  {
    id: 'instructions',
    title: 'Instrucciones',
    description: 'Reglas centrales del prompt',
    icon: FileText
  },
  {
    id: 'knowledge',
    title: 'Conocimiento',
    description: 'Datos que conoce del negocio',
    icon: Building2
  },
  {
    id: 'automation',
    title: 'Automatizacion',
    description: 'Handoff, horarios y respuestas',
    icon: Workflow
  },
  {
    id: 'safety',
    title: 'Seguridad',
    description: 'Limites y buenas practicas',
    icon: ShieldCheck
  },
  {
    id: 'test',
    title: 'Prueba',
    description: 'Simulador de respuesta IA',
    icon: FlaskConical
  }
];

const quickRules = [
  'Responde de forma amable y profesional.',
  'No inventes precios.',
  'Si no sabes algo, pide los datos al cliente.',
  'Ofrece productos o servicios relacionados cuando sea util.',
  'Manten respuestas claras y cortas.',
  'Si el cliente esta molesto, escala a una persona.'
];

const safetyGuides = [
  'No inventar precios, promociones ni disponibilidad.',
  'No compartir informacion sensible de clientes.',
  'Pedir datos faltantes antes de confirmar pedidos.',
  'Escalar a humano cuando haya dudas o molestia.',
  'Responder con claridad y evitar promesas imposibles.'
];

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function normalizeSettings(settings) {
  return {
    ...emptySettings,
    ...settings,
    template_id: settings?.template_id ?? '',
    sinonimos_json: settings?.sinonimos_json
      ? JSON.stringify(settings.sinonimos_json, null, 2)
      : ''
  };
}

function serialize(value) {
  return JSON.stringify(value ?? {});
}

function Field({ children, help, id, label }) {
  return (
    <label className="ai-field" htmlFor={id}>
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function SwitchField({ checked, description, id, label, onChange }) {
  return (
    <label className="ai-switch-card" htmlFor={id}>
      <span className="ai-switch-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="ai-switch-control">
        <input
          aria-label={label}
          checked={checked}
          id={id}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" />
      </span>
    </label>
  );
}

function AIConfigHero({
  activeSection,
  companyName,
  hasChanges,
  isActive,
  isSaving,
  onDiscard,
  onSave,
  onTest,
  selectedSettings,
  templateForm
}) {
  return (
    <header className="ai-hero">
      <div className="ai-hero-copy">
        <span className="ai-hero-kicker">
          <Sparkles size={16} aria-hidden="true" />
          AI Assistant Control Center
        </span>
        <h1>Configuracion de IA</h1>
        <p>Personaliza como responde tu asistente inteligente y adapta sus respuestas al estilo de tu negocio.</p>
      </div>

      <div className="ai-hero-status" aria-label="Resumen del asistente">
        <span className={isActive ? 'ai-pill success' : 'ai-pill warning'}>
          <BadgeCheck size={15} aria-hidden="true" />
          {isActive ? 'Activa' : 'Inactiva'}
        </span>
        <span className="ai-pill">
          <Workflow size={15} aria-hidden="true" />
          {selectedSettings?.id ? 'Automatico' : 'Sin automatizacion'}
        </span>
        <span className="ai-pill">
          <MessageCircle size={15} aria-hidden="true" />
          WhatsApp
        </span>
        <span className="ai-pill">
          <Clock3 size={15} aria-hidden="true" />
          {selectedSettings?.updated_at ? `Actualizado ${new Date(selectedSettings.updated_at).toLocaleDateString()}` : 'Sin actualizacion'}
        </span>
        <span className="ai-pill">
          <Building2 size={15} aria-hidden="true" />
          {companyName || templateForm.tipo_negocio || 'General'}
        </span>
      </div>

      <div className="ai-hero-actions">
        <button className="primary-button" disabled={!hasChanges || isSaving} onClick={onSave} type="button">
          <Save size={18} aria-hidden="true" />
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button className="secondary-button" onClick={onTest} type="button">
          <PlayCircle size={18} aria-hidden="true" />
          Probar IA
        </button>
        {hasChanges ? (
          <button className="ghost-button" onClick={onDiscard} type="button">
            <RotateCcw size={18} aria-hidden="true" />
            Restaurar
          </button>
        ) : null}
      </div>

      <div className="ai-hero-current">
        <span>Seccion actual</span>
        <strong>{sectionItems.find((item) => item.id === activeSection)?.title}</strong>
      </div>
    </header>
  );
}

function AIAssistantStatus({ companyName, error, selectedSettings, templateForm }) {
  const hasTemplate = Boolean(templateForm.nombre || selectedSettings?.template_id);
  const hasInstructions = Boolean(templateForm.prompt_sistema?.trim() || selectedSettings?.reglas_adicionales?.trim());
  const isActive = Boolean(templateForm.activo && (selectedSettings?.id || templateForm.nombre || templateForm.prompt_sistema));
  const whatsappReady = Boolean(selectedSettings?.empresa_id);
  const statusText = error
    ? 'Hay un problema al cargar la configuracion. Intenta actualizar antes de guardar.'
    : !hasInstructions
      ? 'Faltan instrucciones para que la IA responda correctamente.'
      : !whatsappReady
        ? 'Selecciona una empresa para conectar esta configuracion con WhatsApp.'
        : 'Tu asistente esta listo para responder conversaciones de clientes.';

  const checks = [
    { label: 'Estado actual', value: isActive ? 'Activo' : 'Inactivo', ok: isActive },
    { label: 'WhatsApp conectado', value: whatsappReady ? companyName || 'Empresa seleccionada' : 'Pendiente', ok: whatsappReady },
    { label: 'Instrucciones cargadas', value: hasInstructions ? 'Listas' : 'Incompletas', ok: hasInstructions },
    { label: 'Plantilla base', value: hasTemplate ? 'Asignada' : 'Sin plantilla', ok: hasTemplate }
  ];

  return (
    <section className={error ? 'ai-assistant-status error' : isActive ? 'ai-assistant-status ready' : 'ai-assistant-status warning'}>
      <div className="ai-status-lead">
        <span className="ai-status-icon">
          <Bot size={26} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Asistente inteligente</p>
          <h2>{templateForm.nombre || selectedSettings?.nombre_asistente || 'Asistente inteligente'}</h2>
          <p>{statusText}</p>
        </div>
      </div>
      <div className="ai-status-checks">
        {checks.map((check) => (
          <div className={check.ok ? 'ok' : 'pending'} key={check.label}>
            {check.ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            <span>{check.label}</span>
            <strong>{check.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AIConfigNavigation({ activeSection, completion, onChange }) {
  return (
    <nav className="ai-section-nav" aria-label="Secciones de configuracion IA">
      {sectionItems.map((item, index) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        const isComplete = completion[item.id];
        return (
          <button
            aria-current={isActive ? 'step' : undefined}
            className={isActive ? 'active' : ''}
            key={item.id}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <span className="ai-step-index">{index + 1}</span>
            <span className="ai-step-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="ai-step-copy">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <span className={isComplete ? 'ai-step-state complete' : 'ai-step-state'}>
              {isComplete ? <Check size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function TemplateLibrary({ catalog, onDelete, onEdit, onNew, selectedTemplateId }) {
  return (
    <section className="ai-template-dock" aria-label="Biblioteca de plantillas">
      <div>
        <span>
          <ListChecks size={18} aria-hidden="true" />
        </span>
        <div>
          <h3>Biblioteca de plantillas</h3>
          <p>{catalog.templates.length} plantillas disponibles para reutilizar instrucciones por tipo de negocio.</p>
        </div>
      </div>
      <button className="secondary-button" onClick={onNew} type="button">
        <FileText size={18} aria-hidden="true" />
        Nueva plantilla
      </button>
      <div className="ai-template-strip">
        {catalog.templates.length === 0 ? (
          <p className="ai-muted-note">Aun no hay plantillas. Crea una configuracion base para comenzar.</p>
        ) : null}
        {catalog.templates.map((template) => (
          <article className={String(template.id) === String(selectedTemplateId) ? 'selected' : ''} key={template.id}>
            <button onClick={() => onEdit(template)} type="button">
              <strong>{template.nombre}</strong>
              <span>{template.tipo_negocio} · {template.tono} · {template.activo ? 'Activa' : 'Inactiva'}</span>
            </button>
            <button className="icon-button bordered" onClick={() => onDelete(template.id)} type="button" aria-label="Eliminar plantilla">
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ description, icon: Icon, title }) {
  return (
    <header className="ai-panel-header">
      <span>
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function AIIdentitySection({ catalog, companies, form, onChange, settingsForm, onSettingsChange }) {
  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="Estos datos ayudan a que el asistente tenga una personalidad coherente con tu negocio."
        icon={UserRound}
        title="Identidad del asistente"
      />
      <div className="ai-form-grid two">
        <Field id="ai-company" label="Empresa" help="Negocio donde se aplicara esta configuracion.">
          <select id="ai-company" value={settingsForm.empresa_id} onChange={(event) => onSettingsChange(event.target.value)}>
            <option value="">Selecciona una empresa</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}
          </select>
        </Field>
        <Field id="ai-assistant-name" label="Nombre del asistente" help="Nombre visible o interno del asistente de esta empresa.">
          <input
            id="ai-assistant-name"
            onChange={(event) => onChange({ settings: { ...settingsForm, nombre_asistente: event.target.value } })}
            placeholder="Ej. Ana de Ventas"
            value={settingsForm.nombre_asistente ?? ''}
          />
        </Field>
        <Field id="ai-template-name" label="Nombre de plantilla" help="Nombre interno para reconocer esta configuracion.">
          <input
            id="ai-template-name"
            onChange={(event) => onChange({ template: { ...form, nombre: event.target.value } })}
            placeholder="Ej. Asistente comercial"
            value={form.nombre}
          />
        </Field>
        <Field id="ai-business-type" label="Tipo de negocio" help="Ayuda a adaptar vocabulario y ejemplos.">
          <select
            id="ai-business-type"
            onChange={(event) => onChange({ template: { ...form, tipo_negocio: event.target.value } })}
            value={form.tipo_negocio}
          >
            {(catalog.tipos_negocio.length ? catalog.tipos_negocio : ['General']).map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </Field>
        <Field id="ai-tone" label="Tono base" help="Ej. profesional para B2B, cercano para ventas directas.">
          <select id="ai-tone" onChange={(event) => onChange({ template: { ...form, tono: event.target.value } })} value={form.tono}>
            {['PROFESIONAL', 'AMABLE', 'CERCANO', 'FORMAL', 'COMERCIAL'].map((tone) => <option key={tone} value={tone}>{tone}</option>)}
          </select>
        </Field>
        <Field id="ai-company-tone" label="Personalidad por empresa" help="Describe el estilo esperado para esta empresa.">
          <input
            id="ai-company-tone"
            onChange={(event) => onChange({ settings: { ...settingsForm, tono_respuesta: event.target.value } })}
            placeholder="Ej. amable, breve y comercial"
            value={settingsForm.tono_respuesta ?? ''}
          />
        </Field>
      </div>
    </section>
  );
}

function AIBehaviorSection({ form, onChange, settingsForm }) {
  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="Configura como debe sentirse la respuesta: activa, breve, clara y alineada al formato que ya entiende la API."
        icon={SlidersHorizontal}
        title="Comportamiento"
      />
      <div className="ai-form-grid two">
        <SwitchField
          checked={form.activo}
          description="La plantilla queda disponible para responder con esta configuracion."
          id="ai-template-active"
          label="Plantilla activa"
          onChange={(checked) => onChange({ template: { ...form, activo: checked } })}
        />
        <SwitchField
          checked={form.emojis_activos}
          description="El formato de respuesta puede usar los emojis definidos para guiar al cliente."
          id="ai-template-emojis"
          label="Usar emojis del sistema"
          onChange={(checked) => onChange({ template: { ...form, emojis_activos: checked } })}
        />
        <SwitchField
          checked={settingsForm.usar_emojis}
          description="Permite que la configuracion de empresa incluya simbolos visuales en respuestas."
          id="ai-settings-emojis"
          label="Usar emojis en esta empresa"
          onChange={(checked) => onChange({ settings: { ...settingsForm, usar_emojis: checked } })}
        />
        <Field id="ai-response-format" label="Formato de respuesta" help="Usa {items} para insertar productos o servicios encontrados.">
          <textarea
            id="ai-response-format"
            onChange={(event) => onChange({ template: { ...form, formato_respuesta: event.target.value } })}
            rows={7}
            value={form.formato_respuesta}
          />
        </Field>
      </div>
      <div className="ai-token-grid">
        {[
          ['emoji_principal', 'Principal'],
          ['emoji_producto', 'Producto'],
          ['emoji_precio', 'Precio'],
          ['emoji_stock', 'Stock'],
          ['emoji_asesor', 'Asesor'],
          ['emoji_pago', 'Pago']
        ].map(([key, label]) => (
          <Field id={`ai-${key}`} key={key} label={label}>
            <input
              id={`ai-${key}`}
              onChange={(event) => onChange({ settings: { ...settingsForm, [key]: event.target.value } })}
              value={settingsForm[key] ?? ''}
            />
          </Field>
        ))}
      </div>
    </section>
  );
}

function AIInstructionsBuilder({ form, onChange }) {
  function appendRule(rule) {
    const current = form.prompt_sistema?.trim();
    const nextPrompt = current ? `${current}\n- ${rule}` : `- ${rule}`;
    onChange({ template: { ...form, prompt_sistema: nextPrompt } });
  }

  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="Escribe aqui como debe responder tu asistente, que debe evitar y que informacion debe pedir al cliente."
        icon={FileText}
        title="Prompt Builder"
      />
      <div className="ai-prompt-builder">
        <div className="ai-rule-chips" aria-label="Ejemplos rapidos">
          {quickRules.map((rule) => (
            <button key={rule} onClick={() => appendRule(rule)} type="button">
              <Sparkles size={14} aria-hidden="true" />
              {rule}
            </button>
          ))}
        </div>
        <Field id="ai-system-prompt" label="Instrucciones principales" help="Los ejemplos solo se agregan si los seleccionas.">
          <textarea
            className="ai-prompt-textarea"
            id="ai-system-prompt"
            onChange={(event) => onChange({ template: { ...form, prompt_sistema: event.target.value } })}
            rows={14}
            value={form.prompt_sistema}
          />
        </Field>
        <div className="ai-prompt-footer">
          <span>{form.prompt_sistema?.length ?? 0} caracteres</span>
          <span>Incluye tono, limites, datos que debe pedir y cuando escalar.</span>
        </div>
      </div>
    </section>
  );
}

function AIBusinessKnowledge({ catalog, companies, form, onChange, settingsForm }) {
  const selectedCompany = companies.find((company) => String(company.id) === String(settingsForm.empresa_id));

  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="La IA usara esta informacion para responder con mayor precision."
        icon={Building2}
        title="Conocimiento del negocio"
      />
      <div className="ai-knowledge-summary">
        <div>
          <span>
            <Building2 size={18} aria-hidden="true" />
          </span>
          <strong>{selectedCompany?.nombre || 'Empresa sin seleccionar'}</strong>
          <small>{form.tipo_negocio || 'General'}</small>
        </div>
        <div>
          <span>
            <Globe2 size={18} aria-hidden="true" />
          </span>
          <strong>{settingsForm.template_id ? 'Plantilla asignada' : 'Sin plantilla asignada'}</strong>
          <small>{catalog.templates.find((template) => String(template.id) === String(settingsForm.template_id))?.nombre || 'Puedes usar reglas base'}</small>
        </div>
      </div>
      <div className="ai-form-grid two">
        <Field id="ai-template" label="Plantilla del negocio" help="Puedes dejarlo sin plantilla para usar reglas base.">
          <select
            id="ai-template"
            onChange={(event) => onChange({ settings: { ...settingsForm, template_id: event.target.value } })}
            value={settingsForm.template_id ?? ''}
          >
            <option value="">Sin plantilla</option>
            {catalog.templates.map((template) => <option key={template.id} value={template.id}>{template.nombre}</option>)}
          </select>
        </Field>
        <Field id="ai-welcome" label="Saludo inicial">
          <textarea
            id="ai-welcome"
            onChange={(event) => onChange({ settings: { ...settingsForm, saludo_personalizado: event.target.value } })}
            placeholder="Hola, soy el asistente de la tienda. Te ayudo a encontrar lo que necesitas."
            rows={4}
            value={settingsForm.saludo_personalizado ?? ''}
          />
        </Field>
        <Field id="ai-no-results" label="Mensaje sin resultados">
          <textarea
            id="ai-no-results"
            onChange={(event) => onChange({ settings: { ...settingsForm, mensaje_sin_resultados: event.target.value } })}
            placeholder="No encontre ese producto, pero puedo mostrarte opciones similares."
            rows={4}
            value={settingsForm.mensaje_sin_resultados ?? ''}
          />
        </Field>
        <Field id="ai-after-hours" label="Mensaje fuera de horario">
          <textarea
            id="ai-after-hours"
            onChange={(event) => onChange({ settings: { ...settingsForm, mensaje_fuera_horario: event.target.value } })}
            placeholder="Estamos fuera de horario. Te responderemos lo antes posible."
            rows={4}
            value={settingsForm.mensaje_fuera_horario ?? ''}
          />
        </Field>
      </div>
    </section>
  );
}

function AIAutomationSection({ form, onChange }) {
  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="Define cuando debe escalar a humano y que mensajes se usan durante el handoff."
        icon={Workflow}
        title="Automatizacion"
      />
      <div className="ai-form-grid two">
        <Field id="ai-handoff-timeout" label="Tiempo para escalar a asesor" help="Minutos antes de activar el flujo de handoff.">
          <input
            id="ai-handoff-timeout"
            min="1"
            onChange={(event) => onChange({ settings: { ...form, handoff_timeout_minutos: event.target.value } })}
            type="number"
            value={form.handoff_timeout_minutos ?? 4}
          />
        </Field>
        <Field id="ai-advisor-message" label="Mensaje para escalar a asesor">
          <textarea
            id="ai-advisor-message"
            onChange={(event) => onChange({ settings: { ...form, mensaje_asesor: event.target.value } })}
            placeholder="Te comunico con un asesor para ayudarte mejor."
            rows={3}
            value={form.mensaje_asesor ?? ''}
          />
        </Field>
        <Field id="ai-handoff-take" label="Mensaje asesor acepta">
          <input
            id="ai-handoff-take"
            onChange={(event) => onChange({ settings: { ...form, handoff_mensaje_tomar: event.target.value } })}
            placeholder="Un asesor tomo la conversacion."
            value={form.handoff_mensaje_tomar ?? ''}
          />
        </Field>
        <Field id="ai-handoff-decline" label="Mensaje asesor no disponible">
          <input
            id="ai-handoff-decline"
            onChange={(event) => onChange({ settings: { ...form, handoff_mensaje_declinar: event.target.value } })}
            placeholder="En este momento no hay asesores disponibles."
            value={form.handoff_mensaje_declinar ?? ''}
          />
        </Field>
        <Field id="ai-handoff-expired" label="Mensaje handoff expirado">
          <input
            id="ai-handoff-expired"
            onChange={(event) => onChange({ settings: { ...form, handoff_mensaje_expirado: event.target.value } })}
            placeholder="La solicitud expiro. Puedo seguir ayudandote."
            value={form.handoff_mensaje_expirado ?? ''}
          />
        </Field>
        <Field id="ai-handoff-reactivate" label="Mensaje reactivar IA">
          <input
            id="ai-handoff-reactivate"
            onChange={(event) => onChange({ settings: { ...form, handoff_mensaje_reactivar: event.target.value } })}
            placeholder="Quieres que el asistente continue ayudandote?"
            value={form.handoff_mensaje_reactivar ?? ''}
          />
        </Field>
      </div>
    </section>
  );
}

function AISafetyRules({ form, onChange }) {
  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="Estas guias ayudan a que el cliente confie en la IA. Solo se guardan las reglas adicionales y sinonimos soportados por el backend."
        icon={ShieldCheck}
        title="Reglas de seguridad"
      />
      <div className="ai-safety-grid">
        {safetyGuides.map((guide) => (
          <div key={guide}>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{guide}</span>
          </div>
        ))}
      </div>
      <Field id="ai-extra-rules" label="Reglas adicionales guardables" help="Reglas especificas para esta empresa.">
        <textarea
          id="ai-extra-rules"
          onChange={(event) => onChange({ settings: { ...form, reglas_adicionales: event.target.value } })}
          rows={5}
          value={form.reglas_adicionales ?? ''}
        />
      </Field>
      <Field id="ai-synonyms" label="Sinonimos por negocio (JSON)" help="Usa JSON valido para reconocer formas distintas de pedir lo mismo.">
        <textarea
          id="ai-synonyms"
          onChange={(event) => onChange({ settings: { ...form, sinonimos_json: event.target.value } })}
          placeholder={'{\n  "rotulacion": ["vinil", "rotular"],\n  "diseno": ["arte"]\n}'}
          rows={6}
          value={form.sinonimos_json ?? ''}
        />
      </Field>
    </section>
  );
}

function AITestSimulator({ isPreviewing, onPreview, preview, previewMessage, setPreviewMessage }) {
  return (
    <section className="ai-config-panel">
      <SectionHeader
        description="Prueba como responderia la IA sin enviar mensajes reales a clientes."
        icon={FlaskConical}
        title="Prueba del asistente"
      />
      <div className="ai-chat-simulator">
        <div className="ai-chat-window" aria-live="polite">
          <div className="ai-chat-message customer">
            <span>Cliente</span>
            <p>{preview?.mensaje || previewMessage || 'Hola, que servicios ofrecen?'}</p>
          </div>
          <div className="ai-chat-message assistant">
            <span>IA</span>
            <p>{isPreviewing ? 'Generando respuesta...' : preview?.respuesta || 'La respuesta de prueba aparecera aqui.'}</p>
          </div>
        </div>
        {preview?.tipo_prueba ? (
          <div className="ai-test-meta">
            <span>Modo de prueba</span>
            <strong>{preview.tipo_prueba.replaceAll('_', ' ')}</strong>
          </div>
        ) : null}
        <div className="ai-chat-input">
          <Field id="ai-preview-message" label="Mensaje del cliente" help="Ejemplo: Hola, que servicios ofrecen?">
            <textarea
              id="ai-preview-message"
              onChange={(event) => setPreviewMessage(event.target.value)}
              rows={4}
              value={previewMessage}
            />
          </Field>
          <button className="primary-button" disabled={isPreviewing} onClick={onPreview} type="button">
            <Send size={18} aria-hidden="true" />
            {isPreviewing ? 'Probando...' : 'Probar respuesta'}
          </button>
        </div>
      </div>
    </section>
  );
}

function AIPreviewPanel({ completion, preview, selectedSettings, templateForm }) {
  const assistantName = selectedSettings?.nombre_asistente || templateForm.nombre || 'Asistente IA';
  const checklist = [
    ['Identidad configurada', completion.identity],
    ['Instrucciones completas', completion.instructions],
    ['WhatsApp conectado', completion.knowledge],
    ['Automatizacion activa', completion.automation],
    ['Prueba realizada', completion.test]
  ];

  return (
    <aside className="ai-preview-panel">
      <div className="ai-preview-profile">
        <span>
          <Bot size={28} aria-hidden="true" />
        </span>
        <div>
          <h2>{assistantName}</h2>
          <p>{selectedSettings?.tono_respuesta || templateForm.tono || 'Tono pendiente'}</p>
        </div>
      </div>
      <div className="ai-preview-example">
        <small>Ejemplo de respuesta</small>
        <p>{preview?.respuesta || selectedSettings?.saludo_personalizado || 'Hola, con gusto te ayudo. Cuentame que producto o servicio estas buscando.'}</p>
      </div>
      <div className="ai-preview-checklist">
        {checklist.map(([label, ok]) => (
          <div className={ok ? 'done' : ''} key={label}>
            {ok ? <CheckCircle2 size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}
            <span>{label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function AIUnsavedChangesBar({ isSaving, onDiscard, onSave }) {
  return (
    <div className="ai-unsaved-bar" role="status" aria-live="polite">
      <div>
        <AlertTriangle size={18} aria-hidden="true" />
        <span>Tienes cambios sin guardar.</span>
      </div>
      <div>
        <button className="secondary-button" onClick={onDiscard} type="button">Descartar</button>
        <button className="primary-button" disabled={isSaving} onClick={onSave} type="button">
          <Save size={17} aria-hidden="true" />
          {isSaving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function AIConfigSkeleton() {
  return (
    <div className="ai-config-skeleton" role="status" aria-live="polite">
      <div className="ai-skeleton-hero" />
      <div className="ai-skeleton-status" />
      <div className="ai-skeleton-layout">
        <span />
        <span />
        <span />
      </div>
      <p>Cargando configuracion de IA...</p>
    </div>
  );
}

function AIConfigErrorState({ message, onRetry }) {
  return (
    <section className="ai-config-feedback error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar la configuracion de IA.</h2>
        <p>{message || 'Revisa tu conexion o intenta actualizar la informacion.'}</p>
      </div>
      {onRetry ? (
        <button className="secondary-button" onClick={onRetry} type="button">
          <RefreshCcw size={17} aria-hidden="true" />
          Reintentar
        </button>
      ) : null}
    </section>
  );
}

function AIConfigEmptyState({ onCreate }) {
  return (
    <section className="ai-config-feedback">
      <Sparkles size={24} aria-hidden="true" />
      <div>
        <h2>Configura tu asistente IA.</h2>
        <p>Define como debe responder tu asistente para automatizar conversaciones con tus clientes.</p>
      </div>
      <button className="primary-button" onClick={onCreate} type="button">Comenzar configuracion</button>
    </section>
  );
}

export function BotPromptsManager() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState({ templates: [], settings: [], tipos_negocio: [] });
  const [companies, setCompanies] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [settingsForm, setSettingsForm] = useState(emptySettings);
  const [templateBaseline, setTemplateBaseline] = useState(emptyTemplate);
  const [settingsBaseline, setSettingsBaseline] = useState(emptySettings);
  const [previewMessage, setPreviewMessage] = useState('Hola, que servicios ofrecen?');
  const [preview, setPreview] = useState(null);
  const [activeSection, setActiveSection] = useState('identity');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const selectedSettings = useMemo(
    () => catalog.settings.find((item) => String(item.empresa_id) === String(settingsForm.empresa_id)),
    [catalog.settings, settingsForm.empresa_id]
  );

  const selectedCompany = useMemo(
    () => companies.find((company) => String(company.id) === String(settingsForm.empresa_id)),
    [companies, settingsForm.empresa_id]
  );

  const templateDirty = serialize(templateForm) !== serialize(templateBaseline);
  const settingsDirty = serialize(settingsForm) !== serialize(settingsBaseline);
  const hasChanges = templateDirty || settingsDirty;
  const isAssistantActive = Boolean(templateForm.activo && (selectedSettings?.id || templateForm.nombre || templateForm.prompt_sistema));

  const completion = {
    identity: Boolean((settingsForm.nombre_asistente || templateForm.nombre) && settingsForm.empresa_id),
    behavior: Boolean(templateForm.tono && templateForm.formato_respuesta),
    instructions: Boolean(templateForm.prompt_sistema?.trim()),
    knowledge: Boolean(settingsForm.empresa_id),
    automation: Boolean(settingsForm.handoff_timeout_minutos || settingsForm.mensaje_asesor),
    safety: Boolean(settingsForm.reglas_adicionales || settingsForm.sinonimos_json),
    test: Boolean(preview?.respuesta)
  };

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextCatalog, nextCompanies] = await Promise.all([
        fetchBotPromptCatalog(),
        fetchCompanies()
      ]);
      setCatalog(nextCatalog);
      setCompanies(nextCompanies);

      const nextCompanyId = settingsForm.empresa_id || nextCompanies[0]?.id || '';
      const nextSettings = nextCatalog.settings.find((item) => String(item.empresa_id) === String(nextCompanyId));
      const normalizedSettings = nextSettings
        ? normalizeSettings(nextSettings)
        : { ...emptySettings, empresa_id: nextCompanyId ? String(nextCompanyId) : '' };

      setSettingsForm(normalizedSettings);
      setSettingsBaseline(normalizedSettings);

      if (nextCatalog.templates[0] && !templateDirty) {
        setTemplateForm(nextCatalog.templates[0]);
        setTemplateBaseline(nextCatalog.templates[0]);
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedSettings) {
      return;
    }

    const normalizedSettings = normalizeSettings(selectedSettings);
    setSettingsForm(normalizedSettings);
    setSettingsBaseline(normalizedSettings);
  }, [selectedSettings?.id]);

  if (!isSuperAdminRole(user?.rol)) {
    return <AIConfigErrorState message="No tienes permisos para administrar prompts del bot." />;
  }

  function handleSectionChange(sectionId) {
    setActiveSection(sectionId);
  }

  function handleCompanyChange(companyId) {
    const nextSettings = catalog.settings.find((item) => String(item.empresa_id) === String(companyId));
    const normalizedSettings = nextSettings
      ? normalizeSettings(nextSettings)
      : { ...emptySettings, empresa_id: companyId };
    setSettingsForm(normalizedSettings);
    setSettingsBaseline(normalizedSettings);
  }

  function handleFormChange(next) {
    if (next.template) {
      setTemplateForm(next.template);
    }
    if (next.settings) {
      setSettingsForm(next.settings);
    }
    setSuccess('');
  }

  async function handleSaveChanges() {
    try {
      setIsSaving(true);
      setError('');
      setSuccess('');

      if (templateDirty) {
        const savedTemplate = await saveBotPromptTemplate(templateForm);
        setTemplateForm(savedTemplate);
        setTemplateBaseline(savedTemplate);
      }

      if (settingsDirty) {
        const savedSettings = await saveBotResponseSettings(settingsForm);
        const normalizedSettings = normalizeSettings(savedSettings);
        setSettingsForm(normalizedSettings);
        setSettingsBaseline(normalizedSettings);
      }

      setSuccess('Configuracion de IA guardada correctamente.');
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteTemplate(templateId) {
    try {
      setError('');
      await deleteBotPromptTemplate(templateId);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handlePreview() {
    try {
      setIsPreviewing(true);
      setError('');
      setSuccess('');
      const result = await previewBotPrompt({
        ...settingsForm,
        mensaje: previewMessage,
        formato_respuesta: templateForm.formato_respuesta,
        saludo_personalizado: settingsForm.saludo_personalizado,
        mensaje_sin_resultados: settingsForm.mensaje_sin_resultados,
        mensaje_asesor: settingsForm.mensaje_asesor
      });
      setPreview(result);
      setSuccess('Vista previa generada correctamente.');
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleNewTemplate() {
    setTemplateForm(emptyTemplate);
    setTemplateBaseline(emptyTemplate);
    setActiveSection('identity');
    setSuccess('');
  }

  function handleEditTemplate(template) {
    setTemplateForm(template);
    setTemplateBaseline(template);
    setActiveSection('identity');
    setSuccess('');
  }

  function handleDiscardChanges() {
    setTemplateForm(templateBaseline);
    setSettingsForm(settingsBaseline);
    setSuccess('');
    setError('');
  }

  function renderActiveSection() {
    if (activeSection === 'identity') {
      return (
        <AIIdentitySection
          catalog={catalog}
          companies={companies}
          form={templateForm}
          onChange={handleFormChange}
          onSettingsChange={handleCompanyChange}
          settingsForm={settingsForm}
        />
      );
    }

    if (activeSection === 'behavior') {
      return <AIBehaviorSection form={templateForm} onChange={handleFormChange} settingsForm={settingsForm} />;
    }

    if (activeSection === 'instructions') {
      return <AIInstructionsBuilder form={templateForm} onChange={handleFormChange} />;
    }

    if (activeSection === 'knowledge') {
      return (
        <AIBusinessKnowledge
          catalog={catalog}
          companies={companies}
          form={templateForm}
          onChange={handleFormChange}
          settingsForm={settingsForm}
        />
      );
    }

    if (activeSection === 'automation') {
      return <AIAutomationSection form={settingsForm} onChange={handleFormChange} />;
    }

    if (activeSection === 'safety') {
      return <AISafetyRules form={settingsForm} onChange={handleFormChange} />;
    }

    return (
      <AITestSimulator
        isPreviewing={isPreviewing}
        onPreview={handlePreview}
        preview={preview}
        previewMessage={previewMessage}
        setPreviewMessage={setPreviewMessage}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="resource-page bot-prompts-page">
        <AIConfigSkeleton />
      </div>
    );
  }

  const isEmpty = catalog.templates.length === 0 && catalog.settings.length === 0;

  return (
    <div className="resource-page bot-prompts-page">
      <AIConfigHero
        activeSection={activeSection}
        companyName={selectedCompany?.nombre}
        hasChanges={hasChanges}
        isActive={isAssistantActive}
        isSaving={isSaving}
        onDiscard={handleDiscardChanges}
        onSave={handleSaveChanges}
        onTest={() => setActiveSection('test')}
        selectedSettings={selectedSettings}
        templateForm={templateForm}
      />

      {error ? <AIConfigErrorState message={error} onRetry={loadData} /> : null}
      {success ? (
        <div className="ai-settings-success" role="status" aria-live="polite">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{success}</span>
        </div>
      ) : null}
      {isEmpty ? <AIConfigEmptyState onCreate={handleNewTemplate} /> : null}

      <AIAssistantStatus
        companyName={selectedCompany?.nombre}
        error={error}
        selectedSettings={selectedSettings}
        templateForm={templateForm}
      />

      <TemplateLibrary
        catalog={catalog}
        onDelete={handleDeleteTemplate}
        onEdit={handleEditTemplate}
        onNew={handleNewTemplate}
        selectedTemplateId={templateForm.id}
      />

      <section className="ai-control-layout">
        <AIConfigNavigation activeSection={activeSection} completion={completion} onChange={handleSectionChange} />
        <main className="ai-active-section">{renderActiveSection()}</main>
        <AIPreviewPanel completion={completion} preview={preview} selectedSettings={selectedSettings} templateForm={templateForm} />
      </section>

      {hasChanges ? <AIUnsavedChangesBar isSaving={isSaving} onDiscard={handleDiscardChanges} onSave={handleSaveChanges} /> : null}
    </div>
  );
}
