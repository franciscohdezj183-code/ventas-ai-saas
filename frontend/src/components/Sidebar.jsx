import { ChevronsLeft, ChevronsRight, Sparkles } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import logo from '../../Logo.png';

function NexusBrand({ companyName, isCollapsed }) {
  return (
    <div className="brand">
      <span className="brand-logo">
        <img alt="Nexus IA" src={logo} />
      </span>
      <div className="brand-copy">
        <span className="brand-name" aria-label="Nexus IA">
          <strong>Nexus</strong>
          <em>IA</em>
        </span>
        <small>{companyName}</small>
      </div>
      {isCollapsed ? <span className="brand-tooltip">Nexus IA</span> : null}
    </div>
  );
}

function SidebarItem({ item, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
      data-tooltip={item.label}
      end={item.end}
      key={item.label}
      onClick={onNavigate}
      to={item.to}
    >
      <Icon size={19} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function Sidebar({ companyName = 'Nexus IA', isCollapsed = false, items, onNavigate, onToggleCollapse }) {
  return (
    <aside className="sidebar" aria-label="Menu principal">
      <button
        aria-label={isCollapsed ? 'Expandir menu' : 'Colapsar menu'}
        className="sidebar-collapse-button"
        onClick={onToggleCollapse}
        type="button"
      >
        {isCollapsed ? <ChevronsRight size={17} aria-hidden="true" /> : <ChevronsLeft size={17} aria-hidden="true" />}
      </button>

      <NexusBrand companyName={companyName} isCollapsed={isCollapsed} />

      <div className="sidebar-section-label">
        <Sparkles size={14} aria-hidden="true" />
        <span>Workspace</span>
      </div>

      <nav className="nav-list" aria-label="Navegacion principal">
        {items.map((item) => (
          <SidebarItem item={item} key={item.label} onNavigate={onNavigate} />
        ))}
      </nav>
    </aside>
  );
}
