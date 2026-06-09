import { useEffect, useState } from 'react';

const initialForm = {
  nombre_cliente: '',
  telefono: '',
  interes: '',
  estado: 'NUEVO',
  empresa_id: ''
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
        estado: lead.estado ?? 'NUEVO',
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
    <form className="company-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="lead-name">
          <span>Nombre cliente</span>
          <input
            id="lead-name"
            name="nombre_cliente"
            onChange={handleChange}
            placeholder="Nombre del cliente"
            type="text"
            value={form.nombre_cliente}
          />
          {errors.nombre_cliente ? <small>{errors.nombre_cliente}</small> : null}
        </label>

        <label className="field-group" htmlFor="lead-phone">
          <span>Telefono</span>
          <input
            id="lead-phone"
            name="telefono"
            onChange={handleChange}
            placeholder="+52 55 0000 0000"
            type="tel"
            value={form.telefono}
          />
          {errors.telefono ? <small>{errors.telefono}</small> : null}
        </label>

        <label className="field-group" htmlFor="lead-interest">
          <span>Interes</span>
          <input
            id="lead-interest"
            name="interes"
            onChange={handleChange}
            placeholder="Producto o servicio de interes"
            type="text"
            value={form.interes}
          />
          {errors.interes ? <small>{errors.interes}</small> : null}
        </label>

        <label className="field-group" htmlFor="lead-status">
          <span>Estado</span>
          <select id="lead-status" name="estado" onChange={handleChange} value={form.estado}>
            <option value="NUEVO">NUEVO</option>
            <option value="EN_PROCESO">EN_PROCESO</option>
            <option value="GANADO">GANADO</option>
            <option value="PERDIDO">PERDIDO</option>
          </select>
        </label>

        {canSelectCompany ? (
          <label className="field-group full-field" htmlFor="lead-company">
            <span>Empresa</span>
            <select
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
            {errors.empresa_id ? <small>{errors.empresa_id}</small> : null}
          </label>
        ) : null}
      </div>

      <div className="form-actions">
        {isEditing ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar lead' : 'Crear lead'}
        </button>
      </div>
    </form>
  );
}
