import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { fetchAIStatus } from './aiApi.js';

export function AIStatusCard() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchAIStatus()
      .then(setStatus)
      .catch(() => {
        setStatus({
          configured: false,
          model: 'No disponible',
          auto_reply: false
        });
      });
  }, []);

  return (
    <article className="whatsapp-status-card">
      <Bot size={22} aria-hidden="true" />
      <div>
        <span>IA comercial</span>
        <strong>
          <StatusBadge status={status?.configured ? 'ACTIVO' : 'INACTIVO'}>
            {status?.configured ? 'Configurada' : 'Sin API Key'}
          </StatusBadge>
        </strong>
        <small>
          Modelo {status?.model ?? '...'} - Auto-respuesta{' '}
          {status?.auto_reply ? 'activa' : 'desactivada'}
        </small>
      </div>
    </article>
  );
}
