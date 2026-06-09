import {
  createUser,
  deleteUser,
  findUserById,
  findUsers,
  updateUser
} from './users.service.js';

export async function listUsers(req, res, next) {
  try {
    res.json({ data: await findUsers() });
  } catch (error) {
    next(error);
  }
}

export async function getUser(req, res, next) {
  try {
    const user = await findUserById(req.params.id);

    if (!user) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }

    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function storeUser(req, res, next) {
  try {
    const user = await createUser(req.body);
    res.status(201).json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function patchUser(req, res, next) {
  try {
    const user = await updateUser(req.params.id, req.body);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
}

export async function removeUser(req, res, next) {
  try {
    await deleteUser(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
