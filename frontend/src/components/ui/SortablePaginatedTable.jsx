import { useEffect, useMemo, useState } from 'react';

const mockUsers = [
  { id: 1, nombre: 'Ana Lopez', email: 'ana@demo.com', rol: 'Admin', ventas: 12800 },
  { id: 2, nombre: 'Carlos Ruiz', email: 'carlos@demo.com', rol: 'Vendedor', ventas: 9400 },
  { id: 3, nombre: 'Mariana Diaz', email: 'mariana@demo.com', rol: 'Soporte', ventas: 4200 },
  { id: 4, nombre: 'Jorge Perez', email: 'jorge@demo.com', rol: 'Vendedor', ventas: 15300 },
  { id: 5, nombre: 'Lucia Torres', email: 'lucia@demo.com', rol: 'Admin', ventas: 11800 },
  { id: 6, nombre: 'Diego Ramos', email: 'diego@demo.com', rol: 'Soporte', ventas: 3600 },
  { id: 7, nombre: 'Paola Medina', email: 'paola@demo.com', rol: 'Vendedor', ventas: 17200 },
  { id: 8, nombre: 'Miguel Castro', email: 'miguel@demo.com', rol: 'Admin', ventas: 10100 },
  { id: 9, nombre: 'Sofia Herrera', email: 'sofia@demo.com', rol: 'Vendedor', ventas: 8900 },
  { id: 10, nombre: 'Raul Navarro', email: 'raul@demo.com', rol: 'Soporte', ventas: 5100 },
  { id: 11, nombre: 'Elena Vargas', email: 'elena@demo.com', rol: 'Admin', ventas: 22000 },
  { id: 12, nombre: 'Mateo Silva', email: 'mateo@demo.com', rol: 'Vendedor', ventas: 7900 },
  { id: 13, nombre: 'Valeria Cruz', email: 'valeria@demo.com', rol: 'Soporte', ventas: 6100 },
  { id: 14, nombre: 'Oscar Molina', email: 'oscar@demo.com', rol: 'Vendedor', ventas: 13700 },
  { id: 15, nombre: 'Camila Reyes', email: 'camila@demo.com', rol: 'Admin', ventas: 19500 }
];

const defaultColumns = [
  { key: 'id', label: 'ID' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'rol', label: 'Rol' },
  { key: 'ventas', label: 'Ventas', render: (row) => `$${row.ventas.toLocaleString('es-MX')}` }
];

function getSortValue(row, column) {
  return column.sortValue ? column.sortValue(row) : row[column.key];
}

function compareValues(firstValue, secondValue, direction) {
  const modifier = direction === 'asc' ? 1 : -1;

  if (typeof firstValue === 'number' && typeof secondValue === 'number') {
    return (firstValue - secondValue) * modifier;
  }

  return String(firstValue ?? '').localeCompare(String(secondValue ?? ''), 'es', { sensitivity: 'base' }) * modifier;
}

export function SortablePaginatedTable({
  columns = defaultColumns,
  data = mockUsers,
  emptyMessage = 'No hay registros para mostrar.',
  footerStart,
  getRowKey = (row) => row.id,
  initialSortKey,
  onPageSizeChange,
  pageSize: controlledPageSize,
  pageSizeOptions = [5, 10, 20],
  showPageSizeSelector = true
}) {
  const firstSortableColumn = columns.find((column) => column.sortable !== false);
  const [page, setPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(pageSizeOptions[0] ?? 5);
  const [sortConfig, setSortConfig] = useState({
    key: initialSortKey ?? firstSortableColumn?.key ?? columns[0]?.key,
    direction: 'asc'
  });
  const pageSize = controlledPageSize ?? internalPageSize;

  const sortedData = useMemo(() => {
    const sortedColumn = columns.find((column) => column.key === sortConfig.key);

    if (!sortedColumn || sortedColumn.sortable === false) {
      return data;
    }

    return [...data].sort((firstRow, secondRow) => (
      compareValues(getSortValue(firstRow, sortedColumn), getSortValue(secondRow, sortedColumn), sortConfig.direction)
    ));
  }, [columns, data, sortConfig]);

  const totalPages = Math.max(Math.ceil(sortedData.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedData]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  function handleSort(columnKey) {
    const column = columns.find((currentColumn) => currentColumn.key === columnKey);

    if (!column || column.sortable === false) {
      return;
    }

    setSortConfig((currentSort) => ({
      key: columnKey,
      direction: currentSort.key === columnKey && currentSort.direction === 'asc' ? 'desc' : 'asc'
    }));
    setPage(1);
  }

  function handlePageSizeChange(event) {
    const nextPageSize = Number(event.target.value);
    setInternalPageSize(nextPageSize);
    onPageSizeChange?.(nextPageSize);
    setPage(1);
  }

  return (
    <div className="sortable-table-shell">
      <div className="sortable-table-wrap">
        <table className="sortable-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sortConfig.key === column.key;
                const isSortable = column.sortable !== false;
                return (
                  <th key={column.key} className={`sortable-table-header ${column.headerClassName ?? ''}`}>
                    <button
                      className="sortable-table-sort"
                      disabled={!isSortable}
                      onClick={() => handleSort(column.key)}
                      type="button"
                    >
                      {column.label}
                      {isSortable ? (
                        <span className={`sortable-table-arrow ${isSorted ? 'active' : ''}`} aria-hidden="true">
                          {isSorted && sortConfig.direction === 'desc' ? '\u25BC' : '\u25B2'}
                        </span>
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length ? (
              paginatedData.map((row) => (
                <tr key={getRowKey(row)} className="sortable-table-row">
                  {columns.map((column) => (
                    <td key={column.key} className={`sortable-table-cell ${column.cellClassName ?? ''}`}>
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="sortable-table-empty" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sortable-table-footer">
        {typeof footerStart === 'function' ? footerStart({
          currentPage,
          pageSize,
          totalPages,
          totalRows: sortedData.length,
          visibleRows: paginatedData.length
        }) : footerStart ?? (showPageSizeSelector ? (
          <label className="sortable-page-size">
            Filas por pagina
            <select
              className="sortable-page-size-select"
              onChange={handlePageSizeChange}
              value={pageSize}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        ) : <span />)}

        <div className="sortable-pagination-actions">
          <button
            className="sortable-pagination-button"
            disabled={currentPage <= 1}
            onClick={() => setPage((nextPage) => Math.max(nextPage - 1, 1))}
            type="button"
          >
            Anterior
          </button>
          <span className="sortable-pagination-state">
            Pagina {currentPage} de {totalPages}
          </span>
          <button
            className="sortable-pagination-button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((nextPage) => Math.min(nextPage + 1, totalPages))}
            type="button"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

export default SortablePaginatedTable;
