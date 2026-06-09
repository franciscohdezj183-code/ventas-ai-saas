import { NavLink } from 'react-router-dom';

export function Sidebar({ items }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">VA</span>
        <div>
          <span>Ventas AI</span>
          <small>SaaS Admin</small>
        </div>
      </div>

      <nav className="nav-list" aria-label="Navegacion principal">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              end={item.end}
              key={item.label}
              to={item.to}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
