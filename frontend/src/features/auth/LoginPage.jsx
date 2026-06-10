import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import logo from '../../../Logo.png';

const initialForm = {
  email: '',
  password: ''
};

function validateLoginForm(form) {
  const errors = {};
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!form.email.trim()) {
    errors.email = 'Ingresa tu correo.';
  } else if (!emailPattern.test(form.email)) {
    errors.email = 'Ingresa un correo valido.';
  }

  if (!form.password) {
    errors.password = 'Ingresa tu contrasena.';
  } else if (form.password.length < 6) {
    errors.password = 'La contrasena debe tener al menos 6 caracteres.';
  }

  return errors;
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.message ??
    'No pudimos iniciar sesion. Revisa tus datos e intenta de nuevo.'
  );
}

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: ''
    }));
    setApiError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateLoginForm(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      setIsSubmitting(true);
      await login({
        email: form.email.trim(),
        password: form.password
      });
      navigate('/', { replace: true });
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-hidden="true">
        <div className="login-brand">
          <span className="login-brand-logo">
            <img alt="Nexus IA" src={logo} />
          </span>
          <div>
            <strong>Nexus IA</strong>
            <small>SaaS empresarial</small>
          </div>
        </div>

        <div className="login-hero-copy">
          <span>
            <Sparkles size={16} aria-hidden="true" />
            Panel multiempresa
          </span>
          <strong>Administra ventas, leads y catalogos desde un solo lugar.</strong>
          <p>Una consola comercial para operar WhatsApp, productos, servicios y seguimiento de clientes con IA.</p>
        </div>

        <div className="login-benefits">
          <div>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Catalogo y CRM centralizados</span>
          </div>
          <div>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Atencion por WhatsApp conectada al negocio</span>
          </div>
          <div>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Usuarios y empresas con roles controlados</span>
          </div>
        </div>
      </section>

      <section className="login-panel" aria-label="Inicio de sesion">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-heading">
            <p className="eyebrow">Acceso administrativo</p>
            <h1>Iniciar sesion</h1>
            <p>Bienvenido de vuelta. Ingresa tus credenciales para continuar al panel.</p>
          </div>

          {apiError ? (
            <div className="login-alert">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>{apiError}</span>
            </div>
          ) : null}

          <label className="field-group" htmlFor="email">
            <span>Correo electronico</span>
            <div className={errors.email ? 'input-shell invalid' : 'input-shell'}>
              <Mail size={18} aria-hidden="true" />
              <input
                autoComplete="email"
                id="email"
                name="email"
                onChange={handleChange}
                placeholder="admin@empresa.com"
                type="email"
                value={form.email}
              />
            </div>
            {errors.email ? <small>{errors.email}</small> : null}
          </label>

          <label className="field-group" htmlFor="password">
            <span>Contrasena</span>
            <div className={errors.password ? 'input-shell invalid' : 'input-shell'}>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                autoComplete="current-password"
                id="password"
                name="password"
                onChange={handleChange}
                placeholder="Minimo 6 caracteres"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
              />
              <button
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                className="icon-button"
                onClick={() => setShowPassword((currentValue) => !currentValue)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password ? <small>{errors.password}</small> : null}
          </label>

          <button className="login-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <Loader2 className="spin-icon" size={18} aria-hidden="true" />
                Validando acceso...
              </>
            ) : (
              'Entrar al panel'
            )}
          </button>

          <div className="login-security-note">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>Acceso protegido para usuarios autorizados.</span>
          </div>
        </form>
      </section>
    </main>
  );
}
