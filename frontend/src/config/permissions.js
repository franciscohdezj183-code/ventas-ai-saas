export const ROLE_ALIASES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  super_admin: 'super_admin',
  owner: 'owner',
  seller: 'seller',
  support: 'support',
  viewer: 'viewer'
});

export const ROLE_PERMISSIONS = Object.freeze({
  super_admin: [
    'tenants.view',
    'tenants.manage',
    'users.view',
    'users.manage',
    'products.view',
    'products.manage',
    'customers.view',
    'customers.manage',
    'conversations.view',
    'conversations.manage',
    'orders.view',
    'orders.manage',
    'ai_config.view',
    'ai_config.manage',
    'whatsapp.view',
    'whatsapp.manage',
    'reports.view',
    'subscriptions.view',
    'subscriptions.manage',
    'billing.view',
    'billing.manage'
  ],
  owner: [
    'tenants.view',
    'tenants.manage',
    'users.view',
    'users.manage',
    'products.view',
    'products.manage',
    'customers.view',
    'customers.manage',
    'conversations.view',
    'conversations.manage',
    'orders.view',
    'orders.manage',
    'ai_config.view',
    'ai_config.manage',
    'whatsapp.view',
    'whatsapp.manage',
    'reports.view',
    'subscriptions.view',
    'subscriptions.manage',
    'billing.view',
    'billing.manage'
  ],
  seller: [
    'products.view',
    'customers.view',
    'conversations.view',
    'orders.view'
  ],
  support: [
    'customers.view',
    'conversations.view',
    'conversations.manage'
  ],
  viewer: [
    'reports.view',
    'conversations.view',
    'orders.view'
  ]
});

export function normalizeRole(role) {
  return ROLE_ALIASES[String(role ?? '').trim()] ?? null;
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === 'super_admin';
}

function getUserRole(userOrRole) {
  if (typeof userOrRole === 'object' && userOrRole !== null) {
    return userOrRole.normalizedRole ?? userOrRole.rol ?? userOrRole.role;
  }

  return userOrRole;
}

export function hasRole(userOrRole, role) {
  return normalizeRole(getUserRole(userOrRole)) === normalizeRole(role);
}

export function hasPermission(userOrRole, permission) {
  if (!permission) {
    return true;
  }

  const userPermissions = typeof userOrRole === 'object' && userOrRole !== null && Array.isArray(userOrRole.permissions)
    ? userOrRole.permissions
    : null;

  if (userPermissions?.includes(permission)) {
    return true;
  }

  const normalizedRole = normalizeRole(getUserRole(userOrRole));

  if (!normalizedRole) {
    return false;
  }

  return ROLE_PERMISSIONS[normalizedRole]?.includes(permission) ?? false;
}
