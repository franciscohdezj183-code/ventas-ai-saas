import {
  Boxes,
  Bot,
  Building2,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  MessageSquareText,
  MessageCircle,
  Settings,
  Users,
  Wrench
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const navigationItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true },
  { label: 'Empresas', icon: Building2, to: '/empresas' },
  { label: 'Usuarios', icon: Users, to: '/usuarios' },
  { label: 'Categorias', icon: FolderTree, to: '/categorias' },
  { label: 'Productos', icon: Boxes, to: '/productos' },
  { label: 'Servicios', icon: Wrench, to: '/servicios' },
  { label: 'Leads', icon: ClipboardList, to: '/leads' },
  { label: 'Conversaciones', icon: MessageSquareText, to: '/conversaciones' },
  { label: 'WhatsApp', icon: MessageCircle, to: '/whatsapp' },
  { label: 'Prompts del Bot', icon: Bot, to: '/prompts-bot', roles: ['SUPER_ADMIN'] },
  { label: 'Configuracion', icon: Settings, to: '/configuracion' }
];

function getPageTitle(pathname, items) {
  return items.find((item) => item.to === pathname)?.label ?? 'Dashboard';
}

export function AdminLayout() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const companyName = user?.empresa?.nombre ?? 'Nexus IA';
  const visibleNavigationItems = useMemo(
    () => navigationItems.filter((item) => !item.roles || item.roles.includes(user?.rol)),
    [user?.rol]
  );
  const currentTitle = useMemo(() => getPageTitle(location.pathname, visibleNavigationItems), [location.pathname, visibleNavigationItems]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

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
        onToggleCollapse={() => setIsSidebarCollapsed((currentValue) => !currentValue)}
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
          onLogout={logout}
          onMenuClick={() => setIsSidebarOpen(true)}
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
