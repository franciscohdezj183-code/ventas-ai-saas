import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCategories } from '../categories/categoriesApi.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  importProducts,
  updateProduct
} from './productsApi.js';
import { ProductForm } from './ProductForm.jsx';
import { ProductImport } from './ProductImport.jsx';
import { ProductTable } from './ProductTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function ProductsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [products, setProducts] = useState([]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextProducts, nextCategories, nextCompanies] = await Promise.all([
        fetchProducts(),
        fetchCategories(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canSelectCompany]);

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      setEditingProduct(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(product) {
    const shouldDelete = window.confirm(`Eliminar ${product.nombre}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteProduct(product.id);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handleImport(payload) {
    try {
      setIsImporting(true);
      setError('');
      const result = await importProducts(payload);
      setImportResult(result);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <ProductImport
        canSelectCompany={canSelectCompany}
        companies={companies}
        importResult={importResult}
        isImporting={isImporting}
        onImport={handleImport}
      />

      <ProductForm
        canSelectCompany={canSelectCompany}
        categories={categories}
        companies={companies}
        isSaving={isSaving}
        onCancel={() => setEditingProduct(null)}
        onSubmit={handleSubmit}
        product={editingProduct}
      />

      <ProductTable
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={setEditingProduct}
        products={products}
      />
    </div>
  );
}
