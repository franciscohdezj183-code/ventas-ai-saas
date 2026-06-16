import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  Building2,
  MessageCircle,
  MessageSquareText,
  PackageCheck,
  Save,
  ShoppingBag,
  Upload,
  Users
} from 'lucide-react';
import { ErrorState, LoadingState, StatusBadge } from '../../components/ui/index.js';
import { fetchCompanies, updateCompany } from '../companies/companiesApi.js';
import { fetchCompanySettings, saveCompanySetting } from '../companySettings/companySettingsApi.js';

const emptyBusinessForm = {
  nombre: '',
  telefono: '',
  direccion: '',
  tipo_negocio: '',
  logo: null
};

const emptyAiForm = {
  nombre_bot: '',
  tono_respuesta: '',
  mensaje_bienvenida: ''
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function OwnerAction({ description, icon: Icon, label, to }) {
  return (
    <Link className="saas-company-card" to={to}>
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <Icon size={20} aria-hidden="true" />
    </Link>
  );
}

export function OwnerCompanyPanel() {
  const [company, setCompany] = useState(null);
  const [settings, setSettings] = useState(null);
  const [businessForm, setBusinessForm] = useState(emptyBusinessForm);
  const [aiForm, setAiForm] = useState(emptyAiForm);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingBusiness, setIsSavingBusiness] = useState(false);
  const [isSavingAi, setIsSavingAi] = useState(false);

  const logoPreview = useMemo(() => {
    if (businessForm.logo) {
      return URL.createObjectURL(businessForm.logo);
    }

    return company?.logo ?? settings?.empresa_logo ?? null;
  }, [businessForm.logo, company?.logo, settings?.empresa_logo]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [companies, settingsRows] = await Promise.all([
        fetchCompanies(),
        fetchCompanySettings()
      ]);
      const nextCompany = companies[0] ?? null;
      const nextSettings = settingsRows[0] ?? null;

      setCompany(nextCompany);
      setSettings(nextSettings);
      setBusinessForm({
        nombre: nextCompany?.nombre ?? '',
        telefono: nextCompany?.telefono ?? '',
        direccion: nextCompany?.direccion ?? nextSettings?.empresa_direccion ?? '',
        tipo_negocio: nextCompany?.tipo_negocio ?? '',
        logo: null
      });
      setAiForm({
        nombre_bot: nextSettings?.nombre_bot ?? '',
        tono_respuesta: nextSettings?.tono_respuesta ?? '',
        mensaje_bienvenida: nextSettings?.mensaje_bienvenida ?? ''
      });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleBusinessChange(event) {
    const { files, name, type, value } = event.target;

    setBusinessForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'file' ? files?.[0] ?? null : value
    }));
  }

  function handleAiChange(event) {
    const { name, value } = event.target;

    setAiForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function handleBusinessSubmit(event) {
    event.preventDefault();

    if (!company?.id) {
      return;
    }

    try {
      setIsSavingBusiness(true);
      setError('');
      const payload = new FormData();
      payload.append('nombre', businessForm.nombre);
      payload.append('telefono', businessForm.telefono);
      payload.append('direccion', businessForm.direccion);
      payload.append('tipo_negocio', businessForm.tipo_negocio);
      payload.append('plan', company.plan);
      payload.append('activo', String(company.activo));

      if (businessForm.logo) {
        payload.append('logo', businessForm.logo);
      }

      setCompany(await updateCompany(company.id, payload));
      setBusinessForm((currentForm) => ({ ...currentForm, logo: null }));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSavingBusiness(false);
    }
  }

  async function handleAiSubmit(event) {
    event.preventDefault();

    try {
      setIsSavingAi(true);
      setError('');
      const savedSettings = await saveCompanySetting({
        ...settings,
        ...aiForm,
        empresa_id: settings?.empresa_id ?? company?.id
      });
      setSettings(savedSettings);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSavingAi(false);
    }
  }

  if (isLoading) {
    return <LoadingState message="Cargando panel de empresa..." />;
  }

  return (
    <div className="resource-page settings-page">
      <div className="settings-unified-header">
        <div>
          <span className="settings-header-icon">
            <Building2 size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Mi empresa</p>
            <h1>{company?.nombre ?? 'Panel de empresa'}</h1>
            <p>Administra tu negocio, asistente IA, usuarios, WhatsApp y operacion comercial.</p>
          </div>
        </div>
        <div className="settings-header-summary">
          <div>
            <PackageCheck size={18} aria-hidden="true" />
            <span>Plan {company?.plan ?? settings?.empresa_plan ?? '-'}</span>
          </div>
          <div className={company?.activo ? 'active' : ''}>
            <Building2 size={18} aria-hidden="true" />
            <span>{company?.activo ? 'Empresa activa' : 'Empresa suspendida'}</span>
          </div>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <section className="saas-command-grid" aria-label="Accesos del owner">
        <OwnerAction description="Administrar accesos del equipo" icon={Users} label="Usuarios" to="/usuarios" />
        <OwnerAction description="Conectar o revisar el canal" icon={MessageCircle} label="WhatsApp" to="/whatsapp" />
        <OwnerAction description="Ver catalogo del negocio" icon={PackageCheck} label="Productos" to="/productos" />
        <OwnerAction description="Leads y clientes capturados" icon={Users} label="Clientes" to="/leads" />
        <OwnerAction description="Historial e inbox de atencion" icon={MessageSquareText} label="Conversaciones" to="/conversaciones" />
        <OwnerAction description="Vista lista para conectar pedidos" icon={ShoppingBag} label="Pedidos" to="/pedidos" />
        <OwnerAction description="Indicadores y reportes" icon={BarChart3} label="Reportes" to="/" />
      </section>

      <section className="enterprise-dashboard-grid">
        <form className="settings-section" onSubmit={handleBusinessSubmit}>
          <header>
            <span><Building2 size={19} aria-hidden="true" /></span>
            <div>
              <h2>Datos del negocio</h2>
              <p>Edita informacion publica, logo y datos comerciales.</p>
            </div>
          </header>
          <div className="settings-section-body">
            <div className="form-grid">
              <label className="field-group" htmlFor="owner-company-name">
                <span>Nombre</span>
                <input id="owner-company-name" name="nombre" onChange={handleBusinessChange} value={businessForm.nombre} />
              </label>
              <label className="field-group" htmlFor="owner-company-phone">
                <span>Telefono</span>
                <input id="owner-company-phone" name="telefono" onChange={handleBusinessChange} value={businessForm.telefono} />
              </label>
              <label className="field-group" htmlFor="owner-company-type">
                <span>Tipo de negocio</span>
                <input id="owner-company-type" name="tipo_negocio" onChange={handleBusinessChange} value={businessForm.tipo_negocio} />
              </label>
              <label className="field-group" htmlFor="owner-company-logo">
                <span>Logo</span>
                <input accept="image/*" id="owner-company-logo" name="logo" onChange={handleBusinessChange} type="file" />
              </label>
              <label className="field-group full-field" htmlFor="owner-company-address">
                <span>Direccion</span>
                <input id="owner-company-address" name="direccion" onChange={handleBusinessChange} value={businessForm.direccion} />
              </label>
            </div>
            {logoPreview ? (
              <div className="settings-preview-meta">
                <img alt="Logo de la empresa" className="product-image sm" src={logoPreview} />
                <span>Logo actual del negocio</span>
              </div>
            ) : null}
            <div className="form-actions">
              <button className="primary-button" disabled={isSavingBusiness} type="submit">
                <Upload size={18} aria-hidden="true" />
                {isSavingBusiness ? 'Guardando...' : 'Guardar negocio'}
              </button>
            </div>
          </div>
        </form>

        <form className="settings-section" onSubmit={handleAiSubmit}>
          <header>
            <span><Bot size={19} aria-hidden="true" /></span>
            <div>
              <h2>IA y bienvenida</h2>
              <p>Configura la personalidad y el primer mensaje del asistente.</p>
            </div>
          </header>
          <div className="settings-section-body">
            <div className="form-grid">
              <label className="field-group" htmlFor="owner-ai-name">
                <span>Nombre/persona IA</span>
                <input id="owner-ai-name" name="nombre_bot" onChange={handleAiChange} value={aiForm.nombre_bot} />
              </label>
              <label className="field-group" htmlFor="owner-ai-tone">
                <span>Tono</span>
                <input id="owner-ai-tone" name="tono_respuesta" onChange={handleAiChange} value={aiForm.tono_respuesta} />
              </label>
              <label className="field-group full-field" htmlFor="owner-ai-welcome">
                <span>Mensaje de bienvenida</span>
                <textarea id="owner-ai-welcome" name="mensaje_bienvenida" onChange={handleAiChange} value={aiForm.mensaje_bienvenida} />
              </label>
            </div>
            <div className="settings-preview-card">
              <div className="settings-chat-preview">
                <small>{aiForm.nombre_bot || 'Asistente'}</small>
                <p>{aiForm.mensaje_bienvenida || 'Hola, gracias por escribirnos. Como podemos ayudarte?'}</p>
              </div>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={isSavingAi} type="submit">
                <Save size={18} aria-hidden="true" />
                {isSavingAi ? 'Guardando...' : 'Guardar IA'}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="panel-section">
        <div className="section-header dashboard-section-header">
          <div>
            <h2>Pedidos</h2>
            <p>La vista queda preparada para conectarse al modulo de pedidos cuando exista endpoint.</p>
          </div>
          <ShoppingBag size={22} aria-hidden="true" />
        </div>
        <StatusBadge status="PENDIENTE">Modulo pendiente</StatusBadge>
      </section>
    </div>
  );
}
