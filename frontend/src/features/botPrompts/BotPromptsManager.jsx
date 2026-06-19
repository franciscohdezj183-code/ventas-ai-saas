import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Eye, FileText, Layers3, Save, Sparkles, Trash2 } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/ui/index.js';
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
  emoji_principal: '✨',
  emoji_producto: '•',
  emoji_precio: '💰',
  emoji_stock: '📦',
  emoji_asesor: '🧑‍💼',
  emoji_pago: '💳',
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

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function BotPromptsManager() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState({ templates: [], settings: [], tipos_negocio: [] });
  const [companies, setCompanies] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [settingsForm, setSettingsForm] = useState(emptySettings);
  const [previewMessage, setPreviewMessage] = useState('Tienes salas grises');
  const [preview, setPreview] = useState(null);
  const [activeSection, setActiveSection] = useState('template');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedSettings = useMemo(
    () => catalog.settings.find((item) => String(item.empresa_id) === String(settingsForm.empresa_id)),
    [catalog.settings, settingsForm.empresa_id]
  );
  const stats = useMemo(() => ({
    templates: catalog.templates.length,
    assigned: catalog.settings.length,
    active: catalog.templates.filter((template) => template.activo).length
  }), [catalog]);

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

      if (!settingsForm.empresa_id && nextCompanies[0]?.id) {
        setSettingsForm((current) => ({ ...current, empresa_id: String(nextCompanies[0].id) }));
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

    setSettingsForm({
      ...emptySettings,
      ...selectedSettings,
      template_id: selectedSettings.template_id ?? '',
      sinonimos_json: selectedSettings.sinonimos_json
        ? JSON.stringify(selectedSettings.sinonimos_json, null, 2)
        : ''
    });
  }, [selectedSettings?.id]);

  if (!isSuperAdminRole(user?.rol)) {
    return <ErrorState message="No tienes permisos para administrar prompts del bot." />;
  }

  async function handleTemplateSubmit(event) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');
      await saveBotPromptTemplate(templateForm);
      setTemplateForm(emptyTemplate);
      setSuccess('Plantilla guardada correctamente.');
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

  async function handleSettingsSubmit(event) {
    event.preventDefault();

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');
      await saveBotResponseSettings(settingsForm);
      setSuccess('Configuracion de IA guardada correctamente.');
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePreview() {
    try {
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
    }
  }

  if (isLoading) {
    return <LoadingState message="Cargando prompts del bot..." />;
  }

  return (
    <div className="resource-page bot-prompts-page">
      <div className="bot-prompts-header">
        <div>
          <span className="bot-prompts-header-icon">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Personalidad</p>
            <h1>Configuracion IA</h1>
            <p>Define como habla la IA, que informacion usa y cuando debe pedir apoyo humano.</p>
          </div>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}
      {success ? (
        <div className="ai-settings-success" role="status" aria-live="polite">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{success}</span>
        </div>
      ) : null}

      <section className="bot-prompts-summary-grid">
        <article className="bot-prompts-summary-card">
          <span>Activas</span>
          <strong>{stats.active}</strong>
          <p>Plantillas disponibles para asignar a empresas.</p>
        </article>
        <article className="bot-prompts-summary-card">
          <span>Tipos</span>
          <strong>{catalog.tipos_negocio.length}</strong>
          <p>Rubros iniciales para personalizar respuestas.</p>
        </article>
        <article className="bot-prompts-summary-card">
          <span>Vista previa</span>
          <strong>{preview ? 'Lista' : 'Nueva'}</strong>
          <p>Prueba mensajes antes de llevarlos al bot.</p>
        </article>
      </section>

      <section className="bot-prompts-workspace">
        <aside className="bot-prompts-panel bot-prompts-library">
          <header>
            <span><FileText size={20} aria-hidden="true" /></span>
            <div>
              <h2>Biblioteca</h2>
              <p>{catalog.templates.length} plantillas registradas.</p>
            </div>
          </header>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setTemplateForm(emptyTemplate);
              setActiveSection('template');
            }}
          >
            <FileText size={18} aria-hidden="true" />
            Nueva plantilla
          </button>
          <div className="bot-prompts-list">
            {catalog.templates.map((template) => (
              <div className="bot-prompts-list-row" key={template.id}>
                <div>
                  <strong>{template.nombre}</strong>
                  <span>{template.tipo_negocio} · {template.tono} · {template.activo ? 'Activa' : 'Inactiva'}</span>
                </div>
                <div className="row-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setTemplateForm(template);
                      setActiveSection('template');
                    }}
                  >
                    Editar
                  </button>
                  <button className="icon-button bordered" type="button" aria-label="Eliminar plantilla" onClick={() => handleDeleteTemplate(template.id)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="bot-prompts-main">
          <div className="bot-prompts-tabs">
            <button className={activeSection === 'template' ? 'active' : ''} onClick={() => setActiveSection('template')} type="button">
              Plantilla
            </button>
            <button className={activeSection === 'assignment' ? 'active' : ''} onClick={() => setActiveSection('assignment')} type="button">
              Asignacion
            </button>
            <button className={activeSection === 'preview' ? 'active' : ''} onClick={() => setActiveSection('preview')} type="button">
              Vista previa
            </button>
          </div>

          {activeSection === 'template' ? (
            <form className="bot-prompts-panel bot-prompts-form" onSubmit={handleTemplateSubmit}>
              <header>
                <span><FileText size={20} aria-hidden="true" /></span>
                <div>
                  <h2>Plantilla global</h2>
                  <p>Define personalidad, instrucciones y formato reusable por rubro.</p>
                </div>
              </header>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Personalidad de la IA</h3>
                  <p>Elige como debe sonar el asistente para que sus respuestas sean consistentes.</p>
                </div>
                <div className="bot-prompts-form-grid compact">
                  <label className="field-group">
                    <span>Nombre</span>
                    <input placeholder="Ej. Asistente comercial" value={templateForm.nombre} onChange={(event) => setTemplateForm({ ...templateForm, nombre: event.target.value })} />
                    <small>Nombre interno para reconocer esta plantilla.</small>
                  </label>
                  <label className="field-group">
                    <span>Tipo de negocio</span>
                    <select value={templateForm.tipo_negocio} onChange={(event) => setTemplateForm({ ...templateForm, tipo_negocio: event.target.value })}>
                      {catalog.tipos_negocio.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <small>Ayuda a adaptar vocabulario y ejemplos.</small>
                  </label>
                  <label className="field-group">
                    <span>Tono</span>
                    <select value={templateForm.tono} onChange={(event) => setTemplateForm({ ...templateForm, tono: event.target.value })}>
                      {['PROFESIONAL', 'AMABLE', 'CERCANO', 'FORMAL', 'COMERCIAL'].map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                    </select>
                    <small>Ej. Comercial para ventas directas, formal para B2B.</small>
                  </label>
                  <label className="toggle-field bot-prompts-toggle">
                    <input type="checkbox" checked={templateForm.emojis_activos} onChange={(event) => setTemplateForm({ ...templateForm, emojis_activos: event.target.checked })} />
                    <span>Usar emojis del sistema</span>
                  </label>
                </div>
              </section>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Instrucciones</h3>
                  <p>Reglas base que guian a la IA. No agregues datos sensibles ni contrasenas.</p>
                </div>
                <div className="bot-prompts-system-note">
                  <Sparkles size={18} aria-hidden="true" />
                  <span>Ejemplo: responde claro, pregunta una cosa a la vez y ofrece productos disponibles.</span>
                </div>
                <label className="field-group">
                  <span>Prompt del sistema</span>
                  <textarea rows={6} value={templateForm.prompt_sistema} onChange={(event) => setTemplateForm({ ...templateForm, prompt_sistema: event.target.value })} />
                </label>
              </section>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Respuestas</h3>
                  <p>Define como se estructura la respuesta que ve el cliente.</p>
                </div>
                <label className="field-group">
                  <span>Formato de respuesta</span>
                  <textarea rows={7} value={templateForm.formato_respuesta} onChange={(event) => setTemplateForm({ ...templateForm, formato_respuesta: event.target.value })} />
                  <small>Ejemplo: usa {'{items}'} para insertar productos o servicios encontrados.</small>
                </label>
              </section>
              <div className="ai-settings-sticky-actions">
                <button className="primary-button" disabled={isSaving} type="submit">
                  <Save size={18} aria-hidden="true" />
                  {isSaving ? 'Guardando...' : 'Guardar plantilla'}
                </button>
              </div>
            </form>
          ) : null}

          {activeSection === 'assignment' ? (
            <form className="bot-prompts-panel bot-prompts-form" onSubmit={handleSettingsSubmit}>
              <header>
                <span><Layers3 size={20} aria-hidden="true" /></span>
                <div>
                  <h2>Configuracion por empresa</h2>
                  <p>Ajusta informacion del negocio, limites y automatizaciones de atencion.</p>
                </div>
              </header>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Informacion del negocio</h3>
                  <p>Estos datos ayudan a la IA a hablar como parte de la empresa correcta.</p>
                </div>
              <div className="bot-prompts-form-grid">
                <label className="field-group">
                  <span>Empresa</span>
                  <select value={settingsForm.empresa_id} onChange={(event) => setSettingsForm({ ...emptySettings, empresa_id: event.target.value })}>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.nombre}</option>)}
                  </select>
                  <small>Selecciona a que negocio se aplicara esta configuracion.</small>
                </label>
                <label className="field-group">
                  <span>Plantilla</span>
                  <select value={settingsForm.template_id ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, template_id: event.target.value })}>
                    <option value="">Sin plantilla</option>
                    {catalog.templates.map((template) => <option key={template.id} value={template.id}>{template.nombre}</option>)}
                  </select>
                  <small>Puedes dejarlo sin plantilla para usar reglas base.</small>
                </label>
                <label className="field-group">
                  <span>Nombre asistente</span>
                  <input placeholder="Ej. Ana de Ventas" value={settingsForm.nombre_asistente ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, nombre_asistente: event.target.value })} />
                </label>
                <label className="field-group">
                  <span>Tono de respuesta</span>
                  <input placeholder="Ej. amable, breve y comercial" value={settingsForm.tono_respuesta ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, tono_respuesta: event.target.value })} />
                </label>
              </div>
              </section>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Respuestas</h3>
                  <p>Mensajes que el cliente vera en momentos comunes de la conversacion.</p>
                </div>
              <label className="field-group">
                <span>Saludo personalizado</span>
                <textarea rows={3} placeholder="Ej. Hola, soy el asistente de la tienda. Te ayudo a encontrar lo que necesitas." value={settingsForm.saludo_personalizado ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, saludo_personalizado: event.target.value })} />
              </label>
              <label className="field-group">
                <span>Mensaje sin resultados</span>
                <textarea rows={3} placeholder="Ej. No encontre ese producto, pero puedo mostrarte opciones similares." value={settingsForm.mensaje_sin_resultados ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, mensaje_sin_resultados: event.target.value })} />
              </label>
              <label className="field-group">
                <span>Mensaje asesor</span>
                <textarea rows={3} placeholder="Ej. Te comunico con un asesor para ayudarte mejor." value={settingsForm.mensaje_asesor ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, mensaje_asesor: event.target.value })} />
              </label>
              </section>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Limites</h3>
                  <p>Define cuando la IA debe dejar de insistir y pedir apoyo humano.</p>
                </div>
              <div className="bot-prompts-form-grid compact">
                <label className="field-group">
                  <span>Tiempo handoff (min)</span>
                  <input
                    min="1"
                    type="number"
                    value={settingsForm.handoff_timeout_minutos ?? 4}
                    onChange={(event) => setSettingsForm({ ...settingsForm, handoff_timeout_minutos: event.target.value })}
                  />
                  <small>Minutos antes de escalar a un asesor.</small>
                </label>
                <label className="field-group">
                  <span>Mensaje asesor acepta</span>
                  <input placeholder="Ej. Un asesor tomo la conversacion." value={settingsForm.handoff_mensaje_tomar ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, handoff_mensaje_tomar: event.target.value })} />
                </label>
              </div>
              </section>
              <section className="ai-settings-section-block">
                <div className="ai-settings-section-copy">
                  <h3>Automatizacion</h3>
                  <p>Configura mensajes de traspaso y palabras equivalentes que puede reconocer la IA.</p>
                </div>
              <label className="field-group">
                <span>Mensaje asesor no disponible</span>
                <textarea rows={2} placeholder="Ej. En este momento no hay asesores disponibles. Te responderemos lo antes posible." value={settingsForm.handoff_mensaje_declinar ?? ''} onChange={(event) => setSettingsForm({ ...settingsForm, handoff_mensaje_declinar: event.target.value })} />
              </label>
              <label className="field-group">
                <span>Sinónimos por negocio (JSON)</span>
                <textarea
                  rows={5}
                  placeholder={'{\n  "rotulacion": ["rotulación", "vinil", "rotular"],\n  "diseno": ["diseño", "arte"]\n}'}
                  value={settingsForm.sinonimos_json ?? ''}
                  onChange={(event) => setSettingsForm({ ...settingsForm, sinonimos_json: event.target.value })}
                />
                <small>Usa JSON valido. Sirve para reconocer formas distintas de pedir lo mismo.</small>
              </label>
              </section>
              <div className="ai-settings-sticky-actions">
                <button className="primary-button" disabled={isSaving || !settingsForm.empresa_id} type="submit">
                  <Bot size={18} aria-hidden="true" />
                  {isSaving ? 'Guardando...' : 'Guardar configuracion IA'}
                </button>
              </div>
            </form>
          ) : null}

          {activeSection === 'preview' ? (
            <article className="bot-prompts-panel bot-prompts-preview-panel">
              <header>
                <span><Eye size={20} aria-hidden="true" /></span>
                <div>
                  <h2>Vista previa</h2>
                  <p>Simula una respuesta con la empresa y plantilla seleccionadas.</p>
                </div>
              </header>
              <label className="field-group">
                <span>Mensaje de prueba</span>
                <input placeholder="Ej. Tienes salas grises?" value={previewMessage} onChange={(event) => setPreviewMessage(event.target.value)} />
                <small>La prueba no envia mensajes al cliente; solo muestra como responderia la IA.</small>
              </label>
              <button className="secondary-button" type="button" onClick={handlePreview}>
                <Eye size={18} aria-hidden="true" />
                Probar mensaje
              </button>
              {preview?.tipo_prueba ? (
                <div className="bot-prompts-test-meta">
                  <span>Modo de prueba</span>
                  <strong>{preview.tipo_prueba.replaceAll('_', ' ')}</strong>
                </div>
              ) : null}
              <pre className="bot-prompts-preview-box">{preview?.respuesta ?? 'La respuesta de prueba aparecera aqui.'}</pre>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
