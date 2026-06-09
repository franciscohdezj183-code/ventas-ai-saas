import { Bell, LogOut, Search } from 'lucide-react';

export function Topbar({ onLogout, title = 'Dashboard', user }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Panel administrativo</p>
        <h1>{title}</h1>
      </div>

      <div className="topbar-actions">
        <label className="search-box" htmlFor="admin-search">
          <Search size={18} aria-hidden="true" />
          <input id="admin-search" placeholder="Buscar..." type="search" />
        </label>

        <button className="topbar-icon" aria-label="Notificaciones" type="button">
          <Bell size={19} aria-hidden="true" />
        </button>

        <div className="user-chip">
          <span>{user?.nombre?.charAt(0) ?? 'A'}</span>
          <div>
            <strong>{user?.nombre ?? 'Administrador'}</strong>
            <small>{user?.rol ?? 'OWNER'}</small>
          </div>
        </div>

        <button className="secondary-button" onClick={onLogout} type="button">
          <LogOut size={18} aria-hidden="true" />
          Salir
        </button>
      </div>
    </header>
  );
}
