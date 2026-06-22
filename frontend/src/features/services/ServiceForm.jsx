import { useEffect, useState } from 'react';

const initialForm = {
  nombre: '',
  descripcion: '',
  precio: '',
  tipo_precio: 'FIJO',
  duracion: '',
  categoria_id: '',
  estado: 'ACTIVO',
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

export function ServiceForm({ canSelectCompany, categories = [], companies = [], isSaving, onCancel, onSubmit, service }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(service);

  useEffect(() => {
    setErrors({});

    if (service) {
      setForm({
        nombre: service.nombre ?? '',
        descripcion: service.descripcion ?? '',
        precio: service.precio ?? '',
        tipo_precio: service.tipo_precio ?? 'FIJO',
        duracion: service.duracion ?? '',
        categoria_id: String(service.categoria_id ?? ''),
        estado: service.estado ?? 'ACTIVO',
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
      tipo_precio: form.tipo_precio,
      duracion: Number(form.duracion),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : undefined,
      estado: form.estado,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined
    });
  }

  return (
    <form className="company-form service-form" onSubmit={handleSubmit} noValidate>
      <div className="service-form-sections">
        <section className="service-form-section">
          <div>
            <h3>Informacion basica</h3>
            <p>Datos visibles para identificar y explicar el servicio.</p>
          </div>
          <div className="form-grid service-form-grid">
            <label className="field-group" htmlFor="service-name">
              <span>Nombre</span>
              <input
                id="service-name"
                name="nombre"
                onChange={handleChange}
                placeholder="Ej. Instalacion, consultoria, mantenimiento"
                type="text"
                value={form.nombre}
              />
              {errors.nombre ? <small>{errors.nombre}</small> : null}
            </label>

            <label className="field-group" htmlFor="service-category">
              <span>Categoria</span>
              <select
                id="service-category"
                name="categoria_id"
                onChange={handleChange}
                value={form.categoria_id}
              >
                <option value="">Sin categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group full-field" htmlFor="service-description">
              <span>Descripcion</span>
              <textarea
                id="service-description"
                name="descripcion"
                onChange={handleChange}
                placeholder="Describe que incluye el servicio, condiciones o beneficios principales."
                value={form.descripcion}
              />
            </label>
          </div>
        </section>

        <section className="service-form-section">
          <div>
            <h3>Precio y disponibilidad</h3>
            <p>Define como se cotiza, cuanto dura y si esta activo.</p>
          </div>
          <div className="form-grid service-form-grid">
            <label className="field-group" htmlFor="service-price">
              <span>Precio</span>
              <input
                id="service-price"
                min="0"
                name="precio"
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={form.precio}
              />
              {errors.precio ? <small>{errors.precio}</small> : null}
            </label>

            <label className="field-group" htmlFor="service-price-type">
              <span>Tipo de precio</span>
              <select id="service-price-type" name="tipo_precio" onChange={handleChange} value={form.tipo_precio}>
                <option value="FIJO">Precio fijo</option>
                <option value="DESDE">Desde</option>
                <option value="POR_M2">Por m2</option>
                <option value="COTIZACION">Cotizacion con asesor</option>
              </select>
            </label>

            <label className="field-group" htmlFor="service-duration">
              <span>Duracion en minutos</span>
              <input
                id="service-duration"
                min="1"
                name="duracion"
                onChange={handleChange}
                placeholder="60"
                step="1"
                type="number"
                value={form.duracion}
              />
              {errors.duracion ? <small>{errors.duracion}</small> : null}
            </label>

            <label className="field-group" htmlFor="service-status">
              <span>Estado</span>
              <select id="service-status" name="estado" onChange={handleChange} value={form.estado}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </label>
          </div>
        </section>

        {canSelectCompany ? (
          <section className="service-form-section">
            <div>
              <h3>Empresa</h3>
              <p>Asocia el servicio a la empresa que lo ofrece.</p>
            </div>
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
          </section>
        ) : null}
      </div>

      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar servicio' : 'Crear servicio'}
        </button>
      </div>
    </form>
  );
}
