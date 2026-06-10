import { Edit3, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable.jsx';

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

export function ConversationTable({ conversations, isLoading, onDelete, onEdit }) {
  const columns = [
    {
      key: 'cliente',
      header: 'Cliente',
      render: (conversation) => (
        <>
          <strong>{conversation.telefono_cliente}</strong>
          <span className="muted-cell">ID {conversation.id}</span>
        </>
      )
    },
    { key: 'mensaje', header: 'Mensaje', render: (conversation) => <span className="message-cell">{conversation.mensaje}</span> },
    { key: 'respuesta', header: 'Respuesta', render: (conversation) => <span className="message-cell">{conversation.respuesta || '-'}</span> },
    { key: 'fecha', header: 'Fecha', render: (conversation) => formatDate(conversation.fecha) },
    { key: 'empresa', header: 'Empresa', render: (conversation) => conversation.empresa_nombre },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (conversation) => (
        <div className="table-actions">
          <button aria-label="Editar conversacion" onClick={() => onEdit(conversation)} type="button">
            <Edit3 size={16} aria-hidden="true" />
          </button>
          <button aria-label="Eliminar conversacion" onClick={() => onDelete(conversation)} type="button">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={conversations}
      emptyDescription="El historial de mensajes de WhatsApp se mostrara en esta tabla."
      emptyTitle="No hay conversaciones registradas"
      isLoading={isLoading}
      loadingMessage="Cargando historial..."
    />
  );
}
