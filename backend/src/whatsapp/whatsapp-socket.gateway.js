import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getPermissionsForRole, normalizeRole, ROLES } from '../config/permissions.js';
import { findAuthUserById } from '../modules/auth/auth.service.js';
import { isTokenRevoked } from '../modules/auth/token-blacklist.js';
import { logger } from '../utils/logger.js';
import { getPublicSession } from './whatsapp-session.store.js';
import { normalizeCompanyId } from './whatsapp.types.js';

let socketServer = null;

function getToken(socket) {
  const authToken = socket.handshake.auth?.token;
  const header = socket.handshake.headers?.authorization;

  if (authToken) {
    return String(authToken);
  }

  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  return null;
}

function companyRoom(companyId) {
  return `company:${normalizeCompanyId(companyId)}`;
}

function isSuperAdmin(user) {
  return normalizeRole(user?.rol) === ROLES.SUPER_ADMIN;
}

async function authenticateSocket(socket, next) {
  try {
    const token = getToken(socket);

    if (!token) {
      throw new Error('Authentication token is required');
    }

    const payload = jwt.verify(token, env.jwt.secret);

    if (isTokenRevoked(payload.jti)) {
      throw new Error('Authentication token has been revoked');
    }

    const user = await findAuthUserById(payload.sub);

    if (!user || user.estado !== 'ACTIVO') {
      throw new Error('Authenticated user is not active');
    }

    if (!user.empresa_activo || user.empresa_estado !== 'ACTIVA') {
      throw new Error('Authenticated company is not active');
    }

    socket.authUser = {
      id: user.id,
      empresaId: user.empresa_id,
      rol: user.rol,
      normalizedRole: normalizeRole(user.rol),
      permissions: getPermissionsForRole(user.rol)
    };

    next();
  } catch (error) {
    next(error);
  }
}

function emitToCompany(companyId, eventName, payload) {
  if (!socketServer) {
    return;
  }

  const id = normalizeCompanyId(companyId);
  socketServer.to(companyRoom(id)).emit(eventName, {
    companyId: id,
    ...payload
  });
}

export function initializeWhatsappSocket(io) {
  socketServer = io;
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const user = socket.authUser;

    socket.join(companyRoom(user.empresaId));
    logger.info('whatsapp_socket_connected', {
      socketId: socket.id,
      empresaId: user.empresaId,
      rol: user.normalizedRole
    });

    socket.on('whatsapp:join', (payload = {}) => {
      if (!isSuperAdmin(user)) {
        socket.emit('whatsapp:error', {
          companyId: user.empresaId,
          message: 'No tienes permiso para unirte a otra empresa'
        });
        return;
      }

      try {
        const companyId = normalizeCompanyId(payload.companyId ?? payload.empresaId);
        socket.join(companyRoom(companyId));
        socket.emit('whatsapp:status', getPublicSession(companyId));
      } catch (error) {
        socket.emit('whatsapp:error', {
          companyId: user.empresaId,
          message: error instanceof Error ? error.message : 'No se pudo unir a la empresa'
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('whatsapp_socket_disconnected', {
        socketId: socket.id,
        empresaId: user.empresaId,
        reason
      });
    });
  });
}

export function emitWhatsappStatus(companyId, session = getPublicSession(companyId)) {
  const publicSession = {
    ...getPublicSession(companyId),
    ...session
  };

  delete publicSession.client;
  emitToCompany(companyId, 'whatsapp:status', publicSession);
}

export function emitWhatsappQr(companyId, { qrText, qrImage, status = 'qr' }) {
  emitToCompany(companyId, 'whatsapp:qr', {
    qrText,
    qr: qrText,
    qrImage,
    status
  });
}

export function emitWhatsappError(companyId, error) {
  emitToCompany(companyId, 'whatsapp:error', {
    message: error instanceof Error ? error.message : String(error ?? 'Error de WhatsApp')
  });
}

export function emitWhatsappLog(companyId, payload) {
  emitToCompany(companyId, 'whatsapp:log', payload);
}
