import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Globe2,
  HelpCircle,
  KeyRound,
  MapPin,
  MessageSquare,
  PackageCheck,
  Palette,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { Can } from '../../components/Can.jsx';

const initialForm = {
  empresa_id: '',
  nombre_bot: '',
  tono_respuesta: '',
  mensaje_bienvenida: '',
  mensaje_fuera_horario: '',
  instrucciones_negocio: '',
  temas_bloqueados: '',
  faq_personalizada: '',
  auto_pedidos: true,
  envio_imagenes: true,
  fallback_message: '',
  telefono_dueno: '',
  direccion: '',
  horario_atencion: '',
  politica_entrega: '',
  politica_pagos: '',
  activo_ia: true,
  activo_whatsapp: true
};

function toFormValue(settings) {
  return {
    empresa_id: String(settings?.empresa_id ?? ''),
    nombre_bot: settings?.nombre_bot ?? '',
    tono_respuesta: settings?.tono_respuesta ?? '',
    mensaje_bienvenida: settings?.mensaje_bienvenida ?? '',
    mensaje_fuera_horario: settings?.mensaje_fuera_horario ?? '',
    instrucciones_negocio: settings?.instrucciones_negocio ?? '',
    temas_bloqueados: settings?.temas_bloqueados ?? '',
    faq_personalizada: settings?.faq_personalizada ?? '',
    auto_pedidos: settings?.auto_pedidos ?? true,
    envio_imagenes: settings?.envio_imagenes ?? true,
    fallback_message: settings?.fallback_message ?? '',
    telefono_dueno: settings?.telefono_dueno ?? '',
    direccion: settings?.direccion ?? settings?.empresa_direccion ?? '',
    horario_atencion: settings?.horario_atencion ?? '',
    politica_entrega: settings?.politica_entrega ?? '',
    politica_pagos: settings?.politica_pagos ?? '',
    activo_ia: settings?.activo_ia ?? true,
    activo_whatsapp: settings?.activo_whatsapp ?? true
  };
}

function validateSettings(form, canSelectCompany) {
  const errors = {};

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

const settingsCatalog = [
  {
    id: 'empresa',
    icon: Building2,
    title: 'Empresa',
    description: 'Informacion del negocio',
    keywords: ['empresa', 'negocio', 'nombre', 'contacto', 'telefono', 'direccion', 'logo', 'horario', 'rfc'],
    help: ['Mantiene la identidad operativa del negocio.', 'Esta informacion puede aparecer en respuestas al cliente.', 'El logo no tiene campo editable en este modulo.']
  },
  {
    id: 'ia',
    icon: Sparkles,
    title: 'Inteligencia Artificial',
    description: 'Comportamiento basico',
    keywords: ['ia', 'inteligencia', 'openai', 'asistente', 'tono', 'prompt', 'faq', 'restricciones'],
    help: ['Aqui solo vive la configuracion basica de atencion automatizada.', 'Plantillas, prompts avanzados y pruebas viven en Configuracion IA.', 'Usa microcopy claro para evitar respuestas ambiguas.']
  },
  {
    id: 'whatsapp',
    icon: Smartphone,
    title: 'WhatsApp',
    description: 'Canal y sesiones',
    keywords: ['whatsapp', 'numero', 'canal', 'sesion', 'imagenes', 'pedidos'],
    help: ['Activa o pausa el canal para esta empresa.', 'La conexion tecnica y el QR viven en el modulo WhatsApp.', 'El numero mostrado sale de la configuracion de contacto.']
  },
  {
    id: 'seguridad',
    icon: ShieldCheck,
    title: 'Seguridad',
    description: 'Usuarios y acceso',
    keywords: ['seguridad', 'usuarios', 'roles', 'permisos', '2fa', 'password', 'sesiones'],
    help: ['Los roles y accesos se administran en Usuarios.', 'No se inventan campos que no existen en backend.', 'Esta pagina solo muestra el estado disponible.']
  },
  {
    id: 'notificaciones',
    icon: Bell,
    title: 'Notificaciones',
    description: 'Alertas y mensajes',
    keywords: ['notificaciones', 'correo', 'push', 'recordatorio', 'mensaje', 'alerta'],
    help: ['Actualmente los mensajes configurables son los textos operativos.', 'Correo, push y recordatorios no tienen campos en este endpoint.', 'Usa mensajes breves y accionables.']
  },
  {
    id: 'facturacion',
    icon: CreditCard,
    title: 'Facturacion',
    description: 'Plan y pagos',
    keywords: ['facturacion', 'billing', 'pago', 'plan', 'facturas', 'renovacion', 'metodo'],
    help: ['Las politicas de pago ayudan a responder condiciones comerciales.', 'Planes y suscripciones viven en su modulo dedicado.', 'No se muestran datos de tarjeta aqui.']
  },
  {
    id: 'apariencia',
    icon: Palette,
    title: 'Apariencia',
    description: 'Tema e idioma',
    keywords: ['apariencia', 'tema', 'idioma', 'oscuro', 'claro', 'zona horaria'],
    help: ['Tema claro/oscuro se controla desde la interfaz global.', 'Idioma y zona horaria no tienen campos en este endpoint.', 'Se muestra como configuracion no disponible.']
  },
  {
    id: 'integraciones',
    icon: PlugZap,
    title: 'Integraciones',
    description: 'Servicios externos',
    keywords: ['integraciones', 'api', 'webhook', 'openai', 'whatsapp', 'servicios'],
    help: ['OpenAI avanzado vive en Configuracion IA.', 'WhatsApp tecnico vive en el modulo WhatsApp.', 'Aqui se resume el estado operativo.']
  },
  {
    id: 'sistema',
    icon: SlidersHorizontal,
    title: 'Sistema',
    description: 'Configuraciones avanzadas',
    keywords: ['sistema', 'avanzado', 'estado', 'resumen', 'operacion'],
    help: ['Resumen del estado actual de la configuracion.', 'No se exponen campos tecnicos internos.', 'Evita cambios accidentales de operacion.']
  }
];

function serializeForm(form) {
  return JSON.stringify(form);
}

function PlatformHero({ isDirty, isSaving, onRefresh, onReset, settings }) {
  return (
    <section className="platform-settings-hero">
      <div className="platform-settings-hero-copy">
        <span>
          <SlidersHorizontal size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Settings center</p>
          <h1>Configuracion</h1>
          <p>Administra todas las opciones de tu plataforma desde un solo lugar.</p>
        </div>
      </div>
      <div className="platform-settings-hero-actions">
        {isDirty ? <em>Tienes cambios sin guardar.</em> : <em>Todo guardado.</em>}
        <button className="platform-settings-button ghost" onClick={onRefresh} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Actualizar
        </button>
        <Can role="owner">
          {settings?.fecha_creacion ? (
            <button className="platform-settings-button ghost" disabled={isSaving} onClick={onReset} type="button">
              <RotateCcw size={16} aria-hidden="true" />
              Restaurar
            </button>
          ) : null}
          <button className="platform-settings-button primary" disabled={isSaving} type="submit">
            <Save size={16} aria-hidden="true" />
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </Can>
      </div>
    </section>
  );
}

function GlobalSettingsSearch({ onChange, query, resultCount }) {
  return (
    <label className="platform-settings-search" htmlFor="platform-settings-search">
      <Search size={18} aria-hidden="true" />
      <input
        id="platform-settings-search"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar configuracion: WhatsApp, idioma, OpenAI, pagos..."
        type="search"
        value={query}
      />
      <strong>{resultCount} resultados</strong>
    </label>
  );
}

function SettingsSidebar({ activeId, changedFields, items, onSelect }) {
  return (
    <aside className="platform-settings-sidebar" aria-label="Navegacion de configuracion">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeId;
        const hasChanges = changedFields.some((field) => item.fields?.includes(field));

        return (
          <button
            aria-current={isActive ? 'page' : undefined}
            className={isActive ? 'active' : ''}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <span className="platform-settings-sidebar-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="platform-settings-sidebar-copy">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            {hasChanges ? <i aria-label="Tiene cambios" /> : <ChevronRight size={16} aria-hidden="true" />}
          </button>
        );
      })}
    </aside>
  );
}

function SettingsField({ as = 'input', children, error, help, id, label, ...props }) {
  const Component = as;

  return (
    <label className={`platform-settings-field ${props.className ?? ''}`} htmlFor={id}>
      <span>{label}</span>
      {as === 'input' ? (
        <input id={id} {...props} />
      ) : (
        <Component id={id} {...props}>
          {children}
        </Component>
      )}
      {error ? <small className="error">{error}</small> : help ? <small>{help}</small> : null}
    </label>
  );
}

function SettingsSwitch({ checked, description, icon: Icon, id, label, name, onChange }) {
  return (
    <label className="platform-settings-switch" htmlFor={id}>
      <input checked={checked} id={id} name={name} onChange={onChange} type="checkbox" />
      <span aria-hidden="true" />
      <div>
        <strong>
          <Icon size={17} aria-hidden="true" />
          {label}
        </strong>
        <small>{description}</small>
      </div>
    </label>
  );
}

function SettingsGroup({ children, description, icon: Icon, title }) {
  return (
    <section className="platform-settings-group">
      <header>
        <span>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </header>
      <div className="platform-settings-group-body">{children}</div>
    </section>
  );
}

function ReadOnlyGrid({ items }) {
  return (
    <div className="platform-settings-readonly-grid">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.help ? <small>{item.help}</small> : null}
        </div>
      ))}
    </div>
  );
}

function EmptyConfig({ title }) {
  return (
    <section className="platform-settings-empty">
      <span>
        <HelpCircle size={22} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>No hay campos editables para esta categoria en el endpoint actual.</p>
    </section>
  );
}

function EmpresaPage({ canSelectCompany, companies, errors, form, onChange }) {
  return (
    <>
      <SettingsGroup
        description="Define la entidad sobre la que se aplican estos ajustes."
        icon={Building2}
        title="Informacion principal"
      >
        <div className="platform-settings-grid">
          {canSelectCompany ? (
            <SettingsField
              as="select"
              className="wide"
              error={errors.empresa_id}
              help="Selecciona la empresa que quieres administrar."
              id="settings-company"
              label="Empresa"
              name="empresa_id"
              onChange={onChange}
              value={form.empresa_id}
            >
              <option value="">Selecciona una empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </SettingsField>
          ) : null}
          <SettingsField
            help="Nombre publico o interno del asistente de esta empresa."
            id="settings-bot-name"
            label="Nombre del bot"
            name="nombre_bot"
            onChange={onChange}
            placeholder="Asistente Nexus IA"
            type="text"
            value={form.nombre_bot}
          />
          <SettingsField
            help="Telefono principal para contacto o referencia."
            id="settings-owner-phone"
            label="Telefono dueno"
            name="telefono_dueno"
            onChange={onChange}
            placeholder="+52 55 0000 0000"
            type="tel"
            value={form.telefono_dueno}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup
        description="Datos que ayudan al cliente a ubicar y contactar al negocio."
        icon={MapPin}
        title="Direccion y horario"
      >
        <div className="platform-settings-grid">
          <SettingsField
            className="wide"
            help="Direccion publica que puede compartirse con clientes."
            id="settings-address"
            label="Direccion"
            name="direccion"
            onChange={onChange}
            placeholder="Direccion publica para clientes"
            type="text"
            value={form.direccion}
          />
          <SettingsField
            as="textarea"
            className="wide"
            help="Impacta las respuestas fuera de horario."
            id="settings-hours"
            label="Horario atencion"
            name="horario_atencion"
            onChange={onChange}
            placeholder="Lunes a viernes 9:00 a 18:00"
            value={form.horario_atencion}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup
        description="Este modulo aun no recibe archivo de logo desde el backend."
        icon={UploadCloud}
        title="Logo"
      >
        <EmptyConfig title="Logo no disponible" />
      </SettingsGroup>
    </>
  );
}

function IAPage({ form, onChange }) {
  return (
    <>
      <SettingsGroup
        description="Esta configuracion permite que la atencion automatizada responda conversaciones de clientes."
        icon={Sparkles}
        title="Estado y personalidad"
      >
        <div className="platform-settings-stack">
          <Can role="owner">
            <SettingsSwitch
              checked={form.activo_ia}
              description="Permite respuestas automaticas usando los datos configurados."
              icon={Bot}
              id="settings-ai-active"
              label="Atencion automatizada"
              name="activo_ia"
              onChange={onChange}
            />
          </Can>
          <SettingsField
            help="Para prompts, plantillas y pruebas usa el modulo Configuracion IA."
            id="settings-tone"
            label="Tono de respuesta"
            name="tono_respuesta"
            onChange={onChange}
            placeholder="Cercano, profesional, breve"
            type="text"
            value={form.tono_respuesta}
          />
        </div>
      </SettingsGroup>

      <SettingsGroup
        description="Informacion base para orientar respuestas sin entrar al editor avanzado de IA."
        icon={MessageSquare}
        title="Conocimiento base"
      >
        <div className="platform-settings-grid">
          <SettingsField
            as="textarea"
            help="Reglas comerciales, condiciones especiales y contexto del negocio."
            id="settings-business-instructions"
            label="Instrucciones del negocio"
            name="instrucciones_negocio"
            onChange={onChange}
            placeholder="Reglas comerciales, estilo de atencion..."
            value={form.instrucciones_negocio}
          />
          <SettingsField
            as="textarea"
            help="Temas que deben evitarse o escalarse."
            id="settings-blocked-topics"
            label="Temas bloqueados"
            name="temas_bloqueados"
            onChange={onChange}
            placeholder="Un tema por linea o separado por comas"
            value={form.temas_bloqueados}
          />
          <SettingsField
            as="textarea"
            help="Preguntas frecuentes para respuestas consistentes."
            id="settings-custom-faq"
            label="FAQ personalizada"
            name="faq_personalizada"
            onChange={onChange}
            placeholder="Pregunta: respuesta"
            value={form.faq_personalizada}
          />
          <SettingsField
            as="textarea"
            help="Mensaje seguro si la automatizacion no puede responder."
            id="settings-fallback"
            label="Mensaje de respaldo"
            name="fallback_message"
            onChange={onChange}
            placeholder="Mensaje cuando no se debe o no se puede responder"
            value={form.fallback_message}
          />
        </div>
      </SettingsGroup>
    </>
  );
}

function WhatsAppPage({ form, onChange }) {
  return (
    <>
      <SettingsGroup
        description="Controla la participacion de WhatsApp en la operacion de esta empresa."
        icon={Smartphone}
        title="Conexion operativa"
      >
        <ReadOnlyGrid
          items={[
            { label: 'Estado', value: form.activo_whatsapp ? 'Activo' : 'Pausado' },
            { label: 'Numero conectado', value: form.telefono_dueno || 'No configurado' },
            { label: 'Sesion', value: form.activo_whatsapp ? 'Habilitada' : 'Pausada' }
          ]}
        />
        <Can role="owner">
          <SettingsSwitch
            checked={form.activo_whatsapp}
            description="Habilita el canal WhatsApp para la empresa seleccionada."
            icon={Smartphone}
            id="settings-whatsapp-active"
            label="WhatsApp activo"
            name="activo_whatsapp"
            onChange={onChange}
          />
        </Can>
      </SettingsGroup>

      <SettingsGroup
        description="Automatizaciones disponibles para la atencion por WhatsApp."
        icon={PackageCheck}
        title="Automatizaciones"
      >
        <div className="platform-settings-grid">
          <Can role="owner">
            <SettingsSwitch
              checked={form.auto_pedidos}
              description="Permite automatizar intenciones de pedido cuando el flujo este disponible."
              icon={PackageCheck}
              id="settings-auto-orders"
              label="Auto pedidos"
              name="auto_pedidos"
              onChange={onChange}
            />
            <SettingsSwitch
              checked={form.envio_imagenes}
              description="Permite enviar imagenes de productos cuando existan."
              icon={Smartphone}
              id="settings-send-images"
              label="Envio de imagenes"
              name="envio_imagenes"
              onChange={onChange}
            />
          </Can>
        </div>
      </SettingsGroup>
    </>
  );
}

function NotificationsPage({ form, onChange }) {
  return (
    <SettingsGroup
      description="Mensajes que el cliente puede recibir durante la atencion."
      icon={Bell}
      title="Mensajes operativos"
    >
      <div className="platform-settings-grid">
        <SettingsField
          as="textarea"
          help="Primer mensaje que vera el cliente."
          id="settings-welcome"
          label="Mensaje bienvenida"
          name="mensaje_bienvenida"
          onChange={onChange}
          placeholder="Hola, gracias por escribirnos. Como podemos ayudarte?"
          value={form.mensaje_bienvenida}
        />
        <SettingsField
          as="textarea"
          help="Se usa cuando el cliente escribe fuera de horario."
          id="settings-after-hours"
          label="Mensaje fuera de horario"
          name="mensaje_fuera_horario"
          onChange={onChange}
          placeholder="En este momento estamos fuera de horario..."
          value={form.mensaje_fuera_horario}
        />
      </div>
    </SettingsGroup>
  );
}

function BillingPage({ form, onChange }) {
  return (
    <>
      <Can permission="billing.view" fallback={<EmptyConfig title="Facturacion no disponible" />}>
        <SettingsGroup
          description="Define metodos de pago, anticipos, facturacion y condiciones."
          icon={CreditCard}
          title="Politicas de pago"
        >
          <SettingsField
            as="textarea"
            help="Impacta respuestas sobre pagos, anticipos y facturacion."
            id="settings-payments"
            label="Politica pagos"
            name="politica_pagos"
            onChange={onChange}
            placeholder="Metodos de pago, anticipos y facturacion"
            value={form.politica_pagos}
          />
        </SettingsGroup>
      </Can>
      <SettingsGroup
        description="Planes, metodo de pago y renovacion viven en Suscripciones."
        icon={CreditCard}
        title="Plan y renovacion"
      >
        <EmptyConfig title="Plan gestionado en Suscripciones" />
      </SettingsGroup>
    </>
  );
}

function SecurityPage() {
  return (
    <SettingsGroup
      description="La seguridad depende de roles, permisos y sesiones de usuario."
      icon={KeyRound}
      title="Accesos"
    >
      <ReadOnlyGrid
        items={[
          { label: 'Usuarios', value: 'Gestionado en Usuarios' },
          { label: 'Roles', value: 'Permisos existentes' },
          { label: '2FA', value: 'Sin campo editable' },
          { label: 'Sesiones', value: 'Sin campo editable' }
        ]}
      />
    </SettingsGroup>
  );
}

function AppearancePage() {
  return (
    <SettingsGroup
      description="Preferencias visuales disponibles en la plataforma."
      icon={Palette}
      title="Tema e idioma"
    >
      <ReadOnlyGrid
        items={[
          { label: 'Modo claro', value: 'Compatible' },
          { label: 'Modo oscuro', value: 'Compatible' },
          { label: 'Idioma', value: 'Sin campo editable' },
          { label: 'Zona horaria', value: 'Sin campo editable' }
        ]}
      />
    </SettingsGroup>
  );
}

function IntegrationsPage({ form }) {
  return (
    <SettingsGroup
      description="Servicios externos relacionados con esta configuracion."
      icon={PlugZap}
      title="Servicios conectados"
    >
      <ReadOnlyGrid
        items={[
          { label: 'OpenAI / IA', value: form.activo_ia ? 'Operativo' : 'Pausado', help: 'Avanzado en Configuracion IA' },
          { label: 'WhatsApp', value: form.activo_whatsapp ? 'Operativo' : 'Pausado', help: 'Conexion en modulo WhatsApp' },
          { label: 'API', value: 'Sin campo editable' },
          { label: 'Webhooks', value: 'Sin campo editable' }
        ]}
      />
    </SettingsGroup>
  );
}

function SystemPage({ form, onChange }) {
  return (
    <>
      <SettingsGroup
        description="Reglas operativas generales para entrega y servicio."
        icon={PackageCheck}
        title="Politicas de entrega"
      >
        <SettingsField
          as="textarea"
          help="Zonas, tiempos y condiciones de entrega."
          id="settings-delivery"
          label="Politica entrega"
          name="politica_entrega"
          onChange={onChange}
          value={form.politica_entrega}
        />
      </SettingsGroup>
      <SettingsGroup
        description="Vista resumida del estado actual."
        icon={SlidersHorizontal}
        title="Resumen del sistema"
      >
        <ReadOnlyGrid
          items={[
            { label: 'Empresa', value: form.empresa_id ? `ID ${form.empresa_id}` : 'No seleccionada' },
            { label: 'Atencion automatizada', value: form.activo_ia ? 'Activa' : 'Pausada' },
            { label: 'WhatsApp', value: form.activo_whatsapp ? 'Activo' : 'Pausado' }
          ]}
        />
      </SettingsGroup>
    </>
  );
}

function CategoryContent({ activeId, canSelectCompany, companies, errors, form, onChange }) {
  if (activeId === 'empresa') {
    return <EmpresaPage canSelectCompany={canSelectCompany} companies={companies} errors={errors} form={form} onChange={onChange} />;
  }

  if (activeId === 'ia') {
    return <IAPage form={form} onChange={onChange} />;
  }

  if (activeId === 'whatsapp') {
    return <WhatsAppPage form={form} onChange={onChange} />;
  }

  if (activeId === 'seguridad') {
    return <SecurityPage />;
  }

  if (activeId === 'notificaciones') {
    return <NotificationsPage form={form} onChange={onChange} />;
  }

  if (activeId === 'facturacion') {
    return <BillingPage form={form} onChange={onChange} />;
  }

  if (activeId === 'apariencia') {
    return <AppearancePage />;
  }

  if (activeId === 'integraciones') {
    return <IntegrationsPage form={form} />;
  }

  return <SystemPage form={form} onChange={onChange} />;
}

function InsightPanel({ activeCategory, form, isDirty, settings }) {
  return (
    <aside className="platform-settings-insights" aria-label="Ayuda de configuracion">
      <section>
        <header>
          <span>
            <HelpCircle size={18} aria-hidden="true" />
          </span>
          <div>
            <h3>Consejos</h3>
            <p>{activeCategory.title}</p>
          </div>
        </header>
        <ul>
          {activeCategory.help.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <header>
          <span>
            <CheckCircle2 size={18} aria-hidden="true" />
          </span>
          <div>
            <h3>Estado</h3>
            <p>{isDirty ? 'Pendiente de guardar' : 'Sin cambios pendientes'}</p>
          </div>
        </header>
        <ReadOnlyGrid
          items={[
            { label: 'Empresa', value: settings?.empresa_nombre ?? 'Sin empresa' },
            { label: 'Actualizacion', value: settings?.fecha_actualizacion ? new Date(settings.fecha_actualizacion).toLocaleDateString('es-MX') : 'Sin registro' },
            { label: 'Automatizacion', value: form.activo_ia ? 'Activa' : 'Pausada' },
            { label: 'WhatsApp', value: form.activo_whatsapp ? 'Activo' : 'Pausado' }
          ]}
        />
      </section>
    </aside>
  );
}

function UnsavedChangesBar({ isDirty, isSaving, onReset }) {
  if (!isDirty) {
    return null;
  }

  return (
    <div className="platform-settings-unsaved" role="status" aria-live="polite">
      <div>
        <strong>Tienes cambios sin guardar.</strong>
        <span>Guarda para aplicar la configuracion o restaura los valores actuales.</span>
      </div>
      <div>
        <button className="platform-settings-button ghost" disabled={isSaving} onClick={onReset} type="button">
          Descartar
        </button>
        <button className="platform-settings-button primary" disabled={isSaving} type="submit">
          <Save size={16} aria-hidden="true" />
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

export function CompanySettingsForm({
  canSelectCompany,
  companies,
  isSaving,
  onDelete,
  onCompanyChange,
  onRefresh,
  onSubmit,
  settings
}) {
  const [activeId, setActiveId] = useState('empresa');
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(initialForm);
  const [initialSnapshot, setInitialSnapshot] = useState(serializeForm(initialForm));
  const [query, setQuery] = useState('');

  useEffect(() => {
    const nextForm = toFormValue(settings);
    setForm(nextForm);
    setInitialSnapshot(serializeForm(nextForm));
    setErrors({});
  }, [settings]);

  const changedFields = useMemo(() => {
    const initialValue = JSON.parse(initialSnapshot);
    return Object.keys(form).filter((key) => form[key] !== initialValue[key]);
  }, [form, initialSnapshot]);

  const isDirty = changedFields.length > 0;

  const catalog = useMemo(() => {
    return settingsCatalog.map((item) => ({
      ...item,
      fields:
        item.id === 'empresa'
          ? ['empresa_id', 'nombre_bot', 'telefono_dueno', 'direccion', 'horario_atencion']
          : item.id === 'ia'
            ? ['activo_ia', 'tono_respuesta', 'instrucciones_negocio', 'temas_bloqueados', 'faq_personalizada', 'fallback_message']
            : item.id === 'whatsapp'
              ? ['activo_whatsapp', 'auto_pedidos', 'envio_imagenes']
              : item.id === 'notificaciones'
                ? ['mensaje_bienvenida', 'mensaje_fuera_horario']
                : item.id === 'facturacion'
                  ? ['politica_pagos']
                  : item.id === 'sistema'
                    ? ['politica_entrega']
                    : []
    }));
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return catalog;
    }

    return catalog.filter((item) => {
      return (
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [catalog, query]);

  useEffect(() => {
    if (!query.trim() || !visibleItems.length) {
      return;
    }

    if (!visibleItems.some((item) => item.id === activeId)) {
      setActiveId(visibleItems[0].id);
    }
  }, [activeId, query, visibleItems]);

  const activeCategory = catalog.find((item) => item.id === activeId) ?? catalog[0];
  const ActiveCategoryIcon = activeCategory.icon;

  function handleChange(event) {
    const { checked, name, type, value } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: ''
    }));

    if (name === 'empresa_id') {
      onCompanyChange(value);
    }
  }

  function handleDiscard() {
    const nextForm = JSON.parse(initialSnapshot);
    setForm(nextForm);
    setErrors({});
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateSettings(form, canSelectCompany);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setActiveId('empresa');
      return;
    }

    onSubmit({
      ...form,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined
    });
  }

  return (
    <form className="platform-settings-shell" onSubmit={handleSubmit} noValidate>
      <PlatformHero
        isDirty={isDirty}
        isSaving={isSaving}
        onRefresh={onRefresh}
        onReset={() => onDelete(form)}
        settings={settings}
      />

      <GlobalSettingsSearch query={query} onChange={setQuery} resultCount={visibleItems.length} />

      <section className="platform-settings-layout">
        <SettingsSidebar activeId={activeId} changedFields={changedFields} items={visibleItems} onSelect={setActiveId} />

        <main className="platform-settings-content" aria-live="polite">
          <header className="platform-settings-content-header">
            <span>
              <ActiveCategoryIcon size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Categoria</p>
              <h2>{activeCategory.title}</h2>
              <p>{activeCategory.description}</p>
            </div>
          </header>
          {visibleItems.length ? (
            <CategoryContent
              activeId={activeCategory.id}
              canSelectCompany={canSelectCompany}
              companies={companies}
              errors={errors}
              form={form}
              onChange={handleChange}
            />
          ) : (
            <EmptyConfig title="Sin resultados" />
          )}
        </main>

        <InsightPanel activeCategory={activeCategory} form={form} isDirty={isDirty} settings={settings} />
      </section>

      <UnsavedChangesBar isDirty={isDirty} isSaving={isSaving} onReset={handleDiscard} />
    </form>
  );
}
