import { Navigate } from 'react-router-dom';
import { hasPermission, normalizeRole } from '../config/permissions.js';
import { useAuth } from '../context/AuthContext.jsx';

export function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function RoleRoute({ children, roles }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const normalizedRoles = roles.map((role) => normalizeRole(role)).filter(Boolean);

  if (!normalizedRoles.includes(normalizeRole(user.rol))) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export function PermissionRoute({ children, permission }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (!hasPermission(user, permission)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
