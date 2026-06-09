import { Edit3, Trash2 } from 'lucide-react';

export function ProductTable({ isLoading, onDelete, onEdit, products }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando productos...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoria</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Empresa</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td colSpan="6" className="empty-state">
                No hay productos registrados todavia.
              </td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="product-cell">
                    {product.imagen ? <img alt="" src={product.imagen} /> : <span />}
                    <div>
                      <strong>{product.nombre}</strong>
                      <span className="muted-cell">{product.descripcion || 'Sin descripcion'}</span>
                    </div>
                  </div>
                </td>
                <td>{product.categoria_nombre || '-'}</td>
                <td>${Number(product.precio).toFixed(2)}</td>
                <td>{product.stock}</td>
                <td>{product.empresa_nombre}</td>
                <td>
                  <div className="table-actions">
                    <button aria-label="Editar producto" onClick={() => onEdit(product)} type="button">
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Eliminar producto"
                      onClick={() => onDelete(product)}
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
