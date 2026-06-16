const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'qr',
  'qr_image'
]);

function sanitizeString(value) {
  return value
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function sanitizeValue(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey)
      ])
    );
  }

  if (typeof value !== 'string' || SENSITIVE_KEYS.has(String(key).toLowerCase())) {
    return value;
  }

  return sanitizeString(value);
}

export function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }

  next();
}
