export function normalizeIntentMessage(message) {
  return String(message ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isReservationIntentMessage(message) {
  const normalized = normalizeIntentMessage(message);

  return /\b(aparta(?:r|lo|l[ao]|me|melo|mela|melo|nos|moslo|melo|nlo|nme)?|aparto|apartemoslo|apartamelo|apartarmelo|apartarlo|apartalo|aparat(?:ar|arlo|alo|amelo)?|separa(?:r|lo|me|melo)?|reserv(?:ar|alo|arlo|amelo|a))\b/.test(normalized)
    || /\b(quiero|quisiera|puedo|podemos|me gustaria|voy a)\s+(apart|aparat|separ|reserv)\w*\b/.test(normalized)
    || /\bcomo\s+lo\s+(apart|aparat|separ|reserv)\w*\b/.test(normalized);
}

export function isPurchaseIntentMessage(message) {
  const normalized = normalizeIntentMessage(message);

  return isReservationIntentMessage(normalized)
    || /\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|me lo llevo|quiero ese|quiero informacion|hacer pedido|levantar pedido|finalizar compra|cerrar compra)\b/.test(normalized);
}

export function stripPurchaseIntentWords(message) {
  return normalizeIntentMessage(message)
    .replace(/\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|quiero informacion|hacer pedido|levantar pedido|finalizar compra|cerrar compra|quiero|quisiera|puedo|podemos|me gustaria|voy a|una|un|el|la|lo)\b/g, ' ')
    .replace(/\b(aparta(?:r|lo|la|me|melo|mela|nos|moslo|nlo|nme)?|aparto|apartemoslo|apartamelo|apartarmelo|apartarlo|apartalo|aparat(?:ar|arlo|alo|amelo)?|separa(?:r|lo|me|melo)?|reserv(?:ar|alo|arlo|amelo|a)|me lo llevo|quiero ese)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
