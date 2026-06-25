// Hand-authored payload types for the notification queue.
//
// Everything else about the schema is covered by Drizzle's inferred types in
// lib/db/schema.ts. These types live here because the
// `pending_notifications.payload` JSON column has no Drizzle-inferred shape of
// its own — the enqueuer and dispatcher need a hand-written contract for it.

export type TripKind = 'request' | 'offer';

export type PendingNotificationChannel = 'email' | 'whatsapp';

export type PendingNotificationStatus = 'pending' | 'in_flight' | 'sent' | 'failed' | 'skipped';

export interface PendingNotificationPayload {
  posterName: string;
  newTripKind: TripKind;
  routeLabel: string;
  travelDate: string;
  flightNumbers: string[];
  tripUrl: string;
}

export interface PendingNotificationsRow {
  id: string;
  new_trip_id: string;
  recipient_user_id: string;
  channel: PendingNotificationChannel;
  payload: PendingNotificationPayload;
  status: PendingNotificationStatus;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}
