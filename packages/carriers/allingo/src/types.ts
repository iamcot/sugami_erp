/** Shapes of the Allingo Developer API (https://docs.allingo.vn/vi/api-reference/introduction) that Sugami uses. */

export interface AllingoLocation {
  lat: number;
  lng: number;
}

export interface AllingoAddress {
  contact_name: string;
  contact_phone: string;
  address_line: string;
  ward?: string;
  district?: string;
  province?: string;
  /** Required by the OpenAPI spec; whether a text-only address is accepted is checked with `allingo:probe`. */
  location?: AllingoLocation;
  note?: string;
}

export interface AllingoPackage {
  /** Kilograms. */
  weight: number;
  /** Centimetres. */
  length: number;
  width: number;
  height: number;
  declared_value?: number;
  is_fragile?: boolean;
  items?: { name: string; quantity: number; price?: number; weight?: number }[];
}

export interface InquiryRequest {
  pickup: AllingoAddress;
  dropoff: AllingoAddress;
  package: AllingoPackage;
  cod_amount?: number;
  use_insurance?: boolean;
  /** Who pays the shipping fee: the shop (sender) or the buyer (receiver). */
  payee?: 'sender' | 'receiver';
  delivery_payment_method?: 'cash' | 'credit' | 'post_paid';
  type?: 'standard' | 'on_demand';
  filter_partner_ids?: string[];
}

export interface AllingoQuote {
  service_id: string;
  service_name: string;
  partner: { id: string; name: string };
  price: number;
  addons_fee?: number;
  estimated_delivery_at?: string | null;
  estimated_delivery_range?: string | null;
  estimated_minutes?: number | null;
  /** 'carrier' = the carrier's own estimate; 'service_config' = a fixed figure set for the service. */
  estimated_source?: string | null;
  tracking?: { live_route?: boolean; driver_location?: boolean; track_link?: boolean; driver_info?: boolean };
  available?: boolean;
  error_code?: string | null;
  currency?: string;
  /** Set by Sugami, not by Allingo: the `type` filter this quote was requested with. */
  mode?: 'standard' | 'on_demand';
  /** Also Sugami's: short note, full terms and fee lines, for carriers that give them (Ahamove). */
  info?: string | null;
  details?: string | null;
  breakdown?: { name: string; value: number }[];
  /** Optional extras of the service (Ahamove); the shape is the carrier's own. */
  extras?: unknown[];
}

export interface InquiryResponse {
  quotes: AllingoQuote[];
}

export interface OrderRequest extends InquiryRequest {
  service_id: string;
  estimated_price?: number;
  deliverable_payment_method?: 'cod' | 'prepaid';
  /** Sugami order code (max 64 chars). */
  external_reference?: string;
  fulfillment_type?: 'immediate' | 'scheduled';
  schedule_at?: string;
}

export interface AllingoDelivery {
  id?: string;
  track_id?: string;
  partner_track_id?: string | null;
  partner_order_id?: string | null;
  partner?: { id: string; name: string };
  service?: { id: string; name: string };
  status?: string;
  track_link?: string | null;
  partner_track_link?: string | null;
}

export interface AllingoOrder {
  id: string;
  track_id: string;
  status: string;
  external_reference?: string | null;
  created_at?: string;
  updated_at?: string;
  delivery?: AllingoDelivery | null;
  fee?: { delivery?: number; insurance?: number; cod?: number; total?: number; currency?: string };
  livemode?: boolean;
  test_mode?: boolean;
}

export interface AllingoTimelineEvent {
  id: string;
  status: string;
  status_name?: string | null;
  scanned_at?: string | null;
  scan_location?: { name?: string | null; city?: string | null } | null;
  note?: string | null;
  source?: string | null;
}

export interface AllingoPartner {
  id: string;
  name: string;
  service_type?: string | null;
  icon_url?: string | null;
}

export interface AllingoWebhookEvent {
  id: string;
  type: string;
  api_version?: string;
  created?: number;
  livemode?: boolean;
  data: { object: AllingoOrder & Record<string, unknown> };
}
