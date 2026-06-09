import { CategoriesManager } from '../features/categories/CategoriesManager.jsx';
import { CompaniesManager } from '../features/companies/CompaniesManager.jsx';
import { ConversationsManager } from '../features/conversations/ConversationsManager.jsx';
import { LeadsManager } from '../features/leads/LeadsManager.jsx';
import { ProductsManager } from '../features/products/ProductsManager.jsx';
import { ServicesManager } from '../features/services/ServicesManager.jsx';
import { UsersManager } from '../features/users/UsersManager.jsx';
import { WhatsAppManager } from '../features/whatsapp/WhatsAppManager.jsx';

function SectionPage({ title, description, children }) {
  return (
    <section className="panel-section">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function CompaniesPage() {
  return (
    <SectionPage
      description="Base inicial para administrar negocios dentro de la plataforma."
      title="Empresas"
    >
      <CompaniesManager />
    </SectionPage>
  );
}

export function UsersPage() {
  return (
    <SectionPage
      description="Administra accesos por empresa con roles SUPER_ADMIN y OWNER."
      title="Usuarios"
    >
      <UsersManager />
    </SectionPage>
  );
}

export function CategoriesPage() {
  return (
    <SectionPage
      description="Cada empresa ve y administra unicamente sus propias categorias."
      title="Categorias"
    >
      <CategoriesManager />
    </SectionPage>
  );
}

export function ProductsPage() {
  return (
    <SectionPage
      description="Administra inventario, precios, categorias e imagenes por empresa."
      title="Productos"
    >
      <ProductsManager />
    </SectionPage>
  );
}

export function ServicesPage() {
  return (
    <SectionPage description="Administra servicios, precios y duracion por empresa." title="Servicios">
      <ServicesManager />
    </SectionPage>
  );
}

export function LeadsPage() {
  return (
    <SectionPage
      description="Gestiona prospectos por empresa y visualiza estadisticas por estado."
      title="Leads"
    >
      <LeadsManager />
    </SectionPage>
  );
}

export function ConversationsPage() {
  return (
    <SectionPage
      description="Consulta el historial de mensajes y respuestas por telefono."
      title="Conversaciones"
    >
      <ConversationsManager />
    </SectionPage>
  );
}

export function WhatsAppPage() {
  return (
    <SectionPage description="Vincula una sesion independiente por empresa mediante QR." title="WhatsApp">
      <WhatsAppManager />
    </SectionPage>
  );
}

export function SettingsPage() {
  return (
    <SectionPage
      description="Parametros generales de la plataforma y preparacion para opciones avanzadas."
      title="Configuracion"
    >
      <div className="empty-state">
        <strong>Configuracion pendiente</strong>
        <p>Este modulo esta listo para conectar preferencias de empresa, permisos y automatizaciones.</p>
      </div>
    </SectionPage>
  );
}
