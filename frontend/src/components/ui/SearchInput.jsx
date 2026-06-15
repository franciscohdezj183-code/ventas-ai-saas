import { Search, X } from 'lucide-react';

export function SearchInput({ value, onChange, placeholder = 'Buscar...', id = 'search-input' }) {
  return (
    <label className="search-input input input-bordered" htmlFor={id}>
      <Search size={18} aria-hidden="true" />
      <input
        id={id}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value ? (
        <button className="btn btn-ghost btn-xs btn-circle" aria-label="Limpiar busqueda" onClick={() => onChange?.('')} type="button">
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
