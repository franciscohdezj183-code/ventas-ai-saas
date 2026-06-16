import {
  createCompany,
  deleteCompany,
  findCompanies,
  findCompanyById,
  getSaasGlobalOverview,
  impersonateCompanyOwner,
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

export async function saasGlobalOverview(req, res, next) {
  try {
    res.json({ data: await getSaasGlobalOverview(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function impersonateOwner(req, res, next) {
  try {
    const session = await impersonateCompanyOwner(req.params.id, req.auth);
    await auditFromRequest(req, {
      accion: 'IMPERSONAR',
      modulo: 'empresas',
      descripcion: `SUPER_ADMIN ingreso como OWNER de empresa #${req.params.id}`,
      empresaId: req.params.id,
      usuarioId: req.auth.user.id
    });
    res.json({ data: session });
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
    const company = await createCompany({
      ...req.body,
      logo: req.file ? `/uploads/companies/${req.file.filename}` : req.body.logo
    });
    await auditFromRequest(req, {
      accion: 'CREAR',
      modulo: 'empresas',
      descripcion: `Empresa creada: ${company.nombre} (#${company.id})`,
      empresaId: company.id
    });
    res.status(201).json({ data: company });
  } catch (error) {
    next(error);
  }
}

export async function patchCompany(req, res, next) {
  try {
    const company = await updateCompany(req.params.id, {
      ...req.body,
      logo: req.file ? `/uploads/companies/${req.file.filename}` : req.body.logo
    }, req.auth);
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
