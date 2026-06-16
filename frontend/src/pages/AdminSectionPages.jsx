import { CategoriesManager } from '../features/categories/CategoriesManager.jsx';
import { BotPromptsManager } from '../features/botPrompts/BotPromptsManager.jsx';
import { CompaniesManager } from '../features/companies/CompaniesManager.jsx';
import { CompanySettingsManager } from '../features/companySettings/CompanySettingsManager.jsx';
import { ConversationsManager } from '../features/conversations/ConversationsManager.jsx';
import { LeadsManager } from '../features/leads/LeadsManager.jsx';
import { OnboardingManager } from '../features/onboarding/OnboardingManager.jsx';
import { OrdersPlaceholder } from '../features/orders/OrdersPlaceholder.jsx';
import { OwnerCompanyPanel } from '../features/owner/OwnerCompanyPanel.jsx';
import { ProductsManager } from '../features/products/ProductsManager.jsx';
import { ReportsManager } from '../features/reports/ReportsManager.jsx';
import { ServicesManager } from '../features/services/ServicesManager.jsx';
import { SuperAdminPanel } from '../features/superAdmin/SuperAdminPanel.jsx';
import { UsersManager } from '../features/users/UsersManager.jsx';
import { WhatsAppManager } from '../features/whatsapp/WhatsAppManager.jsx';

function SectionPage({ title, description, actions, children }) {
  return (
    <section className="panel-section">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {actions ? <div className="header-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function CompaniesPage() {
  return <CompaniesManager />;
}

export function OnboardingPage() {
  return <OnboardingManager />;
}

export function UsersPage() {
  return <UsersManager />;
}

export function CategoriesPage() {
  return <CategoriesManager />;
}

export function ProductsPage() {
  return <ProductsManager />;
}

export function ServicesPage() {
  return <ServicesManager />;
}

export function LeadsPage() {
  return <LeadsManager />;
}

export function ConversationsPage() {
  return <ConversationsManager />;
}

export function WhatsAppPage() {
  return <WhatsAppManager />;
}

export function SettingsPage() {
  return <CompanySettingsManager />;
}

export function BotPromptsPage() {
  return <BotPromptsManager />;
}

export function SuperAdminPage() {
  return <SuperAdminPanel />;
}

export function OwnerCompanyPage() {
  return <OwnerCompanyPanel />;
}

export function OrdersPage() {
  return <OrdersPlaceholder />;
}

export function ReportsPage() {
  return <ReportsManager />;
}
