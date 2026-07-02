const TYPO_REPLACEMENTS = new Map([
  ['kiero', 'quiero'],
  ['kiro', 'quiero'],
  ['qiero', 'quiero'],
  ['q', 'que'],
  ['ke', 'que'],
  ['presio', 'precio'],
  ['presios', 'precios'],
  ['nose', 'no se'],
  ['cotisacion', 'cotizacion'],
  ['cotisar', 'cotizar'],
  ['promcionales', 'promocionales'],
  ['promocionalesd', 'promocionales'],
  ['promcionalesd', 'promocionales'],
  ['tines', 'tienes'],
  ['kompu', 'compu'],
  ['camras', 'camaras'],
  ['camara', 'camara'],
  ['refrijerador', 'refrigerador'],
  ['refri', 'refrigerador'],
  ['lababo', 'lavabo']
]);

export function stripAccents(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeForNcie(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[¿?¡!.,;:()[\]{}"'`´]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => TYPO_REPLACEMENTS.get(word) ?? word)
    .join(' ');
}

export function normalizeIncomingMessage({ message, contactName = null, phone = null } = {}) {
  const original = String(message ?? '').trim();
  const normalized = normalizeForNcie(original);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  return {
    original,
    normalized,
    tokens,
    contactName,
    phone,
    isEmpty: original.length === 0
  };
}
