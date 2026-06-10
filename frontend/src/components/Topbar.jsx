import { Building2, ChevronDown, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

export function Topbar({ companyName = 'Nexus IA', onLogout, onMenuClick, title = 'Dashboard', user }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const role = user?.rol ?? 'OWNER';
  const userName = user?.nombre ?? 'Administrador';
  const userEmail = user?.email ?? user?.correo ?? 'Sesion activa';
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'N';

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <button className="topbar-menu" onClick={onMenuClick} type="button" aria-label="Abrir menu">
          <Menu size={20} aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Panel Nexus IA</p>
          <p className="topbar-title">{title}</p>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="topbar-company-pill">
          <Building2 size={17} aria-hidden="true" />
          <div>
            <span>Empresa actual</span>
            <strong>{companyName}</strong>
          </div>
        </div>

        <div className="user-menu">
          <button
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            className="user-menu-trigger"
            onClick={() => setIsMenuOpen((currentValue) => !currentValue)}
            type="button"
          >
            <span className="user-avatar">{userInitial}</span>
            <div>
              <strong>{userName}</strong>
              <small>{role}</small>
            </div>
            <ChevronDown size={16} aria-hidden="true" />
          </button>

          {isMenuOpen ? (
            <div className="user-dropdown" role="menu">
              <div className="user-dropdown-header">
                <span className="user-avatar large">{userInitial}</span>
                <div>
                  <strong>{userName}</strong>
                  <small>{userEmail}</small>
                </div>
              </div>
              <div className="user-dropdown-role">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>{role}</span>
              </div>
              <button className="logout-button" onClick={onLogout} role="menuitem" type="button">
                <LogOut size={18} aria-hidden="true" />
                <span>Cerrar sesion</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
