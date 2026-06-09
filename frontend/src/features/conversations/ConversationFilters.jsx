export function ConversationFilters({
  canSelectCompany,
  companies,
  filters,
  onChange,
  onSearch
}) {
  return (
    <form className="filters-bar" onSubmit={onSearch}>
      <label className="field-group" htmlFor="filter-phone">
        <span>Buscar telefono</span>
        <input
          id="filter-phone"
          name="telefono_cliente"
          onChange={onChange}
          placeholder="Telefono"
          type="search"
          value={filters.telefono_cliente}
        />
      </label>

      {canSelectCompany ? (
        <label className="field-group" htmlFor="filter-company">
          <span>Empresa</span>
          <select id="filter-company" name="empresa_id" onChange={onChange} value={filters.empresa_id}>
            <option value="">Todas</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nombre}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button className="secondary-button" type="submit">
        Consultar historial
      </button>
    </form>
  );
}
