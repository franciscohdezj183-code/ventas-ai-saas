import {
  createProduct,
  deleteProduct,
  findProductById,
  findProducts,
  getCatalogInsights,
  importProducts,
  updateProduct
} from './products.service.js';
import xlsx from 'xlsx';
import { createHttpError } from '../../utils/http-error.js';
import { auditFromRequest } from '../audit/audit.service.js';

export async function listProducts(req, res, next) {
  try {
    const result = await findProducts(req.auth, {
      page: req.query.page,
      pageSize: req.query.page_size,
      search: req.query.search,
      categoria_id: req.query.categoria_id,
      estado: req.query.estado
    });

    if (Array.isArray(result)) {
      res.json({ data: result });
      return;
    }

    res.json({ data: result.items, meta: result.meta });
  } catch (error) {
    next(error);
  }
}

export async function catalogInsights(req, res, next) {
  try {
    res.json({ data: await getCatalogInsights(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req, res, next) {
  try {
    const product = await findProductById(req.params.id, req.auth);

    if (!product) {
      res.status(404).json({ message: 'Producto no encontrado' });
      return;
    }

    res.json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function storeProduct(req, res, next) {
  try {
    const product = await createProduct(req.body, req.auth, req.file);
    await auditFromRequest(req, {
      accion: 'CREAR',
      modulo: 'productos',
      descripcion: `Producto creado: ${product.nombre} (#${product.id})`,
      empresaId: product.empresa_id
    });
    res.status(201).json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function patchProduct(req, res, next) {
  try {
    const product = await updateProduct(req.params.id, req.body, req.auth, req.file);
    res.json({ data: product });
  } catch (error) {
    next(error);
  }
}

export async function removeProduct(req, res, next) {
  try {
    await deleteProduct(req.params.id, req.auth);
    await auditFromRequest(req, {
      accion: 'ELIMINAR',
      modulo: 'productos',
      descripcion: `Producto eliminado: #${req.params.id}`
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function importProductsFromExcel(req, res, next) {
  try {
    if (!req.file) {
      throw createHttpError(400, 'El archivo XLSX es requerido');
    }

    const workbook = xlsx.readFile(req.file.path);
    const [firstSheetName] = workbook.SheetNames;

    if (!firstSheetName) {
      throw createHttpError(400, 'El archivo XLSX no contiene hojas');
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      defval: '',
      raw: false
    });

    const result = await importProducts(rows, req.auth, req.body);
    await auditFromRequest(req, {
      accion: 'CREAR',
      modulo: 'productos',
      descripcion: `Importacion de productos procesada: ${result.insertados} insertados`
    });

    res.status(201).json({
      message: 'Importacion procesada',
      data: result
    });
  } catch (error) {
    next(error);
  }
}
