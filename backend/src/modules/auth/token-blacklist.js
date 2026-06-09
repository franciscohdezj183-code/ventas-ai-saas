const revokedTokens = new Map();

function cleanupExpiredTokens() {
  const now = Math.floor(Date.now() / 1000);

  for (const [jti, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(jti);
    }
  }
}

export function revokeToken(jti, expiresAt) {
  cleanupExpiredTokens();

  if (!jti || !expiresAt) {
    return;
  }

  revokedTokens.set(jti, expiresAt);
}

export function isTokenRevoked(jti) {
  cleanupExpiredTokens();
  return revokedTokens.has(jti);
}
