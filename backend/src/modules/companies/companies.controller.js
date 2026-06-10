import {
  createCompany,
  deleteCompany,
  findCompanies,
  findCompanyById,
  updateCompany
} from './companies.service.js';
import { auditFromRequest } from '../audit/audit.service.js';

export async function listCompanies(req, res, next) {
  try {
    const companies = await findCompanies(req.auth);
    res.json({ data: companies });
  } catch (error) {
    next(error);
  }
}

export async function getCompany(req, res, next) {
  try {
    const company = await findCompanyById(req.params.id, req.auth);

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
    const company = await updateCompany(req.params.id, req.body, req.auth);
    await auditFromRequest(req, {
      accion: 'EDITAR',
      modulo: 'empresas',
      descripcion: `Empresa editada: ${company.nombre} (#${company.id})`,
      empresaId: company.id
    });
    res.json({ data: company });
  } catch (error) {
    next(error);
  }
}

export async function removeCompany(req, res, next) {
  try {
    await deleteCompany(req.params.id);
    await auditFromRequest(req, {
      accion: 'ELIMINAR',
      modulo: 'empresas',
      descripcion: `Empresa eliminada: #${req.params.id}`,
      empresaId: req.params.id
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
