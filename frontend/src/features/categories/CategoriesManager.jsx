import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory
} from './categoriesApi.js';
import { CategoryForm } from './CategoryForm.jsx';
import { CategoryTable } from './CategoryTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function CategoriesManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextCategories, nextCompanies] = await Promise.all([
        fetchCategories(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
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

      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
      } else {
        await createCategory(payload);
      }

      setEditingCategory(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(category) {
    const shouldDelete = window.confirm(`Eliminar ${category.nombre}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteCategory(category.id);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <CategoryForm
        canSelectCompany={canSelectCompany}
        category={editingCategory}
        companies={companies}
        isSaving={isSaving}
        onCancel={() => setEditingCategory(null)}
        onSubmit={handleSubmit}
      />

      <CategoryTable
        categories={categories}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={setEditingCategory}
      />
    </div>
  );
}
