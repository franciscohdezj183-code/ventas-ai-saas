import { Navigate, Route, Routes } from 'react-router-dom';
import {
  CategoriesPage,
  BotPromptsPage,
  CompaniesPage,
  ConversationsPage,
  LeadsPage,
  OnboardingPage,
  ProductsPage,
  ServicesPage,
  SettingsPage,
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
        <Route path="inicio-guiado" element={<OnboardingPage />} />
        <Route path="empresas" element={<CompaniesPage />} />
        <Route path="usuarios" element={<UsersPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="servicios" element={<ServicesPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="conversaciones" element={<ConversationsPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
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
