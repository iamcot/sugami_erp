import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AllingoClient,
  AllingoError,
  effectiveStatus,
  phaseOf,
  type AllingoQuote,
  type AllingoService,
} from '@sugami/carriers-allingo';
import type { Prisma } from '@sugami/db';
import { refreshShipment } from '@sugami/sync';
import {
  ahamoveConfigured,
  allServices,
  bookOrder,
  cancelTrip,
  dispatchNow,
  dropoffOfReceiver,
  quoteStops,
} from '../pos/ahamove.js';
import { runPosAction } from '../pos/pos-orders.js';
import { PosError } from '../pos/pos-orders.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  addonExtras,
  applyCarrierSettings,
  buildInquiry,
  nextPickup,
  orderWeight,
  pickBox,
  pickupProblem,
  serviceProblem,
  toQuoteRows,
  type ParcelInput,
  type ReceiverInput,
} from './shipping-core.js';
import { loadShippingSettings, type ShippingSettings } from './shipping-settings.js';

const OPEN_ORDER = ['new', 'confirmed', 'packing'];
const ACTIVE_PHASES = ['waiting', 'picked_up', 'returning', 'failed_attempt'];
/** Quote rows of Ahamove carry this prefix in their service id; booking them goes to the Ahamove client. */
const AHAMOVE_PREFIX = 'ahamove:';

export interface ParcelOverride {
  boxKey?: string;
  weightGrams?: number;
  /** A parcel size typed by hand instead of one of the shop's boxes (all three together), in cm. */
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** The shop pays the carrier and adds the fee to the order (the buyer pays it through COD). */
  addFeeToOrder?: boolean;
  /** Book for a later time (ISO); omitted = find a driver now. */
  scheduleAt?: string;
  /** Ahamove extras the seller switched on (the service they apply to, and the choices). */
  extraChoices?: { serviceId?: string; requests: { id: string; tierCode?: string; num?: number }[] };
}

/** A sale still on the counter screen, priced before the order exists. */
export interface DraftQuoteInput extends ParcelOverride {
  receiver: { name: string; phone: string; address: string; ward?: string; area?: string };
  lines: { variantId: string; qty: number }[];
  /** COD the carrier collects (before any shipping fee added to the order). */
  codAmount: number;
  /** Order total, declared as the parcel value. */
  total: number;
}

export interface ShipmentView {
  id: string;
  partnerCode: string;
  serviceId: string;
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
  scheduledAt: Date | null;
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

  /** All Ahamove services of the shop's city, for the picker in the settings page. */
  async ahamoveServices() {
    if (!ahamoveConfigured()) return [];
    try {
      return await allServices();
    } catch (err) {
      this.fail(err);
    }
  }

  /** The normal carriers Allingo offers this shop, for the settings page. */
  async partners() {
    if (!this.status().configured) return [];
    try {
      const list = await this.client().partners();
      const fast = new Set(['ahamove', 'lalamove', 'gsm', 'grabexpress', 'grab', 'simulator_on_demand']);
      return list.filter((p) => !fast.has(p.id.toLowerCase())).map((p) => ({ id: p.id, name: p.name }));
    } catch (err) {
      this.fail(err);
    }
  }

  private catalogCache: { at: number; map: Map<string, AllingoService> } | null = null;

  /** Every Allingo service with its limits, COD support and add-ons, by service id (cached for an hour). */
  private async serviceCatalog(): Promise<Map<string, AllingoService>> {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 3_600_000) return this.catalogCache.map;
    const client = this.client();
    const map = new Map<string, AllingoService>();
    for (const p of await client.partners())
      for (const s of await client.services(p.id).catch(() => [] as AllingoService[])) map.set(s.id, s);
    this.catalogCache = { at: Date.now(), map };
    return map;
  }

  private iconCache: { at: number; map: Record<string, string> } | null = null;

  /** Allingo's own logo of each carrier, by carrier id (cached for an hour). */
  async partnerIcons(): Promise<Record<string, string>> {
    if (!this.status().configured) return {};
    if (this.iconCache && Date.now() - this.iconCache.at < 3_600_000) return this.iconCache.map;
    try {
      const list = await this.client().partners();
      const map: Record<string, string> = {};
      for (const p of list) if (p.icon_url) map[p.id.toLowerCase()] = p.icon_url;
      this.iconCache = { at: Date.now(), map };
      return map;
    } catch (err) {
      this.fail(err);
    }
  }

  status() {
    const appId = process.env.ALLINGO_APP_ID ?? '';
    return {
      ahamove: ahamoveConfigured(),
      configured: Boolean(appId && process.env.ALLINGO_APP_SECRET),
      mode: appId.startsWith('app_test_') ? 'test' : appId ? 'live' : null,
      webhookConfigured: Boolean(process.env.ALLINGO_WEBHOOK_SECRET),
    };
  }

  /** Allingo failures as messages a seller can act on. */
  private fail(err: unknown): never {
    if (err instanceof PosError) {
      if (err.status === 404) throw new NotFoundException(err.message);
      if (err.status === 409) throw new ConflictException(err.message);
      throw new BadRequestException(err.message);
    }
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

  private parcelOf(
    input: {
      lines: { qty: number; weightGrams: number | null }[];
      codAmount: number;
      total: number;
    },
    settings: ShippingSettings,
    o: ParcelOverride,
    addedFee = 0,
  ): ParcelInput & { unknownWeights: number } {
    const w = orderWeight(input.lines, settings.defaultItemGrams);
    const grams = o.weightGrams ?? w.grams;
    const box =
      o.lengthCm && o.widthCm && o.heightCm
        ? {
            key: 'custom',
            label: 'Size khác',
            maxGrams: null,
            lengthCm: o.lengthCm,
            widthCm: o.widthCm,
            heightCm: o.heightCm,
          }
        : ((o.boxKey ? settings.boxes.find((b) => b.key === o.boxKey) : undefined) ??
          pickBox(grams, settings.boxes));
    const payee = o.addFeeToOrder ? 'sender' : settings.defaultPayee;
    return {
      grams,
      box,
      // when the shop adds the fee to the order, the buyer pays it as part of the COD
      codAmount: input.codAmount > 0 ? input.codAmount + addedFee : 0,
      payee,
      declaredValue: input.total,
      unknownWeights: w.unknown,
    };
  }

  private parcel(
    order: Awaited<ReturnType<ShippingService['loadOrder']>>,
    settings: ShippingSettings,
    o: ParcelOverride,
    addedFee = 0,
  ): ParcelInput & { unknownWeights: number } {
    return this.parcelOf(
      {
        lines: order.lines.map((l) => ({ qty: Number(l.qty), weightGrams: l.variant?.weightGrams ?? null })),
        codAmount: Number(order.codAmount),
        total: Number(order.total),
      },
      settings,
      o,
      addedFee,
    );
  }

  /** Fee quotes for an existing order. */
  async quotes(code: string, o: ParcelOverride) {
    const order = await this.loadOrder(code);
    this.checkShippable(order);
    const settings = await loadShippingSettings(this.prisma.client);
    return this.quoteFor(settings, this.receiver(order), this.parcel(order, settings, o), o.extraChoices);
  }

  /** Fee quotes for a sale still on the counter screen: the order is created only when the seller confirms. */
  async draftQuotes(body: DraftQuoteInput) {
    const settings = await loadShippingSettings(this.prisma.client);
    const variants = await this.prisma.client.variant.findMany({
      where: { id: { in: body.lines.map((l) => l.variantId) } },
      select: { id: true, weightGrams: true },
    });
    const weight = new Map(variants.map((v) => [v.id, v.weightGrams]));
    const parcel = this.parcelOf(
      {
        lines: body.lines.map((l) => ({ qty: l.qty, weightGrams: weight.get(l.variantId) ?? null })),
        codAmount: body.codAmount,
        total: body.total,
      },
      settings,
      body,
    );
    const r = body.receiver;
    return this.quoteFor(
      settings,
      { name: r.name, phone: r.phone, address: r.address, ward: r.ward ?? null, province: r.area ?? null },
      parcel,
      body.extraChoices,
    );
  }

  /**
   * Fee quotes from every carrier set up: Allingo (all its carriers) and Ahamove (direct).
   * Nothing is created. A carrier that fails does not hide the others; its message comes back as a warning.
   */
  private async quoteFor(
    settings: ShippingSettings,
    to: ReceiverInput,
    parcel: ParcelInput & { unknownWeights: number },
    extraChoices?: ParcelOverride['extraChoices'],
  ) {
    const extrasChoice = extraChoices?.serviceId
      ? { [extraChoices.serviceId.replace(AHAMOVE_PREFIX, '')]: extraChoices.requests }
      : {};
    const allingoOn = this.status().configured;
    const ahamoveOn = ahamoveConfigured();
    if (!allingoOn && !ahamoveOn)
      throw new ServiceUnavailableException(
        'Chưa cấu hình hãng vận chuyển nào (Allingo hoặc Ahamove trong .env, xem docs/allingo.md)',
      );
    const warnings: string[] = [];

    const fromAllingo = async (): Promise<AllingoQuote[]> => {
      const problem = pickupProblem(settings.pickup);
      if (problem) throw new BadRequestException(problem);
      const client = this.client();
      const inquiry = buildInquiry(settings.pickup, to, parcel);
      // ask per delivery mode: the filter is how Allingo tells normal carriers from driver-direct ones
      const modes = ['standard', 'on_demand'] as const;
      // the service list (limits, COD support, add-ons) is optional: without it quotes still show
      const catalog = await this.serviceCatalog().catch(() => new Map<string, AllingoService>());
      const annotate = (q: AllingoQuote): AllingoQuote => {
        const svc = catalog.get(q.service_id);
        if (!svc) return q;
        const problem = serviceProblem(svc, parcel);
        return {
          ...q,
          extras: addonExtras(svc),
          ...(problem && q.available !== false ? { available: false, error_code: problem } : {}),
        };
      };
      const parts = await Promise.allSettled(modes.map((type) => client.quote({ ...inquiry, type })));
      if (parts.every((x) => x.status === 'fulfilled')) {
        const seen = new Set<string>();
        return parts.flatMap((x, i) =>
          (x.status === 'fulfilled' ? (x.value.quotes ?? []) : [])
            .filter((q) => !seen.has(q.service_id) && seen.add(q.service_id))
            .map((q) => ({ ...annotate(q), mode: modes[i] })),
        );
      }
      // the filter was refused: one plain request, modes guessed from the carrier
      return ((await client.quote(inquiry)).quotes ?? []).map(annotate);
    };
    const fromAhamove = async (): Promise<AllingoQuote[]> =>
      (
        await quoteStops(
          dropoffOfReceiver({
            name: to.name,
            phone: to.phone,
            address: to.address,
            ward: to.ward,
            province: to.province,
          }),
          settings.ahamoveServices,
          extrasChoice,
        )
      ).map((q) => {
        // limits Ahamove publishes for the service: refuse here with a clear reason instead of at booking
        const limit =
          q.maxKg && parcel.grams / 1000 > q.maxKg
            ? `Quá tải trọng ${q.maxKg} kg`
            : q.maxCod && parcel.codAmount > q.maxCod
              ? 'COD vượt mức tối đa của dịch vụ'
              : null;
        return {
          service_id: `${AHAMOVE_PREFIX}${q.serviceId}`,
          service_name: q.name,
          partner: { id: 'ahamove', name: 'AhaMove' },
          price: q.fee,
          available: !q.error && !limit,
          error_code: q.error ?? limit,
          estimated_minutes: q.durationMinutes,
          estimated_delivery_range: q.durationMinutes
            ? `~${q.durationMinutes} phút${q.distanceKm ? ` (${q.distanceKm.toLocaleString('vi-VN')} km)` : ''}`
            : null,
          info: q.summary,
          details: q.details,
          breakdown: q.breakdown,
          extras: q.extras,
        };
      });

    const [a, h] = await Promise.allSettled([
      allingoOn ? fromAllingo() : Promise.resolve<AllingoQuote[]>([]),
      ahamoveOn ? fromAhamove() : Promise.resolve<AllingoQuote[]>([]),
    ]);
    const quotes: AllingoQuote[] = [];
    for (const [name, r] of [
      ['Allingo', a],
      ['AhaMove', h],
    ] as const) {
      if (r.status === 'fulfilled') quotes.push(...r.value);
      else warnings.push(`${name}: ${this.messageOf(r.reason)}`);
    }
    if (quotes.length === 0 && warnings.length > 0) throw new BadGatewayException(warnings.join(' | '));
    return {
      data: applyCarrierSettings(toQuoteRows(quotes), settings.carriers),
      warnings,
      parcel: {
        grams: parcel.grams,
        boxKey: parcel.box.key,
        boxLabel: parcel.box.label,
        unknownWeights: parcel.unknownWeights,
      },
      preferredStandard: settings.preferredStandard,
      codAmount: parcel.codAmount,
    };
  }

  /** The text of an error as the seller should read it. */
  private messageOf(err: unknown): string {
    try {
      this.fail(err);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return String(err);
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
    let order = await this.loadOrder(code);
    this.checkShippable(order);
    const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;
    if (scheduleAt && (Number.isNaN(scheduleAt.getTime()) || scheduleAt.getTime() < Date.now() - 60_000))
      throw new BadRequestException('Giờ hẹn phải ở tương lai');
    // a booked order waits for its courier in "Đang đóng gói" (the parcel is handed over when picked up)
    try {
      for (const key of order.status === 'new'
        ? ['confirm', 'pack']
        : order.status === 'confirmed'
          ? ['pack']
          : [])
        await runPosAction(db, order.code, key, userId);
    } catch (err) {
      this.fail(err);
    }
    order = await this.loadOrder(code);
    if (body.serviceId.startsWith(AHAMOVE_PREFIX)) {
      // Ahamove is booked directly; the order moves on when the driver has the parcel, see pos/ahamove.ts
      try {
        await bookOrder(
          db,
          code,
          body.serviceId.slice(AHAMOVE_PREFIX.length),
          userId,
          scheduleAt,
          body.extraChoices?.requests ?? [],
        );
        // a driver is looked for now, or at the booked time: that is the packing deadline
        await db.order.update({ where: { code }, data: { shipByAt: scheduleAt ?? new Date() } });
      } catch (err) {
        this.fail(err);
      }
      return this.forOrder(order.code);
    }
    const settings = await loadShippingSettings(db);
    const problem = pickupProblem(settings.pickup);
    if (problem) throw new BadRequestException(problem);
    const client = this.client();
    const pickupTimes = (code: string) => settings.carriers[code]?.pickupTimes ?? [];
    const addedFee = body.addFeeToOrder ? body.quotedPrice : 0;
    const parcel = this.parcel(order, settings, body, addedFee);
    const inquiry = buildInquiry(settings.pickup, this.receiver(order), parcel);
    // add-ons the seller ticked, only those the service really lists
    const wanted = body.extraChoices?.requests.map((r) => r.id) ?? [];
    const listed = wanted.length
      ? addonExtras(
          (await this.serviceCatalog().catch(() => new Map())).get(body.serviceId) ?? { addons: [] },
        )
      : [];
    const addonKeys = wanted.filter((k) => listed.some((x) => x.id === k));

    // a service name is needed to show the row: ask for the quote again is not needed, the id is enough here
    const pending = order.shipments.find(
      (s) => !s.externalId && s.serviceId === body.serviceId && s.phase === 'waiting',
    );
    const total = await db.shipment.count({ where: { orderId: order.id } });
    const key = pending?.idempotencyKey ?? `ship-${order.code}-${total + 1}`;
    // service ids are random strings; the carrier comes from the service list (fixed again from Allingo's reply)
    const partnerCode =
      (await this.serviceCatalog().catch(() => null))?.get(body.serviceId)?.partner?.id ?? 'allingo';
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
          scheduledAt: scheduleAt,
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
          ...(addonKeys.length ? { addon_keys: addonKeys } : {}),
          deliverable_payment_method: parcel.codAmount > 0 ? 'cod' : 'prepaid',
          external_reference: order.code.slice(0, 64),
          ...(scheduleAt
            ? { fulfillment_type: 'scheduled' as const, schedule_at: scheduleAt.toISOString() }
            : { fulfillment_type: 'immediate' as const }),
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

    const deadline =
      scheduleAt ?? nextPickup(pickupTimes((created.delivery?.partner?.id ?? row.partnerCode).toLowerCase()));
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
        // packing deadline: the time the seller booked for, else the carrier's next pickup (when pickup times are set)
        ...(deadline ? { shipByAt: deadline } : {}),
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

  /**
   * Call off the carriers' pickups of an order that is being cancelled. A carrier that already has the
   * parcel refuses (and the order cannot be cancelled then anyway); other failures stop the cancel with a message.
   */
  async cancelForOrder(code: string) {
    const db = this.prisma.client;
    const order = await db.order.findUnique({
      where: { code },
      include: { shipments: { where: { phase: 'waiting', externalId: { not: null } } } },
    });
    if (!order) return;
    for (const s of order.shipments) await this.cancel(s.id);
    if (order.carrier === 'Ahamove' && order.trackingNo && order.status !== 'shipped') {
      try {
        await cancelTrip(db, code, 'Shop hủy đơn');
      } catch (err) {
        this.fail(err);
      }
    }
  }

  /** "Tìm tài xế ngay" for a trip booked for later: cancel it and book the same service for now. */
  async dispatchNow(code: string, shipmentId?: string, userId?: string) {
    const db = this.prisma.client;
    if (!shipmentId) {
      try {
        await dispatchNow(db, code);
      } catch (err) {
        this.fail(err);
      }
      return this.forOrder(code);
    }
    const s = await db.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { select: { code: true } } },
    });
    if (!s || s.order.code !== code) throw new NotFoundException('Không tìm thấy vận đơn');
    if (!s.scheduledAt || s.phase !== 'waiting')
      throw new ConflictException('Vận đơn này không phải chuyến hẹn giờ đang chờ');
    const quoted = Number(s.quotedPrice);
    await this.cancel(s.id);
    return this.create(
      code,
      { serviceId: s.serviceId ?? '', quotedPrice: quoted, addFeeToOrder: false },
      userId,
    );
  }

  /** Ask Allingo for the shipment's current state (for when no webhook arrived). */
  async refresh(shipmentId: string) {
    const db = this.prisma.client;
    const s = await db.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { select: { code: true } } },
    });
    if (!s?.externalId) throw new NotFoundException('Không tìm thấy vận đơn');
    try {
      await refreshShipment(db, this.client(), { id: s.id, externalId: s.externalId });
    } catch (err) {
      this.fail(err);
    }
    return this.forOrder(s.order.code);
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
          serviceId: s.serviceId,
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
          scheduledAt: s.scheduledAt,
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
