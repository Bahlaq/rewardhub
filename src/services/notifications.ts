import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import { firebaseService } from './firebase';
import {
  ANDROID_NOTIFICATION_CHANNEL_ID,
  BROADCAST_TOPICS,
  canSaveFcmToken,
  offerIdFromPushData,
} from './pushRouting';

export { offerIdFromPushData, canSaveFcmToken };

type OpenHandler = (offerId: string | null) => void;

const PERM_AT_KEY = 'rh_push_perm_at';
const PERM_RETRY_MS = 24 * 60 * 60 * 1000;

let started = false;
let listenersAttached = false;
let registerCalled = false;
let permissionFlowStarted = false;
let latestToken: string | null = null;
let authUid: string | null = null;
let lastSavedKey = '';
let openHandler: OpenHandler | null = null;
let pendingOpen: { offerId: string | null } | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Remember where a notification tap should go until React is listening.
 * `offerId === null` means "open the offers list".
 */
export function setPushOpenHandler(handler: OpenHandler | null): void {
  openHandler = handler;
  if (handler && pendingOpen) {
    const pending = pendingOpen;
    pendingOpen = null;
    handler(pending.offerId);
  }
}

function deliverOpen(offerId: string | null): void {
  if (openHandler) openHandler(offerId);
  else pendingOpen = { offerId };
}

/**
 * Called whenever auth changes. Signed-in Firebase users (Google or
 * anonymous) get their token written to `fcm_tokens/{uid}`. Guests with
 * a `local_guest_*` id stay on the topics only — security rules reject
 * that write, and it is intentional.
 */
export function setBroadcastUser(uid: string | null | undefined): void {
  authUid = canSaveFcmToken(uid) ? uid : null;
  void persistToken();
}

async function persistToken(): Promise<void> {
  const uid = authUid;
  const token = latestToken;
  if (!uid || !token) return;
  const key = `${uid}:${token}`;
  if (key === lastSavedKey) return;

  const waits = [0, 1000, 3000];
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt] > 0) await delay(waits[attempt]);
    if (authUid !== uid || latestToken !== token) return;
    try {
      await firebaseService.saveFcmToken(uid, token, Capacitor.getPlatform());
      lastSavedKey = key;
      console.log('[Push] token saved');
      return;
    } catch (e) {
      console.warn('[Push] token save failed', attempt + 1, e);
    }
  }
}

async function subscribeTopics(): Promise<void> {
  for (let i = 0; i < BROADCAST_TOPICS.length; i++) {
    const topic = BROADCAST_TOPICS[i];
    let subscribed = false;
    for (let attempt = 0; attempt < 3 && !subscribed; attempt++) {
      try {
        await FCM.subscribeTo({ topic });
        subscribed = true;
        console.log('[Push] subscribed', topic);
      } catch (e) {
        console.warn('[Push] subscribe failed', topic, attempt + 1, e);
        await delay(800 * (attempt + 1));
      }
    }
  }
}

/**
 * `PushNotifications.register()` yields an FCM token on Android and an
 * APNs token on iOS. `FCM.getToken()` is the FCM registration token on
 * both, which is what Firestore and topic subscription need. On iOS the
 * APNs token is forwarded to Firebase a moment after registration, so
 * getToken is retried.
 */
async function captureFcmToken(): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await FCM.getToken();
      const token = result && typeof result.token === 'string' ? result.token : '';
      if (token) {
        latestToken = token;
        await subscribeTopics();
        await persistToken();
        return;
      }
    } catch (e) {
      console.warn('[Push] getToken failed', attempt + 1, e);
    }
    await delay(700 * (attempt + 1));
  }
  // Still try to join the topics. Android queues subscribeToTopic until
  // a token exists; iOS needs the APNs token, which the retry covered.
  await subscribeTopics();
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  void PushNotifications.addListener('registration', () => {
    void captureFcmToken();
  });

  void PushNotifications.addListener('registrationError', (err) => {
    console.error('[Push] registrationError', err);
  });

  // Foreground display is native: capacitor.config presentationOptions
  // includes "alert", which makes the Android plugin post a notification
  // and iOS present a banner. This listener only logs.
  void PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] foreground', notification && notification.title);
  });

  void PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    if (action && action.actionId === 'dismiss') return;
    deliverOpen(offerIdFromPushData(action));
  });
}

async function ensureChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: ANDROID_NOTIFICATION_CHANNEL_ID,
      name: 'New codes',
      description: 'Alerts when a new discount code is added',
      importance: 4,
      visibility: 1,
      sound: 'default',
      lights: true,
      vibration: true,
    });
  } catch (e) {
    console.warn('[Push] createChannel failed', e);
  }
}

async function registerIfNeeded(): Promise<void> {
  if (registerCalled) return;
  registerCalled = true;
  try {
    await PushNotifications.register();
    console.log('[Push] register() ok');
  } catch (e) {
    registerCalled = false;
    console.error('[Push] register() failed', e);
  }
}

async function requestPermissionSafely(): Promise<boolean> {
  try {
    const current = await PushNotifications.checkPermissions();
    if (current.receive === 'granted') return true;
    if (current.receive === 'denied') {
      console.log('[Push] permission denied — enable notifications in system settings');
      return false;
    }

    if (Capacitor.getPlatform() === 'android') {
      // Register already ran. Wait so the permission dialog does not
      // land on top of the first frame or the app-open ad. Some OEM
      // ROMs still kill the activity when the dialog is accepted; the
      // token and topic subscription are already in flight by then.
      await delay(3000);
      const again = await PushNotifications.checkPermissions();
      if (again.receive === 'granted') return true;
      if (again.receive === 'denied') return false;
    }

    let last = 0;
    try { last = Number(localStorage.getItem(PERM_AT_KEY) || '0'); } catch { last = 0; }
    if (Number.isFinite(last) && last > 0 && Date.now() - last < PERM_RETRY_MS) {
      console.log('[Push] permission prompt skipped (asked recently)');
      return false;
    }
    try { localStorage.setItem(PERM_AT_KEY, String(Date.now())); } catch { /* private mode */ }

    const next = await PushNotifications.requestPermissions();
    return next.receive === 'granted';
  } catch (e) {
    console.warn('[Push] permission request failed', e);
    return false;
  }
}

/**
 * Call once, as early as possible. Attaches tap/token listeners and, on
 * Android, registers for an FCM token without showing a dialog.
 * iOS registration waits until permission is granted.
 */
export function startBroadcastPush(): void {
  if (!Capacitor.isNativePlatform() || started) return;
  started = true;
  attachListeners();

  if (Capacitor.getPlatform() === 'android') {
    void (async () => {
      await ensureChannel();
      await registerIfNeeded();
    })();
    return;
  }

  void (async () => {
    try {
      const status = await PushNotifications.checkPermissions();
      if (status.receive === 'granted') await registerIfNeeded();
    } catch (e) {
      console.warn('[Push] iOS permission check failed', e);
    }
  })();
}

/**
 * Show the system notification prompt (Android 13+ POST_NOTIFICATIONS,
 * iOS alert/sound/badge). Safe to call after the App Tracking prompt so
 * the two system dialogs do not stack. No-ops on web.
 */
export async function requestNotificationPermission(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  startBroadcastPush();
  if (permissionFlowStarted) return;
  permissionFlowStarted = true;

  const granted = await requestPermissionSafely();
  if (Capacitor.getPlatform() === 'ios' && granted) {
    await registerIfNeeded();
  }
}
