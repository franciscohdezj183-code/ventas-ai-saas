import {
  createCompany,
  deleteCompany,
  findCompanies,
  findCompanyById,
  updateCompany
} from './companies.service.js';

export async function listCompanies(req, res, next) {
  try {
    const companies = await findCompanies();
    res.json({ data: companies });
  } catch (error) {
    next(error);
  }
}

export async function getCompany(req, res, next) {
  try {
    const company = await findCompanyById(req.params.id);

    if (!company) {
      res.status(404).json({ message: 'Empresa no encontrada' });
      return;
    }

    res.json({ data: company });
  } catch (error) {
    next(error);
  }
}

export async function storeCompany(req, res, next) {
  try {
    const company = await createCompany(req.body);
    res.status(201).json({ data: company });
  } catch (error) {
    next(error);
  }
}

export async function patchCompany(req, res, next) {
  try {
    const company = await updateCompany(req.params.id, req.body);
    res.json({ data: company });
  } catch (error) {
    next(error);
  }
}

export async function removeCompany(req, res, next) {
  try {
    await deleteCompany(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
