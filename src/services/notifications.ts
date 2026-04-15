// ═══════════════════════════════════════════════════════════════════════
// Push Notifications — v13.3.0 Safety-First refactor.
//
// Executes in this exact order (matches the 5-point spec):
//   1. DECOUPLE       — no AdMob call here, no shared state with the ad
//                       pipeline. This module cannot affect AdMob init.
//   2. NATIVE CHECK   — every call guarded behind Capacitor.isNativePlatform().
//                       Web and unsupported platforms return immediately.
//   3. CHANNEL FIRST  — createChannel('rewardhub_default') runs BEFORE
//                       checkPermissions / requestPermissions, so any
//                       incoming notification from a background path has
//                       a valid channel to target even before the user
//                       answers the dialog.
//   4. ISOLATE LISTEN — every addListener is in its own try/catch.
//                       Callbacks contain no blocking code (no alert, no
//                       Toast, no network, no throw paths) — they only
//                       schedule work as a microtask.
//   5. DELAYED START  — PushNotifications.register() is wrapped in a
//                       setTimeout(10_000) so the app, the Capacitor
//                       bridge, and any ad activity are fully settled
//                       before FCM registration is triggered.
//
// Throughout: every plugin call goes through safe(), so a failure in any
// one step never cascades into the next.
// ═══════════════════════════════════════════════════════════════════════

let hasRun = false;

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error('[Push] ' + label + ' failed:', err);
    return null;
  }
}

export async function initPushNotifications(
  onToken: (token: string) => void
): Promise<void> {
  if (hasRun) return;
  hasRun = true;

  // ─── (2) NATIVE CHECK ──────────────────────────────────────────
  let Capacitor: any;
  try {
    const core = await import('@capacitor/core');
    Capacitor = core.Capacitor;
  } catch (err) {
    console.error('[Push] @capacitor/core import failed:', err);
    return;
  }
  if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
    console.log('[Push] not a native platform — skip');
    return;
  }
  if (!Capacitor.isPluginAvailable('PushNotifications')) {
    console.log('[Push] plugin not registered — skip');
    return;
  }

  let PushNotifications: any;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch (err) {
    console.error('[Push] plugin import failed:', err);
    return;
  }

  // ─── (3) CHANNEL FIRST — before any permission work ────────────
  await safe('createChannel', function() {
    return PushNotifications.createChannel({
      id: 'rewardhub_default',
      name: 'RewardHub Notifications',
      description: 'Daily reminders and new offer alerts',
      importance: 4,      // IMPORTANCE_HIGH
      visibility: 1,      // VISIBILITY_PUBLIC
      lights: true,
      vibration: true,
    });
  });

  // ─── Permission check + request ────────────────────────────────
  let perm = await safe<{ receive: string }>('checkPermissions', function() {
    return PushNotifications.checkPermissions();
  });
  if (!perm) return;

  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    const reqResult = await safe<{ receive: string }>('requestPermissions', function() {
      return PushNotifications.requestPermissions();
    });
    if (!reqResult) return;
    perm = reqResult;
  }

  if (perm.receive !== 'granted') {
    console.log('[Push] permission not granted — stopping init');
    return;
  }

  // ─── (4) ISOLATED LISTENERS — no blocking code inside callbacks ─
  await safe('addListener:registration', function() {
    return PushNotifications.addListener('registration', function(token: any) {
      // No alert. No Toast. No sync network. Just schedule the callback
      // as a microtask so this handler returns to the native bridge fast.
      try {
        const tv = token && token.value ? String(token.value) : '';
        if (!tv) return;
        Promise.resolve()
          .then(function() { return onToken(tv); })
          .catch(function(e) { console.error('[Push] onToken rejected:', e); });
      } catch (handlerErr) {
        console.error('[Push] registration handler threw:', handlerErr);
      }
    });
  });

  await safe('addListener:registrationError', function() {
    return PushNotifications.addListener('registrationError', function(err: any) {
      try {
        console.error('[Push] registrationError:', err && err.error ? err.error : err);
      } catch {}
    });
  });

  await safe('addListener:pushNotificationReceived', function() {
    return PushNotifications.addListener('pushNotificationReceived', function(n: any) {
      // Intentionally minimal — no Toast, no dynamic imports.
      try {
        console.log('[Push] received:', n && n.title ? n.title : '(no title)');
      } catch {}
    });
  });

  await safe('addListener:pushNotificationActionPerformed', function() {
    return PushNotifications.addListener('pushNotificationActionPerformed', function(evt: any) {
      try {
        console.log('[Push] tapped:', evt && evt.notification ? evt.notification.title : '');
      } catch {}
    });
  });

  // ─── (5) DELAYED START — register() on a 10-second timer ───────
  // Using setTimeout (not await) so this function returns immediately
  // and does not hold the caller. The register call itself is wrapped
  // in safe() so a native rejection cannot leak.
  setTimeout(function() {
    safe('register', function() {
      return PushNotifications.register();
    }).then(function(ok) {
      console.log('[Push] register() result:', ok === null ? 'failed' : 'ok');
    });
  }, 10000);

  console.log('[Push] init queued — register() will fire in 10s');
}
