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
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute.jsx';

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
        <Route index element={<DashboardPage />} />
        <Route
          path="mi-empresa"
          element={
            <RoleRoute roles={['owner']}>
              <OwnerCompanyPage />
            </RoleRoute>
          }
        />
        <Route path="inicio-guiado" element={<OnboardingPage />} />
        <Route path="empresas" element={<CompaniesPage />} />
        <Route path="usuarios" element={<UsersPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="servicios" element={<ServicesPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="conversaciones" element={<ConversationsPage />} />
        <Route path="pedidos" element={<OrdersPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route
          path="suscripciones"
          element={
            <RoleRoute roles={['super_admin']}>
              <PlansPage />
            </RoleRoute>
          }
        />
        <Route
          path="consumo-ia"
          element={
            <RoleRoute roles={['super_admin']}>
              <ReportsPage />
            </RoleRoute>
          }
        />
        <Route
          path="super-admin"
          element={
            <RoleRoute roles={['super_admin']}>
              <SuperAdminPage />
            </RoleRoute>
          }
        />
        <Route
          path="prompts-bot"
          element={
            <RoleRoute roles={['SUPER_ADMIN']}>
              <BotPromptsPage />
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
