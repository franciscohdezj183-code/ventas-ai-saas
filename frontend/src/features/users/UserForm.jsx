import { useEffect, useState } from 'react';

const initialForm = {
  nombre: '',
  correo: '',
  password: '',
  rol: 'OWNER',
  empresa_id: '',
  estado: 'ACTIVO'
};

function validateUser(form, isEditing) {
  const errors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!form.nombre.trim()) {
    errors.nombre = 'El nombre es requerido.';
  }

  if (!emailPattern.test(form.correo)) {
    errors.correo = 'Ingresa un correo valido.';
  }

  if (!isEditing && form.password.length < 6) {
    errors.password = 'El password debe tener al menos 6 caracteres.';
  }

  if (isEditing && form.password && form.password.length < 6) {
    errors.password = 'El password debe tener al menos 6 caracteres.';
  }

  if (!form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

export function UserForm({ companies, isSaving, onCancel, onSubmit, user }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(user);

  useEffect(() => {
    if (user) {
      setForm({
        nombre: user.nombre ?? '',
        correo: user.correo ?? '',
        password: '',
        rol: user.rol ?? 'OWNER',
        empresa_id: String(user.empresa_id ?? ''),
        estado: user.estado ?? 'ACTIVO'
      });
      return;
    }

    setForm(initialForm);
  }, [user]);

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

    const nextErrors = validateUser(form, isEditing);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      ...form,
      empresa_id: Number(form.empresa_id)
    });
  }

  return (
    <form className="company-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="user-name">
          <span>Nombre</span>
          <input
            id="user-name"
            name="nombre"
            onChange={handleChange}
            placeholder="Nombre completo"
            type="text"
            value={form.nombre}
          />
          {errors.nombre ? <small>{errors.nombre}</small> : null}
        </label>

        <label className="field-group" htmlFor="user-email">
          <span>Correo</span>
          <input
            id="user-email"
            name="correo"
            onChange={handleChange}
            placeholder="owner@empresa.com"
            type="email"
            value={form.correo}
          />
          {errors.correo ? <small>{errors.correo}</small> : null}
        </label>

        <label className="field-group" htmlFor="user-password">
          <span>{isEditing ? 'Nueva contrasena' : 'Contrasena'}</span>
          <input
            id="user-password"
            name="password"
            onChange={handleChange}
            placeholder={isEditing ? 'Opcional, minimo 6 caracteres' : 'Minimo 6 caracteres'}
            type="password"
            value={form.password}
          />
          {errors.password ? <small>{errors.password}</small> : null}
        </label>

        <label className="field-group" htmlFor="user-role">
          <span>Rol</span>
          <select id="user-role" name="rol" onChange={handleChange} value={form.rol}>
            <option value="OWNER">OWNER</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
        </label>

        <label className="field-group" htmlFor="user-status">
          <span>Estado</span>
          <select id="user-status" name="estado" onChange={handleChange} value={form.estado}>
            <option value="ACTIVO">ACTIVO</option>
            <option value="INACTIVO">INACTIVO</option>
          </select>
        </label>

        <label className="field-group full-field" htmlFor="user-company">
          <span>Empresa</span>
          <select
            id="user-company"
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
      </div>

      <div className="form-actions">
        {isEditing ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancelar
          </button>
        ) : null}
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar usuario' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}
