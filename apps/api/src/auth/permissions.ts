/** True when the granted permission list allows `required` ("*" = all, "catalog.*" = whole module). */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;
  const module = required.split('.')[0];
  return granted.includes(`${module}.*`);
}

export function collectPermissions(roles: { permissions: unknown }[]): string[] {
  const set = new Set<string>();
  for (const r of roles) {
    if (Array.isArray(r.permissions)) for (const p of r.permissions) if (typeof p === 'string') set.add(p);
  }
  return [...set].sort();
}
