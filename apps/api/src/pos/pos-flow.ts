/**
 * Status machine of a counter order. The seller moves it with buttons, never by picking a status, and
 * each button says what it does to stock:
 *  - retail (taken away): sold and completed at once, stock leaves at the sale; Return/Cancel give it back.
 *  - delivery: stock stays on the shelf until the parcel is handed to the carrier ("Giao cho ĐVVC"); a
 *    cancel before that moves no stock; once shipped, a returned parcel puts the goods back.
 */
export type Fulfillment = 'retail' | 'delivery';
export type PosStatus =
  'new' | 'confirmed' | 'packing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'returned';

export interface PosAction {
  key: string;
  label: string;
  to: PosStatus;
  tone: 'primary' | 'secondary' | 'danger';
  /** What the button does to stock, for the label and the confirm text. */
  stock: 'take' | 'give' | null;
}

const cancel: PosAction = { key: 'cancel', label: 'Hủy đơn', to: 'cancelled', tone: 'danger', stock: null };
const giveBack = (key: string, label: string): PosAction => ({
  key,
  label,
  to: 'returned',
  tone: 'danger',
  stock: 'give',
});

/** The buttons an order offers in its current status. */
export function posActions(f: Fulfillment, status: string): PosAction[] {
  if (f === 'retail') {
    return status === 'completed' ? [giveBack('return', 'Trả hàng'), { ...cancel, stock: 'give' }] : [];
  }
  switch (status) {
    case 'new':
      return [{ key: 'confirm', label: 'Xác nhận', to: 'confirmed', tone: 'primary', stock: null }, cancel];
    case 'confirmed':
      return [{ key: 'pack', label: 'Đóng gói', to: 'packing', tone: 'primary', stock: null }, cancel];
    case 'packing':
      return [{ key: 'ship', label: 'Giao cho ĐVVC', to: 'shipped', tone: 'primary', stock: 'take' }, cancel];
    case 'shipped':
      return [
        { key: 'deliver', label: 'Đã giao', to: 'delivered', tone: 'primary', stock: null },
        giveBack('return', 'Hoàn hàng'),
      ];
    case 'delivered':
      return [
        { key: 'complete', label: 'Hoàn tất (đã thu đủ)', to: 'completed', tone: 'primary', stock: null },
        giveBack('return', 'Trả hàng'),
      ];
    case 'completed':
      return [giveBack('return', 'Trả hàng')];
    default:
      return [];
  }
}

/** Whether the goods of an order in this status have left the warehouse. */
export function holdsStock(f: Fulfillment, status: string): boolean {
  return f === 'retail' ? status === 'completed' : ['shipped', 'delivered', 'completed'].includes(status);
}

/** Orders made before the machine existed have no stored kind: a receiver or carrier means delivery. */
export function fulfillmentOf(o: {
  fulfillment: string | null;
  shipAddress: string | null;
  shipPhone: string | null;
  carrier: string | null;
}): Fulfillment {
  if (o.fulfillment === 'retail' || o.fulfillment === 'delivery') return o.fulfillment;
  return o.shipAddress || o.shipPhone || o.carrier ? 'delivery' : 'retail';
}

export const SHIPPING_TEXT: Record<PosStatus, string> = {
  new: 'Chờ xử lý',
  confirmed: 'Đã xác nhận',
  packing: 'Đang đóng gói',
  shipped: 'Đang giao',
  delivered: 'Giao thành công',
  completed: 'Hoàn tất',
  cancelled: 'Đã hủy',
  returned: 'Hoàn hàng',
};
