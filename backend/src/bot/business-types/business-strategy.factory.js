import { mixedBusinessStrategy } from './mixed-business.strategy.js';
import { productBusinessStrategy } from './product-business.strategy.js';
import { serviceBusinessStrategy } from './service-business.strategy.js';
import { BUSINESS_TYPES, normalizeBusinessType } from './shared-response-helpers.js';

export function getBusinessStrategy(companyContext = {}) {
  const businessType = normalizeBusinessType(companyContext?.tipo_negocio);

  if (businessType === BUSINESS_TYPES.PRODUCTS) {
    return productBusinessStrategy;
  }

  if (businessType === BUSINESS_TYPES.SERVICES) {
    return serviceBusinessStrategy;
  }

  return mixedBusinessStrategy;
}
