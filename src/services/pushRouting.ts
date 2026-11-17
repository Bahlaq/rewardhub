/** Topics every install joins so a broadcast does not need a device list. */
export const FCM_TOPIC_NEW_CODES = 'new_codes';
export const FCM_TOPIC_ALL_USERS = 'all_users';

/**
 * Android notification channel. Must match the manifest meta-data
 * `com.google.firebase.messaging.default_notification_channel_id`.
 * A dedicated id (instead of `default`) lets an app update create the
 * channel at high importance; Android will not raise the importance of
 * a channel the user already has.
 */
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'new_codes';

export const BROADCAST_TOPICS = [FCM_TOPIC_NEW_CODES, FCM_TOPIC_ALL_USERS] as const;

/**
 * Firestore rules allow `fcm_tokens/{uid}` only when `request.auth.uid`
 * matches the document id. `local_guest_*` ids have no auth session, so
 * those devices subscribe to topics but do not write a token document.
 */
export function canSaveFcmToken(uid: string | null | undefined): uid is string {
  return typeof uid === 'string' && uid.length > 0 && !uid.startsWith('local_guest_');
}

/**
 * Pull `offerId` out of an FCM data payload.
 * Capacitor puts custom data on `notification.data` for a received
 * message, and on `action.notification.data` after a tap. Android's
 * cold-start intent also copies every extra onto `data`, so the id can
 * sit one level higher. Data values are always strings.
 */
export function offerIdFromPushData(payload: unknown): string | null {
  return readOfferId(payload, 0);
}

function readOfferId(payload: unknown, depth: number): string | null {
  if (!payload || typeof payload !== 'object' || depth > 4) return null;
  const record = payload as Record<string, unknown>;
  const direct = nonEmptyString(record.offerId) || nonEmptyString(record.offer_id);
  if (direct) return direct;

  if ('data' in record) {
    const nested = readOfferId(record.data, depth + 1);
    if (nested) return nested;
  }
  if ('notification' in record) {
    const nested = readOfferId(record.notification, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
