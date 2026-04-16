// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — v13.5.0 SAFETY-FIRST WRAPPER (iOS + Android).
//
// Restored after v13.4.0 nuclear removal. The crash was isolated to
// native FCM register() racing MainActivity recreation on Samsung/Xiaomi
// OEMs when the system-generated permission dialog destroyed+recreated
// the activity. This file now protects every touchpoint:
//
//   1. DECOUPLE     — every step is in its own try/catch. One failure
//                     does not cascade; the app keeps running.
//   2. DELAYED      — caller is expected to wait 10s after app mount
//                     before invoking initPushNotifications(). By then
//                     the App Open Ad has shown+closed and MainActivity
//                     is settled, so OEM permission-dialog-driven
//                     recreation is no longer racing AdMob.
//   3. CHANNEL 1ST  — on Android we create the default channel BEFORE
//                     calling register(). Missing channel = silent
//                     Java NPE on some OEMs.
//   4. ISOLATE      — listeners never await. Token arrives on its own
//                     promise chain so it cannot block the caller.
//   5. NATIVE CHECK — bails out on web and when the plugin isn't
//                     actually installed, so dev/ci never explodes.
//
// Platform behavior:
//   Android — POST_NOTIFICATIONS prompt (API 33+), FCM token returned.
//   iOS     — system alert prompt, APNs token → Firebase auto-converts
//             it to an FCM token and fires the 'registration' event.
//             No channel work needed (iOS has no notification channels).
//
// The Firebase config file (google-services.json on Android,
// GoogleService-Info.plist on iOS) must be present at build time for
// the FCM token exchange to succeed. We don't touch those files here.
// ═══════════════════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';

type TokenCallback = (token: string) => void;

// Internal guard — we only ever call register() once per process.
let registerCalled = false;

// ─── Plugin loader ───────────────────────────────────────────────────
// Dynamic import is critical: if the plugin is temporarily removed from
// package.json for a hotfix build, a static import would fail the whole
// bundle. Dynamic import + try/catch keeps this module loadable always.
async function loadPushPlugin(): Promise<any | null> {
  try {
    const mod = await import('@capacitor/push-notifications');
    return mod.PushNotifications || null;
  } catch (e) {
    console.warn('[Push] plugin unavailable:', e);
    return null;
  }
}

// ─── Permission helpers ─────────────────────────────────────────────
async function ensurePermission(PushNotifications: any): Promise<boolean> {
  try {
    const current = await PushNotifications.checkPermissions();
    if (current.receive === 'granted') return true;
    if (current.receive === 'denied') {
      console.log('[Push] permission previously denied — skipping register');
      return false;
    }
    const next = await PushNotifications.requestPermissions();
    return next.receive === 'granted';
  } catch (e) {
    console.error('[Push] permission check/request failed:', e);
    return false;
  }
}

// ─── Android channel bootstrap (noop on iOS) ────────────────────────
async function ensureDefaultChannel(PushNotifications: any): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await PushNotifications.createChannel({
      id: 'default',
      name: 'General Notifications',
      description: 'Reward updates and account activity',
      importance: 3, // IMPORTANCE_DEFAULT
      visibility: 1, // VISIBILITY_PUBLIC
      sound: 'default',
      lights: true,
      vibration: true,
    });
    console.log('[Push] Android default channel ensured');
  } catch (e) {
    // Not fatal — register() will still succeed, channel just falls
    // back to system default on some OEMs.
    console.warn('[Push] createChannel failed (non-fatal):', e);
  }
}

// ─── Main entry ─────────────────────────────────────────────────────
export async function initPushNotifications(
  onToken: TokenCallback
): Promise<void> {
  // Guard 1: native only. No-op on web/dev so `vite dev` in a browser
  // never chokes on missing native bridge.
  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] web platform — skipping');
    return;
  }

  // Guard 2: only run register() once per process lifetime.
  if (registerCalled) {
    console.log('[Push] already registered — skipping duplicate call');
    return;
  }
  registerCalled = true;

  // Guard 3: plugin present?
  const PushNotifications = await loadPushPlugin();
  if (!PushNotifications) {
    console.log('[Push] plugin not in bundle — skipping');
    return;
  }

  // Step 1: permission (system dialog fires here on first launch).
  const ok = await ensurePermission(PushNotifications);
  if (!ok) {
    console.log('[Push] permission not granted — not registering');
    return;
  }

  // Step 2: Android channel first (no-op on iOS).
  await ensureDefaultChannel(PushNotifications);

  // Step 3: attach listeners BEFORE register() so the first registration
  // event cannot arrive before we're listening for it.
  try {
    PushNotifications.addListener('registration', function (token: any) {
      // Fire-and-forget; caller decides what to do with the token.
      // We catch our own failures so a throwing callback can never crash
      // the plugin's listener chain.
      try {
        const raw = token && typeof token === 'object' ? token.value : token;
        if (typeof raw === 'string' && raw.length > 0) {
          console.log('[Push] got token (len=' + raw.length + ')');
          onToken(raw);
        } else {
          console.warn('[Push] registration event fired with empty token');
        }
      } catch (cbErr) {
        console.error('[Push] onToken callback threw:', cbErr);
      }
    });

    PushNotifications.addListener('registrationError', function (err: any) {
      console.error('[Push] registrationError:', err);
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      function (n: any) {
        console.log('[Push] received while foregrounded:', n && n.title);
      }
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      function (a: any) {
        console.log('[Push] action performed:', a && a.actionId);
      }
    );
  } catch (e) {
    console.error('[Push] addListener failed — aborting register:', e);
    return;
  }

  // Step 4: register(). Wrapped in its own try/catch because on some
  // OEMs this is where a native Java exception can surface.
  try {
    await PushNotifications.register();
    console.log('[Push] register() ok — waiting for token event');
  } catch (e) {
    console.error('[Push] register() threw:', e);
  }
}

// ─── Cleanup helper (rarely needed) ─────────────────────────────────
export async function removeAllPushListeners(): Promise<void> {
  try {
    const PushNotifications = await loadPushPlugin();
    if (!PushNotifications) return;
    await PushNotifications.removeAllListeners();
  } catch (e) {
    console.warn('[Push] removeAllListeners failed:', e);
  }
}
