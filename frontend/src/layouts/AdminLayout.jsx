import {
  Building2,
  Bot,
  CreditCard,
  Home,
  Inbox,
  MessageCircle,
  BarChart3,
  Package,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  ClipboardList,
  Tags,
  UserCog,
  Users,
  Wrench
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { hasPermission, normalizeRole } from '../config/permissions.js';
import { useAuth } from '../context/AuthContext.jsx';

const navigationByRole = {
  super_admin: [
    { label: 'Dashboard', section: 'Inicio', icon: Home, to: '/', end: true, permission: 'reports.view' },
    { label: 'Conversaciones', section: 'Operacion', icon: Inbox, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', section: 'Operacion', icon: Users, to: '/leads', permission: 'customers.view' },
    { label: 'Pedidos', section: 'Operacion', icon: ClipboardList, to: '/pedidos', permission: 'orders.view' },
    { label: 'Productos', section: 'Catalogo', icon: Package, to: '/productos', permission: 'products.view' },
    { label: 'Categorias', section: 'Catalogo', icon: Tags, to: '/categorias', permission: 'products.view' },
    { label: 'Servicios', section: 'Catalogo', icon: Wrench, to: '/servicios', permission: 'products.view' },
    { label: 'WhatsApp', section: 'Canales e IA', icon: MessageCircle, to: '/whatsapp', permission: 'whatsapp.view' },
    { label: 'Configuracion IA', section: 'Canales e IA', icon: Bot, to: '/prompts-bot', roles: ['super_admin'], permission: 'ai_config.view' },
    { label: 'Centro super admin', section: 'Administracion', icon: ShieldCheck, to: '/super-admin', permission: 'tenants.view' },
    { label: 'Directorio empresas', section: 'Administracion', icon: Building2, to: '/empresas', permission: 'tenants.view' },
    { label: 'Inicio guiado', section: 'Administracion', icon: Rocket, to: '/inicio-guiado', permission: 'tenants.view' },
    { label: 'Suscripciones', section: 'Administracion', icon: CreditCard, to: '/suscripciones', permission: 'subscriptions.view' },
    { label: 'Consumo IA', section: 'Administracion', icon: Sparkles, to: '/consumo-ia', permission: 'reports.view' },
    { label: 'Usuarios globales', section: 'Administracion', icon: Users, to: '/usuarios', permission: 'users.view' },
    { label: 'Configuracion', section: 'Sistema', icon: Settings, to: '/configuracion', permission: 'ai_config.view' }
  ],
  owner: [
    { label: 'Dashboard', section: 'Inicio', icon: Home, to: '/', end: true, permission: 'reports.view' },
    { label: 'Conversaciones', section: 'Operacion', icon: Inbox, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', section: 'Operacion', icon: Users, to: '/leads', permission: 'customers.view' },
    { label: 'Pedidos', section: 'Operacion', icon: ClipboardList, to: '/pedidos', permission: 'orders.view' },
    { label: 'Productos', section: 'Catalogo', icon: Package, to: '/productos', permission: 'products.view' },
    { label: 'Categorias', section: 'Catalogo', icon: Tags, to: '/categorias', permission: 'products.view' },
    { label: 'Servicios', section: 'Catalogo', icon: Wrench, to: '/servicios', permission: 'products.view' },
    { label: 'WhatsApp', section: 'Canales e IA', icon: MessageCircle, to: '/whatsapp', permission: 'whatsapp.view' },
    { label: 'Configuracion', section: 'Sistema', icon: Settings, to: '/configuracion', permission: 'ai_config.view' },
    { label: 'Reportes', section: 'Administracion', icon: BarChart3, to: '/reportes', permission: 'reports.view' },
    { label: 'Usuarios', section: 'Administracion', icon: UserCog, to: '/usuarios', permission: 'users.view' },
    { label: 'Plan', section: 'Administracion', icon: CreditCard, to: '/mi-empresa', roles: ['owner'], permission: 'subscriptions.view' }
  ],
  seller: [
    { label: 'Conversaciones', section: 'Operacion', icon: Inbox, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', section: 'Operacion', icon: Users, to: '/leads', permission: 'customers.view' },
    { label: 'Pedidos', section: 'Operacion', icon: ClipboardList, to: '/pedidos', permission: 'orders.view' },
    { label: 'Productos', section: 'Catalogo', icon: Package, to: '/productos', permission: 'products.view' },
    { label: 'Categorias', section: 'Catalogo', icon: Tags, to: '/categorias', permission: 'products.view' },
    { label: 'Servicios', section: 'Catalogo', icon: Wrench, to: '/servicios', permission: 'products.view' }
  ],
  support: [
    { label: 'Conversaciones', section: 'Operacion', icon: Inbox, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Clientes', section: 'Operacion', icon: Users, to: '/leads', permission: 'customers.view' }
  ],
  viewer: [
    { label: 'Dashboard', section: 'Inicio', icon: Home, to: '/', end: true, permission: 'reports.view' },
    { label: 'Conversaciones', section: 'Operacion', icon: Inbox, to: '/conversaciones', permission: 'conversations.view' },
    { label: 'Pedidos', section: 'Operacion', icon: ClipboardList, to: '/pedidos', permission: 'orders.view' },
    { label: 'Reportes', section: 'Administracion', icon: BarChart3, to: '/reportes', permission: 'reports.view' }
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
        onLogout={logout}
        onNavigate={() => setIsSidebarOpen(false)}
        onThemeToggle={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        theme={theme}
        user={user}
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
