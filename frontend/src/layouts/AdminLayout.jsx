import {
  Boxes,
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
  { label: 'Configuracion', icon: Settings, to: '/configuracion' }
];

function getPageTitle(pathname) {
  return navigationItems.find((item) => item.to === pathname)?.label ?? 'Dashboard';
}

export function AdminLayout() {
  const { logout, user } = useAuth();
  const location = useLocation();

  return (
    <div className="admin-shell">
      <Sidebar items={navigationItems} />
      <div className="admin-workspace">
        <Topbar onLogout={logout} title={getPageTitle(location.pathname)} user={user} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
