import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './styles/global.css';
import './styles/modules/FormStyles.css';
import './styles/modules/TableStyles.css';
import './styles/modules/AdminLayout.css';
import './styles/modules/Sidebar.css';
import './styles/modules/Navbar.css';
import './styles/modules/LoginPage.css';
import './styles/modules/DashboardPage.css';
import './styles/modules/LeadsPage.css';
import './styles/modules/ConversationsPage.css';
import './styles/modules/ProductosPage.css';
import './styles/modules/EmpresasPage.css';
import './styles/modules/UsuariosPage.css';
import './styles/modules/categories.css';
import './styles/modules/ServiciosPage.css';
import './styles/modules/PedidosPage.css';
import './styles/modules/WhatsAppPage.css';
import './styles/modules/AISettingsPage.css';
import './styles/modules/AIUsagePage.css';
import './styles/modules/settings.css';
import './styles/modules/OnboardingPage.css';
import './styles/modules/admin.css';
import './styles/modules/ReportesPage.css';
import './styles/modules/PlansPage.css';
import './styles/modules/ModalStyles.css';
import './styles/design-system.css';

function applyInitialTheme() {
  const savedTheme = window.localStorage.getItem('nexus-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : prefersDark ? 'dark' : 'light';

  document.documentElement.setAttribute('data-theme', theme);
}

applyInitialTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/nexus">
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
