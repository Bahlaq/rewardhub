import { Capacitor } from '@capacitor/core';

type TokenCallback = (token: string) => void;
type PushPlugin = typeof import('@capacitor/push-notifications').PushNotifications;

let registerCalled = false;
let listenersAttached = false;
let PushNotifications: PushPlugin | null = null;

async function loadPushPlugin(): Promise<PushPlugin | null> {
  if (PushNotifications) return PushNotifications;
  try {
    // Dynamic import — a static top-level import of the native bridge has
    // crashed cold start on devices where the plugin isn't registered yet.
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    return PushNotifications;
  } catch (e) {
    console.warn('[Push] plugin unavailable (non-fatal):', e);
    return null;
  }
}

async function ensureDefaultChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const Push = await loadPushPlugin();
  if (!Push) return;
  try {
    await Push.createChannel({
      id: 'default',
      name: 'General Notifications',
      description: 'Reward updates and account activity',
      importance: 3,
      visibility: 1,
      sound: 'default',
      lights: true,
      vibration: true,
    });
    console.log('[Push][3] createChannel OK');
  } catch (e) {
    console.warn('[Push][3] createChannel failed (non-fatal):', e);
  }
}

async function attachListenersOnce(onToken: TokenCallback): Promise<void> {
  if (listenersAttached) return;
  const Push = await loadPushPlugin();
  if (!Push) return;
  listenersAttached = true;
  console.log('[Push][4] attaching listeners...');
  // Capacitor 6 addListener returns a Promise — must await/catch or it
  // surfaces as an unhandledrejection (and our boot overlay kills the UI).
  await Promise.all([
    Push.addListener('registration', function (token: any) {
      console.log('[Push][5] ★ registration event fired!');
      try {
        const raw = token && typeof token === 'object' ? token.value : token;
        console.log('[Push][5] token len=' + (raw ? raw.length : 0));
        if (typeof raw === 'string' && raw.length > 0) {
          onToken(raw);
        }
      } catch (cbErr) {
        console.error('[Push][5] onToken callback threw:', cbErr);
      }
    }),
    Push.addListener('registrationError', function (err: any) {
      console.error('[Push][5] ★ registrationError:', JSON.stringify(err));
    }),
    Push.addListener('pushNotificationReceived', function (n: any) {
      console.log('[Push] received foregrounded:', n && n.title);
    }),
    Push.addListener('pushNotificationActionPerformed', function (a: any) {
      console.log('[Push] action performed:', a && a.actionId);
    }),
  ]);
  console.log('[Push][4] listeners attached ✓');
}

// ═══════════════════════════════════════════════════════════════════════
// Main entry — called when user taps "Enable Notifications" in our prompt.
//
// CRITICAL ANDROID FIX:
// On aggressive OEMs (Samsung/Xiaomi), requestPermissions() shows the
// system dialog which causes onPause/onResume — and the OS kills the
// WebView process during the pause. The user then sees their home
// screen and our app is gone.
//
// SOLUTION: On Android, call register() FIRST (no UI, safe). The FCM
// token is obtained and saved to Firestore BEFORE the permission dialog
// appears. Then we request permissions. If the app gets killed during
// the dialog, the token is already saved — no harm done. POST_NOTIFICATIONS
// permission only controls notification DISPLAY, not token registration,
// so the token works regardless.
//
// On iOS, requestPermissions() does not cause the same crash. We can
// keep the standard order: request permission, then register.
// ═══════════════════════════════════════════════════════════════════════
export async function initPushNotifications(
  onToken: TokenCallback
): Promise<void> {
  console.log('[Push] initPushNotifications — platform:', Capacitor.getPlatform());

  if (!Capacitor.isNativePlatform()) return;
  if (registerCalled) return;

  const Push = await loadPushPlugin();
  if (!Push) return;

  if (Capacitor.getPlatform() === 'android') {
    // ─── ANDROID PATH ──────────────────────────────────────────
    // Step 1: channel + listeners + register (NO permission dialog yet).
    // The FCM token comes back via the registration event listener.
    await ensureDefaultChannel();
    await attachListenersOnce(onToken);
    try {
      await Push.register();
      registerCalled = true;
      console.log('[Push] register() OK — token will arrive via event');
    } catch (e) {
      console.error('[Push] register() FAILED:', e);
      return;
    }

    // IMPORTANT SAFETY CHANGE:
    // We no longer call requestPermissions() on Android from inside the app.
    // Some OEM ROMs still terminate the activity when the runtime permission
    // dialog is accepted, which feels like a crash to the user.
    //
    // FCM token registration does not require POST_NOTIFICATIONS, so we keep
    // token registration stable and avoid the crash path entirely.
    // Notification display permission can still be enabled manually by users
    // from Android system settings.

    try {
      const current = await Push.checkPermissions();
      if (current.receive !== 'granted') {
        console.log('[Push][android] permission is', current.receive, '— skipping in-app request to prevent OEM crash');
      } else {
        console.log('[Push][android] permission already granted');
      }
    } catch (e) {
      console.error('[Push][android] checkPermissions FAILED:', e);
    }
    return;
  }

  // ─── iOS PATH ──────────────────────────────────────────────
  // iOS doesn't have the OEM-kill problem. Standard order is fine.
  try {
    const current = await Push.checkPermissions();
    let granted = current.receive === 'granted';
    if (!granted && current.receive !== 'denied') {
      const next = await Push.requestPermissions();
      granted = next.receive === 'granted';
    }
    if (!granted) {
      console.log('[Push][ios] permission not granted');
      return;
    }
    await attachListenersOnce(onToken);
    await Push.register();
    registerCalled = true;
    console.log('[Push][ios] register() OK');
  } catch (e) {
    console.error('[Push][ios] FAILED:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Silent startup registration — fires on every app start.
// Handles two cases:
//   1. iOS: user previously granted permission; register silently.
//   2. Android: previous session got killed during permission dialog.
//      We register silently (no permission dialog) — token is saved.
// ═══════════════════════════════════════════════════════════════════════
export async function checkAndRegisterIfPermissionAlreadyGranted(
  onToken: TokenCallback
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registerCalled) return;

  const Push = await loadPushPlugin();
  if (!Push) return;

  try {
    if (Capacitor.getPlatform() === 'android') {
      // Android: ALWAYS register silently on startup (no permission dialog).
      // FCM tokens work without POST_NOTIFICATIONS permission.
      await ensureDefaultChannel();
      await attachListenersOnce(onToken);
      await Push.register();
      registerCalled = true;
      console.log('[Push][silent-android] register() OK on startup');
      return;
    }

    // iOS: only register silently if permission already granted.
    const status = await Push.checkPermissions();
    if (status?.receive !== 'granted') return;
    await attachListenersOnce(onToken);
    await Push.register();
    registerCalled = true;
    console.log('[Push][silent-ios] register() OK');
  } catch (e) {
    console.warn('[Push][silent] failed (non-fatal):', e);
  }
}

export async function removeAllPushListeners(): Promise<void> {
  try {
    const Push = await loadPushPlugin();
    if (!Push) return;
    await Push.removeAllListeners();
  } catch (e) {
    console.warn('[Push] removeAllListeners failed:', e);
  }
}
