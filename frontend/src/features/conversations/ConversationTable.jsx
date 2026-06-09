import { Edit3, Trash2 } from 'lucide-react';

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

export function ConversationTable({ conversations, isLoading, onDelete, onEdit }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando historial...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Mensaje</th>
            <th>Respuesta</th>
            <th>Fecha</th>
            <th>Empresa</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {conversations.length === 0 ? (
            <tr>
              <td colSpan="6" className="empty-state">
                No hay conversaciones registradas todavia.
              </td>
            </tr>
          ) : (
            conversations.map((conversation) => (
              <tr key={conversation.id}>
                <td>
                  <strong>{conversation.telefono_cliente}</strong>
                  <span className="muted-cell">ID {conversation.id}</span>
                </td>
                <td className="message-cell">{conversation.mensaje}</td>
                <td className="message-cell">{conversation.respuesta || '-'}</td>
                <td>{formatDate(conversation.fecha)}</td>
                <td>{conversation.empresa_nombre}</td>
                <td>
                  <div className="table-actions">
                    <button
                      aria-label="Editar conversacion"
                      onClick={() => onEdit(conversation)}
                      type="button"
                    >
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Eliminar conversacion"
                      onClick={() => onDelete(conversation)}
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
