// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — v13.5.1 SAFETY-FIRST WRAPPER + DIAGNOSTICS.
//
// Every step logs to console so you can see exactly where the chain
// breaks in Chrome DevTools → Remote Devices → your phone.
// ═══════════════════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';

type TokenCallback = (token: string) => void;

let registerCalled = false;

// ─── Plugin loader ───────────────────────────────────────────────────
async function loadPushPlugin(): Promise<any | null> {
  console.log('[Push][1] loadPushPlugin — attempting dynamic import...');
  try {
    const mod = await import('@capacitor/push-notifications');
    const plugin = mod.PushNotifications || null;
    console.log('[Push][1] loadPushPlugin — success, plugin:', plugin ? 'loaded' : 'null');
    return plugin;
  } catch (e) {
    console.error('[Push][1] loadPushPlugin — FAILED:', e);
    return null;
  }
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
    const next = await PushNotifications.requestPermissions();
    console.log('[Push][2] requestPermissions result:', JSON.stringify(next));
    return next.receive === 'granted';
  } catch (e) {
    console.error('[Push][2] ensurePermission FAILED:', e);
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

  // Guard 1: native only
  if (!Capacitor.isNativePlatform()) {
    console.log('[Push] BAIL — not native platform');
    return;
  }

  // Guard 2: once per process
  if (registerCalled) {
    console.log('[Push] BAIL — already registered');
    return;
  }
  registerCalled = true;

  // Guard 3: plugin present?
  const PushNotifications = await loadPushPlugin();
  if (!PushNotifications) {
    console.log('[Push] BAIL — plugin not in bundle');
    return;
  }

  // Step 1: permission
  const ok = await ensurePermission(PushNotifications);
  if (!ok) {
    console.log('[Push] BAIL — permission not granted');
    return;
  }
  console.log('[Push] permission granted ✓');

  // Step 2: Android channel
  await ensureDefaultChannel(PushNotifications);

  // Step 3: attach listeners BEFORE register()
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

  // Step 4: register()
  console.log('[Push][6] calling register()...');
  try {
    await PushNotifications.register();
    console.log('[Push][6] register() resolved ✓ — waiting for registration event...');
  } catch (e) {
    console.error('[Push][6] register() THREW:', e);
  }
}

// ─── Cleanup helper ─────────────────────────────────────────────────
export async function removeAllPushListeners(): Promise<void> {
  try {
    const PushNotifications = await loadPushPlugin();
    if (!PushNotifications) return;
    await PushNotifications.removeAllListeners();
  } catch (e) {
    console.warn('[Push] removeAllListeners failed:', e);
  }
}
