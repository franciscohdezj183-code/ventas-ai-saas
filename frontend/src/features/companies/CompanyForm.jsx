import { useEffect, useState } from 'react';

const initialForm = {
  nombre: '',
  telefono: '',
  direccion: '',
  tipo_negocio: '',
  plan: 'BASICO',
  activo: true
};

function validateCompany(form) {
  const errors = {};

  if (!form.nombre.trim()) {
    errors.nombre = 'El nombre es requerido.';
  }

  if (!form.tipo_negocio.trim()) {
    errors.tipo_negocio = 'El tipo de negocio es requerido.';
  }

  return errors;
}

export function CompanyForm({ company, isSaving, onCancel, onSubmit }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (company) {
      setForm({
        nombre: company.nombre ?? '',
        telefono: company.telefono ?? '',
        direccion: company.direccion ?? '',
        tipo_negocio: company.tipo_negocio ?? '',
        plan: company.plan ?? 'BASICO',
        activo: Boolean(company.activo)
      });
      return;
    }

    setForm(initialForm);
  }, [company]);

  function handleChange(event) {
    const { checked, name, type, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : value
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: ''
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateCompany(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit(form);
  }

  return (
    <form className="company-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="company-name">
          <span>Nombre</span>
          <input
            id="company-name"
            name="nombre"
            onChange={handleChange}
            placeholder="Empresa Demo"
            type="text"
            value={form.nombre}
          />
          {errors.nombre ? <small>{errors.nombre}</small> : null}
        </label>

        <label className="field-group" htmlFor="company-phone">
          <span>Telefono</span>
          <input
            id="company-phone"
            name="telefono"
            onChange={handleChange}
            placeholder="+52 55 0000 0000"
            type="tel"
            value={form.telefono}
          />
        </label>

        <label className="field-group" htmlFor="company-type">
          <span>Tipo de negocio</span>
          <input
            id="company-type"
            name="tipo_negocio"
            onChange={handleChange}
            placeholder="Restaurante, clinica, tienda..."
            type="text"
            value={form.tipo_negocio}
          />
          {errors.tipo_negocio ? <small>{errors.tipo_negocio}</small> : null}
        </label>

        <label className="field-group" htmlFor="company-plan">
          <span>Plan</span>
          <select id="company-plan" name="plan" onChange={handleChange} value={form.plan}>
            <option value="BASICO">BASICO</option>
            <option value="PRO">PRO</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
          </select>
        </label>

        <label className="field-group full-field" htmlFor="company-address">
          <span>Direccion</span>
          <input
            id="company-address"
            name="direccion"
            onChange={handleChange}
            placeholder="Calle, colonia, ciudad"
            type="text"
            value={form.direccion}
          />
        </label>
      </div>

      <label className="toggle-row" htmlFor="company-active">
        <input
          checked={form.activo}
          id="company-active"
          name="activo"
          onChange={handleChange}
          type="checkbox"
        />
        <span>Empresa activa</span>
      </label>

      <div className="form-actions">
        {company ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : company ? 'Actualizar empresa' : 'Crear empresa'}
        </button>
      </div>
    </form>
  );
}
