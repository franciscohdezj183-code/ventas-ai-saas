import { Edit3, Eye, Power, Trash2 } from 'lucide-react';
import { DataTable, StatusBadge } from '../../components/ui/index.js';

export function CompanyTable({ companies, isLoading, onDelete, onEdit, onToggle, onView }) {
  const columns = [
    {
      key: 'empresa',
      header: 'Empresa',
      render: (company) => (
        <div className="company-table-name">
          <strong>{company.nombre}</strong>
          <span className="muted-cell">{company.direccion || company.slug}</span>
        </div>
      )
    },
    { key: 'telefono', header: 'Telefono', render: (company) => company.telefono || '-' },
    { key: 'tipo', header: 'Tipo', render: (company) => company.tipo_negocio || '-' },
    {
      key: 'plan',
      header: 'Plan',
      render: (company) => <span className="plan-badge">{company.plan || 'SIN PLAN'}</span>
    },
    {
      key: 'activo',
      header: 'Estado',
      render: (company) => (
        <StatusBadge status={company.activo ? 'ACTIVA' : 'INACTIVA'}>
          {company.activo ? 'ACTIVA' : 'INACTIVA'}
        </StatusBadge>
      )
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (company) => (
        <div className="table-actions">
          <button aria-label="Ver empresa" onClick={() => onView(company)} type="button" title="Ver detalle">
            <Eye size={16} aria-hidden="true" />
          </button>
          <button aria-label="Editar empresa" onClick={() => onEdit(company)} type="button">
            <Edit3 size={16} aria-hidden="true" />
          </button>
          <button
            aria-label={company.activo ? 'Desactivar empresa' : 'Activar empresa'}
            onClick={() => onToggle(company)}
            type="button"
            title={company.activo ? 'Desactivar' : 'Activar'}
          >
            <Power size={16} aria-hidden="true" />
          </button>
          <button aria-label="Eliminar empresa" onClick={() => onDelete(company)} type="button">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={companies}
      emptyDescription="Crea una empresa para administrar usuarios, catalogo, WhatsApp y automatizaciones."
      emptyTitle="No hay empresas para mostrar"
      isLoading={isLoading}
      loadingMessage="Cargando empresas..."
      className="companies-data-table"
    />
  );
}
