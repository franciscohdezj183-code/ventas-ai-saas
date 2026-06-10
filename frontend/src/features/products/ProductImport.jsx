import { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud, XCircle } from 'lucide-react';

const REQUIRED_COLUMNS = ['nombre', 'descripcion', 'precio', 'stock', 'categoria'];

function formatFileSize(size) {
  if (!size) {
    return '0 KB';
  }

  return `${(size / 1024).toFixed(1)} KB`;
}

function normalizePreviewRow(row, index) {
  const normalized = REQUIRED_COLUMNS.reduce((current, column) => ({
    ...current,
    [column]: row[column] ?? row[column.toUpperCase()] ?? row[column.charAt(0).toUpperCase() + column.slice(1)] ?? ''
  }), {});

  const errors = [];
  const price = Number(normalized.precio);
  const stock = Number(normalized.stock);

  if (!String(normalized.nombre).trim()) {
    errors.push('nombre es requerido');
  }

  if (!Number.isFinite(price) || price < 0) {
    errors.push('precio debe ser mayor o igual a 0');
  }

  if (!Number.isInteger(stock) || stock < 0) {
    errors.push('stock debe ser entero mayor o igual a 0');
  }

  if (!String(normalized.categoria).trim()) {
    errors.push('categoria es requerida');
  }

  return {
    ...normalized,
    fila: index + 2,
    errores: errors
  };
}

async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const rows = [
    {
      nombre: 'Silla ejecutiva',
      descripcion: 'Silla ergonomica color negro',
      precio: 2500,
      stock: 10,
      categoria: 'Sillas'
    }
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: REQUIRED_COLUMNS });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'productos');
  XLSX.writeFile(workbook, 'plantilla-productos.xlsx');
}

export function ProductImport({
  canSelectCompany,
  companies,
  importResult,
  isImporting,
  onImport
}) {
  const [archivo, setArchivo] = useState(null);
  const [empresaId, setEmpresaId] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewError, setPreviewError] = useState('');

  const previewSummary = useMemo(() => {
    const invalid = previewRows.filter((row) => row.errores.length > 0).length;

    return {
      valid: Math.max(previewRows.length - invalid, 0),
      invalid
    };
  }, [previewRows]);

  async function buildPreview(file) {
    setIsPreviewing(true);
    setPreviewError('');

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setPreviewRows([]);
        setPreviewError('El archivo no contiene hojas.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        defval: '',
        raw: false
      });

      setPreviewRows(rows.slice(0, 8).map(normalizePreviewRow));

      if (rows.length === 0) {
        setPreviewError('El archivo no contiene productos para previsualizar.');
      }
    } catch {
      setPreviewRows([]);
      setPreviewError('No se pudo leer el archivo. Revisa que sea un XLSX valido.');
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleFile(file) {
    if (!file) {
      setArchivo(null);
      setPreviewRows([]);
      setPreviewError('');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('El archivo debe ser XLSX.');
      return;
    }

    setError('');
    setArchivo(file);
    buildPreview(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files[0] ?? null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!archivo) {
      setError('Selecciona un archivo XLSX.');
      return;
    }

    if (canSelectCompany && !empresaId) {
      setError('Selecciona una empresa.');
      return;
    }

    setError('');
    onImport({
      archivo,
      empresa_id: empresaId ? Number(empresaId) : undefined
    });
  }

  const resultErrors = importResult?.errores ?? [];
  const imported = Number(importResult?.insertados ?? 0);
  const totalRows = Number(importResult?.total_filas ?? previewRows.length ?? 0);
  const resultInvalid = resultErrors.length;
  const resultValid = importResult ? Math.max(totalRows - resultInvalid, 0) : previewSummary.valid;

  return (
    <section className="import-box product-import-panel enhanced">
      <div className="product-import-copy">
        <span>
          <FileSpreadsheet size={24} aria-hidden="true" />
        </span>
        <div>
          <h2>Importacion por Excel</h2>
          <p>Sube un XLSX, revisa la vista previa y confirma la importacion cuando el formato este listo.</p>
        </div>
      </div>

      <form className="company-form compact-form" onSubmit={handleSubmit} noValidate>
        <div className="product-import-grid enhanced">
          {canSelectCompany ? (
            <label className="field-group" htmlFor="import-company">
              <span>Empresa</span>
              <select
                id="import-company"
                onChange={(event) => setEmpresaId(event.target.value)}
                value={empresaId}
              >
                <option value="">Selecciona una empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label
            className={isDragging ? 'product-file-drop active' : 'product-file-drop'}
            htmlFor="products-xlsx"
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDrop={handleDrop}
          >
            {isPreviewing ? <Loader2 className="spin-icon" size={28} aria-hidden="true" /> : <UploadCloud size={28} aria-hidden="true" />}
            <strong>{archivo ? archivo.name : 'Arrastra tu Excel aqui'}</strong>
            <span>{archivo ? formatFileSize(archivo.size) : 'o haz clic para seleccionar un archivo .xlsx'}</span>
            <input
              accept=".xlsx"
              id="products-xlsx"
              onChange={(event) => handleFile(event.target.files[0] ?? null)}
              type="file"
            />
          </label>

          <div className="product-import-tips enhanced">
            <div>
              <strong>Formato requerido</strong>
              <span>Columnas exactas: nombre, descripcion, precio, stock, categoria.</span>
            </div>
            <div>
              <strong>Validaciones</strong>
              <span>Precio y stock deben ser numericos. Categoria no puede estar vacia.</span>
            </div>
            <button className="secondary-button" onClick={downloadTemplate} type="button">
              <Download size={17} aria-hidden="true" />
              Descargar plantilla
            </button>
          </div>
        </div>

        {error || previewError ? <div className="form-alert">{error || previewError}</div> : null}

        <div className="import-preview-summary">
          <article>
            <span>Registros validos</span>
            <strong>{resultValid}</strong>
          </article>
          <article className="warning">
            <span>Con error</span>
            <strong>{importResult ? resultInvalid : previewSummary.invalid}</strong>
          </article>
          <article className="success">
            <span>Importados</span>
            <strong>{imported}</strong>
          </article>
        </div>

        {previewRows.length > 0 ? (
          <div className="import-preview-table">
            <div className="section-header compact">
              <div>
                <h3>Vista previa</h3>
                <p>Mostramos las primeras {previewRows.length} filas leidas del archivo.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Nombre</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th>Categoria</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.fila}>
                      <td>{row.fila}</td>
                      <td>{row.nombre || '-'}</td>
                      <td>{row.precio || '-'}</td>
                      <td>{row.stock || '-'}</td>
                      <td>{row.categoria || '-'}</td>
                      <td>
                        {row.errores.length ? (
                          <span className="import-row-status error">
                            <XCircle size={15} aria-hidden="true" />
                            Error
                          </span>
                        ) : (
                          <span className="import-row-status ok">
                            <CheckCircle2 size={15} aria-hidden="true" />
                            Valido
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="form-actions">
          <button className="primary-button" disabled={isImporting || isPreviewing} type="submit">
            {isImporting ? (
              <>
                <Loader2 className="spin-icon" size={18} aria-hidden="true" />
                Importando...
              </>
            ) : (
              'Importar productos'
            )}
          </button>
        </div>
      </form>

      {importResult ? (
        <div className="import-result enhanced">
          <div className={resultErrors.length ? 'import-success-card partial' : 'import-success-card'}>
            <CheckCircle2 size={22} aria-hidden="true" />
            <div>
              <strong>
                {imported} producto{imported === 1 ? '' : 's'} importado{imported === 1 ? '' : 's'}
              </strong>
              <span>
                Procesamos {totalRows} fila{totalRows === 1 ? '' : 's'}.
                {resultErrors.length ? ` ${resultErrors.length} fila${resultErrors.length === 1 ? '' : 's'} requiere revision.` : ' No se detectaron errores.'}
              </span>
            </div>
          </div>

          {resultErrors.length > 0 ? (
            <div className="import-errors-list">
              <h3>Errores por fila</h3>
              {resultErrors.map((row) => (
                <article key={row.fila}>
                  <strong>Fila {row.fila}</strong>
                  <ul>
                    {row.errores.map((rowError) => (
                      <li key={rowError}>{rowError}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
