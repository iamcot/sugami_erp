import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AllingoClient, AllingoError, effectiveStatus, phaseOf } from '@sugami/carriers-allingo';
import type { Prisma } from '@sugami/db';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildInquiry,
  orderWeight,
  pickBox,
  pickupProblem,
  toQuoteRows,
  type ParcelInput,
  type ReceiverInput,
} from './shipping-core.js';
import { loadShippingSettings, type ShippingSettings } from './shipping-settings.js';

const OPEN_ORDER = ['new', 'confirmed', 'packing'];
const ACTIVE_PHASES = ['waiting', 'picked_up', 'returning', 'failed_attempt'];

export interface ParcelOverride {
  boxKey?: string;
  weightGrams?: number;
  /** The shop pays the carrier and adds the fee to the order (the buyer pays it through COD). */
  addFeeToOrder?: boolean;
}

export interface ShipmentView {
  id: string;
  partnerCode: string;
  partnerName: string | null;
  serviceName: string | null;
  partnerTrackNo: string | null;
  trackId: string | null;
  status: string;
  phase: string;
  feeTotal: number;
  quotedPrice: number;
  codAmount: number;
  payee: string;
  trackLink: string | null;
  partnerTrackLink: string | null;
  livemode: boolean;
  error: string | null;
  createdAt: Date;
  events: {
    status: string;
    statusName: string | null;
    note: string | null;
    location: string | null;
    occurredAt: Date;
  }[];
}

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  private client(): AllingoClient {
    const appId = process.env.ALLINGO_APP_ID;
    const appSecret = process.env.ALLINGO_APP_SECRET;
    if (!appId || !appSecret)
      throw new ServiceUnavailableException(
        'Chưa cấu hình Allingo (ALLINGO_APP_ID, ALLINGO_APP_SECRET trong .env)',
      );
    this.cached ??= new AllingoClient({
      appId,
      appSecret,
      apiBase: process.env.ALLINGO_API_BASE || undefined,
    });
    return this.cached;
  }
  private cached: AllingoClient | null = null;

  status() {
    const appId = process.env.ALLINGO_APP_ID ?? '';
    return {
      configured: Boolean(appId && process.env.ALLINGO_APP_SECRET),
      mode: appId.startsWith('app_test_') ? 'test' : appId ? 'live' : null,
      webhookConfigured: Boolean(process.env.ALLINGO_WEBHOOK_SECRET),
    };
  }

  /** Allingo failures as messages a seller can act on. */
  private fail(err: unknown): never {
    if (err instanceof AllingoError) {
      const hint: Record<string, string> = {
        wallet_insufficient: 'Ví Allingo không đủ tiền, hãy nạp thêm',
        app_not_approved: 'App Allingo chưa được duyệt chạy thật',
        cannot_cancel: 'Hãng đã lấy hàng, không hủy được vận đơn',
        validation_failed: 'Allingo không nhận dữ liệu (địa chỉ, số điện thoại hoặc kích thước chưa hợp lệ)',
      };
      const text = `${hint[err.code ?? ''] ?? 'Allingo báo lỗi'}: ${err.message}`;
      if (err.status >= 500 || err.status === 0) throw new BadGatewayException(text);
      throw new BadRequestException(text);
    }
    throw err;
  }

  private async loadOrder(code: string) {
    const order = await this.prisma.client.order.findUnique({
      where: { code },
      include: {
        customer: { select: { name: true, ward: true, region: true } },
        lines: { include: { variant: { select: { weightGrams: true } } } },
        shipments: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn');
    return order;
  }

  private checkShippable(order: Awaited<ReturnType<ShippingService['loadOrder']>>) {
    if (order.source !== 'pos' || order.fulfillment !== 'delivery')
      throw new ConflictException(
        'Chỉ đơn Bán giao hàng tự giao mới tạo vận đơn ở đây; đơn sàn do sàn lo vận chuyển',
      );
    if (!OPEN_ORDER.includes(order.status))
      throw new ConflictException('Đơn đã giao cho vận chuyển hoặc đã đóng, không tạo thêm vận đơn');
    if (!order.shipAddress || !order.shipPhone)
      throw new BadRequestException('Đơn thiếu địa chỉ hoặc số điện thoại người nhận');
    if (order.shipments.some((s) => ACTIVE_PHASES.includes(s.phase) && s.externalId))
      throw new ConflictException('Đơn đã có vận đơn đang chạy, hủy vận đơn đó trước khi tạo cái mới');
  }

  private receiver(order: Awaited<ReturnType<ShippingService['loadOrder']>>): ReceiverInput {
    const fromNote = /Người nhận:\s*(.+)/.exec(order.internalNote ?? '')?.[1]?.trim();
    return {
      name: fromNote || order.customer?.name || 'Khách',
      phone: order.shipPhone ?? '',
      address: order.shipAddress ?? '',
      ward: order.customer?.ward ?? null,
      province: order.shipProvince ?? order.customer?.region ?? null,
    };
  }

  private parcel(
    order: Awaited<ReturnType<ShippingService['loadOrder']>>,
    settings: ShippingSettings,
    o: ParcelOverride,
    addedFee = 0,
  ): ParcelInput & { unknownWeights: number } {
    const w = orderWeight(
      order.lines.map((l) => ({ qty: Number(l.qty), weightGrams: l.variant?.weightGrams ?? null })),
      settings.defaultItemGrams,
    );
    const grams = o.weightGrams ?? w.grams;
    const box =
      (o.boxKey ? settings.boxes.find((b) => b.key === o.boxKey) : undefined) ??
      pickBox(grams, settings.boxes);
    const payee = o.addFeeToOrder ? 'sender' : settings.defaultPayee;
    const cod = Number(order.codAmount);
    return {
      grams,
      box,
      // when the shop adds the fee to the order, the buyer pays it as part of the COD
      codAmount: cod > 0 ? cod + addedFee : 0,
      payee,
      declaredValue: Number(order.total),
      unknownWeights: w.unknown,
    };
  }

  /** Fee quotes for an order; nothing is created. */
  async quotes(code: string, o: ParcelOverride) {
    const order = await this.loadOrder(code);
    this.checkShippable(order);
    const settings = await loadShippingSettings(this.prisma.client);
    const problem = pickupProblem(settings.pickup);
    if (problem) throw new BadRequestException(problem);
    const parcel = this.parcel(order, settings, o);
    try {
      const res = await this.client().quote(buildInquiry(settings.pickup, this.receiver(order), parcel));
      return {
        data: toQuoteRows(res.quotes ?? []),
        parcel: {
          grams: parcel.grams,
          boxKey: parcel.box.key,
          boxLabel: parcel.box.label,
          unknownWeights: parcel.unknownWeights,
        },
        preferredStandard: settings.preferredStandard,
        codAmount: parcel.codAmount,
      };
    } catch (err) {
      this.fail(err);
    }
  }

  /**
   * Create the waybill. The shipment row is written first with its idempotency key: if the answer is lost
   * (network, restart), repeating the request reuses the key and Allingo returns the same shipment.
   */
  async create(
    code: string,
    body: ParcelOverride & { serviceId: string; quotedPrice: number },
    userId?: string,
  ) {
    const db = this.prisma.client;
    const order = await this.loadOrder(code);
    this.checkShippable(order);
    const settings = await loadShippingSettings(db);
    const problem = pickupProblem(settings.pickup);
    if (problem) throw new BadRequestException(problem);
    const client = this.client();
    const addedFee = body.addFeeToOrder ? body.quotedPrice : 0;
    const parcel = this.parcel(order, settings, body, addedFee);
    const inquiry = buildInquiry(settings.pickup, this.receiver(order), parcel);

    // a service name is needed to show the row: ask for the quote again is not needed, the id is enough here
    const pending = order.shipments.find(
      (s) => !s.externalId && s.serviceId === body.serviceId && s.phase === 'waiting',
    );
    const total = await db.shipment.count({ where: { orderId: order.id } });
    const key = pending?.idempotencyKey ?? `ship-${order.code}-${total + 1}`;
    const partnerCode = body.serviceId.split('-')[0] ?? 'allingo';
    const row =
      pending ??
      (await db.shipment.create({
        data: {
          orderId: order.id,
          provider: 'allingo',
          partnerCode: partnerCode.slice(0, 32),
          serviceId: body.serviceId.slice(0, 64),
          status: 'creating',
          phase: 'waiting',
          quotedPrice: BigInt(body.quotedPrice),
          codAmount: BigInt(parcel.codAmount),
          payee: parcel.payee,
          weightGrams: Math.round(parcel.grams),
          lengthCm: parcel.box.lengthCm,
          widthCm: parcel.box.widthCm,
          heightCm: parcel.box.heightCm,
          idempotencyKey: key,
          livemode: !client.isTest,
          createdBy: userId,
        },
      }));

    let created;
    try {
      created = await client.createOrder(
        {
          ...inquiry,
          service_id: body.serviceId,
          estimated_price: body.quotedPrice,
          deliverable_payment_method: parcel.codAmount > 0 ? 'cod' : 'prepaid',
          external_reference: order.code.slice(0, 64),
          fulfillment_type: 'immediate',
        },
        key,
      );
    } catch (err) {
      // a refusal (4xx) is final: close this attempt so the next one uses a new key; a lost answer keeps the row
      if (err instanceof AllingoError && err.status >= 400 && err.status < 500) {
        await db.shipment.update({
          where: { id: row.id },
          data: { phase: 'canceled', status: 'failed', error: err.message.slice(0, 500) },
        });
      } else {
        await db.shipment.update({ where: { id: row.id }, data: { error: String(err).slice(0, 500) } });
      }
      this.fail(err);
    }

    const status = effectiveStatus(created.status, created.delivery?.status);
    const fee = created.fee ?? {};
    const feeTotal = fee.total ?? body.quotedPrice;
    const partnerName = created.delivery?.partner?.name ?? created.delivery?.partner?.id ?? null;
    await db.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: row.id },
        data: {
          externalId: created.id,
          trackId: created.track_id,
          partnerCode: (created.delivery?.partner?.id ?? row.partnerCode).slice(0, 32),
          partnerName: partnerName?.slice(0, 64),
          serviceName: created.delivery?.service?.name?.slice(0, 128) ?? null,
          partnerTrackNo:
            (created.delivery?.partner_order_id ?? created.delivery?.partner_track_id ?? null)?.slice(
              0,
              64,
            ) ?? null,
          status: status.slice(0, 40),
          phase: phaseOf(status),
          feeDelivery: BigInt(fee.delivery ?? 0),
          feeInsurance: BigInt(fee.insurance ?? 0),
          feeCod: BigInt(fee.cod ?? 0),
          feeTotal: BigInt(feeTotal),
          trackLink: created.delivery?.track_link?.slice(0, 500) ?? null,
          partnerTrackLink: created.delivery?.partner_track_link?.slice(0, 500) ?? null,
          livemode: created.livemode ?? !client.isTest,
          error: null,
        },
      });
      const orderData: Prisma.OrderUpdateInput = {
        carrier: partnerName,
        trackingNo: created.delivery?.partner_order_id ?? created.track_id,
        shippingFee: parcel.payee === 'sender' ? BigInt(feeTotal) : 0n,
      };
      if (body.addFeeToOrder && addedFee > 0) {
        orderData.otherIncome = { increment: BigInt(addedFee) };
        orderData.total = { increment: BigInt(addedFee) };
        if (Number(order.codAmount) > 0) orderData.codAmount = { increment: BigInt(addedFee) };
      }
      await tx.order.update({ where: { id: order.id }, data: orderData });
    });
    return this.forOrder(order.code);
  }

  async cancel(shipmentId: string) {
    const db = this.prisma.client;
    const s = await db.shipment.findUnique({ where: { id: shipmentId } });
    if (!s) throw new NotFoundException('Không tìm thấy vận đơn');
    if (!s.externalId) throw new ConflictException('Vận đơn chưa được tạo ở hãng');
    if (s.phase !== 'waiting')
      throw new ConflictException('Hãng đã lấy hàng hoặc vận đơn đã đóng, không hủy được');
    try {
      await this.client().cancelOrder(s.externalId, `cancel-${s.id}`, 'Shop hủy vận đơn');
    } catch (err) {
      this.fail(err);
    }
    await db.shipment.update({
      where: { id: s.id },
      data: { phase: 'canceled', status: 'canceled', canceledAt: new Date() },
    });
    return { ok: true };
  }

  async label(shipmentId: string) {
    const s = await this.prisma.client.shipment.findUnique({ where: { id: shipmentId } });
    if (!s?.externalId) throw new NotFoundException('Không tìm thấy vận đơn');
    try {
      return await this.client().waybill(s.externalId);
    } catch (err) {
      this.fail(err);
    }
  }

  async forOrder(code: string): Promise<{ data: ShipmentView[] }> {
    const rows = await this.prisma.client.shipment.findMany({
      where: { order: { code } },
      orderBy: { createdAt: 'desc' },
      include: { events: { orderBy: { occurredAt: 'desc' }, take: 30 } },
    });
    return {
      data: rows
        .filter((s) => s.externalId || s.phase !== 'canceled')
        .map((s) => ({
          id: s.id,
          partnerCode: s.partnerCode,
          partnerName: s.partnerName,
          serviceName: s.serviceName,
          partnerTrackNo: s.partnerTrackNo,
          trackId: s.trackId,
          status: s.status,
          phase: s.phase,
          feeTotal: Number(s.feeTotal),
          quotedPrice: Number(s.quotedPrice),
          codAmount: Number(s.codAmount),
          payee: s.payee,
          trackLink: s.trackLink,
          partnerTrackLink: s.partnerTrackLink,
          livemode: s.livemode,
          error: s.error,
          createdAt: s.createdAt,
          events: s.events.map((e) => ({
            status: e.status,
            statusName: e.statusName,
            note: e.note,
            location: e.location,
            occurredAt: e.occurredAt,
          })),
        })),
    };
  }
}
