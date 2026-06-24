import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge.jsx';
import { fetchAIStatus } from './aiApi.js';

export function AIStatusCard() {
  const [status, setStatus] = useState(null);
  const isHealthy = status?.status === 'ok' && status?.validated;
  const badgeStatus = isHealthy ? 'ACTIVO' : status?.configured ? 'PENDIENTE' : 'INACTIVO';
  const statusLabels = {
    ok: 'Conexión validada',
    unknown: 'Pendiente de validación',
    missing_key: 'Sin API Key',
    invalid_api_key: 'API Key inválida',
    forbidden: 'Acceso rechazado',
    rate_limited: 'Límite temporal',
    timeout: 'Tiempo de espera agotado',
    server_error: 'Error temporal de OpenAI',
    unknown_error: 'Error de conexión'
  };

  useEffect(() => {
    fetchAIStatus()
      .then(setStatus)
      .catch(() => {
        setStatus({
          configured: false,
          validated: false,
          status: 'unknown_error',
          model: 'No disponible',
          auto_reply: false
        });
      });
  }, []);

  return (
    <article className="whatsapp-status-card ai-status-card">
      <Bot size={22} aria-hidden="true" />
      <div>
        <span>IA comercial</span>
        <strong>
          <StatusBadge status={badgeStatus}>
            {statusLabels[status?.status] ?? 'Comprobando'}
          </StatusBadge>
        </strong>
        <small>
          Modelo {status?.model ?? '...'} - Auto-respuesta {status?.auto_reply ? 'activa' : 'desactivada'}
        </small>
        {status?.lastError ? <small>{status.lastError}</small> : null}
      </div>
    </article>
  );
}
