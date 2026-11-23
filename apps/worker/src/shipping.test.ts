import { describe, expect, it } from 'vitest';
import { activitiesFromShipments, shippingEnabled } from './shipping.js';

describe('shipping worker', () => {
  it('runs only with both Allingo keys', () => {
    expect(shippingEnabled({})).toBe(false);
    expect(shippingEnabled({ ALLINGO_APP_ID: 'a' })).toBe(false);
    expect(shippingEnabled({ ALLINGO_APP_ID: 'a', ALLINGO_APP_SECRET: 'b' })).toBe(true);
  });
  it('turns a shipment event into a push that opens the order', () => {
    const [a] = activitiesFromShipments([
      {
        kind: 'shipment',
        shipmentId: 's1',
        orderCode: 'BH000007',
        title: 'Giao lỗi đơn BH000007',
        body: 'x',
        push: true,
      },
    ]);
    expect(a).toMatchObject({ kind: 'shipment', push: true, url: '/orders?d=order:BH000007' });
  });
});
