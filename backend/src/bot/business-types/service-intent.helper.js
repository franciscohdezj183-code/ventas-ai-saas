export function isServiceInterest(message) {
  return /\b(lo quiero|me interesa|quiero cotizar|quiero hacerlo|quiero agendar|mandame asesor|m[aá]ndame asesor|quiero hablar con alguien|me puedes contactar|quiero contratarlo|quiero contratar|pasame con asesor|p[aá]same con asesor|asesor)\b/i.test(message);
}

export function isShortAffirmation(message) {
  return /^(s[ií]|si|ok|va|dale|claro|perfecto|de acuerdo)$/i.test(String(message ?? '').trim());
}

export function isInstallationFollowUp(message) {
  return /\b(y con instalaci[oó]n|con instalaci[oó]n|instalaci[oó]n|instalar)\b/i.test(message);
}

export function isPriceQuestion(message) {
  return /\b(precio|cu[aá]nto cuesta|cuanto cuesta|y cu[aá]nto sale|y cuanto sale|en cu[aá]nto|en cuanto|costo|vale|cotizar|cotizaci[oó]n|presupuesto)\b/i.test(message);
}
