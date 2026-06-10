import { loginWithEmailAndPassword } from './auth.service.js';
import { revokeToken } from './token-blacklist.js';
import { auditFromRequest } from '../audit/audit.service.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const session = await loginWithEmailAndPassword(email, password);
    await auditFromRequest(req, {
      accion: 'LOGIN',
      modulo: 'auth',
      descripcion: `Login exitoso para ${session.user.email}`,
      usuarioId: session.user.id,
      empresaId: session.user.empresaId
    });

    res.json({
      message: 'Login successful',
      data: session
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  revokeToken(req.auth.payload.jti, req.auth.payload.exp);

  res.json({
    message: 'Logout successful'
  });
}

export function me(req, res) {
  res.json({
    data: req.auth.user
  });
}
