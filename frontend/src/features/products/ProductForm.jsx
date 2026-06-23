import { ImagePlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const initialForm = {
  nombre: '',
  descripcion: '',
  precio: '',
  stock: '',
  imagen: null,
  categoria_id: '',
  empresa_id: '',
  estado: 'ACTIVO'
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
  const imagePreview = useMemo(() => {
    if (form.imagen) {
      return URL.createObjectURL(form.imagen);
    }

    return product?.imagen ?? '';
  }, [form.imagen, product?.imagen]);

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
        empresa_id: String(product.empresa_id ?? ''),
        estado: product.estado ?? 'ACTIVO'
      });
      return;
    }

    setForm(initialForm);
  }, [product]);

  useEffect(() => {
    if (!form.imagen || !imagePreview) {
      return undefined;
    }

    return () => URL.revokeObjectURL(imagePreview);
  }, [form.imagen, imagePreview]);

  function handleChange(event) {
    const { files, name, type, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'file' ? files[0] ?? null : value,
      ...(name === 'empresa_id' ? { categoria_id: '' } : {})
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
      empresa_id: form.empresa_id ? Number(form.empresa_id) : undefined,
      estado: form.estado
    });
  }

  return (
    <form className="company-form product-form" onSubmit={handleSubmit} noValidate>
      <div className="product-form-layout">
        <div className="product-image-preview">
          {imagePreview ? (
            <img alt="Vista previa del producto" src={imagePreview} />
          ) : (
            <span>
              <ImagePlus size={34} aria-hidden="true" />
            </span>
          )}
          <div>
            <strong>Imagen del producto</strong>
            <p>Usa una imagen clara para que el cliente reconozca rapido el articulo.</p>
          </div>
          <label className="field-group product-image-field" htmlFor="product-image">
            <span>Archivo de imagen</span>
            <input accept="image/*" id="product-image" name="imagen" onChange={handleChange} type="file" />
            {imagePreview ? <small>Vista previa activa.</small> : null}
          </label>
        </div>

        <div className="product-form-sections">
          <section className="product-form-section product-main-section">
            <div>
              <h3>Datos del producto</h3>
              <p>Completa la informacion comercial, inventario y disponibilidad en un solo lugar.</p>
            </div>
            <div className="form-grid product-form-grid">
              <label className="field-group product-name-field" htmlFor="product-name">
                <span>Nombre</span>
                <input
                  id="product-name"
                  name="nombre"
                  onChange={handleChange}
                  placeholder="Nombre comercial"
                  type="text"
                  value={form.nombre}
                />
                {errors.nombre ? <small>{errors.nombre}</small> : null}
              </label>

              <label className="field-group product-category-field" htmlFor="product-category">
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

              <label className="field-group full-field product-description-field" htmlFor="product-description">
                <span>Descripcion</span>
                <textarea
                  id="product-description"
                  name="descripcion"
                  onChange={handleChange}
                  placeholder="Describe materiales, medidas, beneficios o variantes."
                  rows={3}
                  value={form.descripcion}
                />
              </label>
              <label className="field-group product-price-field" htmlFor="product-price">
                <span>Precio</span>
                <input
                  id="product-price"
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

              <label className="field-group product-stock-field" htmlFor="product-stock">
                <span>Stock</span>
                <input
                  id="product-stock"
                  min="0"
                  name="stock"
                  onChange={handleChange}
                  placeholder="0"
                  step="1"
                  type="number"
                  value={form.stock}
                />
                {errors.stock ? <small>{errors.stock}</small> : null}
              </label>

              <label className="field-group product-status-field" htmlFor="product-status">
                <span>Estado</span>
                <select id="product-status" name="estado" onChange={handleChange} value={form.estado}>
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </label>

              {canSelectCompany ? (
                <label className="field-group full-field product-company-field" htmlFor="product-company">
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
            </div>
          </section>
        </div>
      </div>

      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar producto' : 'Crear producto'}
        </button>
      </div>
    </form>
  );
}
