import { useEffect, useState } from 'react';

const initialForm = {
  telefono_cliente: '',
  mensaje: '',
  respuesta: '',
  fecha: '',
  empresa_id: ''
};

function toDateTimeLocal(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 16);
}

function validateConversation(form, canSelectCompany) {
  const errors = {};

  if (!form.telefono_cliente.trim()) {
    errors.telefono_cliente = 'El telefono es requerido.';
  }

  if (!form.mensaje.trim()) {
    errors.mensaje = 'El mensaje es requerido.';
  }

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

export function ConversationForm({
  canSelectCompany,
  companies,
  conversation,
  isSaving,
  onCancel,
  onSubmit
}) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(conversation);

  useEffect(() => {
    if (conversation) {
      setForm({
        telefono_cliente: conversation.telefono_cliente ?? '',
        mensaje: conversation.mensaje ?? '',
        respuesta: conversation.respuesta ?? '',
        fecha: toDateTimeLocal(conversation.fecha),
        empresa_id: String(conversation.empresa_id ?? '')
      });
      return;
    }

    setForm(initialForm);
  }, [conversation]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: ''
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateConversation(form, canSelectCompany);
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
    <form className="company-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="conversation-phone">
          <span>Telefono cliente</span>
          <input
            id="conversation-phone"
            name="telefono_cliente"
            onChange={handleChange}
            placeholder="+52 55 0000 0000"
            type="tel"
            value={form.telefono_cliente}
          />
          {errors.telefono_cliente ? <small>{errors.telefono_cliente}</small> : null}
        </label>

        <label className="field-group" htmlFor="conversation-date">
          <span>Fecha</span>
          <input
            id="conversation-date"
            name="fecha"
            onChange={handleChange}
            type="datetime-local"
            value={form.fecha}
          />
        </label>

        {canSelectCompany ? (
          <label className="field-group full-field" htmlFor="conversation-company">
            <span>Empresa</span>
            <select
              id="conversation-company"
              name="empresa_id"
              onChange={handleChange}
              value={form.empresa_id}
            >
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

        <label className="field-group full-field" htmlFor="conversation-message">
          <span>Mensaje</span>
          <textarea
            id="conversation-message"
            name="mensaje"
            onChange={handleChange}
            placeholder="Mensaje del cliente"
            value={form.mensaje}
          />
          {errors.mensaje ? <small>{errors.mensaje}</small> : null}
        </label>

        <label className="field-group full-field" htmlFor="conversation-response">
          <span>Respuesta</span>
          <textarea
            id="conversation-response"
            name="respuesta"
            onChange={handleChange}
            placeholder="Respuesta enviada"
            value={form.respuesta}
          />
        </label>
      </div>

      <div className="form-actions">
        {isEditing ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar conversacion' : 'Guardar conversacion'}
        </button>
      </div>
    </form>
  );
}
