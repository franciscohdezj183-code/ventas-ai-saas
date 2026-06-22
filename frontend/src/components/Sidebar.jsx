import { LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import logo from '../../Logo.png';

const sectionOrder = ['Inicio', 'Operacion', 'Catalogo', 'Canales e IA', 'Administracion', 'Sistema'];

function groupItemsBySection(items) {
  const groupedItems = items.reduce((sections, item) => {
    const section = item.section ?? 'Workspace';

    if (!sections.has(section)) {
      sections.set(section, []);
    }

    sections.get(section).push(item);
    return sections;
  }, new Map());

  return sectionOrder
    .filter((section) => groupedItems.has(section))
    .map((section) => ({ label: section, items: groupedItems.get(section) }))
    .concat(
      [...groupedItems.entries()]
        .filter(([section]) => !sectionOrder.includes(section))
        .map(([label, sectionItems]) => ({ label, items: sectionItems }))
    );
}

function NexusBrand({ companyName }) {
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
    </div>
  );
}

function SidebarItem({ item, onNavigate, onTooltipHide, onTooltipShow }) {
  const Icon = item.icon;

  return (
    <NavLink
      aria-label={item.label}
      className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
      end={item.end}
      key={item.label}
      onBlur={onTooltipHide}
      onFocus={(event) => onTooltipShow?.(item.label, event.currentTarget)}
      onMouseEnter={(event) => onTooltipShow?.(item.label, event.currentTarget)}
      onMouseLeave={onTooltipHide}
      onClick={onNavigate}
      to={item.to}
    >
      <Icon size={19} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

function SidebarFooter({ onLogout, onThemeToggle, onTooltipHide, onTooltipShow, theme, user }) {
  const role = user?.rol ?? 'OWNER';
  const userName = user?.nombre ?? 'Administrador';
  const userEmail = user?.email ?? user?.correo ?? 'Sesion activa';
  const userInitial = userName.trim().charAt(0).toUpperCase() || 'N';
  const isDarkTheme = theme === 'dark';
  const ThemeIcon = isDarkTheme ? Sun : Moon;

  return (
    <div className="sidebar-footer">
      <button
        aria-label={isDarkTheme ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        aria-pressed={isDarkTheme}
        className="sidebar-theme-toggle"
        onBlur={onTooltipHide}
        onFocus={(event) => onTooltipShow?.(isDarkTheme ? 'Tema claro' : 'Tema oscuro', event.currentTarget)}
        onMouseEnter={(event) => onTooltipShow?.(isDarkTheme ? 'Tema claro' : 'Tema oscuro', event.currentTarget)}
        onMouseLeave={onTooltipHide}
        onClick={onThemeToggle}
        type="button"
      >
        <span className="sidebar-action-icon">
          <ThemeIcon size={16} aria-hidden="true" />
        </span>
        <span className="sidebar-theme-copy">
          <strong>{isDarkTheme ? 'Modo oscuro' : 'Modo claro'}</strong>
          <small>{isDarkTheme ? 'Cambiar a claro' : 'Cambiar a oscuro'}</small>
        </span>
      </button>

      <div className="sidebar-user-card">
        <span className="sidebar-user-avatar">{userInitial}</span>
        <div className="sidebar-user-copy">
          <strong>{userName}</strong>
          <small>{userEmail}</small>
          <span>
            <ShieldCheck size={13} aria-hidden="true" />
            {role}
          </span>
        </div>
      </div>

      <button
        aria-label="Cerrar sesion"
        className="sidebar-logout"
        onBlur={onTooltipHide}
        onClick={onLogout}
        onFocus={(event) => onTooltipShow?.('Cerrar sesion', event.currentTarget)}
        onMouseEnter={(event) => onTooltipShow?.('Cerrar sesion', event.currentTarget)}
        onMouseLeave={onTooltipHide}
        type="button"
      >
        <span className="sidebar-action-icon">
          <LogOut size={17} aria-hidden="true" />
        </span>
        <span>Cerrar sesion</span>
      </button>
    </div>
  );
}

export function Sidebar({
  companyName = 'Nexus IA',
  isCollapsed = false,
  items,
  onLogout,
  onNavigate,
  onThemeToggle,
  theme = 'light',
  user
}) {
  const sections = groupItemsBySection(items);
  const [tooltip, setTooltip] = useState(null);

  function showTooltip(label, element) {
    if (!isCollapsed || !element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 12
    });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  return (
    <aside className={`sidebar ${isCollapsed ? 'is-collapsed' : ''}`} aria-label="Menu principal">
      <NexusBrand companyName={companyName} />

      <nav className="nav-list" aria-label="Navegacion principal">
        {sections.map((section) => (
          <section className="nav-section" key={section.label} aria-label={section.label}>
            <div className="sidebar-section-label">
              <span>{section.label}</span>
            </div>
            <div className="nav-section-items">
              {section.items.map((item) => (
                <SidebarItem
                  item={item}
                  key={item.label}
                  onNavigate={onNavigate}
                  onTooltipHide={hideTooltip}
                  onTooltipShow={showTooltip}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>

      <SidebarFooter
        onLogout={onLogout}
        onThemeToggle={onThemeToggle}
        onTooltipHide={hideTooltip}
        onTooltipShow={showTooltip}
        theme={theme}
        user={user}
      />

      {tooltip ? (
        <div className="sidebar-floating-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.label}
        </div>
      ) : null}
    </aside>
  );
}
