import { logger } from '../utils/logger.js';

export function logLegacyDecisionDetected({
  module,
  responsibility,
  decision = null,
  empresaId = null,
  conversationId = null,
  reason = null
} = {}) {
  logger.warn('legacy_decision_detected', {
    module,
    responsibility,
    decision,
    empresaId,
    conversationId,
    reason
  });
}
