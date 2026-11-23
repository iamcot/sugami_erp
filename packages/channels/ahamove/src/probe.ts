/**
 * Read-only check of the Ahamove connection with the keys in .env (`pnpm ahamove:probe`): login (token),
 * the services of the shop's city, then a price quote for each service from the shop to a sample address.
 * Creates no trip. Set AHAMOVE_ENV=stg to use the test environment.
 */
import { AhamoveError, ahamoveFromEnv } from './client.js';

const client = ahamoveFromEnv();
if (!client) {
  console.error('Set AHAMOVE_API_KEY and AHAMOVE_MOBILE in .env (and AHAMOVE_ENV=stg to test)');
  process.exit(1);
}
const {
  AHAMOVE_PICKUP_NAME: name,
  AHAMOVE_PICKUP_PHONE: mobile,
  AHAMOVE_PICKUP_ADDRESS: address,
} = process.env;
if (!name || !mobile || !address) {
  console.error('Set AHAMOVE_PICKUP_NAME, AHAMOVE_PICKUP_PHONE and AHAMOVE_PICKUP_ADDRESS in .env');
  process.exit(1);
}
const lat = Number(process.env.AHAMOVE_PICKUP_LAT);
const lng = Number(process.env.AHAMOVE_PICKUP_LNG);
const city = process.env.AHAMOVE_CITY_ID || 'SGN';
// where to send the sample trip; override with AHAMOVE_PROBE_DROPOFF
const dropoff = process.env.AHAMOVE_PROBE_DROPOFF || '1 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh, Việt Nam';
console.log(`Env: ${process.env.AHAMOVE_ENV === 'stg' ? 'STAGING (test)' : 'PRODUCTION'}, city ${city}`);

try {
  const services = await client.services(city);
  console.log(
    `Services in ${city} (${services.length}): ${services.map((s) => `${s.id} (${s.name})`).join(', ')}`,
  );
  const quotes = await client.quote(
    { name, mobile, address, ...(lat && lng ? { lat, lng } : {}) },
    { name: 'Khách thử', mobile: '0900000001', address: dropoff },
    services.map((s) => s.id),
  );
  const names = new Map(services.map((s) => [s.id, s.name]));
  console.log('Quotes to the sample address (no trip is created):');
  for (const q of quotes)
    console.log(
      ` ${q.serviceId} / ${names.get(q.serviceId) ?? ''}: ${q.error ? `refused: ${q.error}` : `${q.fee} VND${q.distanceKm ? `, ${q.distanceKm.toFixed(1)} km` : ''}`}`,
    );
} catch (err) {
  if (err instanceof AhamoveError)
    console.error(`Ahamove error ${err.status} ${err.code ?? ''}: ${err.message}`);
  else console.error(err);
  process.exit(1);
}
