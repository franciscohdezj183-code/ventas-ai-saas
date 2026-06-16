export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  SELLER: 'seller',
  SUPPORT: 'support',
  VIEWER: 'viewer'
});

export const ROLE_ALIASES = Object.freeze({
  SUPER_ADMIN: ROLES.SUPER_ADMIN,
  OWNER: ROLES.OWNER,
  super_admin: ROLES.SUPER_ADMIN,
  owner: ROLES.OWNER,
  seller: ROLES.SELLER,
  support: ROLES.SUPPORT,
  viewer: ROLES.VIEWER
});

export const PERMISSIONS = Object.freeze([
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
]);

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: PERMISSIONS,
  [ROLES.OWNER]: [
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
  [ROLES.SELLER]: [
    'products.view',
    'customers.view',
    'conversations.view',
    'orders.view'
  ],
  [ROLES.SUPPORT]: [
    'customers.view',
    'conversations.view',
    'conversations.manage'
  ],
  [ROLES.VIEWER]: [
    'reports.view',
    'conversations.view',
    'orders.view'
  ]
});

export function normalizeRole(role) {
  return ROLE_ALIASES[String(role ?? '').trim()] ?? null;
}

export function isKnownRole(role) {
  return Boolean(normalizeRole(role));
}

export function getPermissionsForRole(role) {
  const normalizedRole = normalizeRole(role);

  if (!normalizedRole) {
    return [];
  }

  return [...(ROLE_PERMISSIONS[normalizedRole] ?? [])];
}

export function roleHasPermission(role, permission) {
  return getPermissionsForRole(role).includes(permission);
}

export function roleHasAllPermissions(role, permissions) {
  const rolePermissions = new Set(getPermissionsForRole(role));

  return permissions.every((permission) => rolePermissions.has(permission));
}
