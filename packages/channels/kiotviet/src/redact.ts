/**
 * Mask personal data in KiotViet payloads before they are written to sample files.
 * Product names and codes are kept; customer/receiver details are masked.
 */

const PERSONAL_KEYS = new Set(
  [
    'customerName',
    'customerCode',
    'contactNumber',
    'phone',
    'mobile',
    'email',
    'address',
    'receiver',
    'receiverName',
    'receiverPhone',
    'locationName',
    'wardName',
    'taxCode',
    'identificationNumber',
    'birthDate',
    'comments',
    'facebook',
    'organization',
    'buyerName',
    'buyerPhone',
    'buyerAddress',
  ].map((k) => k.toLowerCase()),
);

/** Keys that are personal only inside customer-like objects. */
const CONTEXT_KEYS = new Set(['name', 'code', 'description']);
const PERSON_CONTEXTS = /customer|receiver|delivery|buyer|partner/i;

export function maskValue(value: unknown): unknown {
  if (typeof value === 'string') return value.length === 0 ? value : `***(${value.length})`;
  if (typeof value === 'number') return 0;
  return value === null ? null : '***';
}

export function redact(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, path));
  if (value === null || typeof value !== 'object') return value;
  const inPerson = path.some((p) => PERSON_CONTEXTS.test(p));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (PERSONAL_KEYS.has(key) || (inPerson && CONTEXT_KEYS.has(key))) {
      out[k] = v !== null && typeof v === 'object' ? redact(v, [...path, k]) : maskValue(v);
    } else {
      out[k] = redact(v, [...path, k]);
    }
  }
  return out;
}

/** Collect the set of dotted key paths in a payload, to document its shape. */
export function keyPaths(value: unknown, prefix = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value.slice(0, 5)) keyPaths(v, `${prefix}[]`, out);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      out.add(p);
      keyPaths(v, p, out);
    }
  }
  return out;
}
