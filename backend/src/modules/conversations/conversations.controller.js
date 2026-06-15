import {
  createConversation,
  deleteConversation,
  findConversationById,
  findConversations,
  findInboxThread,
  findInboxThreads,
  pauseBotForThread,
  resumeBotForThread,
  sendThreadReply,
  updateConversation
} from './conversations.service.js';
import { auditFromRequest } from '../audit/audit.service.js';

export async function listConversations(req, res, next) {
  try {
    res.json({ data: await findConversations(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}

export async function listInboxThreads(req, res, next) {
  try {
    res.json({ data: await findInboxThreads(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}

export async function getInboxThread(req, res, next) {
  try {
    res.json({
      data: await findInboxThread(req.auth, {
        empresaId: req.params.empresaId,
        telefono: req.params.telefono
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function pauseInboxThread(req, res, next) {
  try {
    res.json({
      data: await pauseBotForThread(req.auth, {
        empresaId: req.params.empresaId,
        telefono: req.params.telefono
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function resumeInboxThread(req, res, next) {
  try {
    res.json({
      data: await resumeBotForThread(req.auth, {
        empresaId: req.params.empresaId,
        telefono: req.params.telefono
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function sendInboxReply(req, res, next) {
  try {
    res.json({
      data: await sendThreadReply(req.auth, {
        empresaId: req.params.empresaId,
        telefono: req.params.telefono,
        mensaje: req.body.mensaje
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const conversation = await findConversationById(req.params.id, req.auth);

    if (!conversation) {
      res.status(404).json({ message: 'Conversacion no encontrada' });
      return;
    }

    res.json({ data: conversation });
  } catch (error) {
    next(error);
  }
}

export async function storeConversation(req, res, next) {
  try {
    const conversation = await createConversation(req.body, req.auth);
    res.status(201).json({ data: conversation });
  } catch (error) {
    next(error);
  }
}

export async function patchConversation(req, res, next) {
  try {
    const conversation = await updateConversation(req.params.id, req.body, req.auth);
    res.json({ data: conversation });
  } catch (error) {
    next(error);
  }
}

export async function removeConversation(req, res, next) {
  try {
    await deleteConversation(req.params.id, req.auth);
    await auditFromRequest(req, {
      accion: 'ELIMINAR',
      modulo: 'conversaciones',
      descripcion: `Conversacion eliminada: #${req.params.id}`
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
