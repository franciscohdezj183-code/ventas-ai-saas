import {
  Boxes,
  Building2,
  CreditCard,
  LayoutDashboard,
  MessageSquareText,
  MessageCircle,
  BarChart3,
  Settings,
  Sparkles,
  ShoppingBag,
  UserCog,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { hasPermission, normalizeRole } from '../config/permissions.js';
import { useAuth } from '../context/AuthContext.jsx';

const navigationByRole = {
  super_admin: [
    { label: 'Dashboard global', icon: LayoutDashboard, to: '/', end: true, permission: 'reports.view' },
    { label: 'Empresas', icon: Building2, to: '/super-admin', permission: 'tenants.view' },
    { label: 'Suscripciones', icon: CreditCard, to: '/suscripciones', permission: 'subscriptions.view' },
    { label: 'Consumo IA', icon: Sparkles, to: '/consumo-ia', permission: 'reports.view' },
    { label: 'Usuarios globales', icon: Users, to: '/usuarios', permission: 'users.view' },
    { label: 'Configuracion', icon: Settings, to: '/prompts-bot', roles: ['super_admin'] }
  ],
  owner: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true, permission: 'reports.view' },
    { label: 'Conversaciones', icon: MessageSquareText, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', icon: Users, to: '/leads', permission: 'customers.view' },
    { label: 'Productos', icon: Boxes, to: '/productos', permission: 'products.view' },
    { label: 'Pedidos', icon: ShoppingBag, to: '/pedidos', permission: 'orders.view' },
    { label: 'Reportes', icon: BarChart3, to: '/reportes', permission: 'reports.view' },
    { label: 'WhatsApp', icon: MessageCircle, to: '/whatsapp', permission: 'whatsapp.view' },
    { label: 'Configuracion IA', icon: Settings, to: '/configuracion', permission: 'ai_config.view' },
    { label: 'Usuarios', icon: UserCog, to: '/usuarios', permission: 'users.view' },
    { label: 'Plan', icon: CreditCard, to: '/mi-empresa', roles: ['owner'], permission: 'subscriptions.view' }
  ],
  seller: [
    { label: 'Conversaciones', icon: MessageSquareText, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', icon: Users, to: '/leads', permission: 'customers.view' },
    { label: 'Productos', icon: Boxes, to: '/productos', permission: 'products.view' },
    { label: 'Pedidos', icon: ShoppingBag, to: '/pedidos', permission: 'orders.view' }
  ],
  support: [
    { label: 'Conversaciones', icon: MessageSquareText, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', icon: Users, to: '/leads', permission: 'customers.view' }
  ],
  viewer: [
    { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true, permission: 'reports.view' },
    { label: 'Reportes', icon: BarChart3, to: '/reportes', permission: 'reports.view' },
    { label: 'Conversaciones', icon: MessageSquareText, to: '/conversaciones', permission: 'conversations.view' }
  ]
};

function canShowNavigationItem(item, user) {
  const roleAllowed = !item.roles || item.roles.map(normalizeRole).includes(normalizeRole(user?.rol));
  const permissionAllowed = !item.permission || hasPermission(user, item.permission);

  return roleAllowed && permissionAllowed;
}

function getPageTitle(pathname, items) {
  return items.find((item) => item.to === pathname)?.label ?? 'Dashboard';
}

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem('nexus-theme');

  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AdminLayout() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const companyName = user?.empresa?.nombre ?? 'Nexus IA';
  const normalizedRole = normalizeRole(user?.rol);
  const visibleNavigationItems = useMemo(
    () => (navigationByRole[normalizedRole] ?? []).filter((item) => canShowNavigationItem(item, user)),
    [normalizedRole, user]
  );
  const currentTitle = useMemo(() => getPageTitle(location.pathname, visibleNavigationItems), [location.pathname, visibleNavigationItems]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('nexus-theme', theme);
  }, [theme]);

  return (
    <div
      className={[
        'admin-shell',
        isSidebarOpen ? 'sidebar-open' : '',
        isSidebarCollapsed ? 'sidebar-collapsed' : ''
      ].filter(Boolean).join(' ')}
    >
      <Sidebar
        companyName={companyName}
        isCollapsed={isSidebarCollapsed}
        items={visibleNavigationItems}
        onNavigate={() => setIsSidebarOpen(false)}
      />
      <button
        aria-label="Cerrar menu"
        className="sidebar-backdrop"
        onClick={() => setIsSidebarOpen(false)}
        type="button"
      />
      <div className="admin-workspace">
        <Topbar
          companyName={companyName}
          isSidebarCollapsed={isSidebarCollapsed}
          onLogout={logout}
          onMenuClick={() => setIsSidebarOpen(true)}
          onThemeToggle={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
          onToggleSidebar={() => setIsSidebarCollapsed((currentValue) => !currentValue)}
          theme={theme}
          title={currentTitle}
          user={user}
        />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
