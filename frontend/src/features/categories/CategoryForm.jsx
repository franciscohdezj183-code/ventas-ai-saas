import { useEffect, useState } from 'react';

const initialForm = {
  nombre: '',
  tipo: 'PRODUCTO',
  estado: 'ACTIVA',
  empresa_id: ''
};

function validateCategory(form, canSelectCompany) {
  const errors = {};

  if (!form.nombre.trim()) {
    errors.nombre = 'El nombre es requerido.';
  }

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

export function CategoryForm({ canSelectCompany, category, companies, isSaving, onCancel, onSubmit }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(category);

  useEffect(() => {
    if (category) {
      setForm({
        nombre: category.nombre ?? '',
        tipo: category.tipo ?? 'PRODUCTO',
        estado: category.estado ?? 'ACTIVA',
        empresa_id: String(category.empresa_id ?? '')
      });
      return;
    }

    setForm(initialForm);
  }, [category]);

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

    const nextErrors = validateCategory(form, canSelectCompany);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      nombre: form.nombre,
      tipo: form.tipo,
      estado: form.estado,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined
    });
  }

  return (
    <form className="company-form compact-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="category-name">
          <span>Nombre</span>
          <input
            id="category-name"
            name="nombre"
            onChange={handleChange}
            placeholder="Ej. Bebidas, consultas, accesorios"
            type="text"
            value={form.nombre}
          />
          {errors.nombre ? <small>{errors.nombre}</small> : null}
        </label>

        <label className="field-group" htmlFor="category-type">
          <span>Tipo</span>
          <select id="category-type" name="tipo" onChange={handleChange} value={form.tipo}>
            <option value="PRODUCTO">PRODUCTO</option>
            <option value="SERVICIO">SERVICIO</option>
          </select>
        </label>

        <label className="field-group" htmlFor="category-status">
          <span>Estado</span>
          <select id="category-status" name="estado" onChange={handleChange} value={form.estado}>
            <option value="ACTIVA">ACTIVA</option>
            <option value="INACTIVA">INACTIVA</option>
          </select>
        </label>

        {canSelectCompany ? (
          <label className="field-group" htmlFor="category-company">
            <span>Empresa</span>
            <select
              id="category-company"
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
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar categoria' : 'Crear categoria'}
        </button>
      </div>
    </form>
  );
}
