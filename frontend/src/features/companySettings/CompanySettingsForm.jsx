import { useEffect, useState } from 'react';
import {
  Bot,
  Clock,
  CreditCard,
  MapPin,
  MessageSquare,
  PackageCheck,
  Phone,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles
} from 'lucide-react';

const initialForm = {
  empresa_id: '',
  nombre_bot: '',
  tono_respuesta: '',
  mensaje_bienvenida: '',
  mensaje_fuera_horario: '',
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

function SettingsSection({ children, description, icon: Icon, title }) {
  return (
    <section className="settings-section">
      <header>
        <span>
          <Icon size={19} aria-hidden="true" />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function SettingSwitch({ checked, description, icon: Icon, id, label, name, onChange }) {
  return (
    <label className="settings-switch" htmlFor={id}>
      <input checked={checked} id={id} name={name} onChange={onChange} type="checkbox" />
      <span className="settings-switch-control" aria-hidden="true" />
      <span className="settings-switch-copy">
        <strong>
          <Icon size={18} aria-hidden="true" />
          {label}
        </strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

export function CompanySettingsForm({
  canSelectCompany,
  companies,
  isSaving,
  onDelete,
  onCompanyChange,
  onSubmit,
  settings
}) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(toFormValue(settings));
    setErrors({});
  }, [settings]);

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

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateSettings(form, canSelectCompany);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      ...form,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined
    });
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit} noValidate>
      <div className="settings-form-grid">
        <div className="settings-form-main">
          <SettingsSection
            description="Elige la empresa y define la identidad que usara el asistente."
            icon={Bot}
            title="Informacion general"
          >
            <div className="form-grid">
              {canSelectCompany ? (
                <label className="field-group full-field" htmlFor="settings-company">
                  <span>Empresa</span>
                  <select id="settings-company" name="empresa_id" onChange={handleChange} value={form.empresa_id}>
                    <option value="">Selecciona una empresa</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.empresa_id ? <small>{errors.empresa_id}</small> : null}
                </label>
              ) : null}

              <label className="field-group" htmlFor="settings-bot-name">
                <span>Nombre del bot</span>
                <input
                  id="settings-bot-name"
                  name="nombre_bot"
                  onChange={handleChange}
                  placeholder="Asistente Nexus IA"
                  type="text"
                  value={form.nombre_bot}
                />
              </label>

              <label className="field-group" htmlFor="settings-tone">
                <span>Tono de respuesta</span>
                <input
                  id="settings-tone"
                  name="tono_respuesta"
                  onChange={handleChange}
                  placeholder="Cercano, profesional, breve"
                  type="text"
                  value={form.tono_respuesta}
                />
              </label>
            </div>
          </SettingsSection>

          <SettingsSection
            description="Datos que el bot puede usar cuando el cliente pide ubicacion o contacto."
            icon={Phone}
            title="Datos de contacto"
          >
            <div className="form-grid">
              <label className="field-group" htmlFor="settings-owner-phone">
                <span>Telefono dueno</span>
                <input
                  id="settings-owner-phone"
                  name="telefono_dueno"
                  onChange={handleChange}
                  placeholder="+52 55 0000 0000"
                  type="tel"
                  value={form.telefono_dueno}
                />
              </label>

              <label className="field-group" htmlFor="settings-address">
                <span>Direccion</span>
                <input
                  id="settings-address"
                  name="direccion"
                  onChange={handleChange}
                  placeholder="Direccion publica para clientes"
                  type="text"
                  value={form.direccion}
                />
              </label>
            </div>
          </SettingsSection>

          <SettingsSection
            description="Indica cuando atiende la empresa para ordenar respuestas automaticas."
            icon={Clock}
            title="Horarios"
          >
            <label className="field-group" htmlFor="settings-hours">
              <span>Horario atencion</span>
              <textarea
                id="settings-hours"
                name="horario_atencion"
                onChange={handleChange}
                placeholder="Lunes a viernes 9:00 a 18:00"
                value={form.horario_atencion}
              />
            </label>
          </SettingsSection>

          <SettingsSection
            description="Mensajes base para abrir conversaciones y responder fuera de horario."
            icon={MessageSquare}
            title="Mensajes del bot"
          >
            <div className="settings-message-grid">
              <label className="field-group" htmlFor="settings-welcome">
                <span>Mensaje bienvenida</span>
                <textarea
                  id="settings-welcome"
                  name="mensaje_bienvenida"
                  onChange={handleChange}
                  placeholder="Hola, gracias por escribirnos. Como podemos ayudarte?"
                  value={form.mensaje_bienvenida}
                />
              </label>

              <label className="field-group" htmlFor="settings-after-hours">
                <span>Mensaje fuera de horario</span>
                <textarea
                  id="settings-after-hours"
                  name="mensaje_fuera_horario"
                  onChange={handleChange}
                  placeholder="En este momento estamos fuera de horario, te responderemos pronto."
                  value={form.mensaje_fuera_horario}
                />
              </label>
            </div>
          </SettingsSection>

          <SettingsSection
            description="Aclara zonas, tiempos, condiciones y restricciones de entrega."
            icon={PackageCheck}
            title="Politicas de entrega"
          >
            <label className="field-group" htmlFor="settings-delivery">
              <span>Politica entrega</span>
              <textarea
                id="settings-delivery"
                name="politica_entrega"
                onChange={handleChange}
                placeholder="Zonas, tiempos y condiciones de entrega"
                value={form.politica_entrega}
              />
            </label>
          </SettingsSection>

          <SettingsSection
            description="Define metodos de pago, anticipos, facturacion y condiciones."
            icon={CreditCard}
            title="Politicas de pago"
          >
            <label className="field-group" htmlFor="settings-payments">
              <span>Politica pagos</span>
              <textarea
                id="settings-payments"
                name="politica_pagos"
                onChange={handleChange}
                placeholder="Metodos de pago, anticipos y facturacion"
                value={form.politica_pagos}
              />
            </label>
          </SettingsSection>
        </div>

        <aside className="settings-aside">
          <section className="settings-preview-card">
            <div className="settings-preview-header">
              <span>
                <Sparkles size={19} aria-hidden="true" />
              </span>
              <div>
                <h2>Vista previa</h2>
                <p>Mensaje inicial que vera el cliente.</p>
              </div>
            </div>
            <div className="settings-chat-preview">
              <small>{form.nombre_bot || 'Asistente'}</small>
              <p>
                {form.mensaje_bienvenida ||
                  'Hola, gracias por escribirnos. Como podemos ayudarte?'}
              </p>
            </div>
            <div className="settings-preview-meta">
              <MapPin size={16} aria-hidden="true" />
              <span>{form.direccion || 'Direccion no configurada'}</span>
            </div>
          </section>

          <SettingsSection
            description="Controla si el asistente responde y si WhatsApp participa en la atencion."
            icon={Smartphone}
            title="IA y WhatsApp"
          >
            <div className="settings-switch-list">
              <SettingSwitch
                checked={form.activo_ia}
                description="Permite que el bot responda automaticamente segun la configuracion."
                icon={MessageSquare}
                id="settings-ai-active"
                label="IA activa"
                name="activo_ia"
                onChange={handleChange}
              />
              <SettingSwitch
                checked={form.activo_whatsapp}
                description="Habilita el canal WhatsApp para la empresa seleccionada."
                icon={Smartphone}
                id="settings-whatsapp-active"
                label="WhatsApp activo"
                name="activo_whatsapp"
                onChange={handleChange}
              />
            </div>
          </SettingsSection>
        </aside>
      </div>

      <div className="settings-save-bar">
        <div>
          <strong>{settings?.empresa_nombre ?? 'Configuracion de empresa'}</strong>
          <span>{settings?.empresa_tipo_negocio ?? 'Preferencias comerciales y automaticas'}</span>
        </div>
        <div>
          {settings?.fecha_creacion ? (
            <button className="secondary-button" disabled={isSaving} onClick={() => onDelete(form)} type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Restablecer
            </button>
          ) : null}
          <button className="primary-button" disabled={isSaving || (canSelectCompany && !form.empresa_id)} type="submit">
            <Save size={18} aria-hidden="true" />
            {isSaving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
      </div>
    </form>
  );
}
