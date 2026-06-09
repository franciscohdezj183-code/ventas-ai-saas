import { useEffect, useState } from 'react';

const initialForm = {
  nombre: '',
  descripcion: '',
  precio: '',
  duracion: '',
  empresa_id: ''
};

function validateService(form, canSelectCompany) {
  const errors = {};

  if (!form.nombre.trim()) {
    errors.nombre = 'El nombre es requerido.';
  }

  if (Number(form.precio) < 0 || form.precio === '') {
    errors.precio = 'El precio debe ser mayor o igual a 0.';
  }

  if (!Number.isInteger(Number(form.duracion)) || Number(form.duracion) <= 0) {
    errors.duracion = 'La duracion debe ser mayor a 0.';
  }

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

export function ServiceForm({ canSelectCompany, companies, isSaving, onCancel, onSubmit, service }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(service);

  useEffect(() => {
    if (service) {
      setForm({
        nombre: service.nombre ?? '',
        descripcion: service.descripcion ?? '',
        precio: service.precio ?? '',
        duracion: service.duracion ?? '',
        empresa_id: String(service.empresa_id ?? '')
      });
      return;
    }

    setForm(initialForm);
  }, [service]);

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

    const nextErrors = validateService(form, canSelectCompany);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      ...form,
      precio: Number(form.precio),
      duracion: Number(form.duracion),
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined
    });
  }

  return (
    <form className="company-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="service-name">
          <span>Nombre</span>
          <input
            id="service-name"
            name="nombre"
            onChange={handleChange}
            placeholder="Servicio"
            type="text"
            value={form.nombre}
          />
          {errors.nombre ? <small>{errors.nombre}</small> : null}
        </label>

        <label className="field-group" htmlFor="service-price">
          <span>Precio</span>
          <input
            id="service-price"
            min="0"
            name="precio"
            onChange={handleChange}
            step="0.01"
            type="number"
            value={form.precio}
          />
          {errors.precio ? <small>{errors.precio}</small> : null}
        </label>

        <label className="field-group" htmlFor="service-duration">
          <span>Duracion minutos</span>
          <input
            id="service-duration"
            min="1"
            name="duracion"
            onChange={handleChange}
            step="1"
            type="number"
            value={form.duracion}
          />
          {errors.duracion ? <small>{errors.duracion}</small> : null}
        </label>

        {canSelectCompany ? (
          <label className="field-group" htmlFor="service-company">
            <span>Empresa</span>
            <select
              id="service-company"
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

        <label className="field-group full-field" htmlFor="service-description">
          <span>Descripcion</span>
          <input
            id="service-description"
            name="descripcion"
            onChange={handleChange}
            placeholder="Descripcion del servicio"
            type="text"
            value={form.descripcion}
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
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar servicio' : 'Crear servicio'}
        </button>
      </div>
    </form>
  );
}
