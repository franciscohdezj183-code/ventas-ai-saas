import { useState } from 'react';

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

  return (
    <section className="import-box">
      <div className="section-header inline-header">
        <div>
          <h2>Importacion masiva</h2>
          <p>Formato XLSX con columnas: nombre, descripcion, precio, stock, categoria.</p>
        </div>
      </div>

      <form className="company-form compact-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
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

          <label className="field-group" htmlFor="products-xlsx">
            <span>Archivo XLSX</span>
            <input
              accept=".xlsx"
              id="products-xlsx"
              onChange={(event) => setArchivo(event.target.files[0] ?? null)}
              type="file"
            />
          </label>
        </div>

        {error ? <div className="form-alert">{error}</div> : null}

        <div className="form-actions">
          <button className="primary-button" disabled={isImporting} type="submit">
            {isImporting ? 'Importando...' : 'Importar productos'}
          </button>
        </div>
      </form>

      {importResult ? (
        <div className="import-result">
          <strong>
            {importResult.insertados} de {importResult.total_filas} productos importados.
          </strong>

          {importResult.errores.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.errores.map((row) => (
                    <tr key={row.fila}>
                      <td>{row.fila}</td>
                      <td>{row.errores.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
