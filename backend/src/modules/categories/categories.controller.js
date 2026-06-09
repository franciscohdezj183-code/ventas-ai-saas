import {
  createCategory,
  deleteCategory,
  findCategories,
  findCategoryById,
  updateCategory
} from './categories.service.js';

export async function listCategories(req, res, next) {
  try {
    res.json({ data: await findCategories(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function getCategory(req, res, next) {
  try {
    const category = await findCategoryById(req.params.id, req.auth);

    if (!category) {
      res.status(404).json({ message: 'Categoria no encontrada' });
      return;
    }

    res.json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function storeCategory(req, res, next) {
  try {
    const category = await createCategory(req.body, req.auth);
    res.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function patchCategory(req, res, next) {
  try {
    const category = await updateCategory(req.params.id, req.body, req.auth);
    res.json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function removeCategory(req, res, next) {
  try {
    await deleteCategory(req.params.id, req.auth);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
