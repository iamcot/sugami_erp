/** Ahamove order status → what Sugami does with it. */
export type AhamoveStage = 'searching' | 'picking' | 'delivering' | 'delivered' | 'cancelled' | 'unknown';

/** Raw Ahamove statuses: IDLE, ASSIGNING, ACCEPTED, "IN PROCESS", COMPLETED, CANCELLED (+ CONFIRMING/PAYING). */
export function ahamoveStage(status: string | undefined | null): AhamoveStage {
  switch ((status ?? '').toUpperCase().replace(/_/g, ' ')) {
    case 'IDLE':
    case 'ASSIGNING':
    case 'CONFIRMING':
    case 'PAYING':
      return 'searching';
    case 'ACCEPTED':
      return 'picking';
    case 'IN PROCESS':
      return 'delivering';
    case 'COMPLETED':
      return 'delivered';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** Short Vietnamese text shown as the order's delivery status. */
export function ahamoveStatusText(status: string | undefined | null, subStatus?: string | null): string {
  const sub = (subStatus ?? '').toUpperCase();
  switch (ahamoveStage(status)) {
    case 'searching':
      return 'Ahamove: đang tìm tài xế';
    case 'picking':
      return sub === 'ARRIVED' ? 'Ahamove: tài xế đã đến lấy hàng' : 'Ahamove: tài xế đang đến lấy hàng';
    case 'delivering':
      return 'Ahamove: đang giao hàng';
    case 'delivered':
      return sub === 'IN_RETURN' || sub === 'RETURNED' ? 'Ahamove: đang hoàn hàng' : 'Ahamove: giao thành công';
    case 'cancelled':
      return 'Ahamove: đã hủy';
    default:
      return `Ahamove: ${status ?? '?'}`;
  }
}
