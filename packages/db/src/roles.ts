/** Built-in roles seeded into every installation. Permission "*" grants everything. */
export const DEFAULT_ROLES = [
  { code: 'owner', name: 'Chủ shop', permissions: ['*'] },
  {
    code: 'warehouse',
    name: 'Nhân viên kho',
    permissions: ['catalog.read', 'inventory.read', 'inventory.write', 'sourcing.receive', 'orders.pack'],
  },
  {
    code: 'operations',
    name: 'Vận hành / CSKH',
    permissions: [
      'catalog.read',
      'inventory.read',
      'orders.read',
      'orders.write',
      'customers.read',
      'customers.write',
    ],
  },
  {
    code: 'content',
    name: 'Content',
    permissions: ['catalog.read', 'catalog.write', 'media.write', 'content.write'],
  },
  {
    code: 'purchasing',
    name: 'Mua hàng',
    permissions: ['catalog.read', 'inventory.read', 'sourcing.read', 'sourcing.write'],
  },
] as const;

export type RoleCode = (typeof DEFAULT_ROLES)[number]['code'];
