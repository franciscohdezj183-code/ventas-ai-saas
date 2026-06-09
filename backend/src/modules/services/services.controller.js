import {
  createService,
  deleteService,
  findServiceById,
  findServices,
  updateService
} from './services.service.js';

export async function listServices(req, res, next) {
  try {
    res.json({ data: await findServices(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function getService(req, res, next) {
  try {
    const service = await findServiceById(req.params.id, req.auth);

    if (!service) {
      res.status(404).json({ message: 'Servicio no encontrado' });
      return;
    }

    res.json({ data: service });
  } catch (error) {
    next(error);
  }
}

export async function storeService(req, res, next) {
  try {
    const service = await createService(req.body, req.auth);
    res.status(201).json({ data: service });
  } catch (error) {
    next(error);
  }
}

export async function patchService(req, res, next) {
  try {
    const service = await updateService(req.params.id, req.body, req.auth);
    res.json({ data: service });
  } catch (error) {
    next(error);
  }
}

export async function removeService(req, res, next) {
  try {
    await deleteService(req.params.id, req.auth);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
