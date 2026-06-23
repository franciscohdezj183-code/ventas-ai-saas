import { useEffect, useMemo, useState } from 'react';

const PRICE_TYPES = [
  { value: 'FIJO', label: 'Precio fijo' },
  { value: 'DESDE', label: 'Desde' },
  { value: 'POR_UNIDAD', label: 'Por unidad' },
  { value: 'POR_M2', label: 'Por m2' },
  { value: 'POR_HORA', label: 'Por hora' },
  { value: 'COTIZACION', label: 'Cotización con asesor' }
];

const UNIT_OPTIONS = [
  { value: '', label: 'Sin unidad' },
  { value: 'servicio', label: 'Servicio' },
  { value: 'pieza', label: 'Pieza' },
  { value: 'paquete', label: 'Paquete' },
  { value: 'm2', label: 'm2' },
  { value: 'hora', label: 'Hora' },
  { value: 'asesor', label: 'Asesor' }
];

const initialForm = {
  nombre: '',
  descripcion: '',
  categoria_id: '',
  precio: '',
  tipo_precio: 'FIJO',
  unidad_medida: 'servicio',
  duracion_minutos: '',
  requiere_medidas: false,
  requiere_cantidad: false,
  incluye: '',
  no_incluye: '',
  notas_cotizacion: '',
  precio_minimo: '',
  estado: 'ACTIVO',
  empresa_id: ''
};

function suggestedUnitForType(type, currentUnit) {
  if (type === 'POR_M2') return 'm2';
  if (type === 'POR_HORA') return 'hora';
  if (type === 'POR_UNIDAD') return currentUnit && currentUnit !== 'm2' && currentUnit !== 'hora' ? currentUnit : 'pieza';
  if (type === 'COTIZACION') return currentUnit || 'asesor';
  return currentUnit || 'servicio';
}

function priceLabel(type) {
  return {
    FIJO: 'Precio',
    DESDE: 'Precio base',
    POR_UNIDAD: 'Precio por unidad',
    POR_M2: 'Precio por m2',
    POR_HORA: 'Precio por hora',
    COTIZACION: 'Precio estimado'
  }[type] ?? 'Precio';
}

function validateService(form, canSelectCompany) {
  const errors = {};
  const priceType = String(form.tipo_precio ?? 'FIJO').toUpperCase();

  if (!form.nombre.trim()) {
    errors.nombre = 'El nombre es requerido.';
  }

  if (priceType !== 'COTIZACION' && form.precio === '') {
    errors.precio = 'El precio es requerido para esta modalidad.';
  }

  if (form.precio !== '' && Number(form.precio) < 0) {
    errors.precio = 'El precio debe ser mayor o igual a 0.';
  }

  if (form.precio_minimo !== '' && Number(form.precio_minimo) < 0) {
    errors.precio_minimo = 'El precio mínimo debe ser mayor o igual a 0.';
  }

  if (form.duracion_minutos !== '' && (!Number.isInteger(Number(form.duracion_minutos)) || Number(form.duracion_minutos) <= 0)) {
    errors.duracion_minutos = 'La duración debe ser mayor a 0 o dejarse vacía.';
  }

  if (canSelectCompany && !form.empresa_id) {
    errors.empresa_id = 'Selecciona una empresa.';
  }

  return errors;
}

function numberOrUndefined(value) {
  return value === '' || value === null || value === undefined ? undefined : Number(value);
}

export function ServiceForm({ canSelectCompany, categories = [], companies = [], isSaving, onCancel, onSubmit, service }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const isEditing = Boolean(service);
  const isQuote = form.tipo_precio === 'COTIZACION';
  const isByM2 = form.tipo_precio === 'POR_M2';

  const unitOptions = useMemo(() => {
    if (['FIJO', 'DESDE'].includes(form.tipo_precio)) {
      return UNIT_OPTIONS.filter((unit) => ['', 'servicio', 'pieza', 'paquete'].includes(unit.value));
    }

    return UNIT_OPTIONS;
  }, [form.tipo_precio]);

  useEffect(() => {
    setErrors({});

    if (service) {
      const tipoPrecio = service.tipo_precio ?? 'FIJO';
      setForm({
        nombre: service.nombre ?? '',
        descripcion: service.descripcion ?? '',
        categoria_id: String(service.categoria_id ?? ''),
        precio: service.precio ?? '',
        tipo_precio: tipoPrecio,
        unidad_medida: service.unidad_medida ?? suggestedUnitForType(tipoPrecio, ''),
        duracion_minutos: service.duracion_minutos ?? service.duracion ?? '',
        requiere_medidas: Boolean(service.requiere_medidas),
        requiere_cantidad: Boolean(service.requiere_cantidad),
        incluye: service.incluye ?? '',
        no_incluye: service.no_incluye ?? '',
        notas_cotizacion: service.notas_cotizacion ?? '',
        precio_minimo: service.precio_minimo ?? '',
        estado: service.estado ?? 'ACTIVO',
        empresa_id: String(service.empresa_id ?? '')
      });
      return;
    }

    setForm(initialForm);
  }, [service]);

  function updateField(name, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: ''
    }));
  }

  function handleChange(event) {
    const { checked, name, type, value } = event.target;

    if (name === 'tipo_precio') {
      setForm((currentForm) => ({
        ...currentForm,
        tipo_precio: value,
        unidad_medida: suggestedUnitForType(value, currentForm.unidad_medida),
        requiere_medidas: value === 'POR_M2' ? true : currentForm.requiere_medidas
      }));
      setErrors((currentErrors) => ({ ...currentErrors, tipo_precio: '', precio: '' }));
      return;
    }

    updateField(name, type === 'checkbox' ? checked : value);
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
      precio: numberOrUndefined(form.precio),
      duracion_minutos: numberOrUndefined(form.duracion_minutos),
      categoria_id: numberOrUndefined(form.categoria_id),
      precio_minimo: numberOrUndefined(form.precio_minimo),
      empresa_id: numberOrUndefined(form.empresa_id),
      unidad_medida: form.unidad_medida || undefined
    });
  }

  return (
    <form className="company-form service-form" onSubmit={handleSubmit} noValidate>
      <div className="service-form-sections">
        <section className="service-form-section service-form-section-main">
          <div>
            <h3>Información principal</h3>
            <p>Datos generales para identificar el servicio y ubicarlo en el catálogo.</p>
          </div>
          <div className="form-grid service-form-grid">
            <label className="field-group" htmlFor="service-name">
              <span>Nombre</span>
              <input id="service-name" name="nombre" onChange={handleChange} placeholder="Ej. Instalación, asesoría, impresión" type="text" value={form.nombre} />
              {errors.nombre ? <small>{errors.nombre}</small> : null}
            </label>

            <label className="field-group" htmlFor="service-category">
              <span>Categoría</span>
              <select id="service-category" name="categoria_id" onChange={handleChange} value={form.categoria_id}>
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.nombre}</option>
                ))}
              </select>
            </label>

            <label className="field-group full-field" htmlFor="service-description">
              <span>Descripción</span>
              <textarea id="service-description" name="descripcion" onChange={handleChange} placeholder="Describe el alcance, condiciones o beneficios principales." value={form.descripcion} />
            </label>
          </div>
        </section>

        <section className="service-form-section">
          <div>
            <h3>Precio y modalidad</h3>
            <p>Define cómo se cobra o si requiere cotización personalizada.</p>
          </div>
          <div className="form-grid service-form-grid">
            <label className="field-group" htmlFor="service-price-type">
              <span>Tipo de precio</span>
              <select id="service-price-type" name="tipo_precio" onChange={handleChange} value={form.tipo_precio}>
                {PRICE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>

            <label className="field-group" htmlFor="service-price">
              <span>{priceLabel(form.tipo_precio)}</span>
              <input id="service-price" min="0" name="precio" onChange={handleChange} placeholder={isQuote ? 'Opcional' : '0.00'} step="0.01" type="number" value={form.precio} />
              {errors.precio ? <small>{errors.precio}</small> : null}
            </label>

            <label className="field-group" htmlFor="service-unit">
              <span>Unidad</span>
              <select id="service-unit" name="unidad_medida" onChange={handleChange} value={form.unidad_medida}>
                {unitOptions.map((unit) => (
                  <option key={unit.value} value={unit.value}>{unit.label}</option>
                ))}
              </select>
            </label>

            <label className="field-group" htmlFor="service-min-price">
              <span>Precio mínimo</span>
              <input id="service-min-price" min="0" name="precio_minimo" onChange={handleChange} placeholder="Opcional" step="0.01" type="number" value={form.precio_minimo} />
              {errors.precio_minimo ? <small>{errors.precio_minimo}</small> : null}
            </label>
          </div>
        </section>

        <section className="service-form-section">
          <div>
            <h3>Datos para cotización</h3>
            <p>Indica qué información necesita el equipo o el bot para orientar al cliente.</p>
          </div>
          <div className="form-grid service-form-grid">
            <label className="field-group service-checkbox-field">
              <input checked={form.requiere_medidas} disabled={isByM2} name="requiere_medidas" onChange={handleChange} type="checkbox" />
              <span>Requiere medidas</span>
            </label>

            <label className="field-group service-checkbox-field">
              <input checked={form.requiere_cantidad} name="requiere_cantidad" onChange={handleChange} type="checkbox" />
              <span>Requiere cantidad</span>
            </label>

            <label className="field-group" htmlFor="service-duration">
              <span>Duración en minutos</span>
              <input id="service-duration" min="1" name="duracion_minutos" onChange={handleChange} placeholder="No aplica" step="1" type="number" value={form.duracion_minutos} />
              {errors.duracion_minutos ? <small>{errors.duracion_minutos}</small> : null}
            </label>

            <label className="field-group full-field" htmlFor="service-quote-notes">
              <span>{isQuote ? 'Notas de cotización' : 'Notas para cotizar'}</span>
              <textarea id="service-quote-notes" name="notas_cotizacion" onChange={handleChange} placeholder="Ej. Pedir medidas, cantidad, material, ubicación o fecha requerida." value={form.notas_cotizacion} />
            </label>

            <label className="field-group full-field" htmlFor="service-includes">
              <span>Incluye</span>
              <textarea id="service-includes" name="incluye" onChange={handleChange} placeholder="Elementos incluidos en el servicio." value={form.incluye} />
            </label>

            <label className="field-group full-field" htmlFor="service-excludes">
              <span>No incluye</span>
              <textarea id="service-excludes" name="no_incluye" onChange={handleChange} placeholder="Restricciones, extras o conceptos no incluidos." value={form.no_incluye} />
            </label>
          </div>
        </section>

        <section className="service-form-section">
          <div>
            <h3>Estado</h3>
            <p>Controla si el servicio aparece activo para venta y consulta.</p>
          </div>
          <div className="form-grid service-form-grid">
            <label className="field-group" htmlFor="service-status">
              <span>Estado</span>
              <select id="service-status" name="estado" onChange={handleChange} value={form.estado}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </label>

            {canSelectCompany ? (
              <label className="field-group" htmlFor="service-company">
                <span>Empresa</span>
                <select id="service-company" name="empresa_id" onChange={handleChange} value={form.empresa_id}>
                  <option value="">Selecciona una empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.nombre}</option>
                  ))}
                </select>
                {errors.empresa_id ? <small>{errors.empresa_id}</small> : null}
              </label>
            ) : null}
          </div>
        </section>
      </div>

      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">Cancelar</button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : isEditing ? 'Actualizar servicio' : 'Crear servicio'}
        </button>
      </div>
    </form>
  );
}
