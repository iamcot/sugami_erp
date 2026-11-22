import { describe, expect, it } from 'vitest';
import { collectPermissions, hasPermission } from './permissions.js';

describe('permissions', () => {
  it('supports exact, wildcard and module wildcard', () => {
    expect(hasPermission(['*'], 'users.manage')).toBe(true);
    expect(hasPermission(['catalog.read'], 'catalog.read')).toBe(true);
    expect(hasPermission(['catalog.*'], 'catalog.write')).toBe(true);
    expect(hasPermission(['catalog.read'], 'catalog.write')).toBe(false);
    expect(hasPermission([], 'catalog.read')).toBe(false);
  });
  it('merges role permissions', () => {
    expect(
      collectPermissions([{ permissions: ['b', 'a'] }, { permissions: ['a', 1] }, { permissions: null }]),
    ).toEqual(['a', 'b']);
  });
});
