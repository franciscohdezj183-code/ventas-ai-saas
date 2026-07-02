import { useEffect, useMemo, useState } from 'react';
import { Bot, Gauge, MessageSquareText, RefreshCcw, RotateCcw, ShieldCheck } from 'lucide-react';
import { fetchNcieQuality, fetchNcieTenants, updateNcieTenantEngine } from './ncieAdminApi.js';

function engineLabel(engine) {
  if (engine === 'ncie') return 'NCIE';
  if (engine === 'shadow') return 'Shadow';
  return 'Legacy';
}

function qualityTone(score) {
  if (score >= 85) return 'success';
  if (score >= 65) return 'warning';
  return 'danger';
}

function Metric({ icon: Icon, label, tone = '', value }) {
  return (
    <article className={`metric-card ${tone}`.trim()}>
      <span className="metric-icon"><Icon size={20} aria-hidden="true" /></span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

export function NCIEAdminPanel() {
  const [tenants, setTenants] = useState([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => String(tenant.empresa_id) === String(selectedEmpresaId)) ?? tenants[0] ?? null,
    [selectedEmpresaId, tenants]
  );

  async function loadData(nextEmpresaId = selectedEmpresaId) {
    try {
      setIsLoading(true);
      setError('');
      const nextTenants = await fetchNcieTenants();
      const empresaId = nextEmpresaId || nextTenants[0]?.empresa_id || '';
      const nextQuality = empresaId ? await fetchNcieQuality(empresaId) : null;

      setTenants(nextTenants);
      setSelectedEmpresaId(empresaId);
      setQuality(nextQuality);
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudo cargar la calidad NCIE.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function updateEngine(engine) {
    if (!selectedTenant) return;

    try {
      setIsSaving(true);
      setError('');
      await updateNcieTenantEngine(selectedTenant.empresa_id, {
        conversation_engine_version: engine,
        ncie_enabled: engine === 'ncie',
        ncie_canary_percentage: engine === 'ncie' ? 100 : 0
      });
      await loadData(selectedTenant.empresa_id);
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudo actualizar el motor.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="panel-section">
        <div className="loading-state">Cargando calidad NCIE...</div>
      </section>
    );
  }

  return (
    <div className="resource-page">
      <section className="section-card">
        <header className="section-header">
          <div>
            <p className="eyebrow">Canary NCIE</p>
            <h2>Control conversacional por empresa</h2>
            <p>Activa shadow, canary NCIE o rollback a legacy por tenant.</p>
          </div>
          <button className="secondary-button" disabled={isSaving} onClick={() => loadData(selectedTenant?.empresa_id)} type="button">
            <RefreshCcw size={18} aria-hidden="true" />
            Actualizar
          </button>
        </header>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="form-grid">
          <label>
            Empresa
            <select onChange={(event) => loadData(event.target.value)} value={selectedTenant?.empresa_id ?? ''}>
              {tenants.map((tenant) => (
                <option key={tenant.empresa_id} value={tenant.empresa_id}>{tenant.empresa_nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Canary %
            <input
              disabled
              type="number"
              value={selectedTenant?.ncie_canary_percentage ?? 0}
            />
          </label>
          <label>
            Motor actual
            <input disabled value={engineLabel(selectedTenant?.conversation_engine_version)} />
          </label>
          <label>
            Shadow activo
            <input disabled value={selectedTenant?.conversation_engine_version === 'shadow' ? 'Si' : 'No'} />
          </label>
        </div>

        <div className="metrics-grid">
          <Metric icon={Gauge} label="Quality score" tone={qualityTone(selectedTenant?.quality_score ?? 0)} value={`${selectedTenant?.quality_score ?? 0}%`} />
          <Metric icon={MessageSquareText} label="Mensajes evaluados" value={quality?.total_mensajes_evaluados ?? 0} />
          <Metric icon={Bot} label="NCIE" value={`${quality?.porcentaje_ncie ?? 0}%`} />
          <Metric icon={RotateCcw} label="Fallback" value={`${quality?.tasa_fallback ?? 0}%`} />
        </div>

        <div className="action-bar">
          <button className="secondary-button" disabled={isSaving} onClick={() => updateEngine('shadow')} type="button">
            <ShieldCheck size={18} aria-hidden="true" />
            Activar shadow
          </button>
          <button className="primary-button" disabled={isSaving} onClick={() => updateEngine('ncie')} type="button">
            <Bot size={18} aria-hidden="true" />
            Activar NCIE
          </button>
          <button className="secondary-button danger-soft" disabled={isSaving} onClick={() => updateEngine('legacy')} type="button">
            <RotateCcw size={18} aria-hidden="true" />
            Volver a legacy
          </button>
        </div>
      </section>
    </div>
  );
}
