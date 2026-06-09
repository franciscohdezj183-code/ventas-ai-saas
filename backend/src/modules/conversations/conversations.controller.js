import {
  createConversation,
  deleteConversation,
  findConversationById,
  findConversations,
  updateConversation
} from './conversations.service.js';

export async function listConversations(req, res, next) {
  try {
    res.json({ data: await findConversations(req.auth, req.query) });
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
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
