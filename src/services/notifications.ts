import { Capacitor } from '@capacitor/core';

type TokenCallback = (token: string) => void;

let registerCalled = false;

// ─── Plugin loader ───────────────────────────────────────────────────
// Returns { plugin } wrapper, NOT the plugin directly.
// Capacitor plugin objects are Proxies; returning one from an async
// function causes JavaScript's Promise resolution to call plugin.then()
// to test for a thenable — that call hits the native bridge and throws
// "PushNotifications.then() is not implemented on android".
function loadPushPlugin(): Promise<{ plugin: any } | null> {
  console.log('[Push][1] loadPushPlugin — attempting dynamic import...');
  return import('@capacitor/push-notifications')
    .then(function (mod) {
      const plugin = mod.PushNotifications || null;
      console.log('[Push][1] loadPushPlugin — success, plugin:', plugin ? 'loaded' : 'null');
      return plugin ? { plugin } : null;
    })
    .catch(function (e) {
      console.error('[Push][1] loadPushPlugin — FAILED:', e);
      return null;
    });
}

// ─── Permission helpers ─────────────────────────────────────────────
async function ensurePermission(PushNotifications: any): Promise<boolean> {
  console.log('[Push][2] ensurePermission — checking current status...');
  try {
    const current = await PushNotifications.checkPermissions();
    console.log('[Push][2] checkPermissions result:', JSON.stringify(current));

    if (current.receive === 'granted') {
      console.log('[Push][2] already granted');
      return true;
    }
    if (current.receive === 'denied') {
      console.log('[Push][2] previously DENIED — cannot register');
      return false;
    }

    console.log('[Push][2] status is "' + current.receive + '" — requesting...');

    // ── Android: set a pending flag BEFORE showing the system dialog.
    // On aggressive OEMs (Samsung/Xiaomi), the permission dialog causes
    // onPause → the OS kills the WebView process. When the user reopens
    // the app, checkAndRegisterIfPermissionAlreadyGranted() sees the flag
    // and calls register() silently without showing any UI.
    if (Capacitor.getPlatform() === 'android') {
      try { localStorage.setItem('rh_push_pending', '1'); } catch {}
    }

    const next = await PushNotifications.requestPermissions();
    console.log('[Push][2] requestPermissions result:', JSON.stringify(next));

    if (Capacitor.getPlatform() === 'android') {
      try { localStorage.removeItem('rh_push_pending'); } catch {}
    }

    return next.receive === 'granted';
  } catch (e) {
    console.error('[Push][2] ensurePermission FAILED:', e);
    if (Capacitor.getPlatform() === 'android') {
      try { localStorage.removeItem('rh_push_pending'); } catch {}
    }
    return false;
  }
}

// ─── Android channel bootstrap (noop on iOS) ────────────────────────
async function ensureDefaultChannel(PushNotifications: any): Promise<void> {
  const platform = Capacitor.getPlatform();
  console.log('[Push][3] ensureDefaultChannel — platform:', platform);
  if (platform !== 'android') {
    console.log('[Push][3] not Android — skipping channel');
    return;
  }
  try {
    await PushNotifications.createChannel({
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

// ─── Attach listeners + register ────────────────────────────────────
async function attachAndRegister(
  PushNotifications: any,
  onToken: TokenCallback,
): Promise<void> {
  console.log('[Push][4] attaching listeners...');
  try {
    PushNotifications.addListener('registration', function (token: any) {
      console.log('[Push][5] ★ registration event fired!');
      console.log('[Push][5] raw token object:', JSON.stringify(token));
      try {
        const raw = token && typeof token === 'object' ? token.value : token;
        console.log('[Push][5] extracted token string (len=' + (raw ? raw.length : 0) + ')');
        if (typeof raw === 'string' && raw.length > 0) {
          console.log('[Push][5] calling onToken callback...');
          onToken(raw);
          console.log('[Push][5] onToken callback returned');
        } else {
          console.warn('[Push][5] empty token — NOT calling onToken');
        }
      } catch (cbErr) {
        console.error('[Push][5] onToken callback threw:', cbErr);
      }
    });

    PushNotifications.addListener('registrationError', function (err: any) {
      console.error('[Push][5] ★ registrationError event fired!');
      console.error('[Push][5] error:', JSON.stringify(err));
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      function (n: any) {
        console.log('[Push] notification received while foregrounded:', n && n.title);
      }
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      function (a: any) {
        console.log('[Push] action performed:', a && a.actionId);
      }
    );
    console.log('[Push][4] all listeners attached ✓');
  } catch (e) {
    console.error('[Push][4] addListener FAILED:', e);
    return;
  }

  // Small delay on Android — lets the activity fully resume after the
  // permission dialog onPause/onResume cycle before touching the FCM bridge.
  if (Capacitor.getPlatform() === 'android') {
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('[Push][6] calling register()...');
  try {
    await PushNotifications.register();
    console.log('[Push][6] register() resolved ✓ — waiting for registration event...');
  } catch (e) {
    console.error('[Push][6] register() THREW:', e);
  }
}

// ─── Main entry ─────────────────────────────────────────────────────
export async function initPushNotifications(
  onToken: TokenCallback
): Promise<void> {
  console.log('════════════════════════════════════════════');
  console.log('[Push] initPushNotifications called');
  console.log('[Push] isNativePlatform:', Capacitor.isNativePlatform());
  console.log('[Push] getPlatform:', Capacitor.getPlatform());
  console.log('[Push] registerCalled:', registerCalled);
  console.log('════════════════════════════════════════════');

  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] BAIL — not native platform');
    return;
  }

  if (registerCalled) {
    console.log('[Push] BAIL — already registered');
    return;
  }
  registerCalled = true;

  const pluginWrapper = await loadPushPlugin();
  if (!pluginWrapper) {
    console.log('[Push] BAIL — plugin not in bundle');
    return;
  }
  const PushNotifications = pluginWrapper.plugin;

  const ok = await ensurePermission(PushNotifications);
  if (!ok) {
    console.log('[Push] BAIL — permission not granted');
    return;
  }
  console.log('[Push] permission granted ✓');

  await ensureDefaultChannel(PushNotifications);
  await attachAndRegister(PushNotifications, onToken);
}

// ─── Silent startup registration ─────────────────────────────────────
// Called on every app start. If the user already granted permission
// (including after the app was killed during the permission dialog on
// a previous session), we register silently without any UI.
export async function checkAndRegisterIfPermissionAlreadyGranted(
  onToken: TokenCallback
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registerCalled) return;

  const pluginWrapper = await loadPushPlugin();
  if (!pluginWrapper) return;
  const PushNotifications = pluginWrapper.plugin;

  try {
    const status = await PushNotifications.checkPermissions();
    console.log('[Push][silent] checkPermissions:', status?.receive);
    if (status?.receive !== 'granted') return;

    // Permission already granted — register silently.
    registerCalled = true;
    console.log('[Push][silent] permission already granted — registering silently');
    await ensureDefaultChannel(PushNotifications);
    await attachAndRegister(PushNotifications, onToken);
  } catch (e) {
    console.warn('[Push][silent] silent check failed (non-fatal):', e);
  }
}

// ─── Cleanup helper ─────────────────────────────────────────────────
export async function removeAllPushListeners(): Promise<void> {
  try {
    const wrapper = await loadPushPlugin();
    if (!wrapper) return;
    await wrapper.plugin.removeAllListeners();
  } catch (e) {
    console.warn('[Push] removeAllListeners failed:', e);
  }
}
