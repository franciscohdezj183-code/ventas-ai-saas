import { Navigate, Route, Routes } from 'react-router-dom';
import {
  CategoriesPage,
  BotPromptsPage,
  CompaniesPage,
  ConversationsPage,
  LeadsPage,
  OnboardingPage,
  OrdersPage,
  OwnerCompanyPage,
  AIUsagePage,
  PlansPage,
  ProductsPage,
  ReportsPage,
  ServicesPage,
  SettingsPage,
  SuperAdminPage,
  UsersPage,
  WhatsAppPage
} from './pages/AdminSectionPages.jsx';
import { LoginPage } from './features/auth/LoginPage.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { hasPermission } from './config/permissions.js';
import { useAuth } from './context/AuthContext.jsx';
import { PermissionRoute, ProtectedRoute, RoleRoute } from './routes/ProtectedRoute.jsx';

const homeRouteCandidates = [
  { path: '/', permission: 'reports.view' },
  { path: '/conversaciones', permission: 'conversations.view' },
  { path: '/leads', permission: 'customers.view' },
  { path: '/pedidos', permission: 'orders.view' },
  { path: '/productos', permission: 'products.view' }
];

function HomeRoute() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const firstAllowedRoute = homeRouteCandidates.find((route) => hasPermission(user, route.permission));

  if (!firstAllowedRoute) {
    return null;
  }

  if (firstAllowedRoute.path !== '/') {
    return <Navigate to={firstAllowedRoute.path} replace />;
  }

  return <DashboardPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeRoute />} />
        <Route
          path="plan"
          element={
            <RoleRoute roles={['owner']}>
              <PermissionRoute permission="subscriptions.view">
                <OwnerCompanyPage />
              </PermissionRoute>
            </RoleRoute>
          }
        />
        <Route
          path="inicio-guiado"
          element={
            <PermissionRoute permission="tenants.view">
              <OnboardingPage />
            </PermissionRoute>
          }
        />
        <Route
          path="empresas"
          element={
            <PermissionRoute permission="tenants.view">
              <CompaniesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="usuarios"
          element={
            <PermissionRoute permission="users.view">
              <UsersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="categorias"
          element={
            <PermissionRoute permission="products.view">
              <CategoriesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="productos"
          element={
            <PermissionRoute permission="products.view">
              <ProductsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="servicios"
          element={
            <PermissionRoute permission="products.view">
              <ServicesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="leads"
          element={
            <PermissionRoute permission="customers.view">
              <LeadsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="conversaciones"
          element={
            <PermissionRoute permission="conversations.view">
              <ConversationsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="pedidos"
          element={
            <PermissionRoute permission="orders.view">
              <OrdersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="reportes"
          element={
            <PermissionRoute permission="reports.view">
              <ReportsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="whatsapp"
          element={
            <PermissionRoute permission="whatsapp.view">
              <WhatsAppPage />
            </PermissionRoute>
          }
        />
        <Route
          path="configuracion"
          element={
            <PermissionRoute permission="ai_config.view">
              <SettingsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="suscripciones"
          element={
            <RoleRoute roles={['super_admin']}>
              <PermissionRoute permission="subscriptions.view">
                <PlansPage />
              </PermissionRoute>
            </RoleRoute>
          }
        />
        <Route
          path="consumo-ia"
          element={
            <RoleRoute roles={['super_admin']}>
              <PermissionRoute permission="reports.view">
                <AIUsagePage />
              </PermissionRoute>
            </RoleRoute>
          }
        />
        <Route
          path="super-admin"
          element={
            <RoleRoute roles={['super_admin']}>
              <PermissionRoute permission="tenants.view">
                <SuperAdminPage />
              </PermissionRoute>
            </RoleRoute>
          }
        />
        <Route
          path="prompts-bot"
          element={
            <RoleRoute roles={['SUPER_ADMIN']}>
              <PermissionRoute permission="ai_config.view">
                <BotPromptsPage />
              </PermissionRoute>
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
