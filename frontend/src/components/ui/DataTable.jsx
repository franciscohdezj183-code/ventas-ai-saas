import { EmptyState } from './EmptyState.jsx';
import { LoadingState } from './LoadingState.jsx';

export function DataTable({
  columns,
  data,
  getRowKey = (row) => row.id,
  isLoading = false,
  loadingMessage = 'Cargando informacion...',
  emptyTitle = 'Sin registros',
  emptyDescription = 'No hay informacion para mostrar.',
  className = ''
}) {
  if (isLoading) {
    return <LoadingState message={loadingMessage} />;
  }

  if (!data?.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={`data-table-shell ${className}`}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
