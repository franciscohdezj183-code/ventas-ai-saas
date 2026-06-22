import { useEffect, useState } from 'react';
import { CRM_STATES } from './LeadTable.jsx';

const initialForm = {
  nombre_cliente: '',
  telefono: '',
  interes: '',
  estado: 'NUEVO',
  notas: '',
  empresa_id: ''
};

const formStates = {
  NUEVO: 'Pendiente',
  CONTACTADO: 'Activo',
  COTIZADO: 'Activo cotizado',
  GANADO: 'Activo ganado',
  PERDIDO: 'Inactivo'
};

function validateLead(form, canSelectCompany) {
  const errors = {};

  if (!form.nombre_cliente.trim()) {
    errors.nombre_cliente = 'El nombre del cliente es requerido.';
  }

  if (!form.telefono.trim()) {
    errors.telefono = 'El telefono es requerido.';
  }

  if (!form.interes.trim()) {
    errors.interes = 'El interes es requerido.';
  }

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

export function LeadForm({ canSelectCompany, companies, isSaving, lead, onCancel, onSubmit }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(lead);

  useEffect(() => {
    if (lead) {
      setForm({
        nombre_cliente: lead.nombre_cliente ?? '',
        telefono: lead.telefono ?? '',
        interes: lead.interes ?? '',
        estado: lead.estado === 'EN_PROCESO' ? 'CONTACTADO' : lead.estado ?? 'NUEVO',
        notas: lead.notas ?? '',
        empresa_id: String(lead.empresa_id ?? '')
      });
      return;
    }

    setForm(initialForm);
  }, [lead]);

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

    const nextErrors = validateLead(form, canSelectCompany);
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
    <form className="company-form customer-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid customer-form-grid">
          <label className="field-group" htmlFor="lead-name">
            <span>Nombre completo</span>
            <input
              aria-invalid={Boolean(errors.nombre_cliente)}
              aria-describedby={errors.nombre_cliente ? 'lead-name-error' : undefined}
              id="lead-name"
              name="nombre_cliente"
              onChange={handleChange}
              placeholder="Nombre del cliente"
              type="text"
              value={form.nombre_cliente}
            />
            {errors.nombre_cliente ? <small id="lead-name-error">{errors.nombre_cliente}</small> : null}
          </label>

          <label className="field-group" htmlFor="lead-interest">
            <span>Interes principal</span>
            <input
              aria-invalid={Boolean(errors.interes)}
              aria-describedby={errors.interes ? 'lead-interest-error' : undefined}
              id="lead-interest"
              name="interes"
              onChange={handleChange}
              placeholder="Producto o servicio de interes"
              type="text"
              value={form.interes}
            />
            {errors.interes ? <small id="lead-interest-error">{errors.interes}</small> : null}
          </label>

          <label className="field-group" htmlFor="lead-phone">
            <span>Telefono</span>
            <input
              aria-invalid={Boolean(errors.telefono)}
              aria-describedby={errors.telefono ? 'lead-phone-error' : undefined}
              id="lead-phone"
              name="telefono"
              onChange={handleChange}
              placeholder="+52 55 0000 0000"
              type="tel"
              value={form.telefono}
            />
            {errors.telefono ? <small id="lead-phone-error">{errors.telefono}</small> : null}
          </label>

          <label className="field-group" htmlFor="lead-status">
            <span>Estado</span>
            <select id="lead-status" name="estado" onChange={handleChange} value={form.estado}>
              {CRM_STATES.map((state) => (
                <option key={state} value={state}>{formStates[state]}</option>
              ))}
            </select>
          </label>

          {canSelectCompany ? (
            <label className="field-group" htmlFor="lead-company">
              <span>Empresa</span>
              <select
                aria-invalid={Boolean(errors.empresa_id)}
                aria-describedby={errors.empresa_id ? 'lead-company-error' : undefined}
                id="lead-company"
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
              {errors.empresa_id ? <small id="lead-company-error">{errors.empresa_id}</small> : null}
            </label>
          ) : null}

          <label className="field-group full-field" htmlFor="lead-notes">
            <span>Notas internas</span>
            <textarea
              id="lead-notes"
              name="notas"
              onChange={handleChange}
              placeholder="Seguimiento, acuerdos, objeciones o siguiente paso"
              value={form.notas}
            />
          </label>
      </div>

      <div className="form-actions customer-form-actions">
        {isEditing ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar cliente' : 'Crear cliente'}
        </button>
      </div>
    </form>
  );
}
