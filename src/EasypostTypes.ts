/**
 * The Easypost Node SDK does not provide typings in a usable format for webhooks (just their API).  This is a quick hack for typings support on responses
 */

import { Nullable } from "./Types"

export type Attribute = {
  status: string
}

export type EasyPostIdentifier = {
  /**
   * ie: trk_1234567890, evt_1234567890
   */
  id: string
  /**
   * ie: 'production'
   */
  mode: string
  updated_at: string // ISO date
}

export type TrackingLocation = {
  "object": "TrackingLocation",
  "city": Nullable<string>,
  "state": Nullable<string>,
  "country": Nullable<string>,
  "zip": Nullable<string>
}

export type CarrierDetail = {
  "object": "CarrierDetail",
  "service": Nullable<string>,
  "container_type": Nullable<string>,
  "est_delivery_date_local": Nullable<string>,
  "est_delivery_time_local": Nullable<string>,
  "origin_location": string,
  "origin_tracking_location": TrackingLocation,
  "destination_location": string,
  "destination_tracking_location": TrackingLocation,
  "guaranteed_delivery_date": Nullable<string>,
  "alternate_identifier": Nullable<string>,
  "initial_delivery_attempt": Nullable<string>
}

export type EasypostTrackingDetails = {
  /**
   * ie: 'TrackingDetail'
   */
  "object": string,
  /**
   * for status "delivered" ie: "Delivered to your community mailbox, parcel locker or apt./condo mailbox"
   */
  "message": string,
  "description": Nullable<string>,
  /**
   * ie: 'in_transmit', 'pre_transit', 'in_transit', 'out_for_delivery', 'delivered'
   */
  "status": string,
  "status_detail": string,
  /**
   * ISO timestamp
   */
  "datetime": string,
  /**
   * ie: 'CanadaPost'
   */
  "source": string,
  /**
   * ie: '0100', '3000'
   */
  "carrier_code": string,
  tracking_location: TrackingLocation
}

export type EasypostWebhookResult = {
  /**
   * ie: 'Tracker'
   */
  object: string

  /**
   * ie: '7380...1'
   */
  tracking_code: string
  /**
   * ie: 'delivered'
   */
  status: string
  /**
   * ie: 'unknown'
   */
  status_detail: string
  created_at: string // ISO date
  signed_by: Nullable<string>,
  weight: Nullable<string>,
  est_delivery_date: string,
  /**
   * ie: 'shp_123'
   */
  shipment_id: string,
  /**
   * ie: 'CanadaPost'
   */
  carrier: string,
  /**
   * Probably only when Object === 'Tracking'???
   */
  tracking_details: EasypostTrackingDetails[],

  carrier_detail: CarrierDetail,
  finalized: boolean,
  is_return: boolean,
  public_url: string
} & EasyPostIdentifier;

export type EasypostWebhookEvent = {
  created_at: string,
  description: string,
  previous_attributes: Attribute,
  pending_urls: string[],
  completed_urls: string[],

  /**
   * id: evt_123456789
   */
  id: string // unique identifier
  user_id: string // webhook identifier (when created in EasyPost)
  /**
   * The current status of the event. Possible values are "completed", "failed", "in_queue", "retrying", or "pending" (deprecated)
   */
  status: string,
  /**
   * ie: 'Event'
   */
  object: string,

  result: EasypostWebhookResult
} & EasyPostIdentifier;