import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission, hasRole } from '../config/permissions.js';

export function Can({ children, fallback = null, permission, role, user: explicitUser }) {
  const { user: authUser } = useAuth();
  const user = explicitUser ?? authUser;

  const allowedByPermission = permission ? hasPermission(user, permission) : true;
  const allowedByRole = role ? hasRole(user, role) : true;

  if (!user || !allowedByPermission || !allowedByRole) {
    return fallback;
  }

  return children;
}
