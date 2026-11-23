/**
 * Read-only check of the Allingo connection with the test keys in .env (`pnpm allingo:probe`):
 * token, carrier list, then one fee quote with a text-only address (no coordinates), to learn whether
 * Allingo accepts it. Creates nothing.
 */
import { AllingoClient, AllingoError } from './client.js';

const appId = process.env.ALLINGO_APP_ID ?? '';
const appSecret = process.env.ALLINGO_APP_SECRET ?? '';
if (!appId || !appSecret) {
  console.error('Set ALLINGO_APP_ID and ALLINGO_APP_SECRET in .env (test keys: app_test_..., sk_test_...)');
  process.exit(1);
}
const client = new AllingoClient({ appId, appSecret, apiBase: process.env.ALLINGO_API_BASE || undefined });
console.log(`Mode: ${client.isTest ? 'TEST' : 'LIVE'}`);

if (process.env.ALLINGO_PROBE_RAW) {
  // everything Allingo sends back, unmapped, to check which fields exist (mode, estimates, fees, addons...)
  const sample = {
    pickup: {
      contact_name: 'Sugami',
      contact_phone: process.env.ALLINGO_PROBE_PICKUP_PHONE || '0900000000',
      address_line: process.env.ALLINGO_PROBE_PICKUP_ADDRESS || '1 Phố Huế',
      ward: process.env.ALLINGO_PROBE_PICKUP_WARD || 'Phường Hai Bà Trưng',
      province: process.env.ALLINGO_PROBE_PICKUP_PROVINCE || 'Hà Nội',
    },
    dropoff: {
      contact_name: 'Khách thử',
      contact_phone: '0900000001',
      address_line: '1 Nguyễn Huệ',
      ward: 'Phường Sài Gòn',
      province: 'Hồ Chí Minh',
    },
    package: { weight: 0.5, length: 20, width: 15, height: 10, declared_value: 200000 },
    cod_amount: 0,
    payee: 'receiver',
  };
  try {
    console.log('RAW /partners:', JSON.stringify(await client.debugCall('GET', '/partners'), null, 1));
    for (const type of [undefined, 'standard', 'on_demand'])
      console.log(
        `RAW /inquiries type=${type ?? '(none)'}:`,
        JSON.stringify(
          await client.debugCall('POST', '/inquiries', { ...sample, ...(type ? { type } : {}) }),
          null,
          1,
        ),
      );
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
}

try {
  const partners = await client.partners();
  console.log(`Carriers (${partners.length}): ${partners.map((p) => `${p.id}`).join(', ')}`);

  const pickup = {
    contact_name: 'Sugami',
    contact_phone: process.env.ALLINGO_PROBE_PICKUP_PHONE || '0900000000',
    address_line: process.env.ALLINGO_PROBE_PICKUP_ADDRESS || '1 Phố Huế',
    ward: process.env.ALLINGO_PROBE_PICKUP_WARD || 'Phường Hai Bà Trưng',
    province: process.env.ALLINGO_PROBE_PICKUP_PROVINCE || 'Hà Nội',
  };
  const dropoff = {
    contact_name: 'Khách thử',
    contact_phone: '0900000001',
    address_line: '1 Nguyễn Huệ',
    ward: 'Phường Sài Gòn',
    province: 'Hồ Chí Minh',
  };
  const quote = await client.quote({
    pickup,
    dropoff,
    package: { weight: 0.5, length: 20, width: 15, height: 10 },
    cod_amount: 0,
    payee: 'receiver',
  });
  console.log('Text-only quote accepted (no coordinates needed).');
  for (const q of quote.quotes)
    console.log(
      ` ${q.partner.id} / ${q.service_name}: ${q.price} VND ${q.available === false ? `(unavailable ${q.error_code ?? ''})` : ''}`,
    );
} catch (err) {
  if (err instanceof AllingoError) {
    console.error(`Allingo error ${err.status} ${err.code ?? ''}: ${err.message}`);
    if (err.code === 'validation_failed')
      console.error('The address may need coordinates (location {lat, lng}); see docs/allingo.md.');
  } else console.error(err);
  process.exit(1);
}
