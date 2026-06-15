import { Navigate } from 'react-router-dom';
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

  if (!roles.includes(user.rol)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
