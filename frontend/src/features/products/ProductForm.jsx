import { useEffect, useMemo, useState } from 'react';

const initialForm = {
  nombre: '',
  descripcion: '',
  precio: '',
  stock: '',
  imagen: null,
  categoria_id: '',
  empresa_id: ''
};

function validateProduct(form, canSelectCompany) {
  const errors = {};

  if (!form.nombre.trim()) {
    errors.nombre = 'El nombre es requerido.';
  }

  if (Number(form.precio) < 0 || form.precio === '') {
    errors.precio = 'El precio debe ser mayor o igual a 0.';
  }

  if (!Number.isInteger(Number(form.stock)) || Number(form.stock) < 0 || form.stock === '') {
    errors.stock = 'El stock debe ser un entero mayor o igual a 0.';
  }

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

export function ProductForm({
  canSelectCompany,
  categories,
  companies,
  isSaving,
  onCancel,
  onSubmit,
  product
}) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(product);

  const filteredCategories = useMemo(() => {
    if (!canSelectCompany || !form.empresa_id) {
      return categories;
    }

    return categories.filter((category) => String(category.empresa_id) === String(form.empresa_id));
  }, [canSelectCompany, categories, form.empresa_id]);

  useEffect(() => {
    if (product) {
      setForm({
        nombre: product.nombre ?? '',
        descripcion: product.descripcion ?? '',
        precio: product.precio ?? '',
        stock: product.stock ?? '',
        imagen: null,
        categoria_id: String(product.categoria_id ?? ''),
        empresa_id: String(product.empresa_id ?? '')
      });
      return;
    }

    setForm(initialForm);
  }, [product]);

  function handleChange(event) {
    const { files, name, type, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'file' ? files[0] ?? null : value
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: ''
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateProduct(form, canSelectCompany);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      ...form,
      precio: Number(form.precio),
      stock: Number(form.stock),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : '',
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined
    });
  }

  return (
    <form className="company-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field-group" htmlFor="product-name">
          <span>Nombre</span>
          <input
            id="product-name"
            name="nombre"
            onChange={handleChange}
            placeholder="Producto"
            type="text"
            value={form.nombre}
          />
          {errors.nombre ? <small>{errors.nombre}</small> : null}
        </label>

        <label className="field-group" htmlFor="product-price">
          <span>Precio</span>
          <input
            id="product-price"
            min="0"
            name="precio"
            onChange={handleChange}
            step="0.01"
            type="number"
            value={form.precio}
          />
          {errors.precio ? <small>{errors.precio}</small> : null}
        </label>

        <label className="field-group" htmlFor="product-stock">
          <span>Stock</span>
          <input
            id="product-stock"
            min="0"
            name="stock"
            onChange={handleChange}
            step="1"
            type="number"
            value={form.stock}
          />
          {errors.stock ? <small>{errors.stock}</small> : null}
        </label>

        {canSelectCompany ? (
          <label className="field-group" htmlFor="product-company">
            <span>Empresa</span>
            <select
              id="product-company"
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

        <label className="field-group" htmlFor="product-category">
          <span>Categoria</span>
          <select
            id="product-category"
            name="categoria_id"
            onChange={handleChange}
            value={form.categoria_id}
          >
            <option value="">Sin categoria</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="field-group" htmlFor="product-image">
          <span>Imagen</span>
          <input accept="image/*" id="product-image" name="imagen" onChange={handleChange} type="file" />
          {product?.imagen && !form.imagen ? <small>Imagen actual disponible.</small> : null}
        </label>

        <label className="field-group full-field" htmlFor="product-description">
          <span>Descripcion</span>
          <input
            id="product-description"
            name="descripcion"
            onChange={handleChange}
            placeholder="Descripcion del producto"
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
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar producto' : 'Crear producto'}
        </button>
      </div>
    </form>
  );
}
